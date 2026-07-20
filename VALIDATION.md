# Validation framework

A repeatable gate that proves the app's critical guarantees before a deploy —
so "the task is done" is something we **demonstrate**, not assert.

## Run it

```bash
npm run validate
```

Exit code `0` = every layer passed. Non-zero = something failed (the output and
`validation-artifacts/report.md` say what). Nothing is committed by this run;
screenshots and the report land in `validation-artifacts/` (git-ignored).

## What it does — four layers

| Layer | Command | Proves |
|-------|---------|--------|
| 1. Type safety | `tsc --noEmit` | No type regressions |
| 2. Unit / logic | `vitest run` | Storage, nav, parser, VIP, reports logic — incl. the quota/compression/crash-safety tests added for this work |
| 3. Production build | `next build` | The app actually compiles for production |
| 4. End-to-end | `node scripts/e2e-validate.mjs` (real headless Chromium) | The runtime guarantees below, with a screenshot per step |

Layer 4 boots `next start` and drives the real UI — no mocks — using the
`playwright` library and the pre-installed Chromium (no extra dependency).

## Requirements traceability — each guarantee → how it's verified → evidence

| # | Guarantee (from this work) | Verified by | Evidence |
|---|----------------------------|-------------|----------|
| G1 | **Guest room number never appears in the check-in URL** | E2E `A1` asserts `/checkin/<token>` and the path has no room number | `02-checkin-url-clean.png` (banner shows the clean path) |
| G2 | **Room number never leaks into any request** (incl. App Router RSC `?_rsc=` fetches → Vercel logs) | E2E `A2` records every network request and asserts none contains the room number | `report.md` (request count checked) |
| G3 | **Check-in works and shows confirmation** | E2E `A3` clicks check-in, waits for the success overlay | `03-checkin-success.png` |
| G4 | **A day is stored compressed at rest** (quota headroom) | E2E `A4` reads localStorage and asserts the `LZ:` marker | `report.md` (stored length) |
| G5 | **Check-ins persist across navigation/reload** | E2E `A5` re-opens the room and asserts the "all checked in" state | `04-checkin-persisted.png` |
| G6 | **Full storage shows a real error, not a fake success** (the original incident) | E2E `B1` forces `QuotaExceededError`, asserts the red "NOT saved" overlay and absence of the green success | `05-quota-honest-error.png` |
| G7 | Quota honesty / recovery / capping logic | Unit — `src/__tests__/storage-quota.test.ts` | `vitest` output |
| G8 | Compression round-trip, backward-compat, crash-safety, ring buffer | Unit — `src/__tests__/storage-compression.test.ts` | `vitest` output |
| G9 | PII-free token navigation round-trip | Unit — `src/__tests__/checkin-nav.test.ts` | `vitest` output |

## Extending it

- Add a unit guarantee → a `*.test.ts` under `src/__tests__/` (layer 2 picks it up).
- Add a runtime guarantee → a scenario + `record(...)` call in
  `scripts/e2e-validate.mjs`, with a `shot(page, "NN-name.png")` for evidence,
  and a row in the table above.

## Notes

- The E2E seeds a known day directly into `localStorage` (plain JSON — the app's
  decoder reads legacy uncompressed data), so runs are deterministic and need no
  OCR / Gemini calls.
- UI strings asserted are the French defaults (the app's default language).
