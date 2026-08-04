# Check-in PWA

## Overview
Hotel breakfast check-in for the Courtyard by Marriott reception desk. Upload the
morning's arrivals list (Gemini Vision OCR), find a room or a name, record who
walked in, close the day, read the report.

The user is standing, one-handed, with a queue in front of them between 06:30 and
10:30. Every decision in this codebase is downstream of that.

## Tech Stack
- Next.js 16 App Router, TypeScript, Tailwind CSS v4
- Gemini 2.5 Flash Vision API for OCR, Tesseract.js as fallback
- localStorage for persistence (compressed, 30-day ring buffer)
- Notes encrypted at rest: AES-GCM, non-extractable key in IndexedDB
- Vitest + jsdom for logic; Playwright for design rules and end-to-end

## TDD Workflow (MANDATORY)
1. **Write tests FIRST** before implementing any feature or fix
2. Tests live in `src/__tests__/` with pattern `*.test.ts`
3. Run tests: `npx vitest run` — single file: `npx vitest run src/__tests__/x.test.ts`
4. All tests must pass before committing — **465 tests across 34 files**
5. Layout and behaviour that a unit test cannot see belong in the design rules,
   not in a screenshot: `node scripts/design-rules.mjs` (52 rules, real browser)
6. Full gate: `bash scripts/validate.sh` — tsc, vitest, build, end-to-end

**A test fixture that cannot reproduce the product is a fixture that lies about
it.** Three features once looked broken on the tablet because the demo seeder
wrote empty dates and handed out group codes at random. `mock-seeder.test.ts`
now asserts the demo day can exercise everything the app can show.

## Two shells, one state
`/search` renders one of two trees, chosen by `usePortrait()`:

- **Landscape** — two columns. The eye reads left, the hand rests right.
  `handSide` flips them for a left-hander.
- **Portrait** — one column, one thumb. `src/components/portrait/`. The pad is
  fixed at the bottom; the guest card and the results list take turns in the one
  body slot above it (`portraitSlot` in `src/lib/portrait.ts`).

Portrait is `(max-width: 1023px) and (orientation: portrait)` — narrow AND taller
than wide. Not width alone: a landscape iPad zoomed to 150% reports 796px and is
still a landscape iPad.

## Key Paths
- API routes: `src/app/api/ocr*/route.ts`
- Pages: `upload/`, `search/`, `checkin/[roomNumber]/`, `report/`, `reports/`,
  `dashboard/`, `clients/`, `morning-brief/`, `debug/`
- Components: `src/components/` — `report/` and `portrait/` are the two subsets
- Logic: `src/lib/` — storage, parser, vip, report-v2, groups, expected,
  notes-crypto, portrait, tile-rank, back-nav
- Tests: `src/__tests__/` · Harness: `scripts/`
- **Why anything exists: `docs/USER-STORIES.md`** — every story names the test or
  design rule that holds it. A story with no proof is a wish.

## Brand & Design
- Primary gold `#A66914`, light gold `#DD9C28`; tokens in `globals.css` `@theme`
- Font: MuseoSans > Nunito > Arial
- Card radius 14px, pill buttons 52px, spacing on a 4pt scale
- Surface tiers, so three stacked boxes do not read as one: `surface-chrome`
  (furniture) · `surface-field` (the live input) · `surface-card` (data)
- WCAG AA is measured on real renders, gradients composited — not eyeballed

**Glass is expensive.** `backdrop-filter` over a flat background is invisible and
still pays full compositing cost; 170 blurred elements is what made the iPad
unusable. The portrait drawer is the one place it is earned — one element, with a
real screen behind it.

## Conventions
- `"use client"` on all interactive components
- Gemini uses `thinkingBudget: 0` for speed; multi-photo via `Promise.allSettled`
- Pads fire on `pointerdown`, not click — iOS delays click by ~300ms
- The app owns the keyboard everywhere: `inputMode="none"` plus `AlphaKeypad` /
  `NumericKeypad`. The iOS keyboard covers half the screen and cannot be dismissed
  reliably. Search folds diacritics, so no accent keys are needed.
- Swipe is a shortcut, never the only path — every carousel face is also on a dot,
  and the gesture can be turned off (`swipeEnabled`)
- **The room number never appears in a URL or a network request.** Navigation
  carries it in sessionStorage (`checkin-nav.ts`, `back-nav.ts`)
- **No money on the service report.** That belongs to the dashboard, and so does
  anything cumulative over a week or a month — one day, one report
- Shared rooms (same room, different names) stay separate entries
- VIP matching uses a room+name composite key
