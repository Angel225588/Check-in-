# Session handoff — check-in quota / privacy / validation work

**Branch:** `claude/checkin-app-registration-bug-3lpy9c`
**Status:** work complete, tested, and pushed. **NOT deployed** — see ⚠️ below.

---

## TL;DR

- The original incident ("check-in showed ✓ but the count stayed at 11") is a
  **client-side localStorage failure**, not a server bug. Fixed + verified.
- Four commits on this branch, each with tests; full validation gate is green.
- ⚠️ **Do not deploy this branch as-is.** `main` has moved 10 commits ahead with
  its own quota + privacy + revenue work; deploying this branch standalone would
  **regress production**. It needs to be reconciled with `main` first. Details
  and an exact recipe are below.

---

## What was fixed on this branch

| Commit | What | Why it matters |
|--------|------|----------------|
| `b156df9` | **Honest saves** — `addCheckIn`/`addClient`/`updateClient` return the real save result; the check-in screen shows a red "NON enregistré — réessayer" instead of a fake ✓ when the write fails | This is the *actual* incident fix. **`main` does NOT have this** — on main `addCheckIn` still returns `void` and flashes success even when the save silently fails. |
| `0ff9f59` | **Rung 1** — LZ compression (~10×) of `dailyData_*` + `sessionHistory` (backward-compatible via an `LZ:` marker), ring-buffer retention (`MAX_HISTORY_DAYS`), and crash-safety shape guards (a corrupted entry can no longer white-screen the PWA at startup) | Removes the quota ceiling behind the incident; the crash guard was flagged by the security audit. |
| `bc0b0a3` | **Privacy** — room number removed from the check-in URL (opaque `sessionStorage` token via `lib/checkin-nav`), so it stops appearing in Vercel **access logs** (incl. RSC fetches). Also stops OCR routes logging the full guest list on parse failure. | `main` only redacts rooms from Vercel **Analytics** — that does NOT cover access logs. These are complementary. |
| `21db502` | **Validation framework** — `npm run validate` (tsc → vitest → build → real-browser E2E with screenshots). See `VALIDATION.md`. | Proves the guarantees rather than asserting them. |

Verified: **236 unit tests + 6 E2E checks pass; `tsc` clean; `next build` clean.**
Evidence screenshots were generated in `validation-artifacts/` (git-ignored).

---

## ⚠️ The deployment problem (why this isn't live yet)

Branch topology as of this session:

- **Live production** = a *manual promotion* of `claude/client-checkin-system-WYfe8`.
  That branch is **10 commits behind `main`**.
- **`main`** is the furthest ahead. Since this branch's base it added:
  - `feat(checkin): loud 'Petit-déjeuner NON inclus — à encaisser' banner` (revenue-leak fix)
  - `feat(analytics): enable Vercel Web Analytics` + `fix(privacy): redact room numbers from Vercel Analytics`
  - `feat(landing): marketing landing page` + GSAP CSP fix
  - **5× `fix(storage)`** — main's own quota approach: cap raw OCR text,
    `reclaimStorageSpace()` on startup, a user-facing **"Free up space"** settings
    button (`freeUpSpace()`), and a closeDay build repair
- **This branch** is 10 commits behind `main` and was based on the older tip.

**Deploying this branch as-is would regress** the revenue banner, analytics,
landing page, and main's storage work — and its `storage.ts` conflicts with
main's (both rewrote the same file to solve the quota problem, differently).

### How main's approach and this branch's approach relate

They are **complementary**, not duplicates:

| Concern | `main` | this branch |
|---------|--------|-------------|
| Quota — prevent | cap raw OCR text | cap raw OCR text **+ ~10× compression + ring buffer** |
| Quota — recover | `reclaimStorageSpace()` on load, `freeUpSpace()` button | evict-and-retry inside `saveTodayData` |
| Quota — honesty | ❌ still silent (`addCheckIn` returns void, fake ✓) | ✅ returns result, red error UI |
| Privacy | redact room from **Analytics** | remove room from **URL/access logs** |
| Robustness | — | JSON shape guards (no startup white-screen) |
| Verification | — | `npm run validate` + E2E |

The only real merge conflict is **`src/lib/storage.ts`** (both added quota logic)
plus a filename collision on **`src/__tests__/storage-quota.test.ts`** (main added
one too). `checkin/[roomNumber]/page.tsx` and `package.json` auto-merge cleanly.

---

## Recommended path to get a correct build live

**Option A — reconcile, then deploy (most complete).**
```bash
git checkout claude/checkin-app-registration-bug-3lpy9c
git merge origin/main            # conflicts: src/lib/storage.ts + storage-quota.test.ts
# Resolve storage.ts by KEEPING BOTH strategies:
#   - keep main's reclaimStorageSpace() / freeUpSpace() / settings button
#   - keep this branch's encode()/decode() compression, shape guards,
#     ring buffer, and the honest saveTodayData (evict+retry, returns bool)
#   - keep addCheckIn/addClient/updateClient returning boolean (the honesty fix)
#   - route main's reclaim/freeUp writes through encode() so they stay compressed
# Merge the two storage-quota.test.ts files (union of cases) or rename one.
npm run validate                 # MUST be green before going further
git push
```
Then deploy (see below). This ships main's work **and** the honesty + compression
+ URL-privacy + validation on top.

**Option B — deploy `main` tonight, land this branch as a follow-up PR (lowest risk).**
Main already fixes the quota incident (capping/reclaim) and privacy-analytics and
has the revenue banner, so promoting `main` makes tomorrow safe and non-regressed.
Then open this branch as a PR into `main` for the additive pieces — **especially
the honest-save fix, which main lacks.** Note: without the honest-save fix, a
still-full tablet on main will silently drop a guest (the original symptom).

**Recommendation:** A if someone can eyeball the storage.ts merge + run
`npm run validate` before the morning; otherwise B now and A as a fast follow-up.
Either way, **the honest-save fix (`b156df9`) should reach production** — it's the
direct cure for the reported incident and it's on no other branch.

---

## How to actually deploy to production (Vercel)

Production here is **manually promoted** (project `check-in`,
`prj_WjZkDMSpp9dZTx4r9SXYot63vUAv`, team `angels-projects-b0896f69`). The live
domains are `check-in-pdj.vercel.app` / `check-in-lake.vercel.app`. Steps:

1. Get the chosen commit onto the branch you promote (merge to `main`, or pick the
   reconciled branch).
2. In Vercel → project **check-in** → **Deployments**, find the READY deployment
   for that commit (pushes auto-build a preview).
3. **Promote to Production** (⋯ menu → Promote to Production), or
   `vercel promote <deployment-url>`.
4. Confirm `check-in-pdj.vercel.app` serves the new build; do the 30-second
   click-through (search → check-in → count moves) before the morning.

Make sure **`GEMINI_API_KEY`** (and any `NEXT_PUBLIC_SUPABASE_*`) env vars are set
on the project — they already are for the current production.

---

## Security backlog (from the 5-agent audit — none block Marriott, all matter before selling)

1. **HIGH — `/api/*` effectively unauthenticated.** The `API_AUTH_TOKEN` gate is
   never sent by the client, so in any working config the OCR routes are open —
   anyone with the URL can run up the **Gemini bill**. Fix: Vercel Access/WAF in
   front of `/api/*`, or an authenticated session. *(Top priority before other hotels.)*
2. **MED/HIGH — rate-limit bypass** via spoofable `X-Forwarded-For`, and it's
   per-instance in-memory (no global cap). Move to platform edge / shared store.
3. **MED — no body-size cap before buffering** uploads (memory DoS);
   `verify-extraction` trusts `content-length` and skips a PDF magic-byte check.
4. **MED — request amplification** (PDF chunk fan-out; Pro+thinking brief route).
5. **P3 — full guest PII goes to Google Gemini** by design → needs a DPA /
   no-retention tier + a line in the privacy notice.
6. **Hygiene** — run `npm audit fix` (non-forced; **never `--force`**, it
   downgrades Next to 9). Enable Supabase **RLS** before any guest data flows there.

---

## Deferred / open

- **Rung 2 (IndexedDB)** — deferred by decision; do it as a tested follow-up (not
  a same-day-before-service change). Rung 1 compression already gives a single
  tablet ~10× headroom.
- **`/api/*` lockdown** — the #1 security item above; recommend Vercel Access.

---

*Nothing in production was changed this session. All work is on
`claude/checkin-app-registration-bug-3lpy9c`; preview builds exist on Vercel.*
