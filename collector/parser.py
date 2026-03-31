import json
from datetime import datetime, timezone


def parse_packet(raw_json: "str | bytes") -> "dict | None":
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

    # Destination node (broadcast = 0xFFFFFFFF)
    to_num = data.get("to")
    to_node_id = None
    if to_num is not None and to_num != 0xFFFFFFFF:
        to_node_id = f"!{to_num:08x}"

    result = {
        "node_id": node_id,
        "to_node_id": to_node_id,
        "channel_index": data.get("channel", 0),
        "timestamp": timestamp,
        "rssi": data.get("rssi"),
        "snr": data.get("snr"),
        "packet_type": data.get("type", "unknown"),
        "short_name": None,
        "long_name": None,
        "battery_level": None,
        "uptime_seconds": None,
        "text": None,
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

    elif packet_type == "text":
        # Text messages: payload is the message string itself
        if isinstance(payload, str):
            result["text"] = payload
        elif isinstance(payload, dict):
            result["text"] = payload.get("text", "")

    return result
