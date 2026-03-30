# Project Bible — MeshGuild

**Version:** 0.1
**Date:** 2026-03-29
**Status:** Approved

---

## What This Is

MeshGuild is an open-source platform that turns a Meshtastic LoRa mesh network into an engaged, self-sustaining community — with RPG-style progression, collectibles, and a web dashboard for monitoring and management. It is built first for a specific crew in OKC, designed from day one to be packaged and deployed by any mesh community anywhere.

The core insight: **an emergency communication network only works if people have already deployed it.** Gamification solves the cold-start problem. Friends keep nodes online to earn XP, climb leaderboards, and collect rare cards — which means the emergency network is already live and tested when it actually matters.

---

## Mission

Build a resilient, off-grid communication network for a friend group that:
1. Works completely without internet or cell infrastructure during emergencies
2. Is engaging enough in normal times that people actively want to participate
3. Requires zero ongoing effort from non-technical friends (plug in and forget)
4. Can be packaged and deployed by other mesh communities worldwide

---

## The Two Modes

### Emergency Mode
*When internet and cell are down.*

- LoRa radio is the only transport — no internet dependency whatsoever
- Friends connect to their local node via Bluetooth using the Meshtastic app
- Text messaging works across the full mesh
- Node relay happens at firmware level — no PC required
- Remote node management happens over LoRa mesh admin packets (no internet needed)
- **The dashboard is irrelevant here.** The mesh just works.

### Normal Mode
*When internet is up.*

- Dashboard accessible from anywhere via public URL
- Real-time node health monitoring (signal, uptime, battery)
- Gamification layer active: XP, leaderboards, achievements, collectibles
- Weather bot pushes NWS severe alerts to the mesh channel
- Content bots send daily MTG card, gaming prompts, group content
- Network admin can remotely reboot nodes over the mesh
- Out-of-state members can participate via MQTT internet bridge

---

## The Adoption Problem and Why Gamification Solves It

Emergency networks fail because nobody deploys them before they're needed.

For this network to function during a tornado or infrastructure failure, every friend needs:
- A node deployed and powered on at their home
- Familiarity with the Meshtastic app
- Confidence that the network works

None of that happens if the network has no normal-mode purpose.

**The gamification layer makes keeping your node online a game mechanic.** Node uptime earns XP. Relaying packets earns contribution points. Top-performing nodes drop collectible cards. The leaderboard shows who's carrying the guild. Friends who care about their ranking keep their nodes powered — which is exactly the behavior that makes the emergency network reliable.

The emergency network's reliability is a side effect of people having fun.

---

## The OKC Crew (Founding Network)

| Handle | Role | Node |
|--------|------|------|
| Owner | Network admin, builder | EP-VLG-01 |
| Micah | Early adopter, 0.5 mi east | EP-MIC-01 (planned) |
| Ben | Relay candidate, Bethany | RLY-BTH-01 (planned) |
| Alex | Relay candidate, Yukon NE | RLY-YKN-01 (planned) |
| Caleb | Western anchor, Yukon | RLY-YKN-02 (planned) |
| Tom Ish | SE branch | EP-SE-01 (planned) |
| P | Out of state — MQTT bridge | EP-REMOTE-01 (planned) |

**Group profile:** Early 30s tech-adjacent professionals. Software engineers, IT, network security, data engineering. Shared interests: MTG, gaming (League, MMOs, RPGs), competitive play, stoner culture, active Discord. Left-leaning. Already socially connected — the mesh is an addition to their world, not a replacement.

**The pitch:** *"We're building guild infrastructure. Your node is your contribution. Keep it online, keep it strong, earn your place on the leaderboard. Also: if a tornado takes out the cell towers, we can still talk."*

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    LoRa Mesh                        │
│   Node ──── Node ──── Node ──── Node ──── Node      │
│   (always works, zero internet dependency)          │
└─────────────────────────────────────────────────────┘
                          │
              (WiFi on gateway node)
                          │
                   Mosquitto (PC)
                          │
               Python Collector (PC)
                          │
                    Supabase DB
                          │
             ┌────────────┴────────────┐
             │                         │
      Vercel Dashboard          Supabase Realtime
      (public URL)             (live push to browser)
```

**Key principles:**
- The mesh operates independently of everything above the dashed line
- The dashboard is always publicly accessible (Vercel)
- The collector runs on owner's PC for now; migrates to always-on device later
- No OKC-specific hardcoding — everything is config-driven for multi-tenant deployment

---

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Radio | Meshtastic firmware on Heltec V3 | US915, LongFast |
| Local broker | Mosquitto | Runs on owner's PC |
| Collector | Python + paho-mqtt | Writes to Supabase |
| Database | Supabase (Postgres) | Realtime subscriptions |
| Frontend | Next.js on Vercel | Public URL, no server to manage |
| Auth | Supabase Auth | Admin vs member roles |
| Bots | Python scripts | Weather, MTG card, content |
| Remote admin | Meshtastic Python library | Sends admin packets over LoRa |

---

## Gamification System

### XP Sources
| Action | XP |
|--------|-----|
| Node online (per hour) | 10 |
| Packet relayed | 2 |
| Message sent on mesh | 5 |
| Node online 7 days straight | 500 bonus |
| First message during a real outage | 1000 bonus |
| Acknowledged weather alert | 25 |

### Node Levels (RPG tier names)
| Level | XP Required | Title |
|-------|------------|-------|
| 1 | 0 | Beacon |
| 2 | 500 | Relay |
| 3 | 2000 | Warden |
| 4 | 5000 | Guardian |
| 5 | 15000 | Sentinel |
| 6 | 50000 | Archnode |

### Leaderboards
- **Weekly Relay Champion** — most packets forwarded this week
- **Best Uptime** — highest percentage online this month
- **Most Active** — most messages sent
- **Guild Backbone** — all-time relay count

### Guild Health Score
A single collective score (0–100) representing the network's emergency readiness:
- Weighted average of node uptime across all deployed nodes
- Degrades when nodes go offline, recovers when they come back
- Displayed prominently on the dashboard — the whole crew is responsible for it
- Guild rank unlocks at score thresholds (e.g. score 80+ = "Battle Ready")

### Achievements
| Achievement | Trigger |
|-------------|---------|
| First Contact | Sent first mesh message |
| Long Shot | Message relayed 5+ miles |
| Grid Warrior | Sent message during a real outage |
| Night Watch | Node online 30 consecutive days |
| Backbone | Node relayed 10,000 packets |
| Pack Leader | Reached Sentinel level |
| Storm Chaser | Received a tornado warning on mesh |
| Off the Grid | Active during major cell/internet outage |

### Collectible Cards
MTG-inspired digital cards that drop as rewards. Each card represents a network event, milestone, or character archetype. Cards have rarity tiers and are permanently associated with the node that earned them.

**Drop mechanics:**
- Nodes in the top 25% of relay performance each week have a 15% chance of a card drop
- Nodes in the top 10% have a 40% chance, with increased rare/mythic probability
- Special event cards drop during real network outages (ultra-rare)
- Achievement completions guarantee a common card drop

**Rarity tiers:**
| Rarity | Color | Drop rate |
|--------|-------|-----------|
| Common | White | 60% of drops |
| Uncommon | Green | 25% of drops |
| Rare | Blue | 12% of drops |
| Mythic | Gold | 3% of drops |

**Card themes:** mesh network archetypes, OKC landmarks, weather events, radio/comms imagery, group in-jokes (to be defined with the crew)

Cards are displayed in a node's profile on the dashboard. Future: trading between nodes.

---

## Player Profile & Weekly Report

### Player Profile Page
Public URL, no login required: `meshguild.app/p/<node-id>` (e.g. `meshguild.app/p/EP-VLG-01`)

Designed to be bookmarked and shared. Non-technical friends get the link once and never need to do anything else.

**Four sections:**

**Stats** — XP total, current level with progress bar to next level, uptime percentage, relay count, current guild rank

**Leaderboard** — full guild standings with the viewing node's row highlighted. Updates in real time via Supabase Realtime.

**Collectibles** — card gallery showing all earned cards with rarity color, date earned, and the event that triggered the drop (e.g. "Earned during tornado warning, 2026-04-12")

**Tips** — dynamic, personalized suggestions generated from the node's actual telemetry:
- *"Your node went offline 3 times this week — check your power adapter or USB cable"*
- *"Your relay count is low — try moving your node higher or near a window"*
- *"You're 200 XP from reaching Warden — you're close!"*
- *"Your uptime is in the top 25% this week — you're eligible for a card drop!"*

---

### Weekly Mesh Message
Sent automatically to every node every Monday morning. Serves two purposes: delivers the player's weekly summary AND acts as a passive mesh health check — if a friend receives it, their node is online and the mesh path is clear.

**Message format** (fits within Meshtastic's 228-byte limit):
```
[MeshGuild] Weekly Report
EP-VLG-01 • Warden Lv3
XP: 4,250 (+340 this wk)
Relay rank: 2/6 | Uptime: 94%
New card: Storm Watcher (Uncommon)
meshguild.app/p/vlg01
```

**Delivery tracking:** the collector logs whether each weekly message was acknowledged by the target node. Unacknowledged messages after 24 hours trigger a `NODE_OFFLINE` dashboard alert.

---

## Content & Bot Layer

### Weather Bot
- Polls NWS API every 30 minutes for active severe weather alerts in OKC area
- Sends new alerts to the mesh channel (deduped by alert ID)
- Formats for Meshtastic's 228-byte message limit
- Also triggers a card drop event for "Storm Chaser" achievement recipients

### MTG Card of the Day
- Daily push to the mesh channel at configurable time
- Random card from Scryfall API with name and mana cost
- Short flavor text truncated to fit mesh message limit

### Daily Prompt / Vibe Check
- Daily question or prompt pushed to the channel
- Examples: "If you could add one card to your main deck, what is it?" / "Rate today 1-10"
- Configurable prompt list, community-submitted later

### Gaming Bot (future)
- League of Legends patch alert when new patch drops
- Configurable game integrations per network

---

## Remote Management

Reboot commands are sent as Meshtastic admin packets over the LoRa mesh — not over internet. This means:
- Remote reboot works even if a friend's internet is down
- As long as there is a LoRa path to the node, it can be managed
- Triggered from the dashboard by the network admin

---

## Out-of-State Member Support (P's Bridge)

For members who can't reach the LoRa mesh geographically:
- Their collector subscribes to the network's MQTT topic over the internet
- They send messages that get injected into the mesh via the gateway node
- Participates in gamification normally
- Future feature: not blocking current build

---

## Sub-Projects and Build Order

| # | Project | Description | Depends On |
|---|---------|-------------|-----------|
| 0 | Mesh Baseline | 2-node setup, range test | — |
| 1 | MQTT Infrastructure | WiFi on radio, Mosquitto config | Phase 0 |
| 2 | Collector | Python MQTT → Supabase writer | Phase 1 |
| 3 | Dashboard Core | Next.js + Supabase, node health | Phase 2 |
| 4 | Auth & Multi-tenant | Supabase Auth, network isolation | Phase 3 |
| 5 | Gamification Layer | XP, levels, leaderboards, guild score | Phase 4 |
| 6 | Collectible Cards | Drop system, card display, profiles | Phase 5 |
| 7 | Player Profile & Weekly Report | Public profile URL, weekly mesh message, tips engine | Phase 5 |
| 8 | Weather Bot | NWS alerts → mesh | Phase 2 |
| 8 | Content Bots | MTG card, daily prompt | Phase 2 |
| 9 | Remote Management | Node reboot via mesh admin | Phase 3 |
| 10 | P's Bridge | Out-of-state MQTT bridge | Phase 4 |
| 11 | Packaging | Multi-network deploy, open source | Phase 6 |

---

## Design Principles

1. **Mesh first.** Every feature is evaluated against: does this work when the internet is down? If not, it is a normal-mode feature only and must never compromise offline reliability.

2. **Zero touch for friends.** Non-technical members plug in a device and forget it. All configuration, management, and troubleshooting is handled remotely by the network admin.

3. **Config-driven from day one.** No hardcoded network names, regions, node lists, or friend handles. Every deployment gets its own configuration. This is what makes packaging possible.

4. **Fun earns reliability.** Gamification mechanics must always reward behaviors that improve network resilience (uptime, relay count, placement quality). Fun and mission are never in conflict.

5. **Start small, design wide.** Build for OKC Crew first. But every architectural decision considers: could another group deploy this with a config file change?

---

## Current Status

| Item | Status |
|------|--------|
| Radio 1 (EP-VLG-01) | Flashed, configured, operational |
| Radio 2 (EP-VLG-02) | Flashed, configured, operational |
| 2-node connectivity | Confirmed — both nodes see each other |
| Range test | Not yet run |
| WiFi / MQTT | Not yet configured |
| Dashboard | Architecture decided — Next.js + Supabase (replacing earlier Flask/SQLite draft) |
| Collector | Not yet built |
| Gamification | Designed, not yet built |

---

## What's Paused / Superseded

The earlier Flask + SQLite dashboard (partially built in `dashboard/`) is superseded by this architecture. That work should be set aside. The new stack is Next.js + Supabase.

---

## Open Questions

- Project name: **MeshGuild** is a working title — finalize with the crew
- Card art style: pixel art, illustrated, procedurally generated?
- Card trading: yes/no in v1?
- Prompt list: owner-curated or community-submitted?
- Collectible card themes: to be defined with the crew before building
