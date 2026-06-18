# Imarketin / Check-in — Dev Log

Reverse-chronological log of substantive work. Each entry: what shipped, proof, what's next.

---

## 2026-06-18 — Supabase migration (security foundation) + landing online

### Landing page → LIVE
- Marketing landing published to production: **https://check-in-pdj.vercel.app/landing.html** (HTTP 200, public).
- Served from the Next app's `public/` (decoupled from the Supabase branch), shipped via the existing Vercel→`main` pipeline.
- Dematerialization motif (paper→data), GSAP animations, real neutralized app screenshots (IMARKETIN-branded).

### Supabase — new `imarketin` project + secure multi-tenant foundation
Branch: `feat/supabase-migration` (NOT merged to prod — build/test only).

**Project:** `imarketin` (`qimhmwkmkbqxsvtayldn`), region **eu-west-3 (Paris, EU/RGPD)**, free plan for build/test (upgrade to Pro €25/mo only at cutover).

**Architecture (institutional-grade):**
- Single project, multi-tenant via `location_id` + **RLS deny-by-default** on every table.
- Roles (`manager` / `staff`) + tenant id carried in JWT **`app_metadata`** (set server-side, user-immutable) — read by RLS via `auth.jwt()`. No self-minted JWTs.
- Access code → session: `auth-location` Edge Function matches a **peppered HMAC** of the code (IP rate-limited), then mints a real Supabase session. Code is never a DB credential; anon key reads nothing.
- `admin-provision` Edge Function (bootstrap-token-guarded) creates a location + per-role users + codes.

**Schema:** locations, location_members, location_codes, auth_attempts, app_config, sessions, clients (full app parity), checkins, notes, morning_briefs, audit_log. Canonical SQL: `supabase/migrations/0001_imarketin_platform.sql`. Old allow-all `schema.sql` deprecated.

**Proofs captured (live API):**
- `get_advisors(security)` = **0 issues**.
- All 10 tables `rls_enabled = true`; anon reads **0 rows** despite seeded data.
- Right code → JWT with correct `location_id` + `role`; wrong code → **401**; manager vs staff distinguished.
- Cross-tenant: Location B cannot read or insert into Location A → **HTTP 403**.
- RBAC: staff blocked from manager-only delete (**0 rows**); manager allowed.
- Notes: write/read/edit works, isolated per hotel, author auto-attributed.

**Demo data (for browser testing):** `Courtyard Demo` (staff `DEMO-STAFF-1234`, manager `DEMO-MGR-9876`), `Demo Two` (`TWO-STAFF-5555`).

### Next
- Offline-first sync engine (outbox + last-write-wins + verify-after-write).
- Wire app to Supabase behind a feature flag (localStorage stays fallback).
- OCR end-to-end + browser test harness for the agent.
- RGPD export/erase endpoints; pre-prod hardening (pepper → env secret, rotate bootstrap token, Pro upgrade).
