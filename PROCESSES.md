# Project Processes — Check-in PWA

**Mission**: ship a hotel-grade product. Zero data leak. Zero broken mornings. Every feature traceable.

---

## 1. Definition of Done (DoD)

A feature is **NOT DONE** until all 4 gates pass. Saying "done with caveats" is failure.

| Gate | Check | Tool |
|------|-------|------|
| **G1 — TDD** | A failing test was written FIRST. It now passes. | `npx vitest run <file>` |
| **G2 — Type safety** | Zero new TypeScript errors. | `npx tsc --noEmit` |
| **G3 — Build** | `npm run build` succeeds, all routes register. | `npm run build` |
| **G4 — Live verify** | Feature exercised on the running dev server (or in browser). | `npm run dev` |

If any gate fails → **block the merge**. Do NOT push to `main`.

---

## 2. Pre-commit checklist (every commit, no exception)

- [ ] All tests passing (`npx vitest run`)
- [ ] No `--no-verify` shortcut
- [ ] No hardcoded API keys, secrets, or PII in code or test fixtures
- [ ] No `console.log` of guest names, room numbers, or payment data
- [ ] Diff reviewed — no unrelated changes
- [ ] Commit message describes the WHY, not the WHAT

---

## 3. OCR Safety Gates

### When sending data to external AI (Gemini)

- [ ] Image/PDF transmitted only over HTTPS
- [ ] Prompt instructs the model **not to retain** if option exists
- [ ] No additional client metadata appended to the prompt
- [ ] Response logged with **PII redaction** (names, room numbers stripped before `console.error`)
- [ ] Errors expose generic messages to the user, never raw API responses

### Local mode (Tesseract / fallback)

- [ ] Available as a Settings toggle ("Mode Local OCR")
- [ ] Default in V2 / signed contract, optional in pilot
- [ ] Worker pre-warmed at page load to avoid first-call latency
- [ ] Triggered automatically after 2 consecutive Gemini failures (rate limit, network, server)

---

## 4. Deploy gate (push to `main`)

`main` is watched by Vercel for production. Every push deploys.

Before pushing to `main`:
- [ ] All gates 1-4 of DoD passed
- [ ] No `.env*` file staged
- [ ] No `node_modules`, `.next`, or build artifact staged
- [ ] Commit message has a clear summary
- [ ] Co-authored-by trailer present
- [ ] If breaking change, mention in commit body

After pushing to `main`:
- [ ] Watch Vercel deployment status
- [ ] Smoke test on production URL within 5 minutes
- [ ] Rollback if error rate spikes

---

## 5. Data privacy gates

- [ ] No guest data in git history (search `git log -p` for sample names if doubt)
- [ ] `.env.local` always in `.gitignore`
- [ ] localStorage data never logged to remote (Vercel logs, Sentry, etc.)
- [ ] All client PII (names, payment data) stays on-device unless explicitly opted-in
- [ ] V2 Migration plan documented (Supabase RLS, OAuth, audit log) — see `OCR-AUDIT.md`

---

## 6. Bug-handling protocol

Every bug logged in this format (in commit message OR a `BUGS.md`):

```
SYMPTOM: what the user saw
ROOT CAUSE: what actually broke
GUARD: the test/check/gate that now prevents recurrence
```

No bug closes until a guard exists. No exceptions.

---

## 7. Daily smoke test (every morning at 8h00 UTC)

Before the team uses the app:

1. Open production URL → must load in <3s
2. `/upload` → photo capture button responds
3. `/search` → typing returns results
4. `/checkin/[any-room]` → check-in persists
5. `/report` → renders without console error
6. `/dashboard` → tab "7 Jours" renders trend with capped %

If any step fails → **incident** → fix or rollback within 30 min.

---

## 8. Animation budget

Per UX brief:
- **Maximum 200ms** for any UI transition (button, modal, card)
- **Maximum 700ms** for chart bar growth
- **Maximum 300ms** for page transitions
- **Zero** delays on critical actions (check-in button, search response)

If an animation feels slow, it IS slow. Cut it.

---

## 9. Communication contract

- Commits are public log. Write commit messages assuming someone non-technical reads them.
- Every PR has a 1-line "what changes for the user".
- Every breaking change has a rollback note.

---

## 10. CEO mode — autonomy with accountability

When the user delegates ("you're the CEO"):
- Ship what's promised, no scope creep
- Document every architectural decision
- Push back on requests that violate processes (security, scope, quality)
- Daily checkpoint: "what shipped, what blocked, what's next"
- Never "ship and run" — verify post-deploy

---

*Last updated 2026-05-09. Owner: Claude (with Angel Polanco's authorization).*
