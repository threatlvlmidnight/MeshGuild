import json
from collector.parser import parse_packet


def test_parse_telemetry_packet():
    raw = json.dumps({
        "channel": 0,
        "from": 2882400296,
        "id": 12345678,
        "payload": {
            "device_metrics": {
                "battery_level": 87,
                "voltage": 4.1,
                "channel_utilization": 5.3,
                "air_util_tx": 1.5,
                "uptime_seconds": 3600,
            }
        },
        "rssi": -65,
        "snr": 9.5,
        "sender": "!aabb0011",
        "timestamp": 1743350400,
        "to": 4294967295,
        "type": "telemetry",
    })
    packet = parse_packet(raw)
    assert packet is not None
    assert packet["node_id"] == "!abcdf028"
    assert packet["rssi"] == -65
    assert packet["snr"] == 9.5
    assert packet["packet_type"] == "telemetry"
    assert packet["battery_level"] == 87
    assert packet["uptime_seconds"] == 3600


def test_parse_telemetry_flat_payload():
    """Some firmware versions put metrics at payload root without device_metrics wrapper."""
    raw = json.dumps({
        "from": 2882400296,
        "payload": {
            "battery_level": 50,
            "voltage": 3.8,
            "uptime_seconds": 7200,
        },
        "rssi": -80,
        "snr": 5.0,
        "timestamp": 1743350400,
        "type": "telemetry",
    })
    packet = parse_packet(raw)
    assert packet is not None
    assert packet["battery_level"] == 50
    assert packet["uptime_seconds"] == 7200


def test_parse_nodeinfo_packet():
    raw = json.dumps({
        "from": 2882400296,
        "payload": {
            "id": "!abc12328",
            "longname": "EP-VLG-01",
            "shortname": "V01",
            "hardware": 43,
        },
        "rssi": -70,
        "snr": 8.0,
        "timestamp": 1743350400,
        "type": "nodeinfo",
    })
    packet = parse_packet(raw)
    assert packet is not None
    assert packet["long_name"] == "EP-VLG-01"
    assert packet["short_name"] == "V01"


def test_parse_nodeinfo_nested_user():
    """Some firmware versions nest nodeinfo under a user key."""
    raw = json.dumps({
        "from": 2882400296,
        "payload": {
            "user": {
                "id": "!abc12328",
                "longName": "EP-VLG-01",
                "shortName": "V01",
                "hwModel": "HELTEC_V3",
            }
        },
        "rssi": -70,
        "snr": 8.0,
        "timestamp": 1743350400,
        "type": "nodeinfo",
    })
    packet = parse_packet(raw)
    assert packet is not None
    assert packet["long_name"] == "EP-VLG-01"
    assert packet["short_name"] == "V01"


def test_parse_text_packet():
    raw = json.dumps({
        "from": 2882400296,
        "payload": {"text": "hello mesh"},
        "rssi": -90,
        "snr": 3.0,
        "timestamp": 1743350400,
        "type": "text",
    })
    packet = parse_packet(raw)
    assert packet is not None
    assert packet["packet_type"] == "text"
    assert packet["rssi"] == -90


def test_parse_packet_missing_rssi():
    """Gateway's own packets may not have rssi/snr."""
    raw = json.dumps({
        "from": 2882400296,
        "payload": {},
        "timestamp": 1743350400,
        "type": "position",
    })
    packet = parse_packet(raw)
    assert packet is not None
    assert packet["rssi"] is None
    assert packet["snr"] is None


def test_parse_missing_from_returns_none():
    raw = json.dumps({"payload": {}, "timestamp": 1743350400, "type": "text"})
    assert parse_packet(raw) is None


def test_parse_invalid_json_returns_none():
    assert parse_packet("not json at all") is None


def test_parse_bytes_payload():
    raw = json.dumps({"from": 1234, "type": "text", "timestamp": 0}).encode("utf-8")
    result = parse_packet(raw)
    assert result is not None
    assert result["node_id"] == "!000004d2"


def test_node_id_hex_format():
    raw = json.dumps({
        "from": 255,
        "payload": {},
        "timestamp": 1743350400,
        "type": "text",
    })
    packet = parse_packet(raw)
    assert packet["node_id"] == "!000000ff"
