# Sprint 19: Network Planning Mode

**Goal:** Add a role-gated PLAN MODE to the guild map that lets Elders and Leaders drag-and-drop hypothetical node placements, visualize RF coverage and link margins, query nearby points of interest as potential host sites, and save/reload named plans to Supabase.

**Spec:** `docs/superpowers/specs/2026-04-02-sprint19-network-planning-design.md`

---

## Sprint Items

| # | Item | Files touched |
|---|------|--------------|
| S19-1 | DB: `map_plans` table with RLS | `supabase/sprint19-network-planning.sql` |
| S19-2 | Hardware profile constants + FSPL helpers | `dashboard/app/map/_plan-config.ts` |
| S19-3 | Planning overlay component (`_plan.tsx`) | `dashboard/app/map/_plan.tsx` |
| S19-4 | Plan save/load panel | `dashboard/app/map/page.tsx` + `_map.tsx` |
| S19-5 | Role gating + PLAN MODE toggle | `dashboard/app/map/page.tsx` + `_map.tsx` |
| S19-6 | Overpass POI query on node select | `dashboard/app/map/_plan.tsx` |
| S19-7 | Nearest-neighbor link lines with margin color | `dashboard/app/map/_plan.tsx` |

---

## File Structure

```
supabase/
  sprint19-network-planning.sql      # map_plans table + RLS

dashboard/app/map/
  _plan-config.ts                    # NEW — hardware profiles, colors, FSPL math
  _plan.tsx                          # NEW — plan overlay: draggable markers, rings, links, POI
  _map.tsx                           # MODIFIED — accept planMode + planNodes props
  page.tsx                           # MODIFIED — plan mode toggle, save/load panel
```

---

## S19-1: DB — `map_plans` Table

**File:** Create `supabase/sprint19-network-planning.sql`

Run in the Supabase SQL editor (after all existing migrations).

```sql
CREATE TABLE IF NOT EXISTS map_plans (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT          NOT NULL,
  created_by  UUID          NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  plan_data   JSONB         NOT NULL DEFAULT '[]',
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
);
```

**RLS policies:**
- Owner can SELECT / INSERT / UPDATE / DELETE their own plans
- Elders and Leaders can SELECT all plans (so co-planners can load each other's work)

```sql
ALTER TABLE map_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_select_own_plans"
  ON map_plans FOR SELECT
  USING (created_by = auth.uid());

CREATE POLICY "elder_leader_select_all_plans"
  ON map_plans FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('elder', 'leader')
    )
  );

CREATE POLICY "owner_insert_plans"
  ON map_plans FOR INSERT
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "owner_update_plans"
  ON map_plans FOR UPDATE
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "owner_delete_plans"
  ON map_plans FOR DELETE
  USING (created_by = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON map_plans TO authenticated;
```

---

## S19-2: Hardware Profile Constants + FSPL Helpers

**File:** Create `dashboard/app/map/_plan-config.ts`

```typescript
// Hardware profiles for planned nodes.
// Range radius (meters) is conservative outdoor suburban estimate at −126 dBm sensitivity.

export type HardwareProfile = 'desk' | 'relay' | 'fixed';

export interface ProfileConfig {
  label: string;
  description: string;
  rangeM: number;        // coverage radius for the map ring
  color: string;         // ring + marker fill color
  linkBudgetDb: number;  // Tx + Rx sensitivity + antenna gain
}

export const PROFILES: Record<HardwareProfile, ProfileConfig> = {
  desk: {
    label: 'Indoor Desk',
    description: 'YELUFT V3 or similar, stock whip, window-side',
    rangeM: 3_000,
    color: '#3b82f6',    // blue
    linkBudgetDb: 134,   // 8 dBm Tx + 126 dBm sens (no antenna gain indoors)
  },
  relay: {
    label: 'Outdoor Relay',
    description: 'SenseCAP M1 / RAK, outdoor enclosure, elevated mount',
    rangeM: 20_000,
    color: '#f59e0b',    // amber
    linkBudgetDb: 156,   // 27 dBm Tx + 126 dBm sens + 3 dBi gain
  },
  fixed: {
    label: 'High-Power Fixed',
    description: 'T-Beam + 8 dBi yagi, rooftop or tower mount',
    rangeM: 60_000,
    color: '#ef4444',    // red
    linkBudgetDb: 161,   // 27 dBm Tx + 126 dBm sens + 8 dBi gain
  },
};

// Free-space path loss at 915 MHz, distance in meters → dB
export function fspl915(distanceM: number): number {
  if (distanceM <= 0) return 0;
  return 20 * Math.log10(distanceM) + 31.67;
}

// Link margin between two profiles at a given distance
// > 20 dB → green (reliable)  10–20 dB → amber (marginal)  < 10 dB → red (unreliable)
export function linkMarginDb(
  profileA: HardwareProfile,
  profileB: HardwareProfile,
  distanceM: number
): number {
  const budget = Math.min(
    PROFILES[profileA].linkBudgetDb,
    PROFILES[profileB].linkBudgetDb
  );
  return budget - fspl915(distanceM);
}

export function marginColor(marginDb: number): string {
  if (marginDb >= 20) return '#22c55e';   // green
  if (marginDb >= 10) return '#f59e0b';   // amber
  return '#ef4444';                        // red
}
```

---

## S19-3: Planning Overlay Component

**File:** Create `dashboard/app/map/_plan.tsx`

This is a pure Leaflet layer — no sidebar UI here, just what goes on the map.

```typescript
'use client';

import { useEffect, useRef, useState } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { v4 as uuidv4 } from 'uuid';
import {
  PROFILES,
  HardwareProfile,
  linkMarginDb,
  marginColor,
} from './_plan-config';

export interface PlanNode {
  id: string;
  lat: number;
  lng: number;
  profile: HardwareProfile;
  label: string;
}

export interface PoiResult {
  id: number;
  lat: number;
  lon: number;
  tags: Record<string, string>;
}

interface Props {
  nodes: PlanNode[];
  onNodesChange: (nodes: PlanNode[]) => void;
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
  pois: PoiResult[];
}
```

**Rendering responsibilities:**
- For each `PlanNode`:
  - `L.CircleMarker` (draggable) at the planned location, colored by profile
  - `L.Circle` coverage ring with profile color, 20% opacity fill, dashed border
  - On click → set `selectedNodeId`, trigger POI fetch
- For each nearest-neighbor pair (see S19-7):
  - `L.Polyline` with color from `marginColor(linkMarginDb(...))`
- POI markers: small gray diamond markers for Overpass results
- Map click in plan mode → add new node at click point with default profile 'relay'

---

## S19-4: Plan Save / Load Panel

**Location:** Inside `dashboard/app/map/page.tsx` (rendered above the map when plan mode is active)

**UI elements:**

```
┌─────────────────────────────────────────────────────────┐
│  SIGNAL PLANNING MODE                                    │
│  ─────────────────────────────────────────────         │
│  [Plan name input field          ] [SAVE] [NEW]         │
│  ─────────────────────────────────────────────         │
│  SAVED PLANS                                            │
│  • Hefner Loop Expansion        Apr 2 · 3 nodes  [LOAD] │
│  • Downtown Bridge              Apr 1 · 5 nodes  [LOAD] │
└─────────────────────────────────────────────────────────┘
```

**Save logic:**
```typescript
async function savePlan() {
  if (!planName.trim() || !profile) return;
  const payload = {
    name: planName.trim(),
    created_by: profile.id,
    plan_data: JSON.stringify(planNodes),
  };
  if (activePlanId) {
    // UPDATE existing
    await client.from('map_plans')
      .update({ name: planName.trim(), plan_data: planNodes, updated_at: new Date().toISOString() })
      .eq('id', activePlanId);
  } else {
    // INSERT new
    const { data } = await client.from('map_plans').insert(payload).select().single();
    setActivePlanId(data.id);
  }
  await fetchPlans();
}
```

**Load logic:**
```typescript
async function loadPlan(plan: SavedPlan) {
  setPlanNodes(plan.plan_data as PlanNode[]);
  setPlanName(plan.name);
  setActivePlanId(plan.id);
}
```

**State needed in `page.tsx`:**
```typescript
const [planMode, setPlanMode] = useState(false);
const [planNodes, setPlanNodes] = useState<PlanNode[]>([]);
const [planName, setPlanName] = useState('');
const [activePlanId, setActivePlanId] = useState<string | null>(null);
const [savedPlans, setSavedPlans] = useState<SavedPlan[]>([]);
const [selectedPlanNodeId, setSelectedPlanNodeId] = useState<string | null>(null);
const [pois, setPois] = useState<PoiResult[]>([]);
```

---

## S19-5: Role Gating + PLAN MODE Toggle

**Location:** `dashboard/app/map/page.tsx`

```typescript
const isElder = profile?.role === 'elder' || profile?.role === 'leader';
```

Only render the PLAN MODE toggle button when `isElder` is true:

```tsx
{isElder && (
  <button
    onClick={() => setPlanMode((m) => !m)}
    className={`px-3 py-1 text-xs font-mono border rounded ${
      planMode
        ? 'bg-amber-500 border-amber-400 text-black'
        : 'bg-black border-amber-600 text-amber-400 hover:bg-amber-900'
    }`}
  >
    {planMode ? '[ EXIT PLAN MODE ]' : '[ PLAN MODE ]'}
  </button>
)}
```

Pass `planMode` prop down into `_map.tsx`:

```tsx
<MapView
  ...
  planMode={planMode}
  planNodes={planNodes}
  onPlanNodesChange={setPlanNodes}
  selectedPlanNodeId={selectedPlanNodeId}
  onSelectPlanNode={setSelectedPlanNodeId}
  pois={pois}
/>
```

---

## S19-6: Overpass POI Query on Node Select

**Location:** `dashboard/app/map/_plan.tsx` or `page.tsx`

When a plan node is selected (clicked), fetch all POI within a radius around that node's lat/lng. Query everything — the goal is to surface potential hosts (businesses, towers, water towers, public buildings, hilltops).

```typescript
async function fetchPois(lat: number, lng: number, radiusM = 1500) {
  const query = `
    [out:json][timeout:25];
    (
      node["man_made"="tower"](around:${radiusM},${lat},${lng});
      node["man_made"="water_tower"](around:${radiusM},${lat},${lng});
      node["man_made"="antenna"](around:${radiusM},${lat},${lng});
      node["natural"="peak"](around:${radiusM},${lat},${lng});
      node["natural"="hill"](around:${radiusM},${lat},${lng});
      way["building"="yes"]["height"](around:${radiusM},${lat},${lng});
      node["amenity"="fire_station"](around:${radiusM},${lat},${lng});
      node["amenity"="police"](around:${radiusM},${lat},${lng});
      node["telecom"](around:${radiusM},${lat},${lng});
    );
    out center;
  `;
  const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  const json = await res.json();
  setPois(json.elements ?? []);
}
```

POI markers on the map: small gray tooltip markers. The sidebar panel (in `page.tsx`) shows a scrollable list of the POI results with their tags when a node is selected. This helps the operator identify "who could host a node here."

---

## S19-7: Nearest-Neighbor Link Lines

**Location:** `dashboard/app/map/_plan.tsx`

Build a minimum spanning tree (nearest-neighbor heuristic) from the current plan nodes and draw Leaflet `Polyline` segments between each pair:

```typescript
function nearestNeighborLinks(nodes: PlanNode[]): Array<[PlanNode, PlanNode]> {
  if (nodes.length < 2) return [];
  const paired = new Set<string>();
  const links: Array<[PlanNode, PlanNode]> = [];

  for (const a of nodes) {
    let closest: PlanNode | null = null;
    let minDist = Infinity;
    for (const b of nodes) {
      if (b.id === a.id) continue;
      const key = [a.id, b.id].sort().join('|');
      if (paired.has(key)) continue;
      const d = haversineM(a.lat, a.lng, b.lat, b.lng);
      if (d < minDist) { minDist = d; closest = b; }
    }
    if (closest) {
      const key = [a.id, closest.id].sort().join('|');
      paired.add(key);
      links.push([a, closest]);
    }
  }
  return links;
}

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
```

Render each link as a `Polyline` with `color={marginColor(linkMarginDb(a.profile, b.profile, haversineM(...)))}` and `weight={2}`, `dashArray="6 4"`.

---

## Acceptance Criteria

- [ ] S19-1: `map_plans` table exists in Supabase with correct RLS enforced
- [ ] S19-2: Profile constants and FSPL math exported from `_plan-config.ts`, values compile without errors
- [ ] S19-3: Plan nodes can be dropped (map click) and dragged on the map; coverage ring renders in profile color
- [ ] S19-4: Plans can be saved with a name, listed in panel, and reloaded into the map
- [ ] S19-5: PLAN MODE toggle only visible to `role = 'elder' | 'leader'`; invisible to `member`
- [ ] S19-6: Clicking a plan node fires an Overpass query and populates a POI list in the sidebar
- [ ] S19-7: A dashed nearest-neighbor link line renders between each node pair, colored green/amber/red by link margin
- [ ] Build passes `npm run build` with no TypeScript errors
