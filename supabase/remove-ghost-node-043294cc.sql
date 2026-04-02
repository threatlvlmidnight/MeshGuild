-- Remove ghost node !043294cc (UNIFORM-1 Node 2 / UFN2)
-- Alex reflashed this device; the old node ID is stale.
-- Run in Supabase SQL editor.

DO $$
DECLARE
  ghost TEXT := '!043294cc';
BEGIN
  -- Child tables first (no CASCADE defined on schema FK constraints)
  DELETE FROM cards         WHERE node_id = ghost;
  DELETE FROM achievements  WHERE node_id = ghost;
  DELETE FROM xp_events     WHERE node_id = ghost;
  DELETE FROM alerts        WHERE node_id = ghost;
  DELETE FROM telemetry     WHERE node_id = ghost;

  -- Parent
  DELETE FROM nodes WHERE id = ghost;

  RAISE NOTICE 'Ghost node % removed.', ghost;
END $$;
