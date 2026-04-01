-- Sprint 14: Player Badges
-- Special recognition badges awarded by guild leadership.
-- Commendation-type badges are UI-derived from player_commendations and need no table.

CREATE TABLE IF NOT EXISTS player_badges (
  id          BIGSERIAL    PRIMARY KEY,
  player_id   UUID         NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  badge_key   TEXT         NOT NULL,
  badge_label TEXT         NOT NULL,
  awarded_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  awarded_by  UUID         REFERENCES profiles(id) ON DELETE SET NULL,
  note        TEXT,
  CONSTRAINT player_badges_unique UNIQUE (player_id, badge_key)
);

CREATE INDEX IF NOT EXISTS idx_player_badges_player
  ON player_badges(player_id, awarded_at DESC);

ALTER TABLE player_badges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "player_badges_select_authenticated" ON player_badges;
CREATE POLICY "player_badges_select_authenticated"
  ON player_badges FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "player_badges_insert_admin" ON player_badges;
CREATE POLICY "player_badges_insert_admin"
  ON player_badges FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "player_badges_delete_admin" ON player_badges;
CREATE POLICY "player_badges_delete_admin"
  ON player_badges FOR DELETE
  TO authenticated
  USING (is_admin());

GRANT SELECT ON player_badges TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON player_badges TO service_role;
GRANT USAGE, SELECT ON SEQUENCE player_badges_id_seq TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'player_badges'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE player_badges;
  END IF;
END $$;
