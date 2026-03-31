"""Alert engine: evaluate node state and generate alerts."""

from datetime import datetime, timezone, timedelta


# Alert thresholds
OFFLINE_TIMEOUT_MINUTES = 10
WEAK_SIGNAL_RSSI = -110
LOW_BATTERY_PERCENT = 20


def check_packet_alerts(packet: dict) -> list[dict]:
    """Check a single packet for alert conditions. Returns list of alert dicts."""
    alerts = []

    rssi = packet.get("rssi")
    if rssi is not None and rssi < WEAK_SIGNAL_RSSI:
        alerts.append({
            "node_id": packet["node_id"],
            "alert_type": "WEAK_SIGNAL",
            "message": f"Signal strength {rssi} dBm is below {WEAK_SIGNAL_RSSI} dBm threshold",
        })

    battery = packet.get("battery_level")
    if battery is not None and battery < LOW_BATTERY_PERCENT:
        alerts.append({
            "node_id": packet["node_id"],
            "alert_type": "LOW_BATTERY",
            "message": f"Battery at {battery}% is below {LOW_BATTERY_PERCENT}% threshold",
        })

    return alerts


def find_offline_nodes(nodes: list[dict], now: datetime | None = None) -> list[dict]:
    """Given a list of node rows, return NODE_OFFLINE alerts for stale ones.

    Each node dict must have: id, last_seen (ISO string or datetime), is_online (bool).
    """
    if now is None:
        now = datetime.now(timezone.utc)

    cutoff = now - timedelta(minutes=OFFLINE_TIMEOUT_MINUTES)
    alerts = []

    for node in nodes:
        if not node.get("is_online"):
            continue

        last_seen = node.get("last_seen")
        if last_seen is None:
            continue

        if isinstance(last_seen, str):
            last_seen = datetime.fromisoformat(last_seen)

        if last_seen < cutoff:
            alerts.append({
                "node_id": node["id"],
                "alert_type": "NODE_OFFLINE",
                "message": f"Node {node.get('short_name', node['id'])} has not been seen for over {OFFLINE_TIMEOUT_MINUTES} minutes",
            })

    return alerts
