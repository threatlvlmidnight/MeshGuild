-- sprint17-guild-stats.sql
-- Public-readable aggregate stats view for the landing page.
-- Allows anon (unauthenticated) users to see node/operator counts
-- without hitting the auth-gated node_ownership RLS policy.

CREATE OR REPLACE VIEW public.guild_stats AS
SELECT
  (SELECT COUNT(*)                         FROM public.nodes)          ::int  AS total_nodes,
  (SELECT COUNT(*) FROM public.nodes WHERE is_online = true)           ::int  AS online_nodes,
  (SELECT COUNT(DISTINCT player_id)        FROM public.node_ownership) ::int  AS total_operators;

GRANT SELECT ON public.guild_stats TO anon, authenticated;
