"""antenna_test.py — Compare antenna signal quality for a guild node.

Polls the telemetry table in two phases (BASELINE → TEST) and prints
a side-by-side comparison of RSSI and SNR statistics.

Usage:
    python3 -m bots.antenna_test

Workflow:
    1. Run the script — it starts collecting BASELINE readings.
    2. Let it run for 2–5 minutes so packets accumulate.
    3. Press Enter → marks the switchover point.
    4. Swap antenna, let it run another 2–5 minutes.
    5. Press Enter again → prints the final comparison and exits.

Metrics:
    RSSI  — how loud your node was (dBm, less negative = stronger signal)
    SNR   — signal vs noise ratio (dB, higher = cleaner signal)

Environment (bots/.env):
    SUPABASE_URL           — Supabase project URL
    SUPABASE_SERVICE_KEY   — service-role key
    ANTENNA_NODE_ID        — node to monitor (default: !02ee16c8 / UFN1)
    ANTENNA_POLL_SEC       — poll interval in seconds (default: 20)
"""

import os
import sys
import time
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv(Path(__file__).parent / ".env")

SUPABASE_URL        = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
NODE_ID             = os.environ.get("ANTENNA_NODE_ID", "!02ee16c8")
POLL_SEC            = int(os.environ.get("ANTENNA_POLL_SEC", "20"))

# ── Stats helpers ─────────────────────────────────────────────────────────────

def _mean(values: list[float]) -> Optional[float]:
    return sum(values) / len(values) if values else None

def _fmt(val: Optional[float], unit: str, decimals: int = 1) -> str:
    if val is None:
        return "  n/a"
    return f"{val:+.{decimals}f} {unit}"

def print_stats(label: str, rssi_vals: list[int], snr_vals: list[float]) -> None:
    n = len(rssi_vals)
    if n == 0:
        print(f"\n  {label}: no packets collected yet")
        return

    avg_rssi = _mean(rssi_vals)
    avg_snr  = _mean(snr_vals)
    min_rssi = min(rssi_vals)
    max_rssi = max(rssi_vals)
    min_snr  = min(snr_vals)
    max_snr  = max(snr_vals)

    print(f"\n  {label}  ({n} packet{'s' if n != 1 else ''} sampled)")
    print(f"    RSSI  avg {_fmt(avg_rssi, 'dBm')}   range [{min_rssi}, {max_rssi}] dBm")
    print(f"    SNR   avg {_fmt(avg_snr,  'dB ')}   range [{min_snr:.1f}, {max_snr:.1f}] dB")

# ── Data collection ───────────────────────────────────────────────────────────

def fetch_since(client: Client, node_id: str, since_iso: str) -> tuple[list[int], list[float]]:
    """Return (rssi_list, snr_list) for packets from node_id after since_iso."""
    resp = (
        client.table("telemetry")
        .select("rssi, snr")
        .eq("node_id", node_id)
        .gte("timestamp", since_iso)
        .not_.is_("rssi", "null")
        .execute()
    )
    rssi_vals, snr_vals = [], []
    for row in (resp.data or []):
        if row.get("rssi") is not None:
            rssi_vals.append(int(row["rssi"]))
        if row.get("snr") is not None:
            snr_vals.append(float(row["snr"]))
    return rssi_vals, snr_vals

# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in bots/.env")
        sys.exit(1)

    client: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    print(f"\n  ANTENNA TEST — node {NODE_ID}")
    print( "  ════════════════════════════════════════")
    print( "  Collecting BASELINE readings.")
    print(f"  Polls every {POLL_SEC}s. Press Enter when ready to swap antenna.\n")

    phase1_start = datetime.now(timezone.utc).isoformat()

    # ── Phase 1: baseline ────────────────────────────────────────────────────
    stop_event = threading.Event()

    def poll_loop(since_ref: list[str], label: str) -> None:
        while not stop_event.is_set():
            rssi, snr = fetch_since(client, NODE_ID, since_ref[0])
            sys.stdout.write(f"\r  [{label}]  {len(rssi)} pkts   RSSI avg: "
                             f"{_fmt(_mean(rssi), 'dBm') if rssi else '  ---'}   "  # noqa: E501
                             f"SNR avg: {_fmt(_mean(snr), 'dB') if snr else '  ---'}   ")
            sys.stdout.flush()
            stop_event.wait(POLL_SEC)

    since_ref: list[str] = [phase1_start]
    t = threading.Thread(target=poll_loop, args=(since_ref, "BASELINE"), daemon=True)
    t.start()

    input()  # Wait for user to press Enter

    stop_event.set()
    t.join()

    baseline_rssi, baseline_snr = fetch_since(client, NODE_ID, phase1_start)
    print_stats("BASELINE (old antenna)", baseline_rssi, baseline_snr)

    # ── Phase 2: new antenna ─────────────────────────────────────────────────
    print("\n  Swap antenna now. Press Enter to start collecting TEST readings.\n")
    input()

    phase2_start = datetime.now(timezone.utc).isoformat()
    stop_event = threading.Event()
    since_ref = [phase2_start]

    t = threading.Thread(target=poll_loop, args=(since_ref, "TEST   "), daemon=True)
    t.start()

    print(f"  Collecting TEST readings. Press Enter when done.\n")
    input()

    stop_event.set()
    t.join()

    test_rssi, test_snr = fetch_since(client, NODE_ID, phase2_start)

    # ── Final comparison ─────────────────────────────────────────────────────
    print("\n  ════════════════════════════════════════")
    print("  RESULTS")
    print_stats("BASELINE (old antenna)", baseline_rssi, baseline_snr)
    print_stats("TEST     (new antenna)", test_rssi, test_snr)

    avg_b_rssi = _mean(baseline_rssi)
    avg_t_rssi = _mean(test_rssi)
    avg_b_snr  = _mean(baseline_snr)
    avg_t_snr  = _mean(test_snr)

    if avg_b_rssi is not None and avg_t_rssi is not None:
        delta_rssi = avg_t_rssi - avg_b_rssi
        delta_snr  = (avg_t_snr or 0) - (avg_b_snr or 0)
        print(f"\n  DELTA   RSSI {delta_rssi:+.1f} dBm   SNR {delta_snr:+.1f} dB")
        if delta_rssi > 1 or delta_snr > 0.5:
            print("  ✓  TEST antenna appears BETTER — keep it.")
        elif delta_rssi < -1 or delta_snr < -0.5:
            print("  ✗  TEST antenna appears WORSE — try the other one or revert.")
        else:
            print("  ~  Results are within noise margin — antennas are equivalent.")
    else:
        print("\n  Not enough data in one or both phases to compare.")

    print()

if __name__ == "__main__":
    main()
