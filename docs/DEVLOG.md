# Imarketin / Check-in — Dev Log

Reverse-chronological log of substantive work. Each entry: what shipped, proof, what's next.

---

## 2026-06-30 — Sync v2 (kills the duplicate) + analyse narration + impact screen

### Sync v2 — cross-device check-in state
Root cause of the 13h/14h duplicate: check-in *records* never synced, so a 2nd device's `remaining`/`allDone` never reflected the 1st device's check-in and the local guard couldn't fire across devices. Fixed by syncing check-ins (idempotent upsert by record `id`; zero-knowledge PII; sticky tombstone for undo) + a live pull (12s poll + Supabase Realtime + focus). The existing `allDone` guard now blocks the duplicate; added an explicit "déjà pointé à HHh" banner.
- Files: `src/lib/sync/push-checkins.ts`, `src/lib/sync/keys.ts` (cached PBKDF2), `src/hooks/useLiveSync.ts`, `storage.applyServerCheckins` + tombstone set, check-in/search/upload wiring, migration `0004_realtime_checkins_clients.sql`.
- **Proof:** failing-first reconcile test (`sync-checkins.test.ts`, 6); server-contract proof via SQL on a throwaway location — 2 pushes → **1 live row** (idempotent), undo → **0 live rows** (tombstone). 279/279 tests, tsc + `next build` clean.

### Analyse narration + start-of-day impact
`AnalyseLoading` (agent-style plain-word steps during OCR) + `ImpactScreen` ("Bonjour l'équipe / voici la journée" — textured-gold TOTAL, Inclus/Comp/VIP/Hors-liste/À-vérifier/Chambres, tap-any-box → plain explanation, honest coherence flag, analysé-en-X-s, Commencer le service). `impact.ts/computeImpact` = comp/inclus/hors strict partition (sums to total) + VIP overlay + data-quality à-vérifier (TDD, 6). Wired into `/upload`: processing → narration; confirm → impact → service.
- **Proof:** verified live on the dev server via preview tooling — narration animates, impact shows correct real math (TOTAL 13 = 6+2+5; VIP 1; à-vérifier 1 → coherence banner), tap-to-explain popover works. Screenshots inspected.

### Data minimization
`dropTodayRawText()` drops the raw OCR dump for the open day once the clean roster is saved (photos already never persisted). TDD (3 tests).

### Verified Pro-tier security posture
Advisors clean (leaked-password WARN gone; only the 3 intentional locked-table INFO remain). Flagged Attack Challenge Mode to be turned OFF (challenges normal staff; emergency-only; Vercel auto-DDoS is always-on). Skipped OWASP Enterprise ruleset (→ code-side rate-limiting) + PITR (~$100/mo; daily backups suffice).

### Next
- Angel's two-device LIVE test on preview (`feat/supabase-migration`): upload → narration → impact; device A check-in → device B sees it (no duplicate) + "déjà pointé".
- Sprint 1 hardening: security headers (HSTS/CSP/frame-deny) + rate-limit on `/api/ocr` + auth path.
- Then S2 sync→prod cutover (48h dual-run, divergence 0) at Courtyard.

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

### Shipped this session (preview branch)
- **S0 auto-purge** ✅ · **quality hooks** ✅ · **zero-knowledge crypto lib** (`src/lib/crypto/field-crypto.ts`, 5 tests) ✅.

### CODE + SYNC — proven GREEN (live, round-trip)
Restored the paused free-tier project; ran `scripts/test-code-sync.mjs` against the **live** Supabase project (eu-west-3). All checks pass:
1. **Code → session** — `DEMO-STAFF-1234` → scoped session for "Courtyard Demo", role=staff ✅
2. **Wrong code → 401** ✅
3. **Write → round-trip read matches** (inserted a client, read it back) ✅
4. **Isolation** — the other location (`Demo Two`) sees **0 rows** (RLS holds) ✅
5. **Anon reads nothing** (deny-by-default) ✅

Harness reads secrets from ENV (never hardcoded). Proves the **auth + sync + tenant-isolation plumbing**. NOTE: this path stores `name` in plaintext today — the zero-knowledge crypto lib is built but **not yet wired into the sync mapper** (tomorrow). Fine for demo/test data; real PII gets encryption first.

### Mistral OCR — validated (live, real report)
Angel supplied a 7-day Mistral test key (env only, never committed). `scripts/test-mistral-ocr.mjs` (key from ENV) ran against:
- **Synthetic Courtyard daily arrival report** → perfect structured markdown table (40 rooms, all fields + totals), 2 pages / 4.3s.
- **Real `R118 Package Forecast`** (actual Opera format, messy compound FR names) → clean table incl. the **package codes that drive breakfast logic** (BKF INC/GRP/COMP, UPSPDJ). ~2 minor l/I glyph quirks.
Verdict: **Mistral OCR 4 (EU) is a strong replacement for Google Gemini** — structured tables map straight to our parser, and it's the sovereign/EU story. Next: wire `MISTRAL_API_KEY` into the app's OCR route (Angel setting it on Vercel), adapt the parser to consume markdown tables, drop Google.

### Scope decision (Angel, late 2026-06-29) — minimal-change rollout
- **The live hotel app UI/UX does NOT change.** No new screens to prod yet.
- **Only addition:** a small **home/3D icon (top) to enter a sync code** → connects the device to Supabase sync.
- **One screen live first: the existing restaurant / check-in screen.** The new Réception + Direction spaces stay **preview-only** until tested.
- Rationale: don't disrupt what works; prove sync + zero-knowledge encryption under the current UI, expand later.

### Zero-knowledge encryption — proven live in the browser
`public/sync-test.html` upgraded: PII encrypted on-device (key derived from the access code) before write. Verified end-to-end against the live project: stored `name` = `v1:+GGwsbJXt5…` (ciphertext), **no plaintext leak**, decrypts back to the real name only on-device. Opening Supabase shows gibberish — owner-blind, as designed.

### Tomorrow (P1 — Angel tests code + sync)
1. Wire `field-crypto` into the sync mapper → guest name/notes encrypted before they ever reach Supabase (the round-trip then shows **ciphertext** in the dashboard).
2. Minimal **code-entry test page** on preview (enter code → add guest → see it sync) so Angel taps it on his phone with a demo code.
3. Re-run the harness green (now with encryption asserted).
4. **No prod flip** — preview + demo data only. localStorage stays authoritative → **zero data-loss risk**.

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
