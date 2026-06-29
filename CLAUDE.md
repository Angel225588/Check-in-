# Check-in PWA


## Overview
Hotel breakfast check-in PWA. Upload daily report photos (Gemini Vision API), search rooms, check in guests.

## Tech Stack
- Next.js 16 App Router, TypeScript, Tailwind CSS v4
- Gemini 2.5 Flash Vision API for OCR
- Tesseract.js as fallback
- localStorage for persistence
- Vitest + jsdom for testing

## TDD Workflow (MANDATORY)
1. **Write tests FIRST** before implementing any feature or fix
2. Tests live in `src/__tests__/` with pattern `*.test.ts`
3. Run tests: `npx vitest run`
4. Run single file: `npx vitest run src/__tests__/filename.test.ts`
5. All tests must pass before committing — currently 91 tests across 5 files
6. Test files: `parser.test.ts`, `ocr-api.test.ts`, `photo-capture.test.ts`, `vip.test.ts`, `report.test.ts`

## Git & Cloud-Sync Workflow (MANDATORY — locked 2026-06-21)
**Hard rule: never leave work local-only. A commit that isn't pushed does not exist for Angel, GitHub, or Vercel.**
- **Push after every commit** (or at the latest at the end of each work turn). Local commits are invisible to Angel and create no Vercel preview — always `git push` the working branch.
- **Work on a branch, never commit straight to `main`** unless the change is explicitly a production landing (e.g. the marketing page). Feature work lives on its branch (e.g. `feat/supabase-migration`).
- **`main` is production** — Vercel auto-deploys it. Only merge/push to `main` when the change is meant to go live.
- **Pushing a branch = a Vercel preview** (separate URL, never prod). That's how Angel sees and tests WIP. Preview URLs sit behind Vercel deployment protection; for an Angel phone-test, expose a publicly reachable preview.
- **Documented at all times:** every substantive change is committed with a clear message + reflected in `docs/DEVLOG.md` and the relevant ClickUp task's Proof-of-Done. So work is portable across local and cloud with zero context loss.
- At the end of a work session, state the branch + that it's pushed, so status is never ambiguous.

## Key Paths
- API routes: `src/app/api/ocr/route.ts`, `src/app/api/ocr-vip/route.ts`
- Pages: `src/app/upload/`, `src/app/search/`, `src/app/checkin/[roomNumber]/`, `src/app/report/`
- Components: `src/components/`
- Logic: `src/lib/` (types, storage, parser, vip, report, utils)
- Tests: `src/__tests__/`

## Brand & Design
- Primary gold: `#A66914`, Light gold: `#DD9C28`
- Font: MuseoSans > Nunito > Arial
- Card radius: 14px, Pill buttons: 52px radius
- Apple-style glassmorphism: backdrop-blur, translucent backgrounds
- CSS tokens defined in `src/app/globals.css` via `@theme`

## Conventions
- "use client" on all interactive components
- Gemini API uses `thinkingBudget: 0` (no thinking mode) for speed
- Multi-photo uploads process in parallel via `Promise.allSettled`
- Shared rooms (same room, different names) are kept as separate entries
- VIP matching uses room+name composite key

## Proof-of-Done (PoD) — MANDATORY on every task (locked 2026-06-09)
**Hard rule: no task is "done" without attached proof. We never go back to re-verify a closed task.**

Every task — in ClickUp and in code — must, before being marked complete, carry a **Proof-of-Done**: a concrete, re-runnable artifact that demonstrates the task actually works. Saying "done" or pasting a console log is NOT proof.

A valid PoD is one (or more) of:
1. **A passing test** — written FAILING first (proves it tests the thing), then green. Name the test file.
2. **A round-trip verification** — `write() → read() the live external state → assert() it matches`. Reading your own log is not verification (see Round-trip-or-fail rule below).
3. **A live-state read** — query Supabase / hit the endpoint / read the row, and paste the actual result.
4. **A visual artifact** — screenshot/recording of the actual rendered output (for UI), inspected by Claude before it counts.
5. **A tool/advisor report** — e.g. Supabase `get_advisors(security)` = 0 issues, attached.

**ClickUp requirement:** every task description ends with a `## Preuve de réalisation` block stating exactly what proof will be produced. A task cannot be closed until that proof is attached as a comment/artifact on the task. Stale/unverifiable → reopen.

**Why:** so a task closed today stays trustworthy forever — we build on top of it without re-checking. This is how the app stops repeating mistakes.

## Round-trip-or-fail rule (applies to all external state: Supabase / Etsy / Printify / etc.)
Any code that mutates external state MUST: (1) `write()` the mutation, (2) `read()` the live state back from the same system, (3) `assert()` the read matches the expected mutation — throw and exit non-zero on mismatch. Reading your own console log is **not** verification. Use a `verifyAfterWrite()` helper. A script that can't prove its mutation landed must surface a failure, never a silent success.

## Supabase Integration (in progress — see docs/sprints/2026-06-09_supabase-integration.md + docs/sprints/2026-06-20_sync-engine-blueprint.md)
- Org **imarketin** (`cvzfjewqizeicaidledm`); project **`imarketin`** (`qimhmwkmkbqxsvtayldn`), region **eu-west-3 (Paris)** — EU/RGPD. **This is the single pinned project+region** (assert via `get_project` before any live write).
- Architecture: **single project, multi-tenant via RLS** (`location_id` everywhere, deny-by-default; role via JWT `app_metadata`).
- Auth: **location access code → Edge Function `auth-location` → scoped Supabase session** (code = peppered HMAC, rate-limited). Code **auto-assigned** at provisioning; **only the manager** rotates a code or adds a location. Anon key reads nothing.
- Sync: **offline-first** — localStorage cache + outbox queue → Supabase. **Last-write-wins by client-authored `client_rev`** (NOT server `updated_at`, which is before-update only → used only as the pull watermark). Deletes = **sticky tombstones**. `verifyAfterWrite` proves a write *landed* (not equals-what-we-sent). Never clear localStorage until the server copy is round-trip-confirmed AND the outbox is drained for that date.
- Plan: **free for build/test; Pro (€25/mo) only at cutover**. RGPD: EU residency, export, erasure (≠ tombstone), audit log (role+device granularity — shared role users), 90-day guest-detail retention (proposed), DPA.
- Rollout: **Courtyard first**, then Btisseme's hotels. Cutover gate = divergence 0 over 48h dual-run. Full stage plan + per-stage Proof-of-Done in the sprint docs.

## Operating Model — Claude owns Development (locked 2026-06-29)
**Granted by Angel (CEO):** Claude is **Director of Development** — full authority over security, dev, and design execution, and over the quality bar. Angel is **CEO**: sets priority (what's P0, what can wait) and makes go/no-go calls **one decision at a time**. See `AGENTS.md` for the full department model.

- **Claude owns:** architecture, security, code, design, testing, and the **prod gate**. Nothing reaches prod (`main`) without Claude's quality sign-off.
- **Angel owns:** priorities + the timing go on user-facing prod launches. Claude surfaces each launch with a one-line heads-up; **quality is pre-trusted**.
- **Decision cadence — one at a time.** No menus. Each open decision is presented as **[CONTEXT] one line · [RECO] Claude's pick · [DEFAULT] what happens if Angel says nothing.** Angel answers the top one; Claude executes; the next surfaces. Live list = **CEO Decision Queue** below.
- **Scheduled agents.** Claude may activate background/scheduled agents to run specific, well-scoped tasks. Every output passes the quality gate before it counts: **Playwright verification** (UI exercised in a real browser, screenshot inspected by Claude) + **Proof-of-Done / round-trip-or-fail** (state). **No agent auto-deploys to prod** — agents work on a branch; Claude holds the gate.
- **Bar is non-negotiable:** done only with attached proof. Gate fails → "blocked on gate X", never "done with caveats".

## CEO Decision Queue (answer the top one — context · reco · default)
Ordered by what's blocking progress. Angel answers #1; Claude executes and re-tops the queue. Full rationale: `docs/security/security-posture-and-roadmap.md`.

**Resolved 2026-06-29:** P0 = **S1+S2 this week** ✅ · retention **90d** ✅ · OCR **Mistral, from tomorrow** ✅ · encryption = **zero-knowledge** (key derived from access code, never on server → *we cannot read the hotel's data*; dashboard on non-PII counts; lost-code = lost-data accepted) ✅ · **S0 auto-purge** (delete old OCR text daily; photos already never stored) ✅ · self-host **deferred** ⏳.

**Active execution:** **S0** (auto-purge stale `rawUploadText` → frees storage for tomorrow, safe/localStorage-only) → S1 (pepper → edge-secret-only) → zero-knowledge encryption → wire sync on **preview** → integration harness green → flip live. Everything proven on preview before prod. Safe path, no rush.
