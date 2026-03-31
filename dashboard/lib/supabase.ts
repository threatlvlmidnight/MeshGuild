import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!_client) {
    _client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
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
  created_at: string;
}