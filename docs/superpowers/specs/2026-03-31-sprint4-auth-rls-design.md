# Sprint 4 Design — Auth & Row-Level Security

**Version:** 1.0
**Date:** 2026-03-31
**Status:** Approved
**Sprint Goal:** Lock down the dashboard with authentication and protect Supabase data with RLS.

---

## Scope

| # | Feature | Description |
|---|---------|-------------|
| 1 | Supabase Auth | Email/password login via Supabase Auth |
| 2 | User profiles & roles | `profiles` table with `admin` / `viewer` roles |
| 3 | Row-level security | RLS policies on all 6 tables |
| 4 | Dashboard login page | `/login` route with email/password form |
| 5 | Auth middleware | Protect write operations behind authentication |
| 6 | Admin UI | Admin badge, user menu, admin settings page |

---

## Auth Strategy

- **Provider:** Supabase Auth (email/password only for now)
- **Session management:** `@supabase/ssr` for Next.js App Router cookie-based sessions
- **Roles:** Two roles — `admin` and `viewer`
- **First admin:** Seeded via Supabase SQL; additional admins set by updating the `profiles` table
- **Public read:** The main dashboard (`/`) remains publicly readable — no login required to view node health
- **Protected writes:** Dismissing alerts, acknowledging alerts, and admin actions require authentication

---

## Database Changes

### New table: `profiles`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | References `auth.users(id)` |
| email | text | User's email |
| role | text NOT NULL default 'viewer' | `admin` or `viewer` |
| created_at | timestamptz default now() | |

A trigger auto-creates a profile row when a new user signs up.

### RLS Policies

All tables get RLS enabled. The `service_role` key (used by the collector and bots) bypasses RLS entirely.

**`nodes`**
- SELECT: public (anon + authenticated) — dashboard reads are public
- INSERT/UPDATE: service_role only (collector writes)

**`telemetry`**
- SELECT: public
- INSERT: service_role only

**`alerts`**
- SELECT: public
- INSERT: service_role only
- UPDATE: authenticated users only (dismiss alerts)

**`xp_events`, `achievements`, `cards`**
- SELECT: public
- INSERT/UPDATE: service_role only

**`profiles`**
- SELECT: users can read their own profile
- INSERT: triggered automatically on signup
- UPDATE: admin users can update any profile; users cannot self-promote

---

## Dashboard Changes

### New packages
- `@supabase/ssr` — cookie-based Supabase client for Next.js App Router

### New files
- `lib/supabase-server.ts` — server-side Supabase client (reads cookies)
- `lib/supabase-browser.ts` — browser-side Supabase client (replaces current `supabase.ts`)
- `app/login/page.tsx` — login page with email/password form
- `app/auth/callback/route.ts` — auth callback handler
- `middleware.ts` — Next.js middleware to refresh auth session
- `app/admin/page.tsx` — admin settings page (user list, role management)
- `components/auth-nav.tsx` — nav bar component showing login/user status

### Modified files
- `lib/supabase.ts` — refactored to use `@supabase/ssr`
- `app/layout.tsx` — add nav bar with auth status
- `app/alerts/page.tsx` — dismiss buttons require authentication
- `app/page.tsx` — show auth nav in header

### Page access matrix

| Page | Anon | Viewer | Admin |
|------|------|--------|-------|
| `/` (node grid) | Read | Read | Read |
| `/node/[id]` (detail) | Read | Read | Read |
| `/alerts` | Read only | Read + dismiss own | Read + dismiss all |
| `/login` | Yes | Redirect to `/` | Redirect to `/` |
| `/admin` | Redirect to `/login` | 403 | Full access |

---

## Out of Scope

- OAuth / social login (future)
- Email verification enforcement (future)
- Multi-tenant role management (future)
- API route protection (collector uses service_role, bypasses RLS)
