-- Sprint 4: Auth & Row-Level Security Migration
-- Run this in the Supabase SQL Editor
-- Prerequisites: Supabase Auth enabled (default on all projects)

-- ============================================================
-- 1. Profiles table — stores user roles
-- ============================================================

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'viewer'
    check (role in ('admin', 'viewer')),
  created_at timestamptz not null default now()
);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'viewer');
  return new;
end;
$$ language plpgsql security definer;

-- Drop trigger if it already exists, then create
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- 2. Enable RLS on all tables
-- ============================================================

alter table nodes enable row level security;
alter table telemetry enable row level security;
alter table alerts enable row level security;
alter table xp_events enable row level security;
alter table achievements enable row level security;
alter table cards enable row level security;
alter table profiles enable row level security;

-- ============================================================
-- 3. RLS Policies — nodes
-- ============================================================

-- Anyone can read nodes (dashboard is public)
create policy "nodes_select_public" on nodes
  for select using (true);

-- Only service_role can insert/update (collector)
-- No explicit policy needed — service_role bypasses RLS

-- ============================================================
-- 4. RLS Policies — telemetry
-- ============================================================

create policy "telemetry_select_public" on telemetry
  for select using (true);

-- ============================================================
-- 5. RLS Policies — alerts
-- ============================================================

-- Anyone can read alerts
create policy "alerts_select_public" on alerts
  for select using (true);

-- Authenticated users can dismiss (update acknowledged)
create policy "alerts_update_authenticated" on alerts
  for update using (auth.role() = 'authenticated');

-- ============================================================
-- 6. RLS Policies — gamification tables (Sprint 5 data)
-- ============================================================

create policy "xp_events_select_public" on xp_events
  for select using (true);

create policy "achievements_select_public" on achievements
  for select using (true);

create policy "cards_select_public" on cards
  for select using (true);

-- ============================================================
-- 7. RLS Policies — profiles
-- ============================================================

-- Users can read their own profile
create policy "profiles_select_own" on profiles
  for select using (auth.uid() = id);

-- Admins can read all profiles
create policy "profiles_select_admin" on profiles
  for select using (
    exists (
      select 1 from profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Admins can update any profile role
create policy "profiles_update_admin" on profiles
  for update using (
    exists (
      select 1 from profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- ============================================================
-- 8. Enable Realtime on profiles (for auth state)
-- ============================================================

alter publication supabase_realtime add table profiles;

-- ============================================================
-- 9. Helper: check if current user is admin
-- ============================================================

create or replace function public.is_admin()
returns boolean as $$
begin
  return exists (
    select 1 from profiles
    where id = auth.uid() and role = 'admin'
  );
end;
$$ language plpgsql security definer stable;
