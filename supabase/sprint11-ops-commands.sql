-- Sprint 11: Ops Commands & Collector Heartbeat
-- Remote reboot/restart controls for elder+ operators

-- Command queue: dashboard inserts, collector polls and executes
CREATE TABLE IF NOT EXISTS ops_commands (
  id            BIGSERIAL PRIMARY KEY,
  command       TEXT NOT NULL,          -- REBOOT_COLLECTOR, RESTART_MOSQUITTO
  requested_by  UUID NOT NULL REFERENCES profiles(id),
  status        TEXT NOT NULL DEFAULT 'pending',  -- pending, executing, completed, failed
  result        TEXT,                   -- optional result message
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  executed_at   TIMESTAMPTZ
);

-- Collector heartbeat: upserted every 30s so dashboard knows it's alive
CREATE TABLE IF NOT EXISTS collector_heartbeat (
  id          TEXT PRIMARY KEY DEFAULT 'main',
  last_beat   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status      TEXT NOT NULL DEFAULT 'running',
  started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  pid         INTEGER
);

-- RLS for ops_commands
ALTER TABLE ops_commands ENABLE ROW LEVEL SECURITY;

-- Elder+ can view all commands
CREATE POLICY "Officers can view ops commands"
  ON ops_commands FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('elder', 'leader')
    )
  );

-- Elder+ can insert commands (must be their own ID)
CREATE POLICY "Officers can insert ops commands"
  ON ops_commands FOR INSERT
  TO authenticated
  WITH CHECK (
    requested_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('elder', 'leader')
    )
  );

-- RLS for collector_heartbeat (read-only for authenticated)
ALTER TABLE collector_heartbeat ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view heartbeat"
  ON collector_heartbeat FOR SELECT
  TO authenticated
  USING (true);
