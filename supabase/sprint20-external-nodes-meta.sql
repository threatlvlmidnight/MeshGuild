-- sprint20-external-nodes-meta.sql
-- Adds hardware/telemetry columns to external_nodes so ally popups
-- can show richer context from meshmap.net data.

ALTER TABLE external_nodes
  ADD COLUMN IF NOT EXISTS hw_model      TEXT,
  ADD COLUMN IF NOT EXISTS role          TEXT,
  ADD COLUMN IF NOT EXISTS altitude      INTEGER,
  ADD COLUMN IF NOT EXISTS precision     INTEGER,
  ADD COLUMN IF NOT EXISTS neighbor_count INTEGER,
  ADD COLUMN IF NOT EXISTS last_seen     TIMESTAMPTZ;
