-- Sprint 5b: Add computed stat columns to nodes table
-- These are incremented by the collector on every packet,
-- so the dashboard can read them directly without aggregation queries.
-- Run this in the Supabase SQL Editor.

ALTER TABLE nodes ADD COLUMN IF NOT EXISTS packets_total int NOT NULL DEFAULT 0;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS packets_24h int NOT NULL DEFAULT 0;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS packets_7d int NOT NULL DEFAULT 0;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS uptime_pct real;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS avg_rssi real;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS best_rssi int;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS avg_snr real;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS best_snr real;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS battery_min int;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS offline_count int NOT NULL DEFAULT 0;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS longest_streak_days int NOT NULL DEFAULT 0;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS current_streak_days int NOT NULL DEFAULT 0;
