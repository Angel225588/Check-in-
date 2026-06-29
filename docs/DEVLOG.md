# Imarketin / Check-in — Dev Log

Reverse-chronological log of substantive work. Each entry: what shipped, proof, what's next.

---

## 2026-06-29 — Security-first pivot: zero-knowledge, quality hooks, S0 storage fix

### Operating model — Claude = Director of Development
Angel (CEO) delegated dev/security/design execution + the prod gate to Claude; CEO sets priorities + gives prod-launch timing. Codified in `CLAUDE.md` + new `AGENTS.md`. Cadence: one decision at a time (context · reco · default), tracked in the CLAUDE.md **CEO Decision Queue**.

### Security posture + central-bank maturity roadmap
New doc `docs/security/security-posture-and-roadmap.md`: data map, threat model, **L0–L5 maturity ladder** with per-rung verification gates, RGPD/CNIL checklist, sub-processor register. Operating order locked: **Security → situations → user → hook → design.**

### Decisions (locked 2026-06-29)
- **Encryption = zero-knowledge** — key derived from the access code, never on the server → *we cannot read the hotel's guest data*. Dashboard runs on non-PII counts. Lost-code = lost-data (accepted security property).
- **OCR** — drop Google Gemini → **Mistral OCR 4** (French, EU; self-host container in Phase 2), from tomorrow.
- **Retention** — 90 days, then auto-delete/anonymize.
- **Access** — same location code = same data (RLS deny-by-default).

### Quality hooks (enforced, not remembered) — `.claude/hooks/`
`secret-guard` (DENY hardcoded secrets/JWT/pepper in code) · `git-guard` (ASK on commit/push to `main`, DENY force-push) · `push-reminder` (nudge unpushed commits). Fail-open, unit-tested. Rule→enforcement map in `AGENTS.md`.

### S0 — storage auto-purge → SHIPPED (preview)
Confirmed **photos are never persisted**; `rawUploadText` was the only storage hog. `purgeStaleRawText()` clears OCR text from closed sessions on load.
- **Proof:** TDD `src/__tests__/storage-purge.test.ts` (3 tests, failing-first proven) · full suite **255 green** · `tsc` clean. localStorage-only, idempotent.

### Security website page (plain French) — DRAFT, preview only
`public/securite.html` — "Vos données protégées au niveau d'une banque." **Publishes claim-by-claim ONLY as each becomes literally true** (today only "no photos stored" is fully live; the rest gates on S1→cutover). Publishing untrue security claims is itself a liability.

### Next
- S1: pepper → edge-secret-only (remove `app_config` fallback) + rotate bootstrap token.
- Zero-knowledge crypto lib (key-from-code, encrypt/decrypt, blind index) — TDD.
- Wire sync in mirror mode on preview → integration harness green → flip live (no blind prod flip).

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
