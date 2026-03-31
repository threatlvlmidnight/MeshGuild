# MeshGuild Mac Mini Setup — Paste this into Copilot

## Context
I'm setting up a Meshtastic mesh network monitoring pipeline called MeshGuild. The code is already written and pushed to GitHub. I need you to help me set up two things on this Mac Mini:

1. **Mosquitto MQTT broker** — a Meshtastic radio on my WiFi will publish mesh packets to it
2. **Python collector** — subscribes to Mosquitto and writes data to Supabase (cloud Postgres)

The radio is already configured and connected to WiFi. Once Mosquitto is running on this Mac, I just need to update the radio's MQTT server address to point here.

## Step-by-step setup

### 1. Clone the repo
```bash
git clone https://github.com/threatlvlmidnight/MeshGuild.git
cd MeshGuild
git checkout sprint-1
```

### 2. Install Mosquitto via Homebrew
```bash
brew install mosquitto
```

Create the config file at `/opt/homebrew/etc/mosquitto/mosquitto.conf` (or wherever brew installed it) with this content:
```
listener 1883 0.0.0.0
allow_anonymous true
```

Start Mosquitto:
```bash
brew services start mosquitto
```

Verify it's running:
```bash
netstat -an | grep 1883
```

### 3. Install Python dependencies
```bash
cd collector
pip3 install -r requirements.txt
```

The requirements are: `paho-mqtt>=2.0`, `supabase>=2.0`, `python-dotenv>=1.0`, `pytest>=8.0`

### 4. Create collector/.env
Create a file at `collector/.env` with these values. I will paste in my actual Supabase keys when prompted:
```
MQTT_HOST=localhost
MQTT_PORT=1883
MQTT_TOPIC=msh/US/2/json/#
SUPABASE_URL=https://oxsesryubeolaclexlvv.supabase.co
SUPABASE_SERVICE_KEY=<I will paste this>
SUPABASE_ANON_KEY=<I will paste this>
NETWORK_ID=okc-crew
```

Prompt me to paste the SUPABASE_SERVICE_KEY and SUPABASE_ANON_KEY values individually so I don't have to share them in chat.

### 5. Run the tests
```bash
cd /path/to/MeshGuild
python3 -m pytest collector/tests/ -v
```
All 30 tests should pass.

### 6. Find this Mac's WiFi IP
```bash
ipconfig getifaddr en0
```
Tell me the IP — I need to update my Meshtastic radio's MQTT server address to point to this Mac.

### 7. Run the collector
```bash
cd /path/to/MeshGuild
python3 -m collector.main
```

Expected output when working:
```
[collector] Connected to MQTT broker
[collector] Subscribed to msh/US/2/json/#
[collector] !ac1234ab | rssi=-65 snr=9.5 bat=87
```

### 8. Update radio MQTT address
Once Mosquitto is running and I know this Mac's IP, I'll open the Meshtastic app on my phone → Module configuration → MQTT → change server address from `192.168.1.126` to this Mac's IP. Then reboot the radio.

## Architecture
```
Radio (192.168.86.20) --WiFi--> Mosquitto (this Mac) --> collector.py --> Supabase (cloud)
                                                                              |
                                                            Next.js dashboard on Vercel reads from here
```

## Supabase schema
The schema is already deployed to Supabase. Tables: nodes, telemetry, alerts, xp_events, achievements, cards. The collector writes to nodes, telemetry, and alerts.

## Important notes
- The collector entry point is `collector/main.py`, run as `python3 -m collector.main` from the repo root
- The .env file is gitignored — never commit it
- Mosquitto must allow anonymous connections and listen on 0.0.0.0 (not just localhost)
- The radio publishes JSON to topic `msh/US/2/json/...` — the `#` wildcard in the subscription catches all subtopics
