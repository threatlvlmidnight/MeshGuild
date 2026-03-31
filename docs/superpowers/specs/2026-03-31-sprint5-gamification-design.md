# Sprint 5 Design — XP, Gamification & Collectible Cards

**Version:** 1.0
**Date:** 2026-03-31
**Status:** Approved
**Sprint Goal:** Populate the gamification tables with a live XP engine, achievement system, card drop mechanics, leaderboard, and node profile pages.

---

## Scope

| # | Feature | Layer |
|---|---------|-------|
| 1 | XP Engine — award XP on uptime, packets, streaks | Collector |
| 2 | Level System — compute level from XP total | Collector + Dashboard |
| 3 | Achievement Engine — detect and award achievements | Collector |
| 4 | Card Drop System — rarity-weighted card drops | Collector |
| 5 | Guild Health Score — network-wide readiness metric | Dashboard |
| 6 | Leaderboard Page — XP, uptime, relays | Dashboard |
| 7 | Node Profile Page — stats, achievements, cards | Dashboard |
| 8 | Home Page — add XP / level badges to node cards | Dashboard |
| 9 | Weekly Stats Bot — add XP/level to reports | Bots |

---

## XP Sources

| Action | XP | Event Type | Trigger |
|--------|-----|------------|---------|
| Node online (per hour) | 10 | `UPTIME_HOUR` | Hourly background timer in collector |
| Packet received (telemetry) | 2 | `PACKET_RELAY` | Each MQTT message processed |
| Node online 7 days straight | 500 | `STREAK_BONUS` | Hourly check, once per streak |

> MESSAGE_SENT and OUTAGE_MESSAGE require mesh channel message detection (future).

---

## Level System

| Level | XP Required | Title |
|-------|------------|-------|
| 1 | 0 | Beacon |
| 2 | 500 | Relay |
| 3 | 2000 | Warden |
| 4 | 5000 | Guardian |
| 5 | 15000 | Sentinel |
| 6 | 50000 | Archnode |

Level is computed from `xp_total` on the `nodes` table. Updated after each XP award.

---

## Achievements

| Key | Trigger | Detection |
|-----|---------|-----------|
| `FIRST_CONTACT` | First telemetry packet from node | On first upsert (created_at == updated_at) |
| `NIGHT_WATCH` | Node online 30 consecutive days | Hourly check in collector |
| `BACKBONE` | Node relayed 10,000 packets | Telemetry count check on packet |

> LONG_SHOT, GRID_WARRIOR, STORM_CHASER, OFF_THE_GRID, PACK_LEADER require data not yet available (distance calc, outage detection, level 5). Stubbed for future sprints.

---

## Card Drop System

Cards drop on weekly XP evaluations (triggered by the weekly stats bot or a collector timer).

**Drop mechanics:**
- Top 25% of nodes by weekly XP: 15% chance of card drop
- Top 10%: 40% chance, boosted rare/mythic odds
- Achievement earned: guaranteed common card

**Rarity weights (normal):**
| Rarity | Weight | Color |
|--------|--------|-------|
| COMMON | 60% | White |
| UNCOMMON | 25% | Green |
| RARE | 12% | Blue |
| MYTHIC | 3% | Gold |

**Rarity weights (top 10% boost):**
| Rarity | Weight |
|--------|--------|
| COMMON | 40% |
| UNCOMMON | 30% |
| RARE | 20% |
| MYTHIC | 10% |

**Card name pool (initial):**
- Common: Signal Spark, Mesh Runner, Packet Mule, Relay Rookie, Beacon Keeper
- Uncommon: Grid Walker, Night Relay, Storm Rider, Warden's Watch, Signal Sage
- Rare: Backbone Node, Chain Lightning, Ghost Relay, Archon's Grace
- Mythic: Off The Grid, Eye of the Storm, The Archnode, Meshweaver

---

## Guild Health Score

A network-wide score 0–100 displayed on the dashboard:

```
Guild Health = (online_nodes / total_nodes) × 100
```

**Guild Rank thresholds:**
| Score | Rank |
|-------|------|
| 90+ | Battle Ready |
| 70–89 | Operational |
| 50–69 | Degraded |
| < 50 | Critical |

Computed client-side from nodes data, no new DB writes.

---

## Dashboard Pages

### `/leaderboard` — New Page
- Sortable table: Node name, Level, XP, Title
- Guild Health Score badge at top
- Color-coded level badges

### `/node/[id]` — Enhanced
- Add XP stats section: level, title, XP total, progress to next level
- Achievements gallery (earned badges)
- Card collection (with rarity colors)
- Keep existing signal charts and admin section

### `/` — Enhanced
- Add level badge and XP to node cards
- Add guild health score to header

---

## File Changes

### Collector (Python)
- `collector/xp_engine.py` — NEW: XP award logic, level computation, streak detection
- `collector/achievement_engine.py` — NEW: achievement detection
- `collector/card_engine.py` — NEW: card drop logic with rarity weights
- `collector/supabase_client.py` — Add XP/achievement/card write methods
- `collector/collector.py` — Wire XP engine into message loop + hourly timer

### Dashboard (Next.js)
- `dashboard/lib/supabase.ts` — Add XpEvent, Achievement, Card interfaces + level helpers
- `dashboard/app/page.tsx` — Add level/XP to node cards, guild health score
- `dashboard/app/node/[id]/page.tsx` — Add XP stats, achievements, cards sections
- `dashboard/app/leaderboard/page.tsx` — NEW: leaderboard page
- `dashboard/components/level-badge.tsx` — NEW: reusable level badge component

### Bots
- `bots/weekly_stats.py` — Add XP/level to weekly report format
