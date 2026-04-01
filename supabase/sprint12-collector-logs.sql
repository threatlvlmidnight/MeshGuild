-- Sprint 12: Collector Logs — structured logging for ops troubleshooting
-- Stores collector events: connections, disconnections, errors, alerts, messages, XP, commands

CREATE TABLE IF NOT EXISTS collector_logs (
  id          BIGSERIAL PRIMARY KEY,
  level       TEXT NOT NULL DEFAULT 'info',  -- debug, info, warn, error
  category    TEXT NOT NULL,                 -- mqtt, packet, alert, xp, outbound, ops, system
  message     TEXT NOT NULL,
  node_id     TEXT,                          -- optional: which node this relates to
  metadata    JSONB,                         -- optional: extra structured data
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast time-range + category queries from the dashboard
CREATE INDEX IF NOT EXISTS idx_collector_logs_created ON collector_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_collector_logs_category ON collector_logs(category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_collector_logs_level ON collector_logs(level, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_collector_logs_node ON collector_logs(node_id, created_at DESC);

-- Auto-prune logs older than 7 days (run via pg_cron or manually)
-- DELETE FROM collector_logs WHERE created_at < NOW() - INTERVAL '7 days';

-- RLS: elder+ can read logs
ALTER TABLE collector_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Officers can view collector logs"
  ON collector_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('elder', 'leader')
    )
  );

-- Service role (collector) can insert
GRANT SELECT ON collector_logs TO authenticated;
GRANT INSERT ON collector_logs TO service_role;
GRANT SELECT ON collector_logs TO service_role;
