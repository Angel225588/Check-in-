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

## References
- **Security plan + maturity ladder:** `docs/security/security-posture-and-roadmap.md`
- **Design system:** `docs/imarketin-ui.css` + `docs/design-system.html`
- **Prototypes (served at the Vercel preview):** `public/restaurant-prototype.html`, `public/reception-prototype.html`, `public/design-system.html`
- **Sprints:** `docs/sprints/`
- **DoD · PoD · Round-trip-or-fail:** `CLAUDE.md`
