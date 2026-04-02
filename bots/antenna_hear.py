"""antenna_hear.py — Passive node discovery + telemetry capture over the air.

Connects to your Meshtastic node via TCP and listens for 3 minutes.
Every packet received over RF is logged with RSSI/SNR.
At the end a full report is printed showing every node heard and the
best/latest telemetry for each.

Run as many passes as you want — swap antenna between runs, compare.

Usage:
    python3 -m bots.antenna_hear [--minutes N] [--host IP]

Environment (bots/.env):
    RADIO_HOST — IP of your Meshtastic node (default: 192.168.86.20)

Output:
    Printed to stdout.  Redirect to a file to save:
        python3 -m bots.antenna_hear > run_antenna_A.txt
"""

import argparse
import signal
import sys
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
import os

load_dotenv(Path(__file__).parent / ".env")

# ── defaults ──────────────────────────────────────────────────────────────────
DEFAULT_HOST    = os.environ.get("RADIO_HOST", "192.168.86.20")
DEFAULT_MINUTES = 3
CONN_TIMEOUT    = 15          # seconds to wait for TCP handshake
# ──────────────────────────────────────────────────────────────────────────────


def _fmt_id(num_id: int) -> str:
    return f"!{num_id:08x}"


def _age(ts: float) -> str:
    secs = time.time() - ts
    if secs < 60:
        return f"{int(secs)}s ago"
    return f"{int(secs/60)}m {int(secs%60)}s ago"


def run(host: str, minutes: int) -> None:
    # Import here so the module-level error is clear if meshtastic missing
    try:
        import meshtastic.tcp_interface as tcp_mod
        from meshtastic.protobuf import mesh_pb2 as mesh_pb  # noqa: F401
        from pubsub import pub
    except ImportError as e:
        print(f"ERROR: meshtastic library not found — {e}")
        print("  pip install meshtastic")
        sys.exit(1)

    duration = minutes * 60
    deadline = time.time() + duration

    # node_id (int) → { long_name, short_name, hw_model,
    #                    packets, best_rssi, best_snr, last_rssi, last_snr,
    #                    last_seen, first_seen, portnum_set }
    nodes: dict[int, dict] = defaultdict(lambda: {
        "long_name":  None,
        "short_name": None,
        "hw_model":   None,
        "packets":    0,
        "best_rssi":  None,
        "best_snr":   None,
        "last_rssi":  None,
        "last_snr":   None,
        "first_seen": None,
        "last_seen":  None,
        "portnums":   set(),
    })

    lock = __import__("threading").Lock()

    def on_receive(packet, interface):  # noqa: ANN001
        try:
            from_id = packet.get("from")
            if from_id is None:
                return

            rx_rssi = packet.get("rxRssi")
            rx_snr  = packet.get("rxSnr")
            portnum = packet.get("decoded", {}).get("portnum", "UNKNOWN")
            now     = time.time()

            with lock:
                n = nodes[from_id]
                n["packets"] += 1
                if n["first_seen"] is None:
                    n["first_seen"] = now
                n["last_seen"] = now

                if portnum:
                    n["portnums"].add(str(portnum))

                # RSSI: lower (more negative) = weaker; store best = highest
                if rx_rssi is not None:
                    n["last_rssi"] = rx_rssi
                    if n["best_rssi"] is None or rx_rssi > n["best_rssi"]:
                        n["best_rssi"] = rx_rssi

                # SNR: higher = better
                if rx_snr is not None:
                    n["last_snr"] = rx_snr
                    if n["best_snr"] is None or rx_snr > n["best_snr"]:
                        n["best_snr"] = rx_snr

                # Pull display names from NodeInfo payloads
                decoded = packet.get("decoded", {})
                user    = decoded.get("user", {})
                if user:
                    if user.get("longName"):
                        n["long_name"]  = user["longName"]
                    if user.get("shortName"):
                        n["short_name"] = user["shortName"]
                    if user.get("hwModel"):
                        n["hw_model"] = user["hwModel"]

            # Live status line
            rssi_str = f"RSSI {rx_rssi:+d}" if rx_rssi is not None else "RSSI  --"
            snr_str  = f"SNR {rx_snr:+.1f}" if rx_snr  is not None else "SNR   --"
            name     = nodes[from_id]["short_name"] or _fmt_id(from_id)
            elapsed  = int(now - (deadline - duration))
            print(f"  [{elapsed:>3}s] {name:<8}  {rssi_str}  {snr_str}  {portnum}")

        except Exception as e:
            print(f"  [packet error] {e}")

    # ── connect ───────────────────────────────────────────────────────────────
    print()
    print(f"  ANTENNA HEAR  —  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"  ════════════════════════════════════════")
    print(f"  Host    : {host}")
    print(f"  Duration: {minutes} min")
    print()
    print(f"  Connecting to {host} ...")

    try:
        iface = tcp_mod.TCPInterface(host, connectNow=True)
    except Exception as e:
        print(f"\nERROR: Could not connect to {host} — {e}")
        sys.exit(1)

    # Seed known nodes from the node DB your device already has
    try:
        node_db = iface.nodes or {}
        for nid_str, info in node_db.items():
            try:
                nid = int(nid_str)
            except (ValueError, TypeError):
                continue
            user = info.get("user", {})
            with lock:
                n = nodes[nid]
                n["long_name"]  = n["long_name"]  or user.get("longName")
                n["short_name"] = n["short_name"] or user.get("shortName")
                n["hw_model"]   = n["hw_model"]   or user.get("hwModel")
    except Exception:
        pass

    pub.subscribe(on_receive, "meshtastic.receive")

    print(f"  Listening for {minutes} minute(s). Press Ctrl+C to stop early.\n")
    print(f"  {'TIME':>5}  {'FROM':<8}  {'RSSI':>8}  {'SNR':>7}  PORTNUM")
    print(f"  {'─'*5}  {'─'*8}  {'─'*8}  {'─'*7}  {'─'*12}")

    start = time.time()
    try:
        while time.time() < deadline:
            time.sleep(0.5)
    except KeyboardInterrupt:
        print("\n  (stopped early)")

    try:
        iface.close()
    except Exception:
        pass

    elapsed_total = time.time() - start

    # ── report ────────────────────────────────────────────────────────────────
    print()
    print(f"  ════════════════════════════════════════")
    print(f"  RESULTS — {int(elapsed_total)}s listen window")
    print(f"  ════════════════════════════════════════\n")

    if not nodes:
        print("  No nodes heard during the capture window.")
        print("  Check that your radio is powered and the antenna is connected.")
        return

    # Sort: nodes with RSSI data first, then by packet count desc
    sorted_nodes = sorted(
        nodes.items(),
        key=lambda kv: (kv[1]["best_rssi"] is None, -(kv[1]["packets"])),
    )

    heard_with_signal = sum(1 for _, n in sorted_nodes if n["best_rssi"] is not None)
    print(f"  Nodes heard        : {len(sorted_nodes)}")
    print(f"  With RSSI data     : {heard_with_signal}")
    print()

    HDR = f"  {'ID':<12}  {'NAME':<16}  {'PKTS':>4}  {'BEST RSSI':>9}  {'BEST SNR':>8}  {'LAST RSSI':>9}  {'HW MODEL'}"
    print(HDR)
    print(f"  {'─'*12}  {'─'*16}  {'─'*4}  {'─'*9}  {'─'*8}  {'─'*9}  {'─'*12}")

    for nid, n in sorted_nodes:
        hex_id    = _fmt_id(nid)
        name      = n["long_name"] or n["short_name"] or "—"
        if len(name) > 16:
            name = name[:15] + "…"
        pkts      = n["packets"]
        best_rssi = f"{n['best_rssi']:+d}" if n["best_rssi"] is not None else "—"
        best_snr  = f"{n['best_snr']:+.1f}" if n["best_snr"]  is not None else "—"
        last_rssi = f"{n['last_rssi']:+d}" if n["last_rssi"] is not None else "—"
        hw        = str(n["hw_model"] or "—")

        print(f"  {hex_id:<12}  {name:<16}  {pkts:>4}  {best_rssi:>9}  {best_snr:>8}  {last_rssi:>9}  {hw}")

    print()
    print(f"  Captured at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Listen for Meshtastic RF traffic and report heard nodes + RSSI."
    )
    parser.add_argument("--minutes", type=int, default=DEFAULT_MINUTES,
                        help=f"Capture duration in minutes (default: {DEFAULT_MINUTES})")
    parser.add_argument("--host", default=DEFAULT_HOST,
                        help=f"Meshtastic node TCP host (default: {DEFAULT_HOST})")
    args = parser.parse_args()

    run(host=args.host, minutes=args.minutes)


if __name__ == "__main__":
    main()
