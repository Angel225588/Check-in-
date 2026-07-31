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

## 2026-07-31 · Commit where the hand is; the scale becomes a rule

**Branch** `claude/checkin-app-registration-bug-3lpy9c`
**Verify** `npx vitest run` · `NEW_ONLY=1 node scripts/design-rules.mjs` · `npm run build`
**Result** 397 unit tests · 25/25 design rules · build clean

### Why

Two reports from the iPad. The green commit button under the keypad is a long
reach on a large screen — the bottom edge is the furthest point from both the
number just read and the keys just pressed. And the four service buttons sat
well above the preview card with a band of dead air between them.

Underneath both: the spacing tokens existed in `globals.css` and nothing
enforced them. A token nothing checks is a suggestion, and a suggestion loses
whenever someone is in a hurry.

### What changed

**The − N + row moved above the keypad**, directly under the preview card, so
it sits beside what is being confirmed and a short move from the pad. Position
is identical in every state.

**The nav row fills its line.** It shares that line with the taller metrics
bar; at content height it top-aligned inside a stretched box and left the gap.

**R20 enforces the scale on the rendered page** — 4pt above 8px, with 2 and 6
allowed below for optical alignment inside a component. It found nine
off-scale values on the report alone and every 10px/14px padding in the app.
All snapped; stray radii (10, 11, 13, 26, 44) snapped to the scale too.

**Test tools reach the installed app.** With no address bar `/debug` is
unreachable, so a quiet overflow button on the upload screen opens demo
seeding, the debugger and a wipe — both destructive actions confirm first.

**Récents scrolls** and carries the whole service instead of the last four. A
mostly-vertical drag now belongs to the list rather than the carousel.

`public/mockups/cta-options.html` compares the three commit-button placements
at real width, for judging on the device rather than in the abstract.

---

## 2026-07-27 · Landscape check-in redesign + design-rule gate

**Branch** `claude/checkin-landscape-redesign`
**ClickUp** [Refonte check-in paysage + garde-fous design](https://app.clickup.com/t/wdy2xgx36e) · Live · Marriott
**Verify** `npm run design-rules` · `npx vitest run` · `npm run build`
**Result** 22/22 design rules · 243 unit tests · tsc + build clean

### Why

On a landscape iPad the green **Enregistrer** button fell below the fold —
reception could not check a guest in without scrolling. Same failure class as
the original incident (a check-in that looks possible but isn't).

### What changed

**Layout.** The main column is now a scrollable region plus a *pinned* action
box, so the CTA is reachable at any zoom or screen height. The activity
sidebar docks on tablet, becomes a drawer on phone, can be hidden manually,
and auto-collapses when the guest has no history — an empty 300px column was
stealing width for nothing. The dead space on a breakfast-included guest now
carries a calm green "rien à encaisser" confirmation.

**Visual craft.** A design review found the screen was assembling other
vendors' visual language instead of using tokens this repo already ships:
emoji as product iconography (the `☕✕` was two glyphs glued together, broken
at 40px), Tailwind's stock green fighting a warm cream palette, pure black as
the active payment state, blue-black dark mode under a gold brand. All
replaced with Phosphor icons and the existing `--aur-*` tokens. Details and
reasoning in `docs/DESIGN-SYSTEM.md`.

**Accessibility.** Tap targets raised to 44×44 minimum; WCAG AA verified on
the real render in both colour schemes.

### How it is verified

`scripts/design-rules.mjs` asserts nine invariants (R1–R9) against the
**rendered** app — contrast, reachability and tap size cannot be checked from
source. Each rule exists because of a specific bug; the mapping is in
`docs/DESIGN-SYSTEM.md`.

Two things the contrast check does that a naive one does not: it resolves
**gradients** (asserting the worst colour stop, since a gradient must stay
legible across its span) and **translucent stacks** (compositing the whole
ancestor chain to solid RGB).

### What measurement caught that review did not

| Element | Measured | Cause |
|---|---|---|
| Selected tab, dark mode | invisible | `.dark .text-dark{…!important}` in `globals.css` beat the `dark:` variant → white on white |
| Idle tabs, light mode | 4.24:1 | one point under AA — not visible as "wrong" |
| VIP gold card (number + name) | 2.37:1 | the `#DD9C28` gradient stop; fixed by deepening to bronze, which also reads richer |
| Active payment label | 4.37:1 | gold on gold — the only place gold text sits on a gold-tinted ground |

The first was reported by the user from a screenshot; the other three were
invisible to the eye and only surfaced by measuring the real render.

### Harness faults fixed rather than worked around

Three runs "failed" for reasons that had nothing to do with the design: a
stale chunk manifest (rebuilding `.next` under a running server), the browser
exhausting shared memory mid-suite, and a server started through a pipe into
`head` — which answers SSR requests but serves no static assets, so every
element measured at its unstyled size (a 1128×64 CTA reporting as 81×21).

Each is now detected and named. A gate that reports infrastructure noise as a
design regression trains you to ignore it, which is worse than having none.

### Open

- Evaluate on a real iPad via the Vercel preview before merging to `main`.
- **Recommended:** 30 minutes observing a receptionist during the 7am rush.
  Scripted testers found real defects; they cannot tell you what someone
  actually does with three guests waiting and a tablet in one hand.

---

## 2026-07-27 · Notes — built

**Branch** `claude/checkin-landscape-redesign`
**ClickUp** [Notes client](https://app.clickup.com/t/wdy2xgx36g) · [safety issue](https://app.clickup.com/t/wdy2xgx36f)
**Verify** `npx vitest run` (315) · `npm run design-rules` (R10–R13) · `tsc` · build
**Docs** `docs/NOTES.md`

### The safety defect, closed

The sidebar tab row was gated on `!isFirstVisit`. A guest with no prior stay
had **no route to their own notes at all** — an allergy recorded at booking was
unreachable from the one screen that decides whether they eat.

The tab row now renders for every guest. Alert notes carry a red dot on both
the tab and the activity trigger, and pinned notes surface as chips on the
check-in card itself, so an allergy is readable without opening anything. R10a
and R10b assert both, driving the real UI.

### Encryption

AES-GCM 256 under a `CryptoKey` created with `extractable: false` and held in
IndexedDB. The raw key bytes never exist as JS values, so they cannot be read
out, logged, or copied to another device — even by code running in the page.
`exportKey` on it rejects, and a test asserts that.

Two separate leaks are closed: the *value* is encrypted, and the *key* is a
salted SHA-256 digest — `notes_524_POLANCO` would hand over the guest list no
matter how well the value were encrypted. Payloads gzip before encryption when
compression actually wins.

Every failure path returns `null` and stays silent. A `console.error` carrying
a note body would undo the encryption by writing plaintext somewhere far easier
to read; a test drives the whole CRUD cycle with every console method spied on.

`docs/NOTES.md` states the threat model plainly, including what this
deliberately does **not** defend against (code in the page calling `decrypt`
itself — no browser-side scheme can, and pretending otherwise is theatre).

### Usability findings from the earlier scripted test, now fixed

Delete moved out of the thumb zone into the header, and asks first (R12a/b).
Tone colours the whole row rather than a 12px dot, after testers read an Alert
and a Preference as the same card. Pinned chips capped at three with the
remainder counted; because alerts sort first, the cap can never hide one (R11).

### Handedness

Reported from a screenshot: the activity trigger sat top-**right** while the
panel slid in from the **left**. Panel, trigger and docked column now follow a
persisted `handSide` setting with a toggle in the top row (R13).

One implementation note worth keeping: the mirroring uses `flex-row-reverse`,
so `ml-auto` cannot be used for spacing in those rows — auto margins resolve
against the main axis and silently flip meaning. Use an explicit spacer.

---

## 2026-07-27 · Notes — designed, not built (superseded by the entry above)

**ClickUp** [Notes client — flux validé](https://app.clickup.com/t/wdy2xgx36g) · Sale · Roadmap
**Safety issue** [1ʳᵉ visite = aucun accès aux notes](https://app.clickup.com/t/wdy2xgx36f) · Security · Backlog

Flow is settled and mocked (`mockups/notes-flow.html`, `notes-detail.html`,
`chip-ab.html`): list → filter → add → read → edit → delete, with a centred
composer over a blurred backdrop, pinned notes surfacing as scrollable cards
on the check-in screen, and note detail opening in the sidebar (with ⤢ to
expand) so check-in stays usable while reading.

Not built. It needs encrypted-at-rest storage, the opaque-token approach for
anything identifying, and a security pass first.

**One finding blocks the build regardless of design:** the notes tab only
renders when a guest has history, so a first-time guest has *no path to their
notes at all*. For a guest with a severe allergy, the note is unreachable.
That is a safety defect, not a polish item.





## [2026-07-21] Market-validation framework built + run · ClickUp: Sale·Roadmap
Situation: is this a business, for whom, and at what price? Founder had no pricing
hypothesis and wanted the segment (Marriott-level vs independents) decided by research.
Response: built the reusable 5-lens agent round-table (demand · competitors · pricing ·
market-size · go-to-market) and ran it. Verdict **GO (4/5)**: beachhead = **independent
Paris hotels**, launch-test **€49/mo**, category near-empty (rival = paper+highlighter),
France TAM ~€13M ARR (plan multi-country), moat = distribution/workflow not tech. #1 move:
Courtyard before/after + testimonial video → founder walk-ins around that Courtyard.
Verified: full cited brief in `docs/MARKET-VALIDATION.md`; ClickUp pricing/GTM/framework
tasks updated.
Status: Shipped (research); GTM execution now tracked in Sale·Roadmap.

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