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
