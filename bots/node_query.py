"""node_query.py — Utility for fetching Meshtastic nodes near a location.

Reuses ally_sync's fetch/filter/normalize helpers.  Adds a haversine
radius filter so callers get a clean list of dicts within the specified
distance.

Usage (standalone):
    python -m bots.node_query

Usage (as import):
    from bots.node_query import fetch_nodes_near_okc
    nodes = fetch_nodes_near_okc()           # 40-mile radius, default OKC center
    nodes = fetch_nodes_near_okc(radius_mi=15)

Each returned dict has the shape:
    {
        "id":       "!aabbccdd",
        "name":     "Some Node" | None,
        "lat":      35.46,
        "lng":      -97.51,
        "distance_mi": 12.3,
        "source":   "meshmap.net",
        "noted_at": "2026-04-02T03:00:00+00:00",
    }
"""

import math
import os
from pathlib import Path
from typing import Optional

import requests
from dotenv import load_dotenv

from bots.ally_sync import (
    MESHMAP_API_URL,
    REQUEST_TIMEOUT,
    USER_AGENT,
    fetch_meshmap_nodes,
    filter_in_bbox,
    node_to_row,
)

load_dotenv(Path(__file__).parent / ".env")

# ── Defaults ──────────────────────────────────────────────────────────────────

# Geographic center of Oklahoma City
OKC_LAT = 35.4676
OKC_LNG = -97.5164

DEFAULT_RADIUS_MI = 40


# ── Haversine ────────────────────────────────────────────────────────────────

def haversine_mi(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Return the great-circle distance in miles between two lat/lng points."""
    R = 3958.8  # Earth radius in miles
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlng / 2) ** 2
    )
    return R * 2 * math.asin(math.sqrt(a))


def _radius_to_bbox(
    center_lat: float, center_lng: float, radius_mi: float
) -> tuple[float, float, float, float]:
    """Build a square bounding box that fully contains the radius circle."""
    lat_deg = radius_mi / 69.0
    lng_deg = radius_mi / (69.0 * math.cos(math.radians(center_lat)))
    return (
        center_lat - lat_deg,
        center_lng - lng_deg,
        center_lat + lat_deg,
        center_lng + lng_deg,
    )


# ── Main query function ───────────────────────────────────────────────────────

def fetch_nodes_near_okc(
    *,
    center_lat: float = OKC_LAT,
    center_lng: float = OKC_LNG,
    radius_mi: float = DEFAULT_RADIUS_MI,
    api_url: Optional[str] = None,
) -> list[dict]:
    """
    Fetch all publicly visible Meshtastic nodes within `radius_mi` miles of
    `center_lat / center_lng` (defaults to OKC city center).

    Returns a list of normalized node dicts, each with an added
    'distance_mi' key, sorted nearest-first.
    """
    url = api_url or os.environ.get("MESHMAP_API_URL", "https://meshmap.net/nodes.json")

    # 1. Pull everything from meshmap.net
    raw = fetch_meshmap_nodes(url)

    # 2. Coarse bbox filter (fast, eliminates most nodes)
    lat_min, lng_min, lat_max, lng_max = _radius_to_bbox(center_lat, center_lng, radius_mi)
    candidates = filter_in_bbox(raw, lat_min, lng_min, lat_max, lng_max)

    # 3. Precise haversine filter + normalize
    results: list[dict] = []
    for node in candidates:
        row = node_to_row(node)
        if row is None:
            continue
        dist = haversine_mi(center_lat, center_lng, row["lat"], row["lng"])
        if dist <= radius_mi:
            row["distance_mi"] = round(dist, 2)
            results.append(row)

    results.sort(key=lambda r: r["distance_mi"])
    return results


# ── CLI ───────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import json

    print(f"Fetching Meshtastic nodes within {DEFAULT_RADIUS_MI} miles of OKC...")
    nodes = fetch_nodes_near_okc()
    print(f"Found {len(nodes)} node(s):\n")
    print(json.dumps(nodes, indent=2))
