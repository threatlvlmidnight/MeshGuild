-- Sprint 5: Gamification table grants
-- The xp_events, achievements, and cards tables already have
-- SELECT policies from Sprint 4 (select_public policies allow anyone to read).
-- These GRANTs ensure the Postgres roles can actually access the tables.
-- Run this in the Supabase SQL Editor.

-- INSERT grants for service_role are implicit (bypasses RLS),
-- but we need SELECT for the dashboard to read gamification data.

GRANT SELECT ON xp_events TO anon, authenticated;
GRANT SELECT ON achievements TO anon, authenticated;
GRANT SELECT ON cards TO anon, authenticated;

-- Service role needs INSERT for the collector to write XP/achievements/cards
GRANT INSERT ON xp_events TO service_role;
GRANT INSERT ON achievements TO service_role;
GRANT INSERT ON cards TO service_role;

-- Allow collector to update node xp_total and level
GRANT UPDATE ON nodes TO service_role;
