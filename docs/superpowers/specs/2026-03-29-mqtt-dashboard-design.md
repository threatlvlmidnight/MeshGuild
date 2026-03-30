# Meshtastic Network Health Dashboard — Design Spec

**Date:** 2026-03-29
**Status:** Approved

---

## Goal

A locally-run browser dashboard that monitors the health of the OKC Meshtastic mesh network in real time — showing node status, signal strength history, battery levels, and firing desktop alerts when nodes go offline or thresholds are crossed.

---

## Architecture

Three components, each with one responsibility:

```
Radio 1 (WiFi) --> Mosquitto (local MQTT broker) --> Python collector --> SQLite DB
                                                                       --> Flask dashboard (http://localhost:5000)
                                                                       --> Desktop alerts (plyer)
```

- **Mosquitto** — MQTT broker running as a local Windows service. Radio 1 connects over WiFi and publishes Meshtastic packets to it.
- **Python collector** (`collector.py`) — subscribes to Mosquitto, parses incoming Meshtastic JSON packets, writes to SQLite, evaluates alert conditions.
- **Flask dashboard** (`app.py`) — serves a single-page browser UI that reads from SQLite and auto-refreshes every 30 seconds.

All components run on the user's PC. No cloud services, no authentication required.

---

## Radio Configuration (Prerequisite)

Before the dashboard works, Radio 1 must be configured in the Meshtastic app:

- **WiFi:** set SSID and password under Radio Config → Network
- **MQTT:** enable under Radio Config → MQTT, point to `localhost` (or PC's LAN IP), no auth, topic prefix `msh/`
- **Uplink:** enable on Channel 0 (OKC-CREW) so node packets are published to MQTT

---

## Data Model

SQLite database at `data/mesh.db`. Three tables:

### `nodes`
One row per node. Updated on every received packet.

| Column | Type | Notes |
|--------|------|-------|
| node_id | TEXT PRIMARY KEY | Meshtastic node ID (e.g. `!ac1234ab`) |
| short_name | TEXT | e.g. `V01` |
| long_name | TEXT | e.g. `EP-VLG-01` |
| last_seen | INTEGER | Unix timestamp |
| rssi | INTEGER | dBm, most recent |
| snr | REAL | dB, most recent |
| battery_level | INTEGER | 0–100, null if not reported |
| is_online | INTEGER | 1 if last_seen within 10 min, else 0 |

### `telemetry`
Time-series rows for history charts. One row per received packet per node.

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PRIMARY KEY | autoincrement |
| node_id | TEXT | foreign key → nodes.node_id |
| timestamp | INTEGER | Unix timestamp |
| rssi | INTEGER | dBm |
| snr | REAL | dB |
| battery_level | INTEGER | nullable |

### `alerts`
Log of triggered alerts.

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PRIMARY KEY | autoincrement |
| node_id | TEXT | foreign key → nodes.node_id |
| timestamp | INTEGER | Unix timestamp |
| alert_type | TEXT | see Alert Types below |
| message | TEXT | human-readable description |
| acknowledged | INTEGER | 0 or 1 |

---

## Alert Types

| Type | Trigger Condition |
|------|------------------|
| `NODE_OFFLINE` | `last_seen` older than 10 minutes |
| `WEAK_SIGNAL` | RSSI < -110 dBm |
| `LOW_BATTERY` | battery_level < 20% |

- Alerts are deduplicated — a new `NODE_OFFLINE` alert is only written if the previous one for that node has been acknowledged or is older than 1 hour.
- Desktop notification fires via `plyer.notification.notify()` at the same time the alert row is written.
- `NODE_OFFLINE` is checked on a 60-second background timer in the collector, not just on packet receipt.

---

## Dashboard (browser, `http://localhost:5000`)

Single-page UI. Auto-refreshes every 30 seconds via `<meta http-equiv="refresh">`.

### Node Cards
One card per node in the `nodes` table:
- Node long name + short name
- **Online/Offline badge** — green if `is_online = 1`, red if `is_online = 0`
- **Last seen** — human-readable relative time (e.g. "3 min ago")
- **RSSI** — value in dBm with color: green (> -100), yellow (-100 to -110), red (< -110)
- **SNR** — value in dB with color: green (> -10), yellow (-10 to -15), red (< -15)
- **Battery** — percentage with color: green (> 50%), yellow (20–50%), red (< 20%). Hidden if null.

### Signal History Chart
Line chart (Chart.js) showing RSSI over the last 24 hours, one line per node.
X-axis: time. Y-axis: RSSI in dBm. Renders from `telemetry` table.

### Alerts Panel
List of unacknowledged alerts, newest first:
- Timestamp, node short name, alert type, message
- **Dismiss** button per alert — sets `acknowledged = 1` via POST endpoint

---

## File Structure

```
c:/dev/meshtastic/
  dashboard/
    collector.py       # MQTT subscriber + SQLite writer + alert engine
    app.py             # Flask web server + routes
    db.py              # SQLite schema init + query helpers
    templates/
      index.html       # Dashboard HTML + Chart.js
    data/
      mesh.db          # SQLite database (gitignored)
  requirements.txt     # paho-mqtt, flask, plyer
```

---

## Tech Stack

| Component | Library/Tool | Version |
|-----------|-------------|---------|
| MQTT broker | Mosquitto | latest stable (Windows installer) |
| MQTT client | paho-mqtt | ^2.0 |
| Web framework | Flask | ^3.0 |
| Charts | Chart.js | CDN (no install) |
| Desktop alerts | plyer | ^2.1 |
| Database | SQLite | built into Python |

---

## Running the System

Two processes run concurrently:

```bash
# Terminal 1 — data collector
python dashboard/collector.py

# Terminal 2 — web dashboard
python dashboard/app.py
```

Mosquitto runs as a Windows background service (auto-start on boot after install).

---

## Out of Scope

- Authentication / access control
- Mobile-responsive layout
- Historical data beyond 24 hours in the chart (rows older than 24h can be pruned)
- MQTT over TLS
- Multi-channel support (Channel 0 only for now)
