# Sprint 4: Auth & Row-Level Security Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add authentication and row-level security to the MeshGuild dashboard and Supabase backend.

**Spec:** `docs/superpowers/specs/2026-03-31-sprint4-auth-rls-design.md`

---

## File Structure

```
# New and modified files:

supabase/
  sprint4-auth-rls.sql          # RLS migration: profiles table, policies, trigger

dashboard/
  middleware.ts                  # Next.js middleware — refresh auth session
  lib/
    supabase.ts                  # MODIFIED — browser client via @supabase/ssr
    supabase-server.ts           # NEW — server-side Supabase client
  app/
    layout.tsx                   # MODIFIED — add AuthNav to header
    page.tsx                     # MODIFIED — add AuthNav import
    login/
      page.tsx                   # NEW — email/password login form
    auth/
      callback/
        route.ts                 # NEW — auth callback handler
    admin/
      page.tsx                   # NEW — admin settings (user list + roles)
    alerts/
      page.tsx                   # MODIFIED — require auth for dismiss
  components/
    auth-nav.tsx                 # NEW — login/logout nav component
```

---

## Task 1: Supabase Schema — Profiles Table & RLS Policies

**Files:** Create `supabase/sprint4-auth-rls.sql`

Run this SQL in the Supabase SQL editor to add profiles, enable RLS, and create policies.

---

## Task 2: Install @supabase/ssr

```bash
cd dashboard && npm install @supabase/ssr
```

---

## Task 3: Refactor Supabase Client for Auth

**Files:**
- Modify: `dashboard/lib/supabase.ts` — browser client using `@supabase/ssr`
- Create: `dashboard/lib/supabase-server.ts` — server-side client

---

## Task 4: Auth Middleware

**Files:** Create `dashboard/middleware.ts`

Refreshes the auth session on every request so cookies stay valid.

---

## Task 5: Auth Callback Route

**Files:** Create `dashboard/app/auth/callback/route.ts`

Handles the redirect after email confirmation / OAuth.

---

## Task 6: Login Page

**Files:** Create `dashboard/app/login/page.tsx`

Simple email/password form with login and signup modes.

---

## Task 7: Auth Nav Component

**Files:** Create `dashboard/components/auth-nav.tsx`

Shows login button (anon) or user email + logout button (authenticated). Admin badge for admin users.

---

## Task 8: Update Layout

**Files:** Modify `dashboard/app/layout.tsx`

Add metadata title, add nav bar to body.

---

## Task 9: Protect Alert Dismiss

**Files:** Modify `dashboard/app/alerts/page.tsx`

- Check auth state before allowing dismiss
- Show login prompt if unauthenticated user tries to dismiss

---

## Task 10: Admin Settings Page

**Files:** Create `dashboard/app/admin/page.tsx`

- List all users with roles
- Allow admin to change user roles
- Redirect non-admin users

---

## Task 11: Build & Commit

```bash
cd dashboard && npm run build
git add -A
git commit -m "Sprint 4: auth, admin roles, row-level security"
```
