import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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