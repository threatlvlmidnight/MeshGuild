-- Sprint 10: Onboarding & Rite of First Signal
-- Tracks rite completion and awards initial Renown

-- Track which players have completed the Rite of First Signal
CREATE TABLE IF NOT EXISTS rite_completions (
  id            BIGSERIAL PRIMARY KEY,
  player_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  node_id       TEXT NOT NULL REFERENCES nodes(id),
  completed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Award +50 Renown on rite completion
CREATE OR REPLACE FUNCTION award_rite_renown()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE profiles
  SET renown = renown + 50
  WHERE id = NEW.player_id;

  -- Also insert an XP event on the claimed node for tracking
  INSERT INTO xp_events (node_id, event_type, xp_awarded)
  VALUES (NEW.node_id, 'RITE_OF_FIRST_SIGNAL', 50);

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_rite_completion
  AFTER INSERT ON rite_completions
  FOR EACH ROW
  EXECUTE FUNCTION award_rite_renown();

-- RLS
ALTER TABLE rite_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own rite completion"
  ON rite_completions FOR SELECT
  TO authenticated
  USING (player_id = auth.uid());

CREATE POLICY "Users can insert own rite completion"
  ON rite_completions FOR INSERT
  TO authenticated
  WITH CHECK (player_id = auth.uid());
