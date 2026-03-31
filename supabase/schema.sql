-- MeshGuild Schema v1.0
-- Full schema: 6 tables. Sprint 1 uses nodes, telemetry, alerts.
-- Gamification tables (xp_events, achievements, cards) are created now
-- but populated starting in Sprint 5.

-- Nodes: one row per mesh node
create table nodes (
  id text primary key,
  network_id text not null default 'okc-crew',
  short_name text,
  long_name text,
  last_seen timestamptz,
  rssi int,
  snr real,
  battery_level int,
  is_online boolean not null default true,
  xp_total int not null default 0,
  level int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Telemetry: time-series signal data
create table telemetry (
  id bigint primary key generated always as identity,
  node_id text not null references nodes(id),
  network_id text not null,
  timestamp timestamptz not null,
  rssi int,
  snr real,
  battery_level int,
  uptime_seconds int
);

-- Alerts: triggered notifications
create table alerts (
  id bigint primary key generated always as identity,
  node_id text not null references nodes(id),
  network_id text not null,
  alert_type text not null,
  message text not null,
  acknowledged boolean not null default false,
  created_at timestamptz not null default now()
);

-- XP Events: gamification point awards (Sprint 5)
create table xp_events (
  id bigint primary key generated always as identity,
  node_id text not null references nodes(id),
  network_id text not null,
  event_type text not null,
  xp_awarded int not null,
  created_at timestamptz not null default now()
);

-- Achievements: earned badges (Sprint 5)
create table achievements (
  id bigint primary key generated always as identity,
  node_id text not null references nodes(id),
  network_id text not null,
  achievement_key text not null,
  earned_at timestamptz not null default now()
);

-- Cards: collectible drops (Sprint 5)
create table cards (
  id bigint primary key generated always as identity,
  node_id text not null references nodes(id),
  network_id text not null,
  card_name text not null,
  rarity text not null,
  trigger_event text not null,
  earned_at timestamptz not null default now()
);

-- Indexes
create index idx_telemetry_node_time on telemetry(node_id, timestamp);
create index idx_alerts_network_ack on alerts(network_id, acknowledged);
create index idx_xp_events_node on xp_events(node_id);

-- Enable Realtime on tables that the dashboard subscribes to
alter publication supabase_realtime add table nodes;
alter publication supabase_realtime add table alerts;
