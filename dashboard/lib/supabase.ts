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
  role: "admin" | "viewer";
  created_at: string;
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

// Level system
export const LEVEL_THRESHOLDS = [
  { level: 1, xp: 0, title: "Beacon" },
  { level: 2, xp: 500, title: "Relay" },
  { level: 3, xp: 2000, title: "Warden" },
  { level: 4, xp: 5000, title: "Guardian" },
  { level: 5, xp: 15000, title: "Sentinel" },
  { level: 6, xp: 50000, title: "Archnode" },
];

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
