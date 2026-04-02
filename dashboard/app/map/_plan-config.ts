// _plan-config.ts
// Hardware profiles, range estimates, and RF math for Network Planning Mode.

export type HardwareProfile = "desk" | "relay" | "fixed";

export interface ProfileConfig {
  label: string;
  description: string;
  /** Conservative coverage radius (meters) for map ring */
  rangeM: number;
  /** Hex color for the ring fill + marker */
  color: string;
  /** Effective link budget in dB: Tx power + Rx sensitivity + antenna gain */
  linkBudgetDb: number;
}

export const PROFILES: Record<HardwareProfile, ProfileConfig> = {
  desk: {
    label: "Indoor Desk",
    description: "Stock whip, window-side (YELUFT V3 or similar)",
    rangeM: 3_000,
    color: "#3b82f6", // blue
    linkBudgetDb: 134, // 8 dBm Tx + 126 dBm sensitivity
  },
  relay: {
    label: "Outdoor Relay",
    description: "SenseCAP / RAK, outdoor enclosure, elevated mount",
    rangeM: 8_000,  // OKC suburban rooftop — buildings + trees cap practical range
    color: "#f59e0b", // amber
    linkBudgetDb: 156, // 27 dBm Tx + 126 dBm sensitivity + 3 dBi gain
  },
  fixed: {
    label: "High-Power Fixed",
    description: "T-Beam + 8 dBi yagi, rooftop or tower mount",
    rangeM: 18_000, // OKC flat terrain — yagi gain helps but suburban clutter limits to ~18km
    color: "#ef4444", // red
    linkBudgetDb: 161, // 27 dBm Tx + 126 dBm sensitivity + 8 dBi gain
  },
};

export const PROFILE_KEYS: HardwareProfile[] = ["desk", "relay", "fixed"];

// ── RF Math ──────────────────────────────────────────────────────────────────

/** Free-space path loss at 915 MHz for a given distance in meters → dB */
export function fspl915(distanceM: number): number {
  if (distanceM <= 0) return 0;
  // FSPL(dB) = 20·log10(d) + 20·log10(f) + 20·log10(4π/c)
  // At 915 MHz the constant works out to +31.67 dB
  return 20 * Math.log10(distanceM) + 31.67;
}

/** Link margin (dB) between two profiles at a given distance. Positive = reliable. */
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

/** Polyline color based on link margin: green ≥20 dB, amber 10–20 dB, red <10 dB */
export function marginColor(marginDb: number): string {
  if (marginDb >= 20) return "#22c55e";
  if (marginDb >= 10) return "#f59e0b";
  return "#ef4444";
}

/** Haversine distance in meters between two lat/lng points */
export function haversineM(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Build nearest-neighbor link pairs from a list of plan nodes */
export function nearestNeighborLinks(
  nodes: Array<{ id: string; lat: number; lng: number; profile: HardwareProfile }>
): Array<[typeof nodes[0], typeof nodes[0]]> {
  if (nodes.length < 2) return [];
  const paired = new Set<string>();
  const links: Array<[typeof nodes[0], typeof nodes[0]]> = [];

  for (const a of nodes) {
    let closest: typeof nodes[0] | null = null;
    let minDist = Infinity;
    for (const b of nodes) {
      if (b.id === a.id) continue;
      const key = [a.id, b.id].sort().join("|");
      if (paired.has(key)) continue;
      const d = haversineM(a.lat, a.lng, b.lat, b.lng);
      if (d < minDist) {
        minDist = d;
        closest = b;
      }
    }
    if (closest) {
      const key = [a.id, closest.id].sort().join("|");
      paired.add(key);
      links.push([a, closest]);
    }
  }
  return links;
}
