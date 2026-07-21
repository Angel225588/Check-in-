# Devlog & delivery framework

One place that ties **what we did → why → proof it works → the ClickUp task**.
This is also the raw material for the **demo** (each entry is a "situation → how
we responded → verified outcome").

## The three layers (how they mirror)

```
ClickUp task  ⇄  DEVLOG entry (this file)  ⇄  npm run validate (proof)
   (plan)          (record + narrative)         (definition of done)
```

**The rule:** a ClickUp task is **Done** only when
1. there's a DEVLOG entry below, and
2. `npm run validate` is green (tsc → unit tests → build → browser E2E + screenshots — see `VALIDATION.md`).

No green validate + no devlog entry ⇒ not done. That's the whole contract.

### ClickUp structure (mirror)
- **Live · Marriott** — current production (the deployed hotel).
- **Sale version · Roadmap** — what must be true before we sell it.
- **Security · Backlog** — findings from the audit.

Each task carries: acceptance criteria, a `Verification` status (Verified /
In-progress / Blocked / Needs-repro), and a link to its DEVLOG entry + commit/PR.

### Entry template
```
## [YYYY-MM-DD] <title>  ·  ClickUp #<id>  ·  <commit/PR>
Situation:  what happened / what we wanted
Response:   what we changed and the decision behind it
Verified:   validate result (pass/fail) + evidence (screenshot / test / deploy)
Status:     Shipped / In-progress / Needs-repro
```

---

# Log

## [2026-07-20] Reconciled fixes shipped to production · PR #3 · de9317b
Situation: the reported incident — check-in showed a green ✓ but the count never
moved ("stuck at 11"); separately, `main` had moved 10 commits ahead of the fix
branch with its own quota + privacy + revenue work.
Response: reconciled everything onto `main` in one build — kept main's quota
approach (cap raw @30k, `reclaimStorageSpace()`, "Free up space" button) and
added what main lacked: **honest saves** (`addCheckIn` returns the real result;
red "NON enregistré" instead of a fake ✓), **crash-safety** shape guards, **room
number out of the URL** (access-log privacy), and **OCR routes no longer logging
the guest list**. Deferred LZ compression (rung 1) to the sale version.
Verified: tsc clean · 243/243 unit tests · `next build` clean · Vercel deployment
READY, aliased to check-in-pdj.vercel.app (production auto-deploy from `main`).
Status: Shipped.

## [2026-07-21] Start-session bounces back to upload (Marriott) · ClickUp #TBD
Situation: after clearing browser cache, upload + OCR works, but clicking "Start
session" returns to the upload page — the saved session isn't read back.
Response: diagnosis in progress. NOT quota — storage was just cleared, and raw
OCR text is already capped at 30k, so dropping it (~30KB) wouldn't fix it. Likely
a code/state cause (session saved with 0 rooms, or a Safari-private-mode write
failure). Decision: do not blind-fix; reproduce with the Safari console error
first. Candidate hardening regardless: `handleConfirm` should verify the session
persisted before navigating and show a clear error instead of a silent bounce.
Verified: —
Status: **Needs-repro** (send the Safari console error/screenshot next bounce).

---

# Sale-version roadmap (tracked in ClickUp · "Sale version · Roadmap")

- **Multi-tenant + real persistence (Supabase)** — the branch already scaffolds it
  (`feat/supabase-migration`); needed so data survives device loss and multiple
  tablets share one live count. Gate: RLS on every table before any guest data.
- **Storage rung 1+2 (compression + IndexedDB)** — large headroom for the small
  iPad Safari quota; ships with the storage-test migration it needs.
- **Lock down `/api/*`** — the OCR routes are effectively open; anyone with the URL
  can run up the Gemini bill. Vercel Access / WAF in front of `/api/*`. **#1
  pre-sale item.**
- **Rate-limit + body-size hardening**, **PDF magic-byte checks** — from the audit.
- **Gemini DPA / no-retention tier** — guest photos go to Google; contract + a line
  in the privacy notice.

# Demo (Anthropic-style "how it responds to situations")
Curate the strongest DEVLOG entries into a short narrative: each is a real
*situation* (incident, security finding, feature) → *how the agent diagnosed and
decided* → *verified outcome* (the `validate` screenshots are the money shots).
The 2026-07-20 entry (incident → diagnosis → reconcile → validate → live) is the
flagship clip.
