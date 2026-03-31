"""Weekly Stats Report Bot — sends a per-node summary to the mesh every Monday.

Reports uptime, signal quality, and activity from the past week using
data already in Supabase. Gamification stats (XP, level) will be added
in Sprint 5.

Usage:
    python -m bots.weekly_stats          # send now (one-shot)
    python -m bots.weekly_stats --loop   # wait for Monday 8am, repeat weekly
"""

import sys
import time
from datetime import datetime, timedelta, timezone

from supabase import create_client

from bots.config import BotConfig
from bots.mesh_sender import MeshSender


def get_weekly_stats(supabase_client, network_id: str) -> list[dict]:
    """Query Supabase for per-node stats over the past 7 days."""
    week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()

    # Get all nodes
    nodes_resp = (
        supabase_client.table("nodes")
        .select("id, short_name, long_name, is_online, last_seen, rssi, snr, battery_level, xp_total, level")
        .eq("network_id", network_id)
        .execute()
    )
    nodes = nodes_resp.data or []

    stats = []
    for node in nodes:
        node_id = node["id"]
        name = node.get("short_name") or node.get("long_name") or node_id

        # Count telemetry packets this week
        telem_resp = (
            supabase_client.table("telemetry")
            .select("id", count="exact")
            .eq("node_id", node_id)
            .gte("timestamp", week_ago)
            .execute()
        )
        packet_count = telem_resp.count or 0

        # Count alerts this week
        alerts_resp = (
            supabase_client.table("alerts")
            .select("id", count="exact")
            .eq("node_id", node_id)
            .gte("created_at", week_ago)
            .execute()
        )
        alert_count = alerts_resp.count or 0

        stats.append({
            "node_id": node_id,
            "name": name,
            "is_online": node.get("is_online", False),
            "last_seen": node.get("last_seen"),
            "rssi": node.get("rssi"),
            "snr": node.get("snr"),
            "battery": node.get("battery_level"),
            "packets_7d": packet_count,
            "alerts_7d": alert_count,
            "xp_total": node.get("xp_total", 0),
            "level": node.get("level", 1),
        })

    return stats


def format_report(node_stats: dict) -> str:
    """Format a single node's weekly report for mesh broadcast (228-byte limit)."""
    s = node_stats
    status = "ON" if s["is_online"] else "OFF"
    rssi = f"{s['rssi']}dBm" if s["rssi"] is not None else "n/a"
    snr = f"{s['snr']}dB" if s["snr"] is not None else "n/a"
    bat = f"{s['battery']}%" if s["battery"] is not None else "n/a"

    level_titles = {1: "Beacon", 2: "Relay", 3: "Warden", 4: "Guardian", 5: "Sentinel", 6: "Archnode"}
    level = s.get("level", 1)
    title = level_titles.get(level, "Beacon")
    xp = s.get("xp_total", 0)

    msg = (
        f"[MeshGuild] Weekly Report\n"
        f"{s['name']} • {title} Lv{level}\n"
        f"XP: {xp:,} | Pkts: {s['packets_7d']}\n"
        f"RSSI: {rssi} SNR: {snr} Bat: {bat}"
    )
    return msg


def send_reports(config: BotConfig):
    """Fetch stats and send a report for each node."""
    client = create_client(config.supabase_url, config.supabase_service_key)
    sender = MeshSender(config.radio_host, config.mesh_channel)

    stats = get_weekly_stats(client, config.network_id)
    if not stats:
        print("[stats] No nodes found")
        return

    print(f"[stats] Sending reports for {len(stats)} node(s)")
    for s in stats:
        msg = format_report(s)
        print(f"[stats] {s['name']}: {s['packets_7d']} packets, {s['alerts_7d']} alerts")
        try:
            sender.send(msg)
            time.sleep(5)  # space out messages to avoid flooding the mesh
        except Exception as e:
            print(f"[stats] Failed to send report for {s['name']}: {e}")

    sender.close()
    print("[stats] Done")


def seconds_until_next_monday_8am() -> int:
    """Calculate seconds until next Monday at 8:00 AM local time."""
    now = datetime.now()
    days_ahead = (7 - now.weekday()) % 7  # 0 = Monday
    if days_ahead == 0 and now.hour >= 8:
        days_ahead = 7
    target = now.replace(hour=8, minute=0, second=0, microsecond=0) + timedelta(days=days_ahead)
    return int((target - now).total_seconds())


def main():
    config = BotConfig()

    if not config.supabase_url or not config.supabase_service_key:
        print("[stats] Error: SUPABASE_URL and SUPABASE_SERVICE_KEY required in bots/.env")
        sys.exit(1)

    loop = "--loop" in sys.argv

    if loop:
        print("[stats] Running in loop mode — reports sent every Monday at 8am")
        while True:
            wait = seconds_until_next_monday_8am()
            print(f"[stats] Next report in {wait // 3600}h {(wait % 3600) // 60}m")
            time.sleep(wait)
            send_reports(config)
    else:
        print("[stats] One-shot mode — sending reports now")
        send_reports(config)


if __name__ == "__main__":
    main()
