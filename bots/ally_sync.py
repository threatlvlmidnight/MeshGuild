"""ally_sync.py — Daily ally node sync from meshmap.net → external_nodes table.

Fetches publicly visible Meshtastic nodes in the OKC bounding box,
filters out nodes already claimed in the guild, and upserts the rest
into the `external_nodes` Supabase table as ally markers.

Usage (manual):
    python -m bots.ally_sync

Usage (cron — once per day at 03:00):
    0 3 * * * cd /path/to/meshguild && python -m bots.ally_sync >> logs/ally_sync.log 2>&1

Environment variables (bots/.env):
    SUPABASE_URL            — Supabase project URL
    SUPABASE_SERVICE_KEY    — Supabase service-role key (bypasses RLS for upsert)
    ALLY_BBOX               — Bounding box "lat_min,lng_min,lat_max,lng_max"
                              Defaults to OKC metro area
    MESHMAP_API_URL         — meshmap.net node list endpoint
                              Default: https://meshmap.net/api/node/all
                              Verify at https://meshmap.net — adjust if the
                              endpoint has changed.
"""

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import requests
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv(Path(__file__).parent / ".env")

# ── Config ───────────────────────────────────────────────────────────────────

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")

# OKC metro bounding box — override via ALLY_BBOX env var
DEFAULT_BBOX = "35.20,-97.90,35.80,-97.20"
BBOX_RAW = os.environ.get("ALLY_BBOX", DEFAULT_BBOX)

# meshmap.net public node API
MESHMAP_API_URL = os.environ.get(
    "MESHMAP_API_URL", "https://meshmap.net/nodes.json"
)

REQUEST_TIMEOUT = 20
USER_AGENT = "MeshGuild AllySync Bot (github.com/threatlvlmidnight/MeshGuild)"


def parse_bbox(bbox_str: str) -> tuple[float, float, float, float]:
    """Parse 'lat_min,lng_min,lat_max,lng_max' into a tuple."""
    parts = [float(x.strip()) for x in bbox_str.split(",")]
    if len(parts) != 4:
        raise ValueError(f"ALLY_BBOX must be 'lat_min,lng_min,lat_max,lng_max', got: {bbox_str!r}")
    lat_min, lng_min, lat_max, lng_max = parts
    return lat_min, lng_min, lat_max, lng_max


def fetch_meshmap_nodes(url: str) -> list[dict]:
    """Pull all publicly visible nodes from meshmap.net.

    meshmap.net/nodes.json returns a dict keyed by decimal node number,
    with latitude/longitude stored as integers in units of 1e-7 degrees.
    We normalize to plain float degrees and add a 'num' key so the
    downstream filter/normalize functions work unchanged.
    """
    print(f"[ally_sync] Fetching {url}")
    resp = requests.get(
        url,
        headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
        timeout=REQUEST_TIMEOUT,
    )
    resp.raise_for_status()
    data = resp.json()

    # nodes.json format: {"<nodeNum>": {longName, latitude, longitude, ...}, ...}
    # latitude/longitude are in 1e-7 degree units.
    if isinstance(data, dict) and not any(k in data for k in ("nodes", "data", "results")):
        result = []
        for num_str, node in data.items():
            try:
                num = int(num_str)
            except (TypeError, ValueError):
                continue
            normalized = dict(node)
            normalized["num"] = num
            # Convert 1e-7 integer degrees → float degrees
            if normalized.get("latitude") is not None:
                normalized["latitude"] = normalized["latitude"] / 1e7
            if normalized.get("longitude") is not None:
                normalized["longitude"] = normalized["longitude"] / 1e7
            result.append(normalized)
        return result

    # Legacy list format
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for key in ("nodes", "data", "results"):
            if key in data and isinstance(data[key], list):
                return data[key]
    raise ValueError(f"Unexpected meshmap response shape: {str(data)[:200]}")


def filter_in_bbox(
    nodes: list[dict],
    lat_min: float,
    lng_min: float,
    lat_max: float,
    lng_max: float,
) -> list[dict]:
    """Return only nodes whose position falls inside the bounding box."""
    inside = []
    for node in nodes:
        lat = node.get("lat") or node.get("latitude") or node.get("position", {}).get("lat")
        lng = (
            node.get("lon")
            or node.get("lng")
            or node.get("longitude")
            or node.get("position", {}).get("lon")
        )
        if lat is None or lng is None:
            continue
        try:
            lat, lng = float(lat), float(lng)
        except (TypeError, ValueError):
            continue
        if lat_min <= lat <= lat_max and lng_min <= lng <= lng_max:
            node["_lat"] = lat
            node["_lng"] = lng
            inside.append(node)
    return inside


def get_guild_node_ids(client: Client) -> set[str]:
    """Fetch all node IDs already claimed in the guild."""
    resp = client.from_("nodes").select("id").execute()
    return {row["id"] for row in (resp.data or [])}


def node_to_row(node: dict) -> Optional[dict]:
    """
    Normalize a meshmap.net node object → external_nodes row.

    meshmap.net node shapes vary — this handles the common fields.
    Returns None if we can't extract a valid node ID.
    """
    # Node ID: meshmap uses 'nodeId', 'id', or 'num' (decimal int → hex string)
    node_id = (
        node.get("nodeId")
        or node.get("node_id")
        or node.get("id")
    )
    if node_id is None and "num" in node:
        # Convert decimal int to Meshtastic hex format: !xxxxxxxx
        try:
            node_id = f"!{int(node['num']):08x}"
        except (TypeError, ValueError):
            return None
    if not node_id:
        return None

    # Normalize to string, strip leading ! if already present
    node_id = str(node_id).strip()
    if not node_id.startswith("!"):
        node_id = f"!{node_id}"

    # Display name
    name = (
        node.get("longName")
        or node.get("long_name")
        or node.get("shortName")
        or node.get("short_name")
        or node.get("name")
        or None
    )

    # Hardware + role
    hw_model = node.get("hwModel") or node.get("hw_model") or None
    role     = node.get("role") or None

    # Altitude (already converted to float degrees in fetch_meshmap_nodes,
    # but altitude is not a coordinate so it comes through unchanged in metres)
    altitude = node.get("altitude")
    if altitude is not None:
        try:
            altitude = int(altitude)
        except (TypeError, ValueError):
            altitude = None

    # Location precision setting (smaller number = less precise)
    precision = node.get("precision")
    if precision is not None:
        try:
            precision = int(precision)
        except (TypeError, ValueError):
            precision = None

    # seenBy: dict of {mqtt_topic: unix_timestamp}
    seen_by = node.get("seenBy") or {}
    neighbor_count = len(seen_by)
    last_seen_ts = None
    if seen_by:
        try:
            max_ts = max(v for v in seen_by.values() if isinstance(v, (int, float)))
            last_seen_ts = datetime.fromtimestamp(max_ts, tz=timezone.utc).isoformat()
        except (ValueError, TypeError):
            pass

    return {
        "id": node_id,
        "name": name,
        "lat": node["_lat"],
        "lng": node["_lng"],
        "source": "meshmap.net",
        "noted_at": datetime.now(timezone.utc).isoformat(),
        "hw_model": hw_model,
        "role": role,
        "altitude": altitude,
        "precision": precision,
        "neighbor_count": neighbor_count if neighbor_count else None,
        "last_seen": last_seen_ts,
    }


def run() -> None:
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        print("[ally_sync] ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in bots/.env")
        sys.exit(1)

    try:
        lat_min, lng_min, lat_max, lng_max = parse_bbox(BBOX_RAW)
    except ValueError as e:
        print(f"[ally_sync] ERROR: {e}")
        sys.exit(1)

    print(
        f"[ally_sync] BBox: lat {lat_min}–{lat_max}, lng {lng_min}–{lng_max}"
    )

    # Fetch from meshmap.net
    try:
        raw_nodes = fetch_meshmap_nodes(MESHMAP_API_URL)
    except Exception as e:
        print(f"[ally_sync] ERROR fetching meshmap data: {e}")
        sys.exit(1)

    print(f"[ally_sync] Total nodes from meshmap: {len(raw_nodes)}")

    # Filter to bounding box
    in_bbox = filter_in_bbox(raw_nodes, lat_min, lng_min, lat_max, lng_max)
    print(f"[ally_sync] Nodes inside bbox: {len(in_bbox)}")

    if not in_bbox:
        print("[ally_sync] Nothing to upsert. Done.")
        return

    # Connect to Supabase with service role (writes bypass RLS)
    client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    # Get current guild node IDs so we don't add our own nodes as allies
    guild_ids = get_guild_node_ids(client)
    print(f"[ally_sync] Guild node IDs to exclude: {len(guild_ids)}")

    # Build rows, skip guild nodes and nodes we can't parse
    rows = []
    for node in in_bbox:
        row = node_to_row(node)
        if row is None:
            continue
        if row["id"] in guild_ids:
            print(f"[ally_sync]   Skipping guild node: {row['id']}")
            continue
        rows.append(row)

    print(f"[ally_sync] Upserting {len(rows)} ally node(s):")
    for r in rows:
        print(f"  {r['id']}  {r['name'] or '(no name)'}  {r['lat']:.4f}, {r['lng']:.4f}")

    if not rows:
        print("[ally_sync] Nothing to upsert. Clearing all existing ally nodes.")
        client.from_("external_nodes").delete().neq("id", "").execute()
        return

    # Upsert — on conflict update position + name + noted_at
    resp = (
        client.from_("external_nodes")
        .upsert(rows, on_conflict="id")
        .execute()
    )

    if hasattr(resp, "error") and resp.error:
        print(f"[ally_sync] ERROR upserting: {resp.error}")
        sys.exit(1)

    # Delete stale rows — nodes that were in the table but not in this sync batch
    # (e.g. seeded test data, nodes that moved out of range, or went offline)
    live_ids = [r["id"] for r in rows]
    stale = (
        client.from_("external_nodes")
        .delete()
        .not_.in_("id", live_ids)
        .execute()
    )
    stale_count = len(stale.data) if stale.data else 0
    if stale_count:
        print(f"[ally_sync] Removed {stale_count} stale node(s).")

    print(f"[ally_sync] Done. {len(rows)} ally node(s) synced at {datetime.now(timezone.utc).isoformat()}")


if __name__ == "__main__":
    run()
