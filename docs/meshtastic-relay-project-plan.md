# Meshtastic Relay Project Plan

## Project Summary
Build a low-cost Meshtastic text mesh network connecting a crew of 6 people across the OKC metro (The Village to Mustang/Yukon corridor). Friend homes serve as relay hosts requiring only wall power and simple placement.

## Primary Goal
Achieve reliable group text messaging across all crew nodes over Meshtastic with no phones, no internet, and no recurring cost.

## Success Criteria
- End-to-end message delivery rate >= 95% over a 7-day test window
- Typical delivery latency <= 60 seconds for short text messages
- Host setup effort <= 5 minutes (plug in and place)
- Relay uptime >= 99% over a 7-day test window

## Constraints
- Region and band: US915 only
- Initial relay budget target: $40 to $65 per relay
- Host requirements: wall power only, no app required
- Build methods: no SMD assembly required
- Hardware support: only officially supported Meshtastic hardware
- Initial deployment: indoor relay placement, near high windows

## Assumptions
- At least one friend location exists between endpoints
- Friend hosts can provide 24/7 power and a stable placement location
- 915 MHz compatible antennas and nodes are used consistently

## Crew & Network Topology
| Name | Location | Coords | Role | Notes |
|------|----------|--------|------|-------|
| You | The Village | 35.5609, -97.5564 | Endpoint (owner/builder) | Node ordered |
| Micah | The Village (0.5 mi E) | 35.5625, -97.5472 | Endpoint | Near-neighbor, direct link |
| Ben | Bethany area | 35.5435, -97.5895 | Relay candidate | 2.2 mi from You, bridges west |
| Alex | Yukon NE | 35.5914, -97.6874 | Relay candidate | 6.3 mi from Ben — longest hop |
| Caleb | Yukon | 35.5166, -97.7054 | Relay candidate | 5.3 mi from Alex, western anchor |
| Tom Ish | SE OKC | 35.4959, -97.5035 | Secondary | SE branch, not on main chain |

**Primary path:** You ↔ Ben ↔ Alex ↔ Caleb (max hop 6.3 mi, LongFast recommended)
**Secondary:** Micah connects direct to You; Tom Ish connects direct back to You/Micah

## Network Strategy
- You and Micah are co-located — one shared cluster, both covered immediately
- Ben is the critical first relay (bridges You/Micah to the western chain)
- Alex is the weakest link (6.3 mi hop to Ben) — prioritize high window placement and LongFast preset
- Add relays in priority order: Ben first, Alex second, Caleb third
- Tom Ish joins as eastern branch once core chain is stable
- Prefer fewer, higher, and better-placed nodes over many low-quality placements

## Device Design Standard: Relay v1
### Hardware Profile
- Node: Heltec WiFi LoRa 32 V3 (915 MHz)
- Antenna: 915 MHz tuned SMA whip (3 to 5 dBi)
- Power: 5V USB wall adapter (2A recommended) and reliable USB-C cable
- Enclosure: 3D printed Heltec V3 case

### Estimated Cost Per Relay
- Heltec V3 915 MHz: $20 to $35
- 915 MHz antenna: $10 to $20
- USB power adapter and cable: $8 to $15
- Case and mounting accessories: $5 to $10
- Total expected: about $43 to $80 (typical target around $55)

## Configuration Standard
- Region: US915
- Role for test visibility: ROUTER
- Optional optimization role after stabilization: REPEATER or ROUTER_LATE where appropriate
- Private primary channel with shared PSK
- Node naming: RLY-AREA-NN
- Approximate fixed location enabled (not exact address)
- Same config baseline on all relays except name and location

## Deployment Phases
## Phase 0: Baseline Setup (Week 1)
- Flash and configure both endpoint nodes
- Validate local send/receive and app connectivity
- Run neighborhood range checks for baseline
- Deliverable: baseline performance log

## Phase 1: Site Discovery (Week 1-2)
- Identify friend homes near line between endpoints
- Score each site for elevation, power stability, host reliability, and placement quality
- Select top 2 candidate relay hosts
- Deliverable: ranked candidate list

## Phase 2: Relay Prototype (Week 2)
- Build one Relay v1 unit
- 72-hour soak test at your house
- Validate thermal stability, reboot behavior, and packet forwarding
- Deliverable: approved relay build standard

## Phase 3: First Relay Deployment (Week 3)
- Install relay at best midpoint friend home
- Run repeated timed message tests (morning/evening)
- Track delivery and latency over 7 days
- Deliverable: pass/fail against success criteria

## Phase 4: Reliability Expansion (Week 4+)
- If below target, deploy second relay at next-best site
- Retest for 7 days
- Freeze network layout once thresholds are met
- Deliverable: stable production topology

## Site Scoring Template
Score each candidate 1 to 5.
- Height potential (attic/2nd floor/high window)
- Line quality toward both sides of route
- Continuous power reliability
- Host willingness (long-term)
- Placement practicality (safe, away from interference)

Recommended rule: deploy at sites with total score >= 18 before lower-scored sites.

## Test Protocol
- Send scheduled short text pings at fixed intervals
- Test during at least two daily windows (for example morning and evening)
- Record send time, receive time, and success/failure
- Repeat for 7 continuous days after each topology change
- Only change one variable at a time (node position, antenna, role, etc.)

## Host Handoff Standard
- Relay arrives preconfigured
- Host card has 3 instructions:
  - Plug in
  - Place near specified window
  - Leave powered on
- Optional smart plug for remote power cycling

## Risks and Mitigations
- Risk: poor line-of-sight in dense areas
  - Mitigation: prioritize elevation and midpoint host quality
- Risk: host unplugging device
  - Mitigation: simple host card and optional labeled power adapter
- Risk: weak antenna performance
  - Mitigation: standardized tuned antennas and placement checks
- Risk: config drift between nodes
  - Mitigation: single master config profile and naming convention

## Bill of Materials (Pilot)
For first full pilot:
- Endpoint nodes: 2
- Relay nodes: 1 (initial) to 2 (if needed)
- Total nodes target: 3 to 4

Estimated pilot spend:
- 3-node pilot: about $130 to $240
- 4-node reliability build: about $175 to $320

## Decision Gates
- Gate 1: Baseline complete and endpoint configs stable
- Gate 2: First relay achieves >= 95% delivery target
- Gate 3: Add second relay only if Gate 2 fails
- Gate 4: Freeze topology and move to routine operation

## Hardware Status
| Node | Hardware | Status |
|------|----------|--------|
| You (endpoint) | YELUFT ESP32 LoRa V3 915MHz (ASIN B0FT7WR12P) | **Ordered — arriving soon** |
| Relay v1 prototype | Heltec WiFi LoRa 32 V3 915MHz | Not yet ordered |
| Remaining crew nodes | TBD — share this plan with Ben, Alex, Caleb | Not started |

## Immediate Next Steps
1. **When radio arrives:** Flash firmware at flasher.meshtastic.org, set region US915, configure your endpoint node
2. Run local range check with Micah (0.5 mi) as first sanity test
3. Share plan with Ben — he is the first relay priority
4. Order Relay v1 hardware for Ben's location
5. Build and soak-test relay prototype before deployment
6. Use `tools/okc-relay-planner.html` to visualize and track topology as nodes come online
