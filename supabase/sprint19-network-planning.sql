-- sprint19-network-planning.sql
-- Persistent storage for named network planning sessions (elder/leader only).
-- Plan nodes (type, lat, lng, label) are stored as JSONB inside plan_data.

-- ─── map_plans table ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS map_plans (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT          NOT NULL,
  created_by  UUID          NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  plan_data   JSONB         NOT NULL DEFAULT '[]',
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- Auto-update updated_at on change
CREATE OR REPLACE FUNCTION update_map_plan_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_map_plan_timestamp
  BEFORE UPDATE ON map_plans
  FOR EACH ROW EXECUTE FUNCTION update_map_plan_timestamp();

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE map_plans ENABLE ROW LEVEL SECURITY;

-- Owners can always read their own plans
CREATE POLICY "owner_select_own_plans"
  ON map_plans FOR SELECT
  USING (created_by = auth.uid());

-- Elders and Leaders can read all plans (collaborative planning)
CREATE POLICY "elder_leader_select_all_plans"
  ON map_plans FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('elder', 'leader')
    )
  );

-- Only the creator can insert plans; created_by must match caller
CREATE POLICY "owner_insert_plans"
  ON map_plans FOR INSERT
  WITH CHECK (created_by = auth.uid());

-- Only the creator can update their plans
CREATE POLICY "owner_update_plans"
  ON map_plans FOR UPDATE
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- Only the creator can delete their plans
CREATE POLICY "owner_delete_plans"
  ON map_plans FOR DELETE
  USING (created_by = auth.uid());

-- ─── Grants ──────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON map_plans TO authenticated;
