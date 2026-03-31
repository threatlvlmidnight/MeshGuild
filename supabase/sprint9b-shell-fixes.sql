-- Sprint 9b: Shell fixes
-- Add from_node_id so the dashboard can specify which owned node to send from.

ALTER TABLE outbound_queue
  ADD COLUMN IF NOT EXISTS from_node_id TEXT;
