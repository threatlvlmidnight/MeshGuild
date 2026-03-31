-- Sprint 4 patch: Allow admins to delete nodes and related data
-- Run this in the Supabase SQL Editor

-- Admins can delete nodes
create policy "nodes_delete_admin" on nodes
  for delete using (
    exists (
      select 1 from profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Admins can delete telemetry (cascade when removing a node)
create policy "telemetry_delete_admin" on telemetry
  for delete using (
    exists (
      select 1 from profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Admins can delete alerts (cascade when removing a node)
create policy "alerts_delete_admin" on alerts
  for delete using (
    exists (
      select 1 from profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Admins can delete gamification data (cascade when removing a node)
create policy "xp_events_delete_admin" on xp_events
  for delete using (
    exists (
      select 1 from profiles
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "achievements_delete_admin" on achievements
  for delete using (
    exists (
      select 1 from profiles
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "cards_delete_admin" on cards
  for delete using (
    exists (
      select 1 from profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Grant DELETE permissions to authenticated role
GRANT DELETE ON nodes TO authenticated;
GRANT DELETE ON telemetry TO authenticated;
GRANT DELETE ON alerts TO authenticated;
GRANT DELETE ON xp_events TO authenticated;
GRANT DELETE ON achievements TO authenticated;
GRANT DELETE ON cards TO authenticated;
