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

## 2026-08-07 (evening) — three from the tablet

### The pad was cut off, and the app had never heard of the safe area
Angel's screenshot showed the report's pad running off the bottom. The harness
disagreed — measured on a desktop viewport it fitted exactly, which is the point:
the app declared no `viewport-fit` and had **no safe-area handling anywhere**.
Installed as a PWA, iOS hands back a viewport that includes the home indicator's
band, and every dock in the app was drawing into it.

`viewportFit: "cover"`, a `.pb-safe` utility on the docks, and the report's pad
given a bounded box (`clamp(180px,30vh,290px)`) so key size can never push its
last row off the screen. **R26a measures the last key, not the pad's box** — the
box can sit where it belongs while a taller key inside it hangs below the fold.

### The list you could not open (US-29)
The arrival list lived in a corner of a dashboard, and "who came at 8?" is read
off the list. It expands to the whole screen now, with its search field, its
tiles, and the same `query`/`filter`/`pad` state — two views of one state, so
closing the sheet leaves you exactly where you were.

**The pad went in the sheet's column, not over it.** The first build stacked it
on top with `z-[60]`: a grid of keys with guest names showing through the gaps,
and every row it covered was one you could neither read nor tap. R26b asserts
the list's bottom edge is above the pad's top edge — the R25f lesson, applied
before Angel had to find it.

### Groupes names which coach (US-21)
One on/off for every tour answers a question reception rarely asks: the seven
o'clock coach and the nine o'clock coach are two different mornings. Ticking
TOMEU narrows 13 rooms to 8; unticking gives all 13 back.

Nothing ticked means all of them, so the pill alone behaves exactly as before,
and the checklist does not appear at all when the day has one block — a control
with a single option only ever teaches you it does nothing.

The case that decided the implementation: a stored pick outliving its day.
Yesterday's coach is gone by the time this morning's list is uploaded, and an
empty screen reads as "no groups today", which is a different and wrong fact.
`pickGroups` falls back to every block rather than none.

### Also worth recording
The first verification run came back blank on all three devices — a stale
`next start` from before the rebuild was still holding port 3213, serving JS
chunks the new build had renamed. Blank white screenshots, every selector
missing. That is the same stale-manifest trap CLAUDE.md warns about, from the
other direction: kill the server *before* the build, not after.

---

## 2026-08-07 (later still) — the two habits

### "Descend vers 07:34 · 6 matins" (US-28)
The timestamps were already there; nothing had ever read them as a pattern.
Alongside "D'habitude · Chambre · 6 fois", the guest screen now answers the
other question reception asks about a regular.

Both are MEASURED, the second tier from US-10 — our own history, not a fact and
not a guess — so both carry what they stand on and both refuse to speak below
three occurrences. Two is a coincidence, and a wrong habit puts a sentence in
reception's mouth about someone standing in front of them.

Median over mean, and the middle half over min-to-max: one 10:15 lie-in should
not move a 07:30 habit, and one outlier should not define the window. A guest
with no habit gets "entre 07:20 et 08:50" rather than a minute invented out of
a two-hour spread.

Verified on a real build: six mornings around 07:30 → "Descend vers 07:34 ·
6 matins", every stay stamped "Chambre".

---

## 2026-08-07 (later) — notes in the frame

### The pad is the keyboard (US-17 / US-18 / US-P3)
A note editor needs a keyboard. The app owns the keyboard everywhere, and it is
already on screen six inches below the frame — so the draft lives on the page
and the pad's keys route to it while one is open. Building a second keyboard
inside a 340px box was never going to fit; borrowing the one already there is
what makes the feature possible at all.

Two consequences handled rather than discovered: starting a note switches the
pad to letters, and the alphabet switch stops clearing the search field —
mid-note that would drop the guest and take the frame with them. Verified: the
field still read "310" after typing a note.

One field, not two. Reception is writing "pas de fruits à coque" at 07:40, and
asking which half is the title is asking them to file rather than to write.

### Two buttons in one corner
Moving the compose pencil to the top-right put it exactly on top of the notes
face's own "+". Both visible, one silently winning — the classic "this button
does nothing". `actionHiddenOn` lets a face decline the frame's action.

Found by a verification script, not by looking: the click resolved to the right
element and then timed out because something else was over it.

### The guest page's notes open in place
Tapping a digest note jumped to the Notes tab — a change of screen to read two
more lines of something already in front of you. It expands where it is now.

---

## 2026-08-07 — the date that was always today, and the history that never said how

### generateDayReport stamped `new Date()` inside itself
Every report ever produced said today — including one built from a session
closed three days ago. Stepping back a day changed every figure on the screen
except the date above them, which is exactly the failure US-8's Never names.

The date is a parameter now. Every call site passes the day its data belongs
to — **including the monthly roll-up**, which was stamping thirty stored days
with today's date and had never been looked at closely enough to notice.

### The past stays never said how the guest paid (US-26)
Each row read "1 pers · ch. 718" while the storage knew it was a room charge:
reception's choice at the door is saved on the check-in record and the closed
session keeps both. It had simply never been read back.

Each stay now carries its formule, via `formuleOf` — the report's own function,
so one morning cannot be "inclus" on the guest screen and something else in the
briefing. Null, not "à encaisser", when they never came down: an absence is not
a refusal.

Three occurrences before it is called a habit. Two is a coincidence, and a
wrong "d'habitude" puts a sentence in reception's mouth about a guest standing
in front of them.

### The activity list expands
Search field, and lenses with counts — Tous · VIP · Groupes · Comp · Non inclus.
A lens the day cannot fill is disabled rather than tapped-and-empty. `fold` is
exported from utils rather than copied: two lists folding accents differently
is one guest findable on one screen and not another.

### R24 re-aimed, not relaxed
The pad's wrapper stopped being a card when the keys became cut-and-raised
surfaces. The rule watched the wrapper and failed; it watches the keys now —
one surface became twelve, and it would still catch a pad whose keys vanished
into the page.

**Worth stating plainly:** changing a rule so your own change passes is the
move that should never go unmentioned. It is in the commit message and here.

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
