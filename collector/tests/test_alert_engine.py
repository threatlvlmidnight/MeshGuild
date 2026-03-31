from unittest.mock import MagicMock
from collector.alert_engine import AlertEngine


def make_engine(has_active=False):
    writer = MagicMock()
    writer.has_active_alert.return_value = has_active
    writer.get_stale_online_nodes.return_value = []
    engine = AlertEngine(writer, "okc-crew")
    return engine, writer


def test_weak_signal_creates_alert():
    engine, writer = make_engine(has_active=False)
    packet = {"node_id": "!abcdf028", "rssi": -115, "snr": 5.0, "battery_level": None}
    engine.check_packet(packet)
    writer.insert_alert.assert_called_once()
    call_args = writer.insert_alert.call_args
    assert call_args[0][2] == "WEAK_SIGNAL"


def test_good_signal_no_alert():
    engine, writer = make_engine(has_active=False)
    packet = {"node_id": "!abcdf028", "rssi": -80, "snr": 10.0, "battery_level": None}
    engine.check_packet(packet)
    writer.insert_alert.assert_not_called()


def test_low_battery_creates_alert():
    engine, writer = make_engine(has_active=False)
    packet = {"node_id": "!abcdf028", "rssi": -80, "snr": 10.0, "battery_level": 15}
    engine.check_packet(packet)
    writer.insert_alert.assert_called_once()
    call_args = writer.insert_alert.call_args
    assert call_args[0][2] == "LOW_BATTERY"


def test_good_battery_no_alert():
    engine, writer = make_engine(has_active=False)
    packet = {"node_id": "!abcdf028", "rssi": -80, "snr": 10.0, "battery_level": 80}
    engine.check_packet(packet)
    writer.insert_alert.assert_not_called()


def test_null_values_no_alert():
    engine, writer = make_engine(has_active=False)
    packet = {"node_id": "!abcdf028", "rssi": None, "snr": None, "battery_level": None}
    engine.check_packet(packet)
    writer.insert_alert.assert_not_called()


def test_alert_deduplication_skips_existing():
    engine, writer = make_engine(has_active=True)
    packet = {"node_id": "!abcdf028", "rssi": -115, "snr": 5.0, "battery_level": None}
    engine.check_packet(packet)
    writer.insert_alert.assert_not_called()


def test_both_weak_signal_and_low_battery():
    engine, writer = make_engine(has_active=False)
    packet = {"node_id": "!abcdf028", "rssi": -115, "snr": 5.0, "battery_level": 10}
    engine.check_packet(packet)
    assert writer.insert_alert.call_count == 2


def test_check_offline_marks_stale_nodes():
    engine, writer = make_engine(has_active=False)
    writer.get_stale_online_nodes.return_value = [
        {"id": "!abcdf028", "long_name": "EP-VLG-01"},
        {"id": "!def45678", "long_name": None},
    ]
    engine.check_offline_nodes()
    assert writer.set_node_offline.call_count == 2
    assert writer.insert_alert.call_count == 2
    first_msg = writer.insert_alert.call_args_list[0][0][3]
    assert "EP-VLG-01" in first_msg
    second_msg = writer.insert_alert.call_args_list[1][0][3]
    assert "!def45678" in second_msg


def test_check_offline_deduplication():
    engine, writer = make_engine(has_active=True)
    writer.get_stale_online_nodes.return_value = [
        {"id": "!abcdf028", "long_name": "EP-VLG-01"},
    ]
    engine.check_offline_nodes()
    writer.set_node_offline.assert_called_once()
    writer.insert_alert.assert_not_called()
