import { createBrowserClient } from "@supabase/ssr";
import { SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!_client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !key) {
      throw new Error(
        "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY"
      );
    }

    _client = createBrowserClient(url, key);
  }
  return _client;
}

export interface Node {
  id: string;
  short_name: string | null;
  long_name: string | null;
  last_seen: string | null;
  rssi: number | null;
  snr: number | null;
  battery_level: number | null;
  is_online: boolean;
  xp_total: number;
  level: number;
  created_at: string;
  packets_total: number;
  packets_24h: number;
  packets_7d: number;
  uptime_pct: number | null;
  avg_rssi: number | null;
  best_rssi: number | null;
  avg_snr: number | null;
  best_snr: number | null;
  battery_min: number | null;
  offline_count: number;
  longest_streak_days: number;
  current_streak_days: number;
}

export interface Alert {
  id: number;
  node_id: string;
  alert_type: string;
  message: string;
  acknowledged: boolean;
  created_at: string;
}

export interface Profile {
  id: string;
  email: string;
  role: "member" | "elder" | "leader";
  callsign: string;
  rank_title: string;
  rank_level: number;
  renown: number;
  influence: number;
  primary_node_id: string | null;
  approved: boolean;
  join_date: string;
  created_at: string;
}

export interface NodeOwnership {
  id: number;
  player_id: string;
  node_id: string;
  claimed_at: string;
}

export interface XpEvent {
  id: number;
  node_id: string;
  event_type: string;
  xp_awarded: number;
  created_at: string;
}

export interface Achievement {
  id: number;
  node_id: string;
  achievement_key: string;
  earned_at: string;
}

export interface Card {
  id: number;
  node_id: string;
  card_name: string;
  rarity: "COMMON" | "UNCOMMON" | "RARE" | "MYTHIC";
  trigger_event: string;
  earned_at: string;
}

// Node level system (kept for backward compat — nodes still earn XP)
export const LEVEL_THRESHOLDS = [
  { level: 1, xp: 0, title: "Beacon" },
  { level: 2, xp: 500, title: "Relay" },
  { level: 3, xp: 2000, title: "Warden" },
  { level: 4, xp: 5000, title: "Guardian" },
  { level: 5, xp: 15000, title: "Sentinel" },
  { level: 6, xp: 50000, title: "Archnode" },
];

// Player rank thresholds by role
export const MEMBER_RANKS = [
  { level: 1, renown: 0, title: "Initiate I" },
  { level: 2, renown: 100, title: "Initiate II" },
  { level: 3, renown: 300, title: "Initiate III" },
  { level: 4, renown: 750, title: "Signal Runner I" },
  { level: 5, renown: 1500, title: "Signal Runner II" },
  { level: 6, renown: 3000, title: "Signal Runner III" },
  { level: 7, renown: 5000, title: "Relay Adept I" },
  { level: 8, renown: 8000, title: "Relay Adept II" },
  { level: 9, renown: 12000, title: "Relay Adept III" },
  { level: 10, renown: 18000, title: "Circuit Warden I" },
  { level: 11, renown: 25000, title: "Circuit Warden II" },
  { level: 12, renown: 35000, title: "Circuit Warden III" },
];

export const ELDER_RANKS = [
  { level: 1, renown: 0, title: "Sentinel I" },
  { level: 2, renown: 2000, title: "Sentinel II" },
  { level: 3, renown: 5000, title: "Sentinel III" },
  { level: 4, renown: 10000, title: "Signal Marshal I" },
  { level: 5, renown: 18000, title: "Signal Marshal II" },
  { level: 6, renown: 30000, title: "Signal Marshal III" },
  { level: 7, renown: 45000, title: "High Warden I" },
  { level: 8, renown: 65000, title: "High Warden II" },
  { level: 9, renown: 90000, title: "High Warden III" },
];

export const LEADER_RANKS = [
  { level: 1, renown: 0, title: "Architect I" },
  { level: 2, renown: 10000, title: "Architect II" },
  { level: 3, renown: 25000, title: "Architect III" },
  { level: 4, renown: 50000, title: "Grand Architect I" },
  { level: 5, renown: 80000, title: "Grand Architect II" },
  { level: 6, renown: 120000, title: "Grand Architect III" },
  { level: 7, renown: 0, title: "Founder" },
];

export function getRankForRole(role: string, renown: number) {
  const ranks = role === "leader" ? LEADER_RANKS
    : role === "elder" ? ELDER_RANKS
    : MEMBER_RANKS;

  let current = ranks[0];
  let next: typeof ranks[number] | null = ranks[1] || null;
  for (let i = ranks.length - 1; i >= 0; i--) {
    if (renown >= ranks[i].renown) {
      current = ranks[i];
      next = ranks[i + 1] || null;
      break;
    }
  }
  const progress = next
    ? ((renown - current.renown) / (next.renown - current.renown)) * 100
    : 100;
  return { rank: current.title, level: current.level, renown, nextRenown: next?.renown ?? null, progress };
}

export function getLevelInfo(xp: number) {
  let current = LEVEL_THRESHOLDS[0];
  let next: (typeof LEVEL_THRESHOLDS)[number] | null = LEVEL_THRESHOLDS[1];
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (xp >= LEVEL_THRESHOLDS[i].xp) {
      current = LEVEL_THRESHOLDS[i];
      next = LEVEL_THRESHOLDS[i + 1] || null;
      break;
    }
  }
  const progress = next
    ? ((xp - current.xp) / (next.xp - current.xp)) * 100
    : 100;
  return { level: current.level, title: current.title, xp, nextXp: next?.xp ?? null, progress };
}

export const RARITY_COLORS = {
  COMMON: "text-gray-300",
  UNCOMMON: "text-green-400",
  RARE: "text-blue-400",
  MYTHIC: "text-yellow-400",
} as const;

export const RARITY_BG = {
  COMMON: "bg-gray-700",
  UNCOMMON: "bg-green-900",
  RARE: "bg-blue-900",
  MYTHIC: "bg-yellow-900",
} as const;

export const ACHIEVEMENT_LABELS: Record<string, { name: string; emoji: string }> = {
  FIRST_CONTACT: { name: "First Contact", emoji: "📡" },
  LONG_SHOT: { name: "Long Shot", emoji: "🎯" },
  GRID_WARRIOR: { name: "Grid Warrior", emoji: "⚡" },
  NIGHT_WATCH: { name: "Night Watch", emoji: "🌙" },
  BACKBONE: { name: "Backbone", emoji: "🦴" },
  PACK_LEADER: { name: "Pack Leader", emoji: "👑" },
  STORM_CHASER: { name: "Storm Chaser", emoji: "🌪️" },
  OFF_THE_GRID: { name: "Off The Grid", emoji: "🔌" },
};
