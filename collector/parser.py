import json
from datetime import datetime, timezone


def parse_packet(raw_json: str | bytes) -> dict | None:
    """Parse a Meshtastic MQTT JSON packet into a normalized dict.

    Returns None if the packet is malformed or missing required fields.
    """
    if isinstance(raw_json, bytes):
        raw_json = raw_json.decode("utf-8", errors="replace")

    try:
        data = json.loads(raw_json)
    except (json.JSONDecodeError, TypeError):
        return None

    from_num = data.get("from")
    if from_num is None:
        return None

    node_id = f"!{from_num:08x}"
    raw_ts = data.get("timestamp", 0)
    timestamp = datetime.fromtimestamp(raw_ts, tz=timezone.utc).isoformat()

    result = {
        "node_id": node_id,
        "timestamp": timestamp,
        "rssi": data.get("rssi"),
        "snr": data.get("snr"),
        "packet_type": data.get("type", "unknown"),
        "short_name": None,
        "long_name": None,
        "battery_level": None,
        "uptime_seconds": None,
    }

    payload = data.get("payload", {})
    packet_type = result["packet_type"]

    if packet_type == "nodeinfo":
        user = payload.get("user", payload)
        result["short_name"] = (
            user.get("shortname")
            or user.get("shortName")
            or user.get("short_name")
        )
        result["long_name"] = (
            user.get("longname")
            or user.get("longName")
            or user.get("long_name")
        )

    elif packet_type == "telemetry":
        metrics = payload.get("device_metrics", payload)
        result["battery_level"] = metrics.get("battery_level")
        result["uptime_seconds"] = metrics.get("uptime_seconds")

    return result
