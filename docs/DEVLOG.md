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

## 2026-08-07 (night) — the tick that lost to the filter

### Recency was the wrong rule (US-32, round two)
"If I click one, it should take the place of the last one on the ranking."

Round one made a full bar swap at all — the new pick took the last slot. From
the desk that is still arbitrary: *last ticked* is not a fact about the morning.
The one that should go is the one saying least, and the app already computes
that score — it is what decides which extras earn a slot when nobody has chosen
at all. A coach of 40 outranks 3 comps whatever order they were ticked in.

`weakestMetric` is that score, read backwards. Core is never a candidate.

### The bug under the complaint
There was a second reason a tick could look dead. When a filter is live, its
pill is forced onto the bar so nobody stares at four rows wondering why — and
it was forcing itself into the same slot the new pick had just taken. Tick Comp
with Groupes filtering: Comp went into the list, Groupes overwrote it on the
bar, and the checklist showed a tick for something that never appeared.

The live filter is now **pinned** — passed to `toggleMetric` as `keep`, so the
new pick displaces the weakest thing that is not the filter. And when the filter
does have to force its way on, it displaces the weakest pill rather than
whatever happens to be last.

## 2026-08-07 (night) — the coach that leaves before the restaurant opens

### Paniers (US-34)
Angel's story: a group leaving early takes breakfast boxes, and reception wants
"this list view and quickly check per room number in line".

Every choice is downstream of forty rooms, three minutes, and a driver waiting.
One line per room in ROOM ORDER — it is read against the coach's paper manifest,
and arrival order would reshuffle the list under the finger with every tick. One
tap serves the whole room, because a bag per person is the case and the
exception belongs on the guest's own screen. A counter, because how far through
the run you are is the only number this screen owes anyone.

**A box is breakfast.** It counts as served, or the morning is short by a coach
and the kitchen's numbers stop meaning anything. **A box is not a payment** —
`viaBox` sits beside `paymentAction`, never instead of it: a group on a room
charge that takes bags is still a room charge.

Someone who already ate in the restaurant shows as served here too. They had
breakfast, and marking them as still owed a bag sends reception chasing a guest
who is sitting down eating.

Undo removes only what the run recorded. Undoing a restaurant arrival from this
list would delete a fact entered on another screen.

The report row carries a PANIER chip: forty bags and forty covers are the same
count and not the same morning.

**A fixture that lied, caught by its own test.** The first version of
`box-list.test.ts` used `clientName: "X"` and six cases failed — check-ins match
on room AND name, because two names in one room are two entries. The lib was
right; the fixture could not reproduce the product.

## 2026-08-07 (night) — every screen, not the two I could see

### "In none of these screens are we using the margin"
Correct, and the criticism lands on the fix as much as the bug: I patched the
screens in the photographs. R28 named two routes — which is a rule that watches
the two places the bug had already been caught.

`.pt-safe` now on every screen — search, report and its full-screen sheet,
guest, reports, clients, upload, dashboard, debug, morning-brief, the reception
brief — including the loading shells, which are the first thing anyone sees.
And on every full-height overlay, because an overlay is drawn on top of a screen
that is already correct and gets no help from it: the drawer, the activity
sheet, the history panel, the scanner, the upload session panels.

**R30 walks the app.** Eight routes and two overlays, with the insets faked to
an iPad's 44px, failing on anything that carries words or takes a tap and starts
above the line. Decoration and backdrops may still span the screen — that is
what full-bleed means, and a rule that forbade it would be a rule about the
wrong thing.

Ten for ten on a real build before the gate ran.

## 2026-08-07 (late, second round) — a tick that did nothing

### The checklist could not swap (US-32)
Four slots, all taken, tick Comp — nothing moved. `toggleMetric` appended to
the stored list and `chooseMetrics` sliced to the slots, so the fifth tick
landed in fifth place. From the desk: a checkbox that does not work, with
nothing to tell you something has to come off first.

The new one takes the **last** slot. Not the oldest — the last, so the three
that answer "where are we" stay put and the slot you are choosing is always the
same one. Angel's own case: `[total, entered, remaining, expected]` + Comp
becomes `[total, entered, remaining, comp]`, which is exactly the bar they were
trying to build by hand.

### "Comp normally has the 2/20" (US-33)
It does — in landscape, since the beginning. The portrait bar lost it in the
port and shipped a bare "15".

The half it dropped is the half that changes what happens next: fifteen comps
with two down is a morning with thirteen conversations still in it. Comp, VIP,
Groupes, Enfants and Non inclus all answer the same question, so they all
answer it the same way now, on the bar and in the checklist.

Capped at the expected count. Three people on a room booked for two is an
écart — the report names it and reception settles it — but a pill reading 5/4
just looks broken, and the bar is not where that conversation belongs.

### The report picks its coach too (US-21, the half that was owed)
Same picker, same `pickGroups`, under the tiles in the panel and in the
full-screen sheet. Two sets on purpose: the **tile** counts every group room in
the house — it is the door into the filter, and a door that renames itself once
you walk through it is not a door — while the **list** narrows to what is
ticked.

---

## 2026-08-07 (late) — the other end of the same bargain

### The burger went under the clock (US-30, second half)
`viewport-fit: cover` hands the app the whole screen. That is what we wanted
for the dock — but it is a bargain, and we took only one side of it. iOS is
still drawing a status bar in the top strip and an indicator in the bottom one,
and the app now owns both. Angel's screenshot: the burger and the metrics bar
sitting under the clock and the battery.

**My regression, from this session.** `pb-safe` was the fix for the bottom; the
top never got one. `.pt-safe` now, on the portrait shell, the activity sheet,
the report header and its full-screen sheet, the guest screen, the landscape
search header, /reports and /clients.

**The insets go through a variable so the harness can fake them.** A desktop
browser reports 0 on every edge, so a rule written against `env()` alone passes
on the one machine where the bug cannot happen — it would have watched this
ship. `--safe-top: 44px` makes any machine an iPad. R28 sets it and asserts the
first control is below it; measured 54px after the fix, 10px before.

### The band of dead screen (R29)
The resting frame was pinned at 28vh, which on an iPad stood up left ~180px of
nothing between the card and the commit button — and 500px when the resting
preview is switched off. The frame takes the slot it is given now and stops at
520px, which is where a card starts reading as a wall again.

Same size resting and resolved, so the eye still learns one place. Verified on
Angel's own numbers — 186 rooms, 157 entered: five recents visible before, eight
now, and no gap.

The empty screen with **Aperçu au repos** off is the switch doing what it says.
Worth stating rather than fixing: reproduced both ways, `carousel=1` on and
`carousel=0` off.

---

## 2026-08-07 (night) — the gate, 100/100

**Branch** `claude/checkin-app-registration-bug-3lpy9c` · 511 tests across 41
files · **100 design rules, all passing**

New this round: R26a (the report's pad and its LAST KEY inside the viewport, at
four sizes), R26b (the arrival list expands with its search, and the pad is in
the sheet's column rather than over it), R26c (Groupes narrows to the coach you
tick and unticking means all of them again), R27 (contrast in the guest's
activity panel, both themes).

### R25h assumed a card with one face
The first run went 83/83 and then crashed — a 30-second timeout waiting for
`preview-open` on a card that was rendering it correctly. R25h swipes across the
card and then taps it, which works only while the card has one face. The moment
it gained Notes (US-17), the swipe did exactly its job and landed on a face with
nothing to open.

Verified on a real build before touching the rule: `slot=card,
guest-preview=1, preview-open=1, pane=apercu, field="310"`. The element was
there; the rule was looking for it at the wrong moment. It returns to the first
face between the two halves now.

**Said plainly, because changing a rule so a run goes green is the move that
should never be quiet:** the assumption expired, not the assertion. A swipe must
not navigate, a tap must, and both are still asserted.

### One honest limit
R27 sweeps 13 text nodes — the panel as it stands with no notes written. It
covers the chips, which is where the bug was, but a panel full of notes has
rows, dates and tone badges it does not yet see.

---

## 2026-08-07 (night) — black ink on a black panel

### "Tout" was selected and invisible (US-31)
Angel photographed the guest screen's notes filters in dark mode: Alerte and
Préférence legible, **Tout** a hole in the panel. The chip was doing its job —
it just could not say so.

The cause is worth naming because it is not a colour mistake. Every other chip
takes its colour from a *tone*, and tones come from `--aur-*` tokens that flip
with the theme. "Tout" has no tone, so at some point it had been handed
`#1C1C1C` with a ring of `rgba(0,0,0,.25)` — black ink and a black ring on a
near-black panel. **A literal is a colour that has only ever been checked
against one background.**

Fixed by giving "Tout" a tone's treatment rather than a special case: the gold
that already means "this is the live one" everywhere else. The chip style now
lives in `note-tone.ts` because it is drawn in three components, and
`tone-chip.test.ts` refuses any literal in it — hex or pure-black rgba.

Second half of the same bug, found by the test rather than the eye: the **Info**
tone's ink was `--tab-idle`, the colour of a chip nobody has chosen. A chosen
Info chip looked exactly like an unchosen one.

### The rule that should have existed
R18 sweeps `/search` and `/report` for WCAG contrast on real renders, in both
themes. **The guest screen's side panel was never swept** — that is the gap this
shipped through. R27 opens the guest, opens the Notes tab, and sweeps every text
node in the panel, light and dark.

Three contrast regressions on this project have now been dark-on-dark text. The
pattern is always the same: a colour written as a literal at the one moment
somebody was looking at one theme.

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
