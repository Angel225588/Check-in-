# Devlog

What changed, why, and what proved it. Newest first.

This mirrors the ClickUp list **📖 User stories — Check-in**
(`Imarketin › Check-in`). ClickUp holds the story and its state; this holds the
work and the evidence. When they disagree, the repo is right and ClickUp is
stale — say so rather than quietly fixing one.

**The rule for an entry:** what was wrong, what changed, and the number or the
rule that shows it. An entry with no evidence is a changelog line, and we have
git for those.

---

## 2026-08-06 — the pad, the bar, and a switch nobody could reach

**Branch** `claude/checkin-app-registration-bug-3lpy9c` · 481 tests · 90 design
rules

### The pad was shy
Digits were 20px on a 42px key with a 6px gutter — a pad you have to aim at,
during the part of the morning where nobody has attention to spare. Now
24–42px on keys that start at 38 and grow with the box, gutters doubled.

Separation does more for accuracy than key size alone, which is why the gutters
moved too. The key surface is cut-and-raised (`surface-raised`) and inverts
under the finger, so it answers before React does.

**The trap avoided:** keys with their own tall `min-height` inside a shorter box
is how a pad overflows onto the button above it — the exact bug R25f caught two
days ago. The box governs; the key keeps only a floor that can never exceed it.

### Depth, from the neumorphic reference
Angel sent a neumorphism sheet. We took the **technique**, not the palette:
that one is cool grey-blue, ours is warm cream and gold. Two shadows, not the
reference's four — at our radius four reads as a halo rather than depth.

`--inset-hi` / `--inset-lo`, `.surface-inset`, `.surface-raised`. Unlike glass
this is free: `box-shadow` paints, it does not composite live pixels. That
distinction is why 170 blurred elements killed the iPad and 30 shadowed ones
will not.

### The funnel became a checklist (US-19)
It was a second way to filter — two controls doing one job, and the sheet's
list was the leftovers. It is now **what is on the bar**. Filtering stays on the
pill, where reading a number and acting on it are one gesture.

Two invariants, in `metric-choice.test.ts` (10 cases): the bar is never empty,
and a chosen metric the day has none of never takes a slot — it is listed
greyed with a dash, so "why is Groupes missing" answers itself.

### The VIP points swap was never removed (US-24)
Reported as missing. It was not: verified present and **on-screen without
scrolling** in both orientations, at y=346, gated on `needsPay && isVip`.

The real defect was that nothing led to it. A VIP on a points rate is one room
in two hundred and the only route was knowing the number. Added a **Non inclus**
metric: the rooms whose answer to "petit-déjeuner ?" is not yes.

*A switch nobody can find is a switch nobody built.*

### Also
- **Aperçu au repos** switch (US-25). It governs the resting frame only — never
  the resolved guest card, because that card carries the allergy and US-2 exists
  so it cannot be skipped. A preference must not be able to hide it.
- Build sha at the foot of the drawer. "It does not work on my tablet" and "it
  works on mine" are the same sentence about two different builds, and we lost a
  round to exactly that.

---

## 2026-08-05 — the tablet round

### The pad was not slow, the day was
`scripts/pad-latency.mjs` seeds the real house — 210 rooms, 30 days behind it —
and times key-down to digit-on-screen.

| | before | after |
|---|---|---|
| first digit | 106 ms (worst 174) | **62 ms** |
| later digits | ~55 ms | ~52 ms |

Three things were redone per keystroke: `hitStays` re-parsed 30 days of JSON out
of localStorage (not memoised at all), the first digit drew ~110 result cards,
and the metrics bar rebuilt every tour block from scratch.

**Measured on a desktop.** The iPad is several times slower, which is why Angel
felt it and the harness did not.

### A swipe is not a tap
The moment the faces and rows became targets, every swipe across one opened
whatever it ended on — the browser fires `click` after a touch however far the
finger travelled. `useTapGuard` ignores a click that moved more than 10px.

That bug was one commit old and mine. It would have been worse than the thing
it was fixing. **R25h** holds both halves.

### R25a was green while the screen was broken
At 320×568 the guest card overflowed its slot by 36px and painted over the
commit button. R25a measured the dock's own box — which proves the dock is where
it belongs and nothing about what is drawn on top of it.

**A rule that can be satisfied by a broken screen is not a rule.** R25f now
asserts the card's bottom edge is above the dock's top edge.

---

## 2026-08-04 — portrait, and Option B

Both options built in HTML at 320px before a line of code. Option A kept the
results list under the field and shrank the card: the room number fell to 34px
and there was no line left for an allergy chip. **Option B** gives the whole
slot to whichever is in use, and they are never both in use.

The rule lives in `portraitSlot`, not in the component, so it can be argued with
in a test rather than in a screenshot.

Then the tablet showed what 320px could not: on an iPad stood up the frame was a
900px square. Card-sized and always under the search field now — the eye learns
where to look once.

### Deleted
`/report/details` (895 lines, replaced by `/report`), `RushHourChart`,
`SearchInput`, `ui/input`, `QuickAddGuest`, `NoteComposer`. All zero-importer.

`RushHourChart` turned out to be wanted after all — as a rush-hour glance on the
clock face. It was rebuilt on `buildAffluence`, the report's own arithmetic, so
the peak at the desk and the peak in the 15:00 briefing cannot disagree. Better
outcome than keeping the duplicate, but worth recording that the deletion was
not free.
