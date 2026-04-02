"""antenna_test.py — Compare antenna signal quality using meshmap.net heard-by data.

WHY NOT RSSI FROM SUPABASE:
    Your node talks to the MQTT collector directly (WiFi/serial bridge), so
    packets arrive with rssi=null. RSSI/SNR only appears when another Meshtastic
    node receives your transmission over the air and relays it. With a single
    guild node you need an external signal source.

METHOD:
    meshmap.net passively tracks which external nodes have heard your node
    and when. A better antenna means more nodes hear you, more recently.

    Two metrics:
      heard_by  — how many distinct external nodes heard you in the last hour
      freshest  — how recently the most recent heard timestamp was

Usage:
    python3 -m bots.antenna_test

Workflow:
    1. Script takes a BASELINE snapshot from meshmap.net.
    2. Swap the antenna.
    3. Wait ~3-5 min for the mesh to update, press Enter.
    4. Script takes a TEST snapshot and prints the comparison.

Environment (bots/.env):
    ANTENNA_NODE_ID  — hex node ID (default: !02ee16c8 / UFN1)
    ANTENNA_POLL_SEC — seconds between live status polls (default: 30)
"""

import os
import sys
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

MESHMAP_URL     = "https://meshmap.net/nodes.json"
REQUEST_TIMEOUT = 20
USER_AGENT      = "MeshGuild AntennaTest (github.com/threatlvlmidnight/MeshGuild)"

_RAW_ID = os.environ.get("ANTENNA_NODE_ID", "!02ee16c8").strip()
if _RAW_ID.startswith("!"):
    NODE_HEX = _RAW_ID[1:].lower()
    NODE_DEC = str(int(NODE_HEX, 16))
else:
    NODE_DEC = _RAW_ID
    NODE_HEX = f"{int(_RAW_ID):08x}"

NODE_ID_DISPLAY  = f"!{NODE_HEX}"
POLL_SEC         = int(os.environ.get("ANTENNA_POLL_SEC", "30"))
HEARD_WINDOW_SEC = 3600  # nodes that heard you within this window count


def fetch_node_raw() -> Optional[dict]:
    try:
        resp = requests.get(MESHMAP_URL, timeout=REQUEST_TIMEOUT,
                            headers={"User-Agent": USER_AGENT})
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        print(f"\n  ERROR fetching meshmap.net: {e}")
        return None
    return data.get(NODE_DEC) or data.get(int(NODE_DEC)) or None


def take_snapshot(label: str) -> dict:
    now  = datetime.now(timezone.utc)
    node = fetch_node_raw()
    if node is None:
        return {"label": label, "timestamp": now, "heard_count": 0,
                "total_seen": 0, "seen_by": {}, "freshest": None, "raw_found": False}

    seen_by_raw: dict = node.get("seenBy", {})
    seen_by: dict[str, datetime] = {}
    for topic, ts_val in seen_by_raw.items():
        try:
            if isinstance(ts_val, (int, float)):
                dt = datetime.fromtimestamp(ts_val, tz=timezone.utc)
            else:
                dt = datetime.fromisoformat(str(ts_val).replace("Z", "+00:00"))
            seen_by[topic] = dt
        except Exception:
            pass

    cutoff      = now.timestamp() - HEARD_WINDOW_SEC
    heard_count = sum(1 for dt in seen_by.values() if dt.timestamp() >= cutoff)
    freshest    = max(seen_by.values(), default=None) if seen_by else None

    return {"label": label, "timestamp": now, "heard_count": heard_count,
            "total_seen": len(seen_by), "seen_by": seen_by,
            "freshest": freshest, "raw_found": True}


def _age(dt: Optional[datetime]) -> str:
    if dt is None:
        return "never"
    secs = (datetime.now(timezone.utc) - dt).total_seconds()
    if secs < 60:
        return f"{int(secs)}s ago"
    if secs < 3600:
        return f"{int(secs // 60)}m ago"
    return f"{secs / 3600:.1f}h ago"


def print_snapshot(snap: dict) -> None:
    if not snap["raw_found"]:
        print(f"\n  {snap['label']}: node not found on meshmap.net")
        return
    print(f"\n  {snap['label']}")
    print(f"    Heard by {snap['heard_count']} node(s) in last hour  "
          f"(total ever seen: {snap['total_seen']})")
    print(f"    Most recently heard: {_age(snap['freshest'])}")
    if snap["seen_by"]:
        sorted_seen = sorted(snap["seen_by"].items(), key=lambda x: x[1], reverse=True)
        for topic, dt in sorted_seen[:6]:
            short = topic.split("/")[-1] if "/" in topic else topic
            print(f"      {short:32s}  {_age(dt)}")


def print_comparison(baseline: dict, test: dict) -> None:
    print("\n  ════════════════════════════════════════")
    print("  RESULTS")
    print_snapshot(baseline)
    print_snapshot(test)

    if not baseline["raw_found"] or not test["raw_found"]:
        print("\n  Cannot compare — one or both snapshots missing.")
        return

    delta       = test["heard_count"] - baseline["heard_count"]
    b_fresh     = baseline["freshest"]
    t_fresh     = test["freshest"]
    delta_fresh = (t_fresh - b_fresh).total_seconds() if b_fresh and t_fresh else None

    print(f"\n  DELTA   heard_by {delta:+d} node(s)", end="")
    if delta_fresh is not None:
        print(f"   freshest {delta_fresh / 60:+.1f} min", end="")
    print()

    if delta > 0:
        print("  BETTER — more nodes are hearing you. Keep this antenna.")
    elif delta < 0:
        print("  WORSE  — fewer nodes heard you. Revert or try the other.")
    else:
        print("  SAME   — equivalent heard-by count. Try the other antenna,")
        print("           or compare freshest timestamps above.")
    print()


def live_poll(stop_event: threading.Event) -> None:
    while not stop_event.is_set():
        snap = take_snapshot("live")
        sys.stdout.write(
            f"\r  heard_by: {snap['heard_count']} node(s)   "
            f"freshest: {_age(snap['freshest'])}   "
        )
        sys.stdout.flush()
        stop_event.wait(POLL_SEC)


def main() -> None:
    print(f"\n  ANTENNA TEST — {NODE_ID_DISPLAY}")
    print( "  ════════════════════════════════════════")
    print( "  Signal source: meshmap.net heard-by count")
    print( "  (Your collector RSSI is null — node talks directly to the")
    print( "   MQTT broker, not via RF relay. meshmap.net tracks who")
    print( "   actually hears you over the air.)\n")

    print("  Checking meshmap.net...", end=" ", flush=True)
    node = fetch_node_raw()
    if node is None:
        print("NOT FOUND")
        print(f"\n  Node {NODE_ID_DISPLAY} (decimal: {NODE_DEC}) is not on meshmap.net.")
        print()
        print("  This means no public community gateway is picking up your")
        print("  transmissions over RF. You are your own only receiver right now.")
        print()
        print("  ── To test antenna quality without a second node ─────────────")
        print("  Use the Meshtastic phone app (connect via BT to your node):")
        print("    1. Open the app → Nodes tab")
        print("    2. Tap any visible neighbor node → Long press → Traceroute")
        print("    3. The traceroute response shows the RSSI/SNR your signal")
        print("       arrived at on each hop. Swap antenna, repeat, compare.")
        print()
        print("  ── To use this script in the future ────────────────────────")
        print("  Once a second guild node joins the mesh, it will appear in")
        print("  telemetry with non-null RSSI (it hears your node over RF).")
        print("  The script can then compare before/after readings.")
        print()
        sys.exit(1)

    seen_count = len(node.get("seenBy", {}))
    print(f"found  ({seen_count} node(s) in seenBy)\n")

    print("  Taking BASELINE snapshot (current antenna)...")
    baseline = take_snapshot("BASELINE (old antenna)")
    print_snapshot(baseline)

    print("\n  Swap antenna now.")
    print("  Wait ~3-5 min after swapping for the mesh to update, then press Enter.")
    input("  Press Enter to start live monitoring...\n")

    stop_event = threading.Event()
    t = threading.Thread(target=live_poll, args=(stop_event,), daemon=True)
    t.start()
    input()
    stop_event.set()
    t.join()
    print()

    print("  Taking TEST snapshot (new antenna)...")
    test = take_snapshot("TEST (new antenna)")
    print_comparison(baseline, test)

    print("  Taking BASELINE snapshot (current antenna)...")
    baseline = take_snapshot("BASELINE (old antenna)")
    print_snapshot(baseline)

    print("\n  Swap antenna now.")
    print("  Wait ~3-5 min after swapping for the mesh to update, then press Enter.")
    input("  Press Enter to start live monitoring...\n")

    stop_event = threading.Event()
    t = threading.Thread(target=live_poll, args=(stop_event,), daemon=True)
    t.start()
    input()
    stop_event.set()
    t.join()
    print()

    print("  Taking TEST snapshot (new antenna)...")
    test = take_snapshot("TEST (new antenna)")
    print_comparison(baseline, test)


if __name__ == "__main__":
    main()
