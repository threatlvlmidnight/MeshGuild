-- Sprint 9: Mesh Shell
-- No persistent message storage — inbound messages are broadcast via Supabase
-- Realtime and cached in localStorage on the dashboard.
--
-- This table is a transient relay for OUTBOUND messages only.
-- Dashboard inserts a row; collector polls, publishes to MQTT, deletes the row.
-- Rows typically exist for < 2 seconds.

CREATE TABLE IF NOT EXISTS outbound_queue (
  id            BIGSERIAL PRIMARY KEY,
  content       TEXT NOT NULL,
  channel_index INT NOT NULL DEFAULT 0,
  to_node_id    TEXT,                              -- NULL = broadcast, hex id = DM
  player_id     UUID NOT NULL REFERENCES profiles(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE outbound_queue ENABLE ROW LEVEL SECURITY;

-- Authenticated users can insert their own outbound messages
CREATE POLICY "Users can queue outbound messages"
  ON outbound_queue FOR INSERT
  TO authenticated
  WITH CHECK (player_id = auth.uid());

-- Service role (collector) handles SELECT + DELETE — no user-facing read/delete policies needed
