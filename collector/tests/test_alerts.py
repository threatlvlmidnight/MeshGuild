from datetime import datetime, timezone, timedelta
from collector.alerts import check_packet_alerts, find_offline_nodes


def test_weak_signal_alert():
    packet = {"node_id": "!aabbccdd", "rssi": -115, "battery_level": None}
    alerts = check_packet_alerts(packet)
    assert len(alerts) == 1
    assert alerts[0]["alert_type"] == "WEAK_SIGNAL"


def test_low_battery_alert():
    packet = {"node_id": "!aabbccdd", "rssi": -80, "battery_level": 15}
    alerts = check_packet_alerts(packet)
    assert len(alerts) == 1
    assert alerts[0]["alert_type"] == "LOW_BATTERY"


def test_both_alerts():
    packet = {"node_id": "!aabbccdd", "rssi": -120, "battery_level": 5}
    alerts = check_packet_alerts(packet)
    assert len(alerts) == 2
    types = {a["alert_type"] for a in alerts}
    assert types == {"WEAK_SIGNAL", "LOW_BATTERY"}


def test_no_alerts_healthy_packet():
    packet = {"node_id": "!aabbccdd", "rssi": -80, "battery_level": 90}
    alerts = check_packet_alerts(packet)
    assert len(alerts) == 0


def test_no_alerts_null_values():
    packet = {"node_id": "!aabbccdd", "rssi": None, "battery_level": None}
    alerts = check_packet_alerts(packet)
    assert len(alerts) == 0


def test_find_offline_nodes():
    now = datetime(2026, 3, 30, 12, 0, 0, tzinfo=timezone.utc)
    nodes = [
        {"id": "!aabb", "short_name": "V01", "last_seen": (now - timedelta(minutes=15)).isoformat(), "is_online": True},
        {"id": "!ccdd", "short_name": "V02", "last_seen": (now - timedelta(minutes=5)).isoformat(), "is_online": True},
        {"id": "!eeff", "short_name": "V03", "last_seen": (now - timedelta(minutes=20)).isoformat(), "is_online": False},
    ]
    alerts = find_offline_nodes(nodes, now=now)
    assert len(alerts) == 1
    assert alerts[0]["node_id"] == "!aabb"
    assert alerts[0]["alert_type"] == "NODE_OFFLINE"


def test_find_offline_no_stale_nodes():
    now = datetime(2026, 3, 30, 12, 0, 0, tzinfo=timezone.utc)
    nodes = [
        {"id": "!aabb", "short_name": "V01", "last_seen": (now - timedelta(minutes=3)).isoformat(), "is_online": True},
    ]
    alerts = find_offline_nodes(nodes, now=now)
    assert len(alerts) == 0
