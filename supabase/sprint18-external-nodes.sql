-- sprint18-external-nodes.sql
-- External/ally relay nodes visible on meshmap.net but not part of the guild.
-- These are shown on the guild map as ally markers (gray/dashed) to give
-- operators situational awareness of nearby relay infrastructure.

CREATE TABLE IF NOT EXISTS external_nodes (
  id         TEXT        PRIMARY KEY,           -- Meshtastic node ID e.g. !043294cc
  name       TEXT,                              -- Display name from meshmap or operator
  lat        FLOAT8      NOT NULL,
  lng        FLOAT8      NOT NULL,
  source     TEXT        NOT NULL DEFAULT 'meshmap.net',
  noted_at   TIMESTAMPTZ NOT NULL DEFAULT now() -- When we added this record
);

-- Public read — these are reference markers, not sensitive
ALTER TABLE external_nodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "external_nodes_public_read"
  ON external_nodes FOR SELECT
  USING (true);

GRANT SELECT ON external_nodes TO anon, authenticated;

-- Only admins can insert/update via service role (no client-side writes)

-- ─── Seed: OKC ally nodes seen on meshmap.net 2026-04-02 ────────────────────
-- Coordinates estimated from Lake Hefner landmarks in screenshot
INSERT INTO external_nodes (id, name, lat, lng) VALUES
  ('ext-okc-a', 'OKC Relay NW (Lake Hefner W)',  35.580, -97.627),
  ('ext-okc-b', 'OKC Relay NE (Lake Hefner E)',  35.580, -97.581),
  ('ext-okc-c', 'OKC Relay SW (Mustang Rd)',     35.527, -97.679),
  ('ext-okc-d', 'OKC Relay Central (Bethany)',   35.521, -97.617)
ON CONFLICT (id) DO UPDATE SET
  lat      = EXCLUDED.lat,
  lng      = EXCLUDED.lng,
  name     = EXCLUDED.name,
  noted_at = now();
