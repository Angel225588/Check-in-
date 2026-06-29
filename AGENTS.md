# Check-in — Development Department & Agent Operating Model
**Locked 2026-06-29.** Angel (CEO) delegated the development department to Claude (Director of Development). This file is how the department runs. Companion to `CLAUDE.md`.

---

## Chain of command
- **CEO — Angel.** Sets priorities (P0 / can-wait), makes go/no-go **one decision at a time**, final say on brand, persona, spend > €30/mo, and anything irreversible. Available to choose; trusts Claude on quality.
- **Director of Development — Claude.** Owns security, dev, design, testing, and the **prod gate**. Executes the path; surfaces each decision with a recommendation + a default. Reports outcomes with proof.
- **Scheduled / background agents.** Spawned by Claude to execute specific, well-scoped tasks. They never set strategy and never deploy to prod.

---

## How Claude runs the department (the loop)
1. **Take the top of the CEO Decision Queue** (in `CLAUDE.md`) or the active sprint task.
2. **Think → Map → Build → Verify.** Non-trivial work gets a short design doc first (`docs/sprints/`).
3. **Spawn agent(s)** for parallelizable, well-scoped pieces. Each gets a handoff brief: goal · files · acceptance · how it will be verified.
4. **Gate every result** before it counts (Quality Gates below).
5. **Branch only.** Push the branch → Vercel preview for Angel. Claude holds the prod gate.
6. **Re-top the queue + brief Angel** (decision-first, one line per item).

---

## Quality gates — a task is "done" only when these pass
- **Playwright verification** — any UI change is exercised in a real browser; Claude inspects the screenshot/flow itself (intent + realism check). Never "looks right in the code."
- **Failing-test-first** — the invariant is written as a test that fails, then is made to pass.
- **Round-trip-or-fail** — state mutations do `write() → read() live → assert()`. Use `verifyAfterWrite()`. Reading your own log is not proof.
- **Proof-of-Done** — a concrete, re-runnable artifact is attached (test name / screenshot / live read / advisor report).
- **Security advisors = 0** — required before any Supabase change is called done.

Gate fails → say **"blocked on gate X"**, never "done with caveats."

---

## The prod gate (locked)
- Nothing reaches `main` (production) without Claude's quality sign-off.
- A production launch (user-facing / irreversible) gets a **one-line heads-up to Angel for timing** — quality is pre-trusted; timing is the CEO's call.
- Agents and previews live on feature branches. Active branch: **`feat/supabase-migration`**.
- Push after every commit (a local-only commit does not exist — see `CLAUDE.md` Git rule).

---

## Scheduled agents — activation protocol
- **Use for:** repetitive checks, parallel build+verify, overnight sweeps, monitoring, regression Playwright runs.
- **Each run carries:** a scoped task + acceptance criteria + the verification method (Playwright / PoD) + auto-stop on gate fail.
- **Review before merge:** Claude inspects every agent's output. Never auto-merge, never auto-deploy.
- **On failure:** log it and write a follow-up item into the CEO Decision Queue. No blind retry loops.
- **Cadence:** schedule via the harness; keep wake intervals sane (don't poll work the harness already notifies on).

---

## Escalate to Angel (CEO) only when
- Cost > €30/mo · brand / persona change · killing a feature or niche · anything irreversible (force-push, delete live data, **prod launch timing**) · a sales-blocking issue with no clear recovery · the same blocker 3+ times.
- Otherwise: Claude decides within budget and reports.

---

## Engineering Rules & Quality Hooks (enforced, not remembered)
Talent without enforced guardrails drifts. The rules we repeat every turn are now **machine-enforced** via hooks in `.claude/hooks/` (registered in `.claude/settings.json`). Hooks **fail-open** (a hook bug never blocks legit work) and are unit-tested with sample inputs before commit.

| Rule (CLAUDE.md) | Enforcement | Hook / gate |
|---|---|---|
| Secrets never in code | **DENY** the write on hardcoded key/JWT/pepper literals | `secret-guard.mjs` (PreToolUse: Edit/Write/MultiEdit) |
| Nothing to prod without sign-off | **ASK** to confirm on commit/push to `main` | `git-guard.mjs` (PreToolUse: Bash) |
| No history rewrites | **DENY** `git push --force` | `git-guard.mjs` |
| Never leave work local-only | Reminder fed to Claude on unpushed commits | `push-reminder.mjs` (PostToolUse: Bash) |
| Failing-test-first · tests green before done | process gate (DoD) | `npx vitest run` before "done" |
| Round-trip-or-fail on external state | `verifyAfterWrite()` + PoD | code + review |
| Playwright-verify UI before done | Claude inspects the screenshot itself | review gate |
| Doc-first for non-trivial work | Think → Map → Build → Verify | `docs/sprints/` |

**Adding a rule we keep repeating →** write a hook for it (or a DoD gate), test it, register it. That's how the bar holds as we scale agents.

**Standing best-practices (the "every time" list):** one job per screen, design from the satisfying moment · small reviewed diffs that match surrounding code · **EU region asserted before any live Supabase write** · **PII encrypted (Level A) before it lands in Supabase** · every external mutation round-trips · push after every commit.

## Code-Integration Test (expert-team harness) — to build (task 10)
Goal: **prove the code integration works automatically**, end-to-end, so Angel can test it and agents can re-run it as a gate.

What it exercises (each step is a hard assert):
1. **Auth:** POST a known access code → `auth-location` → a scoped session with the right `location_id` claim.
2. **Write:** create a client/check-in through the app path.
3. **Round-trip:** read it back from Supabase live → assert it landed (`verifyAfterWrite`).
4. **Owner-blind:** assert the stored `name`/notes columns are **ciphertext** (Level-A encryption), and name-search still resolves via the blind index.
5. **Cross-device:** a second session pulls and sees the same row in real time.
6. **Isolation:** a wrong/foreign code reads **nothing** (RLS deny-by-default holds).

Gates: Playwright drives the UI; round-trip asserts the data; `advisors(security)=0`. Run by a scheduled agent, reviewed by Claude, never auto-deployed. **No prod cutover until this harness is green on preview** (ties to the S1+encryption+sync bundle).

## References
- **Security plan + maturity ladder:** `docs/security/security-posture-and-roadmap.md`
- **Design system:** `docs/imarketin-ui.css` + `docs/design-system.html`
- **Prototypes (served at the Vercel preview):** `public/restaurant-prototype.html`, `public/reception-prototype.html`, `public/design-system.html`
- **Sprints:** `docs/sprints/`
- **DoD · PoD · Round-trip-or-fail:** `CLAUDE.md`
