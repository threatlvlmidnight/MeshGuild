# Meshtastic Network Health Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a locally-run browser dashboard that monitors Meshtastic mesh node health via MQTT, storing history in SQLite and firing desktop alerts on threshold violations.

**Architecture:** A Python collector subscribes to a local Mosquitto MQTT broker, parses Meshtastic JSON packets, writes to SQLite, and evaluates alert conditions. A Flask app serves a single-page dashboard at `http://localhost:5000` reading from the same SQLite DB.

**Tech Stack:** Python 3, paho-mqtt, Flask, SQLite, plyer, Chart.js (CDN), Mosquitto

---

## File Structure

```
c:/dev/meshtastic/
  dashboard/
    db.py              # schema init + all query helpers
    parser.py          # pure functions: parse Meshtastic MQTT packets
    alerts.py          # pure functions: evaluate alert conditions + fire notifications
    collector.py       # MQTT client: ties parser + db + alerts together
    app.py             # Flask server + all API routes
    templates/
      index.html       # single-page dashboard: node cards + chart + alerts panel
    tests/
      test_db.py
      test_parser.py
      test_alerts.py
      test_app.py
    data/              # created at runtime, gitignored
  requirements.txt
```

---

## Prerequisites (do these before Task 1)

### Install Mosquitto

1. Download from: https://mosquitto.org/download/ → Windows → `mosquitto-x.x.x-install-win64.exe`
2. Run the installer — accept defaults
3. Open **Services** (Win+R → `services.msc`), find **Mosquitto Broker**, set Startup type to **Automatic**, click Start
4. Verify it's running:
   ```bash
   netstat -an | grep 1883
   ```
   Expected: a line showing `0.0.0.0:1883` in LISTENING state

### Install Python dependencies (after requirements.txt is written in Task 1)

```bash
pip install -r requirements.txt
```

---

## Task 1: Project Setup

**Files:**
- Create: `requirements.txt`
- Create: `dashboard/data/.gitkeep`

- [ ] **Step 1: Create requirements.txt**

```
paho-mqtt>=2.0
flask>=3.0
plyer>=2.1
pytest>=8.0
```

- [ ] **Step 2: Install dependencies**

```bash
pip install -r requirements.txt
```

Expected: all four packages install without error.

- [ ] **Step 3: Create the data directory placeholder**

```bash
mkdir -p dashboard/data && mkdir -p dashboard/templates && mkdir -p dashboard/tests
```

- [ ] **Step 4: Create dashboard/tests/__init__.py**

```python
```
(empty file — makes `tests/` a package so pytest discovers it)

- [ ] **Step 5: Verify pytest runs cleanly with no tests yet**

```bash
cd c:/dev/meshtastic
pytest dashboard/tests/ -v
```

Expected:
```
============ no tests ran ============
```

---

## Task 2: Database Layer (`db.py`)

**Files:**
- Create: `dashboard/db.py`
- Create: `dashboard/tests/test_db.py`

- [ ] **Step 1: Write the failing tests**

Create `dashboard/tests/test_db.py`:

```python
import sqlite3
import time
import pytest
from dashboard.db import init_db, upsert_node, insert_telemetry, insert_alert, \
    get_nodes, get_telemetry, get_unacked_alerts, acknowledge_alert, should_alert


@pytest.fixture
def conn():
    c = sqlite3.connect(":memory:")
    c.row_factory = sqlite3.Row
    init_db(c)
    yield c
    c.close()


def test_init_db_creates_tables(conn):
    tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
    assert tables == {"nodes", "telemetry", "alerts"}


def test_upsert_node_insert(conn):
    upsert_node(conn, "!abc123", "V01", "EP-VLG-01", 1000, -85, 9.5, 80)
    row = conn.execute("SELECT * FROM nodes WHERE node_id='!abc123'").fetchone()
    assert row["short_name"] == "V01"
    assert row["rssi"] == -85


def test_upsert_node_update(conn):
    upsert_node(conn, "!abc123", "V01", "EP-VLG-01", 1000, -85, 9.5, 80)
    upsert_node(conn, "!abc123", "V01", "EP-VLG-01", 2000, -90, 8.0, 75)
    row = conn.execute("SELECT * FROM nodes WHERE node_id='!abc123'").fetchone()
    assert row["rssi"] == -90
    assert row["last_seen"] == 2000


def test_insert_telemetry(conn):
    upsert_node(conn, "!abc123", "V01", "EP-VLG-01", 1000, -85, 9.5, 80)
    insert_telemetry(conn, "!abc123", 1000, -85, 9.5, 80)
    row = conn.execute("SELECT * FROM telemetry WHERE node_id='!abc123'").fetchone()
    assert row["rssi"] == -85


def test_get_nodes_is_online(conn):
    now = int(time.time())
    upsert_node(conn, "!abc123", "V01", "EP-VLG-01", now, -85, 9.5, 80)
    upsert_node(conn, "!def456", "V02", "EP-VLG-02", now - 700, -90, 8.0, 70)
    nodes = {n["node_id"]: n for n in get_nodes(conn)}
    assert nodes["!abc123"]["is_online"] == 1
    assert nodes["!def456"]["is_online"] == 0


def test_get_telemetry_last_24h(conn):
    now = int(time.time())
    upsert_node(conn, "!abc123", "V01", "EP-VLG-01", now, -85, 9.5, 80)
    insert_telemetry(conn, "!abc123", now, -85, 9.5, 80)
    insert_telemetry(conn, "!abc123", now - 90000, -80, 10.0, 85)  # older than 24h
    rows = get_telemetry(conn, hours=24)
    assert len(rows) == 1
    assert rows[0]["rssi"] == -85


def test_insert_and_get_alerts(conn):
    upsert_node(conn, "!abc123", "V01", "EP-VLG-01", 1000, -85, 9.5, 80)
    insert_alert(conn, "!abc123", "WEAK_SIGNAL", "RSSI -115 dBm below threshold")
    alerts = get_unacked_alerts(conn)
    assert len(alerts) == 1
    assert alerts[0]["alert_type"] == "WEAK_SIGNAL"


def test_acknowledge_alert(conn):
    upsert_node(conn, "!abc123", "V01", "EP-VLG-01", 1000, -85, 9.5, 80)
    insert_alert(conn, "!abc123", "WEAK_SIGNAL", "RSSI -115 dBm below threshold")
    alert_id = get_unacked_alerts(conn)[0]["id"]
    acknowledge_alert(conn, alert_id)
    assert get_unacked_alerts(conn) == []


def test_should_alert_true_when_no_prior(conn):
    upsert_node(conn, "!abc123", "V01", "EP-VLG-01", 1000, -85, 9.5, 80)
    assert should_alert(conn, "!abc123", "NODE_OFFLINE") is True


def test_should_alert_false_when_recent_unacked(conn):
    upsert_node(conn, "!abc123", "V01", "EP-VLG-01", 1000, -85, 9.5, 80)
    insert_alert(conn, "!abc123", "NODE_OFFLINE", "Node offline")
    assert should_alert(conn, "!abc123", "NODE_OFFLINE") is False


def test_should_alert_true_when_prior_acknowledged(conn):
    upsert_node(conn, "!abc123", "V01", "EP-VLG-01", 1000, -85, 9.5, 80)
    insert_alert(conn, "!abc123", "NODE_OFFLINE", "Node offline")
    alert_id = get_unacked_alerts(conn)[0]["id"]
    acknowledge_alert(conn, alert_id)
    assert should_alert(conn, "!abc123", "NODE_OFFLINE") is True
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd c:/dev/meshtastic
pytest dashboard/tests/test_db.py -v
```

Expected: `ImportError` — `dashboard.db` does not exist yet.

- [ ] **Step 3: Create `dashboard/__init__.py`**

```python
```
(empty file)

- [ ] **Step 4: Implement `dashboard/db.py`**

```python
import sqlite3
import time


def init_db(conn):
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS nodes (
            node_id TEXT PRIMARY KEY,
            short_name TEXT,
            long_name TEXT,
            last_seen INTEGER,
            rssi INTEGER,
            snr REAL,
            battery_level INTEGER
        );
        CREATE TABLE IF NOT EXISTS telemetry (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            node_id TEXT,
            timestamp INTEGER,
            rssi INTEGER,
            snr REAL,
            battery_level INTEGER
        );
        CREATE TABLE IF NOT EXISTS alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            node_id TEXT,
            timestamp INTEGER,
            alert_type TEXT,
            message TEXT,
            acknowledged INTEGER DEFAULT 0
        );
    """)
    conn.commit()


def upsert_node(conn, node_id, short_name, long_name, last_seen, rssi, snr, battery_level):
    conn.execute("""
        INSERT INTO nodes (node_id, short_name, long_name, last_seen, rssi, snr, battery_level)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(node_id) DO UPDATE SET
            short_name=excluded.short_name,
            long_name=excluded.long_name,
            last_seen=excluded.last_seen,
            rssi=excluded.rssi,
            snr=excluded.snr,
            battery_level=excluded.battery_level
    """, (node_id, short_name, long_name, last_seen, rssi, snr, battery_level))
    conn.commit()


def insert_telemetry(conn, node_id, timestamp, rssi, snr, battery_level):
    conn.execute(
        "INSERT INTO telemetry (node_id, timestamp, rssi, snr, battery_level) VALUES (?, ?, ?, ?, ?)",
        (node_id, timestamp, rssi, snr, battery_level)
    )
    conn.commit()


def insert_alert(conn, node_id, alert_type, message):
    conn.execute(
        "INSERT INTO alerts (node_id, timestamp, alert_type, message, acknowledged) VALUES (?, ?, ?, ?, 0)",
        (node_id, int(time.time()), alert_type, message)
    )
    conn.commit()


def get_nodes(conn):
    cutoff = int(time.time()) - 600
    return conn.execute("""
        SELECT *, CASE WHEN last_seen > ? THEN 1 ELSE 0 END as is_online
        FROM nodes ORDER BY long_name
    """, (cutoff,)).fetchall()


def get_telemetry(conn, hours=24):
    cutoff = int(time.time()) - (hours * 3600)
    return conn.execute(
        "SELECT * FROM telemetry WHERE timestamp > ? ORDER BY timestamp ASC",
        (cutoff,)
    ).fetchall()


def get_unacked_alerts(conn):
    return conn.execute(
        "SELECT * FROM alerts WHERE acknowledged=0 ORDER BY timestamp DESC"
    ).fetchall()


def acknowledge_alert(conn, alert_id):
    conn.execute("UPDATE alerts SET acknowledged=1 WHERE id=?", (alert_id,))
    conn.commit()


def should_alert(conn, node_id, alert_type):
    """Return True if no unacknowledged alert of this type exists for this node in the last hour."""
    cutoff = int(time.time()) - 3600
    row = conn.execute("""
        SELECT id FROM alerts
        WHERE node_id=? AND alert_type=? AND acknowledged=0 AND timestamp > ?
        LIMIT 1
    """, (node_id, alert_type, cutoff)).fetchone()
    return row is None


def open_db(db_path):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    init_db(conn)
    return conn
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd c:/dev/meshtastic
pytest dashboard/tests/test_db.py -v
```

Expected:
```
PASSED test_init_db_creates_tables
PASSED test_upsert_node_insert
PASSED test_upsert_node_update
PASSED test_insert_telemetry
PASSED test_get_nodes_is_online
PASSED test_get_telemetry_last_24h
PASSED test_insert_and_get_alerts
PASSED test_acknowledge_alert
PASSED test_should_alert_true_when_no_prior
PASSED test_should_alert_false_when_recent_unacked
PASSED test_should_alert_true_when_prior_acknowledged
============ 11 passed ============
```

---

## Task 3: Packet Parser (`parser.py`)

**Files:**
- Create: `dashboard/parser.py`
- Create: `dashboard/tests/test_parser.py`

- [ ] **Step 1: Write the failing tests**

Create `dashboard/tests/test_parser.py`:

```python
import json
from dashboard.parser import parse_packet


NODEINFO_PAYLOAD = {
    "from": 3663920076,
    "to": 4294967295,
    "type": "nodeinfo",
    "rssi": -85,
    "snr": 9.75,
    "timestamp": 1000000,
    "payload": {
        "id": "!da4d7fcc",
        "longname": "EP-VLG-01",
        "shortname": "V01",
        "hardware": 43
    }
}

TELEMETRY_PAYLOAD = {
    "from": 3663920076,
    "to": 4294967295,
    "type": "telemetry",
    "rssi": -90,
    "snr": 8.0,
    "timestamp": 1000001,
    "payload": {
        "battery_level": 85,
        "voltage": 3.96
    }
}

POSITION_PAYLOAD = {
    "from": 3663920076,
    "type": "position",
    "rssi": -88,
    "snr": 9.0,
    "timestamp": 1000002,
    "payload": {
        "latitude_i": 355609000,
        "longitude_i": -975564000
    }
}


def test_parse_nodeinfo():
    result = parse_packet("msh/US/2/json/nodeinfo/!gateway", json.dumps(NODEINFO_PAYLOAD))
    assert result["node_id"] == "!da4d7fcc"
    assert result["long_name"] == "EP-VLG-01"
    assert result["short_name"] == "V01"
    assert result["rssi"] == -85
    assert result["snr"] == 9.75
    assert result["timestamp"] == 1000000
    assert result["battery_level"] is None


def test_parse_telemetry():
    result = parse_packet("msh/US/2/json/telemetry/!gateway", json.dumps(TELEMETRY_PAYLOAD))
    assert result["node_id"] == "!da4d7fcc"
    assert result["rssi"] == -90
    assert result["battery_level"] == 85


def test_parse_position():
    result = parse_packet("msh/US/2/json/position/!gateway", json.dumps(POSITION_PAYLOAD))
    assert result["node_id"] == "!da4d7fcc"
    assert result["rssi"] == -88


def test_parse_returns_none_for_unknown_type():
    data = {**NODEINFO_PAYLOAD, "type": "text_message"}
    result = parse_packet("msh/US/2/json/text/!gateway", json.dumps(data))
    assert result is None


def test_parse_returns_none_for_invalid_json():
    result = parse_packet("msh/US/2/json/nodeinfo/!gateway", "not json")
    assert result is None


def test_parse_uses_hex_node_id_when_no_payload_id():
    data = {**TELEMETRY_PAYLOAD}
    result = parse_packet("msh/US/2/json/telemetry/!gateway", json.dumps(data))
    # telemetry has no payload.id — node_id derived from 'from' field as hex
    assert result["node_id"] == "!da4d7fcc"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest dashboard/tests/test_parser.py -v
```

Expected: `ImportError` — `dashboard.parser` does not exist.

- [ ] **Step 3: Implement `dashboard/parser.py`**

```python
import json


HANDLED_TYPES = {"nodeinfo", "telemetry", "position"}


def _int_to_node_id(from_int):
    """Convert Meshtastic 'from' integer to !hex node ID string."""
    return f"!{from_int & 0xFFFFFFFF:08x}"


def parse_packet(topic, payload_str):
    """
    Parse a Meshtastic MQTT JSON packet.
    Returns a dict with normalized fields, or None if the packet should be ignored.

    Returned dict keys:
        node_id (str), short_name (str|None), long_name (str|None),
        timestamp (int), rssi (int|None), snr (float|None), battery_level (int|None)
    """
    try:
        data = json.loads(payload_str)
    except (json.JSONDecodeError, TypeError):
        return None

    packet_type = data.get("type")
    if packet_type not in HANDLED_TYPES:
        return None

    payload = data.get("payload", {})
    from_int = data.get("from", 0)

    # node_id: prefer payload.id (nodeinfo), fall back to hex of 'from'
    node_id = payload.get("id") or _int_to_node_id(from_int)

    short_name = payload.get("shortname")
    long_name = payload.get("longname")
    battery_level = payload.get("battery_level")
    rssi = data.get("rssi")
    snr = data.get("snr")
    timestamp = data.get("timestamp") or 0

    return {
        "node_id": node_id,
        "short_name": short_name,
        "long_name": long_name,
        "timestamp": int(timestamp),
        "rssi": int(rssi) if rssi is not None else None,
        "snr": float(snr) if snr is not None else None,
        "battery_level": int(battery_level) if battery_level is not None else None,
    }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest dashboard/tests/test_parser.py -v
```

Expected:
```
PASSED test_parse_nodeinfo
PASSED test_parse_telemetry
PASSED test_parse_position
PASSED test_parse_returns_none_for_unknown_type
PASSED test_parse_returns_none_for_invalid_json
PASSED test_parse_uses_hex_node_id_when_no_payload_id
============ 6 passed ============
```

---

## Task 4: Alert Engine (`alerts.py`)

**Files:**
- Create: `dashboard/alerts.py`
- Create: `dashboard/tests/test_alerts.py`

- [ ] **Step 1: Write the failing tests**

Create `dashboard/tests/test_alerts.py`:

```python
import sqlite3
import time
import pytest
from unittest.mock import patch
from dashboard.db import init_db, upsert_node, get_unacked_alerts
from dashboard.alerts import check_packet_alerts, check_offline_nodes


@pytest.fixture
def conn():
    c = sqlite3.connect(":memory:")
    c.row_factory = sqlite3.Row
    init_db(c)
    upsert_node(c, "!abc123", "V01", "EP-VLG-01", int(time.time()), -85, 9.5, 80)
    yield c
    c.close()


def test_weak_signal_alert_fires(conn):
    with patch("dashboard.alerts.notify") as mock_notify:
        check_packet_alerts(conn, "!abc123", rssi=-115, battery_level=80)
        alerts = get_unacked_alerts(conn)
        assert any(a["alert_type"] == "WEAK_SIGNAL" for a in alerts)
        mock_notify.assert_called_once()


def test_weak_signal_alert_does_not_fire_above_threshold(conn):
    with patch("dashboard.alerts.notify"):
        check_packet_alerts(conn, "!abc123", rssi=-105, battery_level=80)
        alerts = get_unacked_alerts(conn)
        assert not any(a["alert_type"] == "WEAK_SIGNAL" for a in alerts)


def test_low_battery_alert_fires(conn):
    with patch("dashboard.alerts.notify") as mock_notify:
        check_packet_alerts(conn, "!abc123", rssi=-85, battery_level=15)
        alerts = get_unacked_alerts(conn)
        assert any(a["alert_type"] == "LOW_BATTERY" for a in alerts)
        mock_notify.assert_called_once()


def test_low_battery_does_not_fire_when_none(conn):
    with patch("dashboard.alerts.notify"):
        check_packet_alerts(conn, "!abc123", rssi=-85, battery_level=None)
        alerts = get_unacked_alerts(conn)
        assert not any(a["alert_type"] == "LOW_BATTERY" for a in alerts)


def test_node_offline_alert_fires(conn):
    # Make node appear offline by setting last_seen to 11 minutes ago
    old_time = int(time.time()) - 660
    upsert_node(conn, "!abc123", "V01", "EP-VLG-01", old_time, -85, 9.5, 80)
    with patch("dashboard.alerts.notify") as mock_notify:
        check_offline_nodes(conn)
        alerts = get_unacked_alerts(conn)
        assert any(a["alert_type"] == "NODE_OFFLINE" for a in alerts)
        mock_notify.assert_called_once()


def test_node_offline_does_not_fire_when_online(conn):
    with patch("dashboard.alerts.notify"):
        check_offline_nodes(conn)
        alerts = get_unacked_alerts(conn)
        assert not any(a["alert_type"] == "NODE_OFFLINE" for a in alerts)


def test_alert_deduplication(conn):
    with patch("dashboard.alerts.notify"):
        check_packet_alerts(conn, "!abc123", rssi=-115, battery_level=80)
        check_packet_alerts(conn, "!abc123", rssi=-115, battery_level=80)
        alerts = [a for a in get_unacked_alerts(conn) if a["alert_type"] == "WEAK_SIGNAL"]
        assert len(alerts) == 1
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest dashboard/tests/test_alerts.py -v
```

Expected: `ImportError` — `dashboard.alerts` does not exist.

- [ ] **Step 3: Implement `dashboard/alerts.py`**

```python
import time
from dashboard.db import insert_alert, should_alert, get_nodes

RSSI_THRESHOLD = -110
BATTERY_THRESHOLD = 20
OFFLINE_TIMEOUT = 600  # 10 minutes in seconds


def notify(title, message):
    """Fire a desktop notification. Wrapped for testability."""
    try:
        from plyer import notification
        notification.notify(title=title, message=message, timeout=10)
    except Exception:
        pass  # Never crash the collector due to notification failure


def _fire(conn, node_id, alert_type, message):
    if should_alert(conn, node_id, alert_type):
        insert_alert(conn, node_id, alert_type, message)
        notify(f"Meshtastic: {alert_type}", message)


def check_packet_alerts(conn, node_id, rssi, battery_level):
    """Check WEAK_SIGNAL and LOW_BATTERY on each received packet."""
    if rssi is not None and rssi < RSSI_THRESHOLD:
        _fire(conn, node_id, "WEAK_SIGNAL", f"{node_id} RSSI {rssi} dBm is below {RSSI_THRESHOLD} dBm")

    if battery_level is not None and battery_level < BATTERY_THRESHOLD:
        _fire(conn, node_id, "LOW_BATTERY", f"{node_id} battery at {battery_level}%")


def check_offline_nodes(conn):
    """Check all known nodes for NODE_OFFLINE. Called on a timer."""
    cutoff = int(time.time()) - OFFLINE_TIMEOUT
    for node in get_nodes(conn):
        if node["last_seen"] < cutoff:
            _fire(conn, node["node_id"], "NODE_OFFLINE",
                  f"{node['long_name'] or node['node_id']} has not been seen for over 10 minutes")
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest dashboard/tests/test_alerts.py -v
```

Expected:
```
PASSED test_weak_signal_alert_fires
PASSED test_weak_signal_alert_does_not_fire_above_threshold
PASSED test_low_battery_alert_fires
PASSED test_low_battery_does_not_fire_when_none
PASSED test_node_offline_alert_fires
PASSED test_node_offline_does_not_fire_when_online
PASSED test_alert_deduplication
============ 7 passed ============
```

---

## Task 5: Collector (`collector.py`)

**Files:**
- Create: `dashboard/collector.py`

No unit tests for the collector — it is a thin integration layer that wires MQTT → parser → db → alerts. The components it calls are already tested. Manual verification is sufficient.

- [ ] **Step 1: Create `dashboard/collector.py`**

```python
import time
import threading
import paho.mqtt.client as mqtt
from dashboard.db import open_db, upsert_node, insert_telemetry
from dashboard.parser import parse_packet
from dashboard.alerts import check_packet_alerts, check_offline_nodes

DB_PATH = "dashboard/data/mesh.db"
MQTT_HOST = "localhost"
MQTT_PORT = 1883
MQTT_TOPIC = "msh/#"
OFFLINE_CHECK_INTERVAL = 60  # seconds


def on_message(client, userdata, msg):
    conn = userdata["conn"]
    packet = parse_packet(msg.topic, msg.payload.decode("utf-8", errors="ignore"))
    if packet is None:
        return

    node_id = packet["node_id"]
    timestamp = packet["timestamp"] or int(time.time())
    rssi = packet["rssi"]
    snr = packet["snr"]
    battery_level = packet["battery_level"]
    short_name = packet["short_name"] or node_id
    long_name = packet["long_name"] or node_id

    upsert_node(conn, node_id, short_name, long_name, timestamp, rssi, snr, battery_level)

    if rssi is not None:
        insert_telemetry(conn, node_id, timestamp, rssi, snr, battery_level)

    check_packet_alerts(conn, node_id, rssi, battery_level)
    print(f"[{time.strftime('%H:%M:%S')}] {long_name} rssi={rssi} snr={snr} battery={battery_level}")


def offline_checker(conn):
    while True:
        time.sleep(OFFLINE_CHECK_INTERVAL)
        check_offline_nodes(conn)


def main():
    conn = open_db(DB_PATH)

    thread = threading.Thread(target=offline_checker, args=(conn,), daemon=True)
    thread.start()

    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    client.user_data_set({"conn": conn})
    client.on_message = on_message
    client.connect(MQTT_HOST, MQTT_PORT)
    client.subscribe(MQTT_TOPIC)

    print(f"Collector running — subscribed to {MQTT_TOPIC} on {MQTT_HOST}:{MQTT_PORT}")
    client.loop_forever()


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Verify the collector starts without error**

Make sure Mosquitto is running first (see Prerequisites), then:

```bash
cd c:/dev/meshtastic
python dashboard/collector.py
```

Expected output:
```
Collector running — subscribed to msh/# on localhost:1883
```

It will sit idle until Radio 1 is configured to publish MQTT. Ctrl+C to stop.

---

## Task 6: Flask App (`app.py`)

**Files:**
- Create: `dashboard/app.py`
- Create: `dashboard/tests/test_app.py`

- [ ] **Step 1: Write the failing tests**

Create `dashboard/tests/test_app.py`:

```python
import sqlite3
import time
import pytest
from dashboard.db import init_db, upsert_node, insert_telemetry, insert_alert
from dashboard.app import create_app


@pytest.fixture
def client():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    init_db(conn)
    now = int(time.time())
    upsert_node(conn, "!abc123", "V01", "EP-VLG-01", now, -85, 9.5, 80)
    insert_telemetry(conn, "!abc123", now, -85, 9.5, 80)
    insert_alert(conn, "!abc123", "WEAK_SIGNAL", "Signal weak")
    app = create_app(conn)
    app.config["TESTING"] = True
    with app.test_client() as c:
        yield c


def test_index_returns_200(client):
    response = client.get("/")
    assert response.status_code == 200


def test_api_nodes_returns_nodes(client):
    response = client.get("/api/nodes")
    assert response.status_code == 200
    data = response.get_json()
    assert len(data) == 1
    assert data[0]["node_id"] == "!abc123"
    assert data[0]["short_name"] == "V01"
    assert "is_online" in data[0]


def test_api_telemetry_returns_data(client):
    response = client.get("/api/telemetry")
    assert response.status_code == 200
    data = response.get_json()
    assert len(data) == 1
    assert data[0]["node_id"] == "!abc123"


def test_api_alerts_returns_unacked(client):
    response = client.get("/api/alerts")
    assert response.status_code == 200
    data = response.get_json()
    assert len(data) == 1
    assert data[0]["alert_type"] == "WEAK_SIGNAL"


def test_api_acknowledge_alert(client):
    alerts = client.get("/api/alerts").get_json()
    alert_id = alerts[0]["id"]
    response = client.post(f"/api/alerts/{alert_id}/acknowledge")
    assert response.status_code == 200
    remaining = client.get("/api/alerts").get_json()
    assert remaining == []
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest dashboard/tests/test_app.py -v
```

Expected: `ImportError` — `dashboard.app` does not exist.

- [ ] **Step 3: Implement `dashboard/app.py`**

```python
from flask import Flask, render_template, jsonify
from dashboard.db import open_db, get_nodes, get_telemetry, get_unacked_alerts, acknowledge_alert

DB_PATH = "dashboard/data/mesh.db"


def create_app(conn=None):
    app = Flask(__name__, template_folder="templates")

    if conn is None:
        conn = open_db(DB_PATH)

    @app.route("/")
    def index():
        return render_template("index.html")

    @app.route("/api/nodes")
    def api_nodes():
        rows = get_nodes(conn)
        return jsonify([dict(r) for r in rows])

    @app.route("/api/telemetry")
    def api_telemetry():
        rows = get_telemetry(conn, hours=24)
        return jsonify([dict(r) for r in rows])

    @app.route("/api/alerts")
    def api_alerts():
        rows = get_unacked_alerts(conn)
        return jsonify([dict(r) for r in rows])

    @app.route("/api/alerts/<int:alert_id>/acknowledge", methods=["POST"])
    def api_acknowledge(alert_id):
        acknowledge_alert(conn, alert_id)
        return jsonify({"ok": True})

    return app


if __name__ == "__main__":
    app = create_app()
    app.run(debug=False, port=5000)
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest dashboard/tests/test_app.py -v
```

Expected:
```
PASSED test_index_returns_200
PASSED test_api_nodes_returns_nodes
PASSED test_api_telemetry_returns_data
PASSED test_api_alerts_returns_unacked
PASSED test_api_acknowledge_alert
============ 5 passed ============
```

---

## Task 7: Dashboard UI (`index.html`)

**Files:**
- Create: `dashboard/templates/index.html`

No automated tests — verify manually by running the app and opening the browser.

- [ ] **Step 1: Create `dashboard/templates/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="refresh" content="30">
  <title>Meshtastic Network Health</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #0f172a; color: #e2e8f0; padding: 24px; }
    h1 { font-size: 1.4rem; font-weight: 600; margin-bottom: 24px; color: #f8fafc; }
    h2 { font-size: 1rem; font-weight: 600; margin-bottom: 12px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; }

    .nodes { display: flex; flex-wrap: wrap; gap: 16px; margin-bottom: 32px; }
    .card { background: #1e293b; border-radius: 8px; padding: 16px; min-width: 220px; }
    .card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .card-name { font-weight: 600; font-size: 1rem; }
    .card-short { font-size: 0.75rem; color: #94a3b8; margin-top: 2px; }
    .badge { font-size: 0.7rem; font-weight: 700; padding: 2px 8px; border-radius: 999px; }
    .badge-online { background: #166534; color: #4ade80; }
    .badge-offline { background: #7f1d1d; color: #f87171; }
    .stat { display: flex; justify-content: space-between; font-size: 0.85rem; margin-top: 6px; }
    .stat-label { color: #94a3b8; }
    .green { color: #4ade80; }
    .yellow { color: #fbbf24; }
    .red { color: #f87171; }
    .muted { color: #64748b; }

    .chart-section { background: #1e293b; border-radius: 8px; padding: 16px; margin-bottom: 32px; }
    .chart-wrap { position: relative; height: 240px; }

    .alerts-section { background: #1e293b; border-radius: 8px; padding: 16px; }
    .alert-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid #334155; font-size: 0.85rem; }
    .alert-row:last-child { border-bottom: none; }
    .alert-meta { color: #94a3b8; font-size: 0.75rem; margin-top: 2px; }
    .dismiss-btn { background: #334155; color: #e2e8f0; border: none; border-radius: 4px; padding: 4px 10px; cursor: pointer; font-size: 0.75rem; }
    .dismiss-btn:hover { background: #475569; }
    .no-alerts { color: #64748b; font-size: 0.85rem; }
  </style>
</head>
<body>
  <h1>Meshtastic Network Health</h1>

  <h2>Nodes</h2>
  <div class="nodes" id="nodes-container">Loading...</div>

  <div class="chart-section">
    <h2>Signal History (24h)</h2>
    <div class="chart-wrap">
      <canvas id="rssi-chart"></canvas>
    </div>
  </div>

  <div class="alerts-section">
    <h2>Alerts</h2>
    <div id="alerts-container"><span class="no-alerts">No active alerts</span></div>
  </div>

<script>
function rssiColor(v) {
  if (v === null) return 'muted';
  if (v > -100) return 'green';
  if (v > -110) return 'yellow';
  return 'red';
}
function snrColor(v) {
  if (v === null) return 'muted';
  if (v > -10) return 'green';
  if (v > -15) return 'yellow';
  return 'red';
}
function battColor(v) {
  if (v === null) return 'muted';
  if (v > 50) return 'green';
  if (v > 20) return 'yellow';
  return 'red';
}
function relativeTime(ts) {
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
  return `${Math.floor(diff/3600)}h ago`;
}

async function loadNodes() {
  const nodes = await fetch('/api/nodes').then(r => r.json());
  const container = document.getElementById('nodes-container');
  if (!nodes.length) { container.innerHTML = '<span class="muted">No nodes seen yet</span>'; return; }
  container.innerHTML = nodes.map(n => `
    <div class="card">
      <div class="card-header">
        <div>
          <div class="card-name">${n.long_name || n.node_id}</div>
          <div class="card-short">${n.short_name || ''}</div>
        </div>
        <span class="badge ${n.is_online ? 'badge-online' : 'badge-offline'}">${n.is_online ? 'ONLINE' : 'OFFLINE'}</span>
      </div>
      <div class="stat"><span class="stat-label">Last seen</span><span>${relativeTime(n.last_seen)}</span></div>
      <div class="stat"><span class="stat-label">RSSI</span><span class="${rssiColor(n.rssi)}">${n.rssi !== null ? n.rssi + ' dBm' : '—'}</span></div>
      <div class="stat"><span class="stat-label">SNR</span><span class="${snrColor(n.snr)}">${n.snr !== null ? n.snr + ' dB' : '—'}</span></div>
      ${n.battery_level !== null ? `<div class="stat"><span class="stat-label">Battery</span><span class="${battColor(n.battery_level)}">${n.battery_level}%</span></div>` : ''}
    </div>
  `).join('');
}

async function loadChart() {
  const rows = await fetch('/api/telemetry').then(r => r.json());
  const nodeMap = {};
  rows.forEach(r => {
    if (!nodeMap[r.node_id]) nodeMap[r.node_id] = { labels: [], data: [] };
    nodeMap[r.node_id].labels.push(new Date(r.timestamp * 1000).toLocaleTimeString());
    nodeMap[r.node_id].data.push(r.rssi);
  });
  const colors = ['#38bdf8', '#4ade80', '#fbbf24', '#f87171', '#a78bfa'];
  const datasets = Object.entries(nodeMap).map(([id, d], i) => ({
    label: id,
    data: d.data,
    borderColor: colors[i % colors.length],
    backgroundColor: 'transparent',
    tension: 0.3,
    pointRadius: 2,
  }));
  new Chart(document.getElementById('rssi-chart'), {
    type: 'line',
    data: { labels: Object.values(nodeMap)[0]?.labels || [], datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#94a3b8' } } },
      scales: {
        x: { ticks: { color: '#64748b', maxTicksLimit: 8 }, grid: { color: '#1e293b' } },
        y: { ticks: { color: '#64748b' }, grid: { color: '#334155' }, title: { display: true, text: 'RSSI (dBm)', color: '#64748b' } }
      }
    }
  });
}

async function loadAlerts() {
  const alerts = await fetch('/api/alerts').then(r => r.json());
  const container = document.getElementById('alerts-container');
  if (!alerts.length) { container.innerHTML = '<span class="no-alerts">No active alerts</span>'; return; }
  container.innerHTML = alerts.map(a => `
    <div class="alert-row" id="alert-${a.id}">
      <div>
        <div>${a.message}</div>
        <div class="alert-meta">${a.alert_type} · ${new Date(a.timestamp * 1000).toLocaleString()}</div>
      </div>
      <button class="dismiss-btn" onclick="dismiss(${a.id})">Dismiss</button>
    </div>
  `).join('');
}

async function dismiss(id) {
  await fetch(`/api/alerts/${id}/acknowledge`, { method: 'POST' });
  document.getElementById(`alert-${id}`)?.remove();
  if (!document.querySelector('.alert-row')) {
    document.getElementById('alerts-container').innerHTML = '<span class="no-alerts">No active alerts</span>';
  }
}

loadNodes();
loadChart();
loadAlerts();
</script>
</body>
</html>
```

- [ ] **Step 2: Run the full test suite to confirm nothing broke**

```bash
cd c:/dev/meshtastic
pytest dashboard/tests/ -v
```

Expected: all 24 tests pass.

- [ ] **Step 3: Start the Flask app and verify the dashboard loads**

```bash
python dashboard/app.py
```

Open browser to: http://localhost:5000

Expected: dark dashboard with "No nodes seen yet", empty chart, "No active alerts". The page structure and layout should be visible.

---

## Task 8: Verify End-to-End (Radio Required)

This task requires Radio 1 to be configured with WiFi and MQTT. See the Radio Configuration section in the spec: [docs/superpowers/specs/2026-03-29-mqtt-dashboard-design.md](../specs/2026-03-29-mqtt-dashboard-design.md)

**In the Meshtastic app:**

1. Go to **Radio Config → Network**
   - Enable WiFi
   - Enter your home WiFi SSID and password
   - Save

2. Go to **Radio Config → MQTT**
   - Enable MQTT
   - Server address: your PC's LAN IP (find it with `ipconfig` — look for IPv4 address, e.g. `192.168.1.100`)
   - Port: 1883
   - Username/password: leave blank
   - Root topic: `msh`
   - Save

3. Go to **Channels → OKC-CREW**
   - Enable **Uplink**
   - Save

- [ ] **Step 1: Start the collector**

```bash
python dashboard/collector.py
```

- [ ] **Step 2: Start the dashboard**

In a second terminal:
```bash
python dashboard/app.py
```

- [ ] **Step 3: Verify packets arrive**

Within 1–2 minutes of Radio 1 connecting to WiFi, the collector terminal should show lines like:
```
[14:32:01] EP-VLG-01 rssi=-85 snr=9.75 battery=80
```

- [ ] **Step 4: Verify dashboard updates**

Refresh http://localhost:5000 — the node card for EP-VLG-01 should appear with live signal data.
