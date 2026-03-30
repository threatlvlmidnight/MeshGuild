# Sprint 1 Design — Data Pipeline (Mesh → Dashboard)

**Version:** 1.0
**Date:** 2026-03-30
**Status:** Approved
**Sprint Goal:** Pipe data from the mesh to a live public URL.

---

## Scope

Six tickets from the backlog:

| # | Ticket | Phase |
|---|--------|-------|
| #1 | Configure WiFi on gateway radio | 1 |
| #2 | Install and configure Mosquitto on host PC | 1 |
| #3 | Configure Meshtastic MQTT uplink on OKC-CREW channel | 1 |
| #4 | Set up Supabase project and schema | 2 |
| #5 | Build Python MQTT → Supabase collector | 2 |
| #10 | Set up Next.js project on Vercel | 3 |

**Demo target:** A live public URL showing real-time node health data from the mesh.

---

## Pipeline Architecture

```
EP-VLG-01 (Radio 1)
  WiFi → Dunder-Mifflin Infinity
  MQTT → PC LAN IP:1883
  Topic: msh/US/2/json/LongFast/!<node_id>
         │
   Mosquitto (Windows service, port 1883)
         │
   collector.py (Python, runs on PC)
         │         │
      Supabase   alert checks (every 60s)
      (Postgres)
         │
   Next.js (Vercel)
   ← Supabase Realtime (WebSocket, live push)
```

### Key Decisions

- Radio connects to Mosquitto using the **PC's LAN IP** (192.168.x.x), not `localhost` — the radio is a separate WiFi device on the LAN.
- JSON-decoded topic format: `msh/US/2/json/LongFast/!<node_id>` — parsed telemetry without protobuf decoding.
- Mosquitto runs as a Windows service with auto-start on boot.
- Collector is a plain Python script run in a terminal. Windows service migration is a later concern.
- Radio 2 (EP-VLG-02) appears in data automatically once in mesh range — no config change needed.

---

## Supabase Schema

Full schema set up now (6 tables). Sprint 1 only writes to `nodes`, `telemetry`, and `alerts`. Gamification tables (`xp_events`, `achievements`, `cards`) sit empty until Sprint 5. This avoids painful migrations on live data later.

### `nodes`

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | Meshtastic node ID (`!ac1234ab`) |
| network_id | text NOT NULL | Multi-tenant key (default: `okc-crew`) |
| short_name | text | e.g. `V01` |
| long_name | text | e.g. `EP-VLG-01` |
| last_seen | timestamptz | Updated every packet |
| rssi | int | Latest dBm |
| snr | real | Latest dB |
| battery_level | int nullable | 0–100, null if USB-powered |
| is_online | boolean default true | True if last_seen within 10 min |
| xp_total | int default 0 | Cumulative XP (Sprint 5) |
| level | int default 1 | Current level 1–6 (Sprint 5) |
| created_at | timestamptz default now() | |
| updated_at | timestamptz default now() | |

### `telemetry`

| Column | Type | Notes |
|--------|------|-------|
| id | bigint PK generated always as identity | |
| node_id | text FK → nodes(id) | |
| network_id | text NOT NULL | |
| timestamp | timestamptz NOT NULL | Packet time |
| rssi | int | dBm |
| snr | real | dB |
| battery_level | int nullable | |
| uptime_seconds | int nullable | Device uptime if reported |

### `alerts`

| Column | Type | Notes |
|--------|------|-------|
| id | bigint PK generated always as identity | |
| node_id | text FK → nodes(id) | |
| network_id | text NOT NULL | |
| alert_type | text NOT NULL | `NODE_OFFLINE`, `WEAK_SIGNAL`, `LOW_BATTERY` |
| message | text NOT NULL | Human-readable |
| acknowledged | boolean default false | Dismiss from dashboard |
| created_at | timestamptz default now() | |

### `xp_events` (empty until Sprint 5)

| Column | Type | Notes |
|--------|------|-------|
| id | bigint PK generated always as identity | |
| node_id | text FK → nodes(id) | |
| network_id | text NOT NULL | |
| event_type | text NOT NULL | `UPTIME_HOUR`, `PACKET_RELAY`, `MESSAGE_SENT`, `STREAK_BONUS`, `OUTAGE_MESSAGE` |
| xp_awarded | int NOT NULL | |
| created_at | timestamptz default now() | |

### `achievements` (empty until Sprint 5)

| Column | Type | Notes |
|--------|------|-------|
| id | bigint PK generated always as identity | |
| node_id | text FK → nodes(id) | |
| network_id | text NOT NULL | |
| achievement_key | text NOT NULL | `FIRST_CONTACT`, `LONG_SHOT`, `GRID_WARRIOR`, `NIGHT_WATCH`, `BACKBONE`, `PACK_LEADER`, `STORM_CHASER`, `OFF_THE_GRID` |
| earned_at | timestamptz default now() | |

### `cards` (empty until Sprint 5)

| Column | Type | Notes |
|--------|------|-------|
| id | bigint PK generated always as identity | |
| node_id | text FK → nodes(id) | |
| network_id | text NOT NULL | |
| card_name | text NOT NULL | |
| rarity | text NOT NULL | `COMMON`, `UNCOMMON`, `RARE`, `MYTHIC` |
| trigger_event | text NOT NULL | What caused the drop |
| earned_at | timestamptz default now() | |

### Realtime

Enabled on: `nodes`, `alerts`.

### Indexes

- `telemetry(node_id, timestamp)` — history chart queries
- `alerts(network_id, acknowledged)` — active alerts dashboard query
- `xp_events(node_id)` — XP aggregation (Sprint 5)

---

## Python Collector

Single script at `collector/collector.py`.

### On each MQTT message:

1. Parse the Meshtastic JSON envelope — extract node ID, packet type, payload
2. Upsert `nodes` row — update `last_seen`, `rssi`, `snr`, `battery_level`, set `is_online = true`
3. Insert `telemetry` row with the same signal data
4. Check alert thresholds on the reporting node:
   - RSSI < -110 dBm → `WEAK_SIGNAL` alert
   - battery_level < 20 → `LOW_BATTERY` alert
   - Deduplicate: skip if unacknowledged alert of same type exists for that node

### Background timer (every 60 seconds):

- Query nodes where `last_seen` > 10 minutes ago AND `is_online = true`
- Set `is_online = false`
- Insert `NODE_OFFLINE` alert (deduplicated — skip if unacknowledged one exists)

### File structure:

```
collector/
  collector.py      # Main: MQTT subscribe loop + Supabase writes
  config.py         # Reads env vars: MQTT_HOST, MQTT_PORT, SUPABASE_URL, SUPABASE_KEY, NETWORK_ID
  requirements.txt  # paho-mqtt, supabase
```

### Configuration:

All values from environment variables with defaults:

| Env Var | Default | Notes |
|---------|---------|-------|
| MQTT_HOST | `localhost` | PC runs Mosquitto locally |
| MQTT_PORT | `1883` | Standard MQTT port |
| MQTT_TOPIC | `msh/US/2/json/#` | Meshtastic JSON wildcard |
| SUPABASE_URL | (required) | From Supabase project settings |
| SUPABASE_KEY | (required) | Service role key (server-side only) |
| NETWORK_ID | `okc-crew` | Multi-tenant identifier |

---

## Next.js Dashboard (Sprint 1 Skeleton)

Minimal but real. One page, live data, public URL.

### What ships:

- **`/`** — Node health grid. One card per node:
  - Node long name + short name
  - Online/offline badge (green/red)
  - Last seen (relative time)
  - RSSI with color coding: green (> -100), yellow (-100 to -110), red (< -110)
  - SNR with color coding: green (> -10), yellow (-10 to -15), red (< -15)
  - Battery percentage with color coding: green (> 50%), yellow (20–50%), red (< 20%). Hidden if null.
- **Active alerts banner** at the top if any unacknowledged alerts exist.
- Cards update live via Supabase Realtime (no page refresh).

### What does NOT ship in Sprint 1:

- Authentication
- Leaderboards or gamification UI
- Signal history charts
- Admin controls / remote reboot
- Alert dismiss functionality (read-only for now)

### Stack:

- Next.js 14 (App Router)
- `@supabase/supabase-js` for data + realtime
- Tailwind CSS for styling
- Deployed to Vercel, public URL
- Supabase anon key in client (read-only; RLS not enforced until Sprint 4)

---

## Out of Scope for Sprint 1

- Signal history charts (Sprint 3)
- Alert dismiss from dashboard (Sprint 3)
- Auth / admin roles (Sprint 4)
- Row-level security (Sprint 4)
- XP / gamification (Sprint 5)
- Collectible cards (Sprint 5)
- Bots (Sprint 2+)
- Remote node management (Sprint 3)
