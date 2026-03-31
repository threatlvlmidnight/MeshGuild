-- Sprint 6: Player Identity & Node Ownership
-- Run this in the Supabase SQL Editor AFTER sprint5b-node-stats.sql

-- ============================================================
-- 1. Evolve profiles → players (add columns to existing profiles table)
-- ============================================================

-- Role system: member, elder, leader (replaces admin/viewer)
-- First drop old constraint, migrate data, THEN add new constraint.
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- Update existing rows: admin → leader, viewer → member
UPDATE profiles SET role = 'leader' WHERE role = 'admin';
UPDATE profiles SET role = 'member' WHERE role = 'viewer';

-- Now safe to add the new constraint
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('member', 'elder', 'leader'));

-- Add player columns
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS callsign text UNIQUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS rank_title text NOT NULL DEFAULT 'Initiate I';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS rank_level int NOT NULL DEFAULT 1;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS renown int NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS influence real NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS primary_node_id text REFERENCES nodes(id);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS approved boolean NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS join_date timestamptz NOT NULL DEFAULT now();

-- ============================================================
-- 2. Node ownership table
-- ============================================================

CREATE TABLE IF NOT EXISTS node_ownership (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  player_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  node_id text NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (node_id)  -- each node can only have one owner
);

CREATE INDEX IF NOT EXISTS idx_node_ownership_player ON node_ownership(player_id);

-- ============================================================
-- 3. Callsign generator (NATO phonetic + 2-digit number)
-- ============================================================

CREATE OR REPLACE FUNCTION generate_callsign()
RETURNS text AS $$
DECLARE
  words text[] := ARRAY[
    'ALPHA','BRAVO','CHARLIE','DELTA','ECHO','FOXTROT',
    'GOLF','HOTEL','INDIA','JULIET','KILO','LIMA',
    'MIKE','NOVEMBER','OSCAR','PAPA','QUEBEC','ROMEO',
    'SIERRA','TANGO','UNIFORM','VICTOR','WHISKEY',
    'XRAY','YANKEE','ZULU'
  ];
  candidate text;
  attempts int := 0;
BEGIN
  LOOP
    candidate := words[1 + floor(random() * array_length(words, 1))::int]
                 || '-'
                 || lpad((floor(random() * 100))::int::text, 2, '0');
    -- Check uniqueness
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE callsign = candidate) THEN
      RETURN candidate;
    END IF;
    attempts := attempts + 1;
    IF attempts > 100 THEN
      -- Fallback: add a third digit
      candidate := words[1 + floor(random() * array_length(words, 1))::int]
                   || '-'
                   || lpad((floor(random() * 1000))::int::text, 3, '0');
      RETURN candidate;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 4. Update the signup trigger to assign callsign
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role, callsign, rank_title, rank_level)
  VALUES (new.id, new.email, 'member', generate_callsign(), 'Initiate I', 1);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 5. Rank thresholds table (for auto-promotion within role)
-- ============================================================

CREATE TABLE IF NOT EXISTS rank_thresholds (
  id serial PRIMARY KEY,
  role text NOT NULL,
  rank_title text NOT NULL,
  rank_level int NOT NULL,
  renown_required int NOT NULL,
  UNIQUE (role, rank_level)
);

INSERT INTO rank_thresholds (role, rank_title, rank_level, renown_required) VALUES
  -- Members (12 ranks)
  ('member', 'Initiate I',       1,     0),
  ('member', 'Initiate II',      2,   100),
  ('member', 'Initiate III',     3,   300),
  ('member', 'Signal Runner I',  4,   750),
  ('member', 'Signal Runner II', 5,  1500),
  ('member', 'Signal Runner III',6,  3000),
  ('member', 'Relay Adept I',    7,  5000),
  ('member', 'Relay Adept II',   8,  8000),
  ('member', 'Relay Adept III',  9, 12000),
  ('member', 'Circuit Warden I', 10, 18000),
  ('member', 'Circuit Warden II',11, 25000),
  ('member', 'Circuit Warden III',12,35000),
  -- Elders (9 ranks)
  ('elder', 'Sentinel I',        1,     0),
  ('elder', 'Sentinel II',       2,  2000),
  ('elder', 'Sentinel III',      3,  5000),
  ('elder', 'Signal Marshal I',  4, 10000),
  ('elder', 'Signal Marshal II', 5, 18000),
  ('elder', 'Signal Marshal III',6, 30000),
  ('elder', 'High Warden I',     7, 45000),
  ('elder', 'High Warden II',    8, 65000),
  ('elder', 'High Warden III',   9, 90000),
  -- Leaders (7 ranks)
  ('leader', 'Architect I',       1,     0),
  ('leader', 'Architect II',      2, 10000),
  ('leader', 'Architect III',     3, 25000),
  ('leader', 'Grand Architect I', 4, 50000),
  ('leader', 'Grand Architect II',5, 80000),
  ('leader', 'Grand Architect III',6,120000),
  ('leader', 'Founder',           7,     0)  -- manually assigned, not XP-based
ON CONFLICT DO NOTHING;

-- ============================================================
-- 6. Update is_admin() to check for leader/elder roles
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('leader', 'elder')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Helper: check if current user is a leader
CREATE OR REPLACE FUNCTION public.is_leader()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'leader'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================================
-- 7. RLS for node_ownership
-- ============================================================

ALTER TABLE node_ownership ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can see ownership
CREATE POLICY "node_ownership_select" ON node_ownership
  FOR SELECT USING (auth.role() = 'authenticated');

-- Players can claim unclaimed nodes (insert)
CREATE POLICY "node_ownership_insert" ON node_ownership
  FOR INSERT WITH CHECK (auth.uid() = player_id);

-- Players can unclaim their own nodes
CREATE POLICY "node_ownership_delete" ON node_ownership
  FOR DELETE USING (auth.uid() = player_id);

-- Leaders can manage any ownership
CREATE POLICY "node_ownership_leader_all" ON node_ownership
  FOR ALL USING (is_leader());

-- ============================================================
-- 8. Update profiles RLS for new role system
-- ============================================================

-- Allow authenticated users to read basic profile info of others
-- (callsign, rank, renown — NOT node details)
DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
DROP POLICY IF EXISTS "profiles_select_admin" ON profiles;

-- All authenticated users can read callsign, rank, renown of any profile
CREATE POLICY "profiles_select_authenticated" ON profiles
  FOR SELECT USING (auth.role() = 'authenticated');

-- Update policy: leaders can update any profile, elders can update members
DROP POLICY IF EXISTS "profiles_update_admin" ON profiles;

CREATE POLICY "profiles_update_leader" ON profiles
  FOR UPDATE USING (is_leader());

CREATE POLICY "profiles_update_elder" ON profiles
  FOR UPDATE USING (
    is_admin()
    AND (SELECT role FROM profiles WHERE id = profiles.id) = 'member'
  );

-- ============================================================
-- 9. GRANTs
-- ============================================================

GRANT SELECT ON node_ownership TO anon, authenticated;
GRANT INSERT, DELETE ON node_ownership TO authenticated;
GRANT SELECT ON rank_thresholds TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE node_ownership_id_seq TO authenticated;

-- Realtime for node_ownership
ALTER PUBLICATION supabase_realtime ADD TABLE node_ownership;

-- ============================================================
-- 10. Renown rollup function (player renown = sum of XP from owned nodes)
-- ============================================================

CREATE OR REPLACE FUNCTION recompute_player_renown()
RETURNS void AS $$
BEGIN
  UPDATE profiles p
  SET renown = COALESCE(sub.total_xp, 0)
  FROM (
    SELECT o.player_id, SUM(n.xp_total) AS total_xp
    FROM node_ownership o
    JOIN nodes n ON n.id = o.node_id
    GROUP BY o.player_id
  ) sub
  WHERE p.id = sub.player_id;

  -- Update rank_title and rank_level based on renown
  UPDATE profiles p
  SET rank_title = rt.rank_title,
      rank_level = rt.rank_level
  FROM (
    SELECT DISTINCT ON (rt.role, p2.id) p2.id AS profile_id, rt.rank_title, rt.rank_level
    FROM profiles p2
    JOIN rank_thresholds rt ON rt.role = p2.role AND rt.renown_required <= p2.renown
    ORDER BY rt.role, p2.id, rt.renown_required DESC
  ) rt
  WHERE p.id = rt.profile_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION recompute_player_renown() TO authenticated;

-- ============================================================
-- 11. Assign callsigns to existing profiles that don't have one
-- ============================================================

DO $$
DECLARE
  p RECORD;
BEGIN
  FOR p IN SELECT id FROM profiles WHERE callsign IS NULL LOOP
    UPDATE profiles SET callsign = generate_callsign() WHERE id = p.id;
  END LOOP;
END;
$$;
