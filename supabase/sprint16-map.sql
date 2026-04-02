-- sprint16-map.sql
-- Node location sharing for the guild map view
-- Operators can opt-in to share an approximate (~1km fuzzed) position.
-- Rewarded with the GRID_PRESENCE commendation badge.

-- ─── node_locations table ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS node_locations (
  id        BIGSERIAL PRIMARY KEY,
  node_id   TEXT        NOT NULL UNIQUE REFERENCES nodes(id) ON DELETE CASCADE,
  lat       FLOAT8      NOT NULL,
  lng       FLOAT8      NOT NULL,
  opt_in    BOOLEAN     NOT NULL DEFAULT true,
  set_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  set_by    UUID        REFERENCES profiles(id) ON DELETE SET NULL
);

-- Update set_at automatically on row change
CREATE OR REPLACE FUNCTION update_node_location_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.set_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_node_location_timestamp
  BEFORE UPDATE ON node_locations
  FOR EACH ROW EXECUTE FUNCTION update_node_location_timestamp();

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE node_locations ENABLE ROW LEVEL SECURITY;

-- Approved operators can view opt_in=true locations
-- Node owner can always see their own node's location row (to manage it)
CREATE POLICY "view_node_locations"
  ON node_locations FOR SELECT
  USING (
    (
      opt_in = true
      AND EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
          AND profiles.approved = true
      )
    )
    OR (
      EXISTS (
        SELECT 1 FROM node_ownership
        WHERE node_ownership.node_id = node_locations.node_id
          AND node_ownership.player_id = auth.uid()
      )
    )
  );

-- Node owner can set their node's location
CREATE POLICY "owner_can_insert_node_location"
  ON node_locations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM node_ownership
      WHERE node_ownership.node_id = node_locations.node_id
        AND node_ownership.player_id = auth.uid()
    )
  );

CREATE POLICY "owner_can_update_node_location"
  ON node_locations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM node_ownership
      WHERE node_ownership.node_id = node_locations.node_id
        AND node_ownership.player_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM node_ownership
      WHERE node_ownership.node_id = node_locations.node_id
        AND node_ownership.player_id = auth.uid()
    )
  );

CREATE POLICY "owner_can_delete_node_location"
  ON node_locations FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM node_ownership
      WHERE node_ownership.node_id = node_locations.node_id
        AND node_ownership.player_id = auth.uid()
    )
  );

-- ─── Grants ──────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON node_locations TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE node_locations_id_seq TO authenticated;

-- ─── GRID_PRESENCE badge auto-award ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION award_grid_presence_badge()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_player_id UUID;
BEGIN
  -- Only award when the operator opts in
  IF NEW.opt_in = false THEN
    RETURN NEW;
  END IF;

  -- Find the node owner
  SELECT player_id INTO v_player_id
  FROM node_ownership
  WHERE node_id = NEW.node_id
  LIMIT 1;

  IF v_player_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Award badge (idempotent — ignored if already earned)
  INSERT INTO player_badges (player_id, badge_key, badge_label, awarded_by, note)
  VALUES (
    v_player_id,
    'GRID_PRESENCE',
    'Grid Presence',
    v_player_id,
    'Shared node location on the guild map'
  )
  ON CONFLICT (player_id, badge_key) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_award_grid_presence
  AFTER INSERT OR UPDATE OF opt_in ON node_locations
  FOR EACH ROW
  EXECUTE FUNCTION award_grid_presence_badge();

-- Re-grant player_badges insert to authenticated (SECURITY DEFINER needs it)
GRANT INSERT ON player_badges TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE player_badges_id_seq TO authenticated;
