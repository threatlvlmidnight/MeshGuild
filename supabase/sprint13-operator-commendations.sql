-- Sprint 13: Operator Commendations
-- Guild members can recognize one another for service, reliability, and leadership.

CREATE TABLE IF NOT EXISTS player_commendations (
  id BIGSERIAL PRIMARY KEY,
  from_player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  to_player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  commendation_type TEXT NOT NULL,
  note TEXT,
  influence_value INT NOT NULL DEFAULT 10,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT player_commendations_no_self CHECK (from_player_id <> to_player_id),
  CONSTRAINT player_commendations_type_check CHECK (
    commendation_type IN (
      'RELIABILITY',
      'MENTORSHIP',
      'LEADERSHIP',
      'FIELDCRAFT',
      'SIGNAL_BOOST'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_player_commendations_to_player
  ON player_commendations(to_player_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_player_commendations_from_player
  ON player_commendations(from_player_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_player_commendations_type
  ON player_commendations(commendation_type, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_player_commendations_pair_type
  ON player_commendations(from_player_id, to_player_id, commendation_type);

ALTER TABLE player_commendations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "player_commendations_select_authenticated" ON player_commendations;
CREATE POLICY "player_commendations_select_authenticated"
  ON player_commendations FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "player_commendations_insert_authenticated" ON player_commendations;
CREATE POLICY "player_commendations_insert_authenticated"
  ON player_commendations FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = from_player_id
    AND from_player_id <> to_player_id
  );

DROP POLICY IF EXISTS "player_commendations_delete_leader" ON player_commendations;
CREATE POLICY "player_commendations_delete_leader"
  ON player_commendations FOR DELETE
  TO authenticated
  USING (is_admin());

GRANT SELECT, INSERT ON player_commendations TO authenticated;
GRANT SELECT, INSERT, DELETE ON player_commendations TO service_role;
GRANT USAGE, SELECT ON SEQUENCE player_commendations_id_seq TO authenticated, service_role;

CREATE OR REPLACE FUNCTION apply_player_commendation_effects()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE profiles
    SET influence = COALESCE(influence, 0) + NEW.influence_value
    WHERE id = NEW.to_player_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE profiles
    SET influence = GREATEST(COALESCE(influence, 0) - OLD.influence_value, 0)
    WHERE id = OLD.to_player_id;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_player_commendations_effects ON player_commendations;
CREATE TRIGGER trg_player_commendations_effects
  AFTER INSERT OR DELETE ON player_commendations
  FOR EACH ROW EXECUTE FUNCTION apply_player_commendation_effects();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'player_commendations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE player_commendations;
  END IF;
END $$;