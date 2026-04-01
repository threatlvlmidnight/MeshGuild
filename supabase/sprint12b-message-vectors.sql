-- Sprint 12b: Message Vectors — log message routing without content
-- For troubleshooting missed messages + monitoring node traffic

CREATE TABLE IF NOT EXISTS message_vectors (
  id            BIGSERIAL PRIMARY KEY,
  direction     TEXT NOT NULL,          -- inbound (mesh->collector), outbound (dashboard->mesh)
  from_node_id  TEXT,                   -- sender node hex ID
  to_node_id    TEXT,                   -- recipient node hex ID (NULL = broadcast)
  channel_index INT NOT NULL DEFAULT 0,
  network_id    TEXT NOT NULL,
  player_id     UUID,                   -- who sent it (outbound only)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_message_vectors_created ON message_vectors(created_at DESC);
CREATE INDEX idx_message_vectors_from ON message_vectors(from_node_id, created_at DESC);
CREATE INDEX idx_message_vectors_to ON message_vectors(to_node_id, created_at DESC);
CREATE INDEX idx_message_vectors_direction ON message_vectors(direction, created_at DESC);

ALTER TABLE message_vectors ENABLE ROW LEVEL SECURITY;

-- Elder+ can view all vectors (ops troubleshooting)
CREATE POLICY "Officers can view message vectors"
  ON message_vectors FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('elder', 'leader')
    )
  );

-- Node owners can view vectors involving their own nodes
CREATE POLICY "Owners can view own node vectors"
  ON message_vectors FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM node_ownership
      WHERE node_ownership.player_id = auth.uid()
      AND (
        node_ownership.node_id = message_vectors.from_node_id
        OR node_ownership.node_id = message_vectors.to_node_id
      )
    )
  );

GRANT SELECT ON message_vectors TO authenticated;
GRANT INSERT, SELECT ON message_vectors TO service_role;
