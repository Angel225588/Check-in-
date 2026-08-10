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

## 2026-08-09 (afternoon) — six things from one service

615 tests across 54 files · **24/24 preflight** · **33/33 story pass**. Five
fixed, one measured and not reproduced.

### "Entrés 60" and "Entrés 30" were the same morning
The metrics bar counts PEOPLE. The report tile counted ROOMS. One word, two
units, on two screens reception reads within a minute of each other — so the
report looked like it had mislaid half the service.

Rooms stay the headline on a tile, because a tile is a filter and the list it
filters is a list of rooms: a tile reading 60 that produces 30 rows just moves
the contradiction one tap deeper. So the tile carries both — `30 ch.` with
`60 pers.` under it — and so does the funnel sheet. An absent room's "people"
are the ones who did NOT come; that is the only reading of an absence the
kitchen can use.

R17b used to read the last digits on the tile's face to find the room count.
That stopped meaning "rooms" the moment a people figure was printed underneath,
so the tile publishes `data-rooms` and the rule reads that instead.

### The checklist that appeared to choose for you
"I selected group and it was selecting vip or children and not group. I had to
actually unmark an existing one to then be able to click group."

Two faults, compounding. The tick was drawn from `shown` — the list ALREADY
TRUNCATED to the slots on the bar — so a chosen metric that did not fit rendered
as an empty box, and tapping it told `toggleMetric` to REMOVE something already
in the list. The box stayed empty and the tap did nothing. Unticking something
else made room, the hidden choice appeared, and the control looked possessed.

And displacement went by ranking, which is defensible and invisible: ticking
Groupes made VIP's tick vanish because VIP scored lowest.

Four are pinned now — Total, Entrés, Restants, COMP — drawn with a lock and
"toujours", and nothing can knock them off. The rest are the checklist, and when
those slots are full the one that leaves is the one chosen LONGEST AGO. Not the
better rule in the abstract; the one reception can predict without being taught
it.

`null` and `[]` are no longer the same thing either. Never-chosen falls back to
the ranking; unticked-everything is honoured, because the pinned four are still
a bar.

### Two Récents
`ActivitySheet` was rendered only inside the portrait branch. Landscape's
Récents button opened `HistoryPanel` — a separate list off the raw check-ins,
its own row shape, its own sort, no lenses. Two lists answering "did I already
do 224?" is two answers to check. One sheet in both shells; `HistoryPanel` is
deleted, it had one caller.

### The sidebar that opened empty over a check-in
Reported as a second sidebar. It was not: it was a FIRST-TIME guest. The panel
forked on "has past stays" and only the other branch drew today's entries — so a
first-timer who had already come down got a collapsed panel that opened to
"Aucune visite précédente" above their own check-in, with the undo button inside
the block that never rendered.

One order now for both cases, in `src/lib/guest-sidebar.ts`, and today's
check-ins count toward opening the panel at all. Today is what the screen is
for; it is the one thing that is never dropped.

### The Groupes list dragged sideways under a thumb
"When I select Groupes and scroll the list, it moves left to right with my
finger instead of being a fixed frame. This only happens with Groupes."

`overflow-y: auto` with a visible `overflow-x` computes **`overflow-x: auto`**
too. The results column had been scrollable on both axes since it was written —
it simply never had anything wider than itself to prove it. `GroupPicker`
carried `-mx-0.5`: four pixels of negative margin so the chips' focus rings
could breathe. Four pixels is all a touch device needs to decide the gesture
belongs to the horizontal axis.

That is why it was only ever Groupes. It is the one control that lives *inside*
the scrolling list.

The negative margin is gone, both shells' lists state their axis
(`overflow-x-hidden`, `touch-action: pan-y`, `overscroll-behavior: contain`),
and the chip row takes `pan-x` so a vertical drag starting on a chip still
scrolls the list underneath it.

Portrait's list carried the same four pixels on its own scroller, so it was one
control away from the identical bug. Fixed there too, before anyone met it.

R36 measures it as overflow rather than as feel — `scrollWidth` against
`clientWidth` with the filter on — and it walks up from a ROW rather than from
the picker, because portrait puts the picker above the list instead of inside
it. The first version started at the picker and reported "not found" in
portrait: a rule measuring two different boxes in two shells is not one rule.

### Searching the report hid what you found
Landscape only: type into the report's search field and the pad covered the
results. The header said "3 chambres" and not one of them was on screen.

The panel is `flex-1` beneath a chart with a fixed height. When the pad claimed
its ~340px, the chart kept every pixel of its own and the list absorbed the
whole loss — down to its tiles and its search field, with nothing left for a
row. Nobody had noticed because R26b covers the full-screen sheet, and nothing
covered the panel that sheet expands FROM.

The chart stands down while the pad is up. Affluence is read at a glance between
guests; a search is read while typing, and only one of them can be the thing you
are looking at. Measured: 5 of 9 rows clear of the pad, where it was 0.

### The landscape metrics bar was the flat one
Portrait's pills have been cut into the bar with `surface-inset` since it was
built: four numbers in a row read as four things because light separates them,
not because a border does. Landscape's had a hover tint and nothing else — so
the shell reception actually works on all morning got the plainer version, and
the one used for testing got the depth.

`surface-inset` is a box-shadow. It paints; it does not composite. This is the
technique the app already argues for over `backdrop-filter`, and it costs
nothing on the tablet.

R37 measures painted depth — an inset shadow on the resting pill — in both
shells, so the two cannot drift apart again.

### People lead, and there is one percentage on the report
Reception, reading the tiles: "people in big and rooms smaller, same for the
distribution chart." Then, a minute later: "84.6 and 86 — let's make sure the
numbers are exactly the same everywhere. Simple and just clear."

The swap itself was small. The second half was not, and it was the interesting
one: putting people in the headline made two figures comparable that had never
been comparable before, and they disagreed.

**Three times, for three different reasons.**

*86 against 84.6.* The ring divided people served by the house (148/173). The
panel divided by the sum of its own blocks (148 served + 27 owed by the absent
rooms = 175). The gap was exactly the two unexpected covers. Both arithmetically
right; both answering a slightly different question.

*49 against 40.* Fixed the denominator, and the panel still split three ways —
Entrés, Partiel, Absents — so its green block counted only rooms that came in
FULL while the ring counted everyone who ate. The missing nine points were the
partial rooms.

*And one waiting to happen.* The "Entrés" tile counted fully-arrived rooms too,
so it would have parted company with its own block the first morning a room half
turned up.

The fix is not arithmetic, it is the model. **A room can be half arrived; a
person cannot.** So the répartition is two blocks over one population — everyone
who ate, and everyone who did not — and "everyone who ate" is precisely the
ring's numerator, so the two figures are the same number by construction rather
than by agreement. The parts add back to the house. Percentages are whole
numbers: a tenth of a point is precision nobody uses at 09:00 and one more thing
to reconcile.

Partiel keeps its tile above the list, where the question is genuinely about
rooms and the answer changes what you go and do.

Measured on one screen: ring 83 % · 135/162 · block 135 pers. · 83 % · 79 ch. ·
tile 135 pers. / 79 ch. · absents 27 / 17 % / 18 ch. R34c pins the ring and the
block to the same digit; R34d checks the parts still make a whole.

The old rule R17c asserted "three blocks" — it encoded the shape of the mistake,
and updating it was part of the fix rather than an inconvenience.

### Récents is one panel now, not one per shell
Portrait has always had the activity list *in the drawer* — beside the day, one
tap from the guest, each row with its own undo. Landscape had a button that
opened something else: first `HistoryPanel`, a separate list built off the raw
check-ins with its own row shape and no lenses; then, after that was deleted,
the full-screen sheet. Reception, holding the tablet on its side: "we have the
4 buttons, we just need to add the same activité list."

So landscape opens the same `NavDrawer` — same component, so the rows cannot
drift again — with `showNav={false}`, because the four service tiles are already
in its top row and a second copy would put two Gaucher buttons on one screen.

Measured on the tablet's own width: drawer on the set hand, 0 duplicate tiles,
40 rows, and the expand button still leading to the full-screen list.

That last part had a trap in it. The full-screen sheet lives in `overlays`,
which BOTH shells render — so the portrait branch's own copy would have mounted
it twice the moment the two shells shared a list. R35b counts the mounts rather
than trusting the reading.

### Zero entrés still drew a green block, and three tiles said "0 pers."
One screenshot from the desk, before anyone had come down, carrying three
separate faults.

**The répartition drew an outcome that had not happened.** Entrés was 0 and
Absents 100 %, and there was still a green sliver on top of the red. Its share
was correctly 0 — `treemapShares` has always zeroed an empty block — but the
Entrés block was the one rendered *unguarded*, and a flex item with no basis
still paints its content, so the sliver arrived carrying the VIP and COMP chips.
`Partiel` and `Absents` had both been guarded since they were written; the
component's own docblock says "an outcome that did not happen gets no block at
all". The rule was true of two blocks out of three.

**VIP said "18 ch. / 0 pers."** — a tile disagreeing with itself in two lines.
The room count of a membership tile ignores whether anyone came; the people
count underneath it was counting arrivals. Same for Groupes and Hors liste. The
people figure counts the same guests the room figure counts: arrivals for
Entrés and Partiel, the reservation for VIP, COMP, Groupes and Hors liste, and
for Absents the covers that were laid and nobody sat at.

**And the blocks now say how many people they are**, not only how many doors —
"ABSENTS 93 · 100.0 % · 124 pers." R34 and R34b hold both halves.

### A security test that was a coin flip
`notes-safety` asserted the storage key does not contain the room number:
`expect(key).not.toContain("524")`. The key is 32 hex characters, so three
decimal digits turn up in it by chance roughly once in a hundred and fifty runs
— and it failed exactly that way in a full-suite run here.

It reads like a leak check and is not one. What actually rules out
`notes_524_POLANCO` is that the key's shape owes nothing to its inputs: same
length for a one-digit room and a twelve-digit one, same length for "A" and for
a fifty-character name, and every character changed when only the room moves.
That is deterministic, and it is the property that matters.

The name half of the assertion was never a coin flip and stays — P, O, L and N
are not hex digits.

A security test that cries wolf is worse than no test: it teaches the next
person to re-run until green.

### What one picture per fix caught that the tests did not
Every fix above was green before anyone looked at it. `scripts/proof-shots.mjs`
renders one picture per item against a fixture built to make each one visible —
not to prove the fix, which the tests do, but to see what the tests were not
watching. Three things fell out of it.

**Enfants was counting people while every tile beside it counted rooms.** The
first pass at the rooms/people split appended "ch." to every tile, so the
Enfants tile read "3 ch." when the 3 was three children — the identical defect,
reintroduced one tile over. Its value is rooms-with-children now, which is also
what tapping it filters to; the children are on the people line.

**Four pinned does not fit a portrait bar.** Portrait has four slots and a phone
three, so pinning four left nothing to choose and, on the phone, drew a bar
wider than the screen had room for. `chooseMetrics` caps at the slot count and
priority survives the cut in CORE order. In portrait the bar is the pinned four
and the rest are one tap away behind the funnel — which is the trade Angel
asked for when he said COMP was as important as the trio.

**Two of the rules were measuring the wrong thing.** R33 clicked a result row
without typing anything, so there were no rows, so it photographed the search
screen while reporting on the guest's panel — it failed on a screen that works.
And it measured the drawer's full-screen overlay instead of the panel inside it:
the overlay's centre IS the middle of the viewport, so "which half" answered
"right" for both hands and passed by luck once. A rule that fails on a working
screen is worth no more than one that passes on a broken one.

### Not reproduced: the panel changing sides on rotation
Reported as landscape-left, portrait-right. Driven both orientations × both hand
settings: panel at x=0 and x=0 for Gaucher, x=796 and x=520 for Droitier, and
the drawer's `data-side` tracked the setting each way. The deployed build has
the same wiring, so it is not a stale deploy.

Nothing changed, because nothing was found. **R33** now measures it on every run
instead — the claim is a rule rather than a memory. Two questions outstanding:
whether the toggle read GAUCHER or DROITIER at the time (the label is state, not
target), and whether it was the Activité panel or the nav drawer.

## 2026-08-09 (morning) — live at the desk, and the first thing it got wrong

579 tests across 51 files · **24/24 preflight** · **33/33 story pass, three runs
in a row**.

### "Attendus bientôt" was not predicting badly — it was not predicting
Angel, standing at the desk at 09:05: the pane offered room 201 at 07:15, and
201's own screen said "Descend vers 09:40".

Neither number was a bad forecast. The pane printed `07:${15 + i * 6}` — a time
made out of the row's **position in the list**. Whoever was first was due at
07:15, the second at 07:21, the third at 07:27, forever. The screenshot Angel
sent shows exactly that sequence: 07:15, 07:21, 07:27. Reception reads that pane
to know who is still to come, and a number that comes from an array index is a
lie told in a confident font.

The arithmetic lives in `src/lib/expected-soon.ts` now and **both screens read
it**, so they cannot disagree again. It is the guest's own median from the
mornings we recorded — the same value, from the same collection, that the guest
screen shows. It says nothing below three mornings, nothing when the hour is
spread wide enough that there is no usual one, and nothing about a guest whose
time went by more than fifteen minutes ago: at 09:05 a 07:30 guest is not
arriving soon, they are a different question.

Angel asked the fair question — *should we even show it?* Yes, when it is real.
So the pane no longer occupies a carousel face to say "rien de prévisible": it
appears when it knows something and gets out of the way when it does not. On a
young install it will mostly be absent, which is the honest answer.

13 tests in `expected-soon.test.ts`, including the two times on Angel's tablet:
07:00 lists both guests soonest-first, 09:05 lists only the one still to come.

### One panel, two histories
The Activité sidebar opened with a row of date chips — the first three past
stays as raw ISO strings, `2026-08-05 · 1 pax` — sitting directly above "Séjours
précédents", which lists the same stays, **all** of them, with the weekday, the
room and what they took. The shorter, worse one came first, and each chip cost a
`glass-liquid` blur composited every frame for information already on screen.

The chips are gone. What is left in that block is today's entries with the undo
beside each row — which is not history, and no longer claims to be: it is headed
"Aujourd'hui".

### A probe that skipped its own subject
The story pass had been reporting **32/33** with `US-2 — no such room in the
day`: the story that stops an uncovered breakfast being waved through in one tap
had nothing to test.

The seeder was not short of such rooms — 40 seeded days all had 8 to 12. It was
short of ones **still to come**. The demo day arrives mid-service with ~78% of
rooms already entered, so on roughly one morning in seven every uncovered room
had already been checked in. The assertion in `mock-seeder.test.ts` had asked
the wrong question; corrected, it reproduced the failure immediately — 6 days in
40 — and the seeder now hands one back rather than leaving it to two coin flips.

Worth naming: this failed *quietly*. A probe that cannot find its subject and
counts itself as one check reads as 32/33, which looks like one small problem
rather than a story with no evidence behind it at all.

### Production cannot be talked into shipping the demo loader
`NEXT_PUBLIC_TEST_TOOLS` is set in a hosting dashboard this repository cannot
see or test — the one claim the last entry could not verify. One person adding
it to the production environment would put "replace today's data" back under
reception's thumb with every check here still green.

`testToolsEnabled()` now refuses on a production deployment whatever the flag
says. Previews and this machine still honour it, so the two harnesses that drive
the app's own demo loader keep working: 24/24 and 33/33 on a flagged build.

Also: `.gitignore` covered `.env` and `.env.local` and not `.env.production`.
The repository is public and the Gemini key is a real one, so it ignores every
`.env` shape now and keeps only the sample.

## 2026-08-08 (night) — shipped to a pull request

**PR #4** · 562 tests across 50 files · **118/118 design rules** · **33/33 story
pass** · **24/24 preflight** · fast-forward from `main`, no conflicts.

### The demo loader does not go to the desk
"Charger un service de démo" REPLACES today's data — on a real morning that is
the whole service gone in one mis-tap, with no undo.

Behind `NEXT_PUBLIC_TEST_TOOLS=1` rather than deleted, because deleting it would
also blind the two harnesses that click through the app's own demo loader — the
ones that caught the seeder writing UTC timestamps into Récents. A check that
cannot run is a check that does not exist.

Anything other than an exact `"1"` is off: a flag that guesses is a flag that
ships the demo loader to a desk one typo later. `/debug` refuses in words rather
than relying on nobody typing the URL.

Verified both ways on real builds: production has 0 test-tool buttons and a
refusing `/debug`; the flagged build still drives 24/24 preflight and 33/33
story checks.

**The one thing this cannot verify from here:** whether
`NEXT_PUBLIC_TEST_TOOLS` is set in the Vercel production environment. It is
inlined at build time, so if it is set there, none of the above holds.

## 2026-08-08 (evening) — the exit that moved

### Handedness took the back button with it (US-39)
Flipping Gaucher / Droitier reverses the top row so the burger lands under the
free thumb. The back button was in that row, so it swung from one edge to the
other — and a control whose whole job is "get me out of here" is the one that
must never change corner. You do not hunt for an exit.

It sits outside the reversal now. Measured, both hands: `x=10 y=12 44x72` in
each, while the burger moves to x=754 — so handedness still does the job it
exists for.

### Balayage removed
"We don't need it." The swipe stays on; the switch for turning it off is gone.
US-23's promise survives, because it never rested on the toggle: every face of
the carousel is also on a dot, so the gesture has always been a shortcut rather
than the only way through. R25d asserted the switch; it asserts the dots now —
which is the thing the story actually promises. A preference nobody wants is a
decision reception has to make on a screen they opened for something else.

### Asked and answered: the points swap IS on the report
"How can we see that on the report?" It is already there, on the row: the
Formule column reads **Échangé** for a points-to-breakfast swap, and it is the
one that gets a green tint. Every other outcome has its own word too — Inclus,
COMP, Points, Chambre, Carte, Cash, Superviseur, À encaisser — so what happened
in a room is readable from the list without opening it.

What the expanded list does NOT yet do is let you filter by that column, which
is the next conversation.

## 2026-08-08 (evening) — the production pass

**Branch** `claude/checkin-app-registration-bug-3lpy9c` · 559 tests across 49
files · **117/117 design rules** · **24/24 preflight** · **33/33 story pass**,
both orientations, on the build that would ship.

The story pass is new and is the one that answers "is it ready": it walks
reception's morning and asserts each story's own **Never** line rather than the
happy path. One-tap commit and the field clearing; the shortcut refusing on a
room that needs a decision ("Vérifier 3"); an unaccented query finding *Michel
Élise*; the entry just made being newest in Récents; a note unreadable in 341 KB
of localStorage and still there after a reload; the report with no money on it;
the day closing and the next starting clean; back returning to search; and no
room number in the URL or in any of the 60 requests the pass makes.

### Four rules, four wrong assumptions
R23b counted `> span` after the rows became buttons. R31 asked for a digit key
on a screen showing the alphabet, then asserted the search field should get keys
that belong to an open note editor — the opposite of US-17. Earlier: R25h's
one-face assumption, R28 measuring the dock's box.

Every one of them failed the app for doing the right thing, and every one had
the same cause: **the rule encoded what I remembered of the app instead of
asking the screen what it was showing.** Worth more than the green number.

### The security pass
Notes: AES-GCM 256, key `extractable: false`, verified by scanning storage for
the plaintext and not finding it. No key-shaped strings in the built bundle;
`GEMINI_API_KEY` stays server-side. No `dangerouslySetInnerHTML`, no `eval`.
OCR routes log lengths, never payloads. Guest data leaves the device only for
our own OCR route.

**Deleted `src/lib/supabase.ts`** — no importers, but it read two `NEXT_PUBLIC_`
vars, and those are inlined into the client bundle at build time. Keys for a
database this app never talks to would have shipped to the tablet if they were
ever set.

## 2026-08-08 (afternoon) — the pad went deaf

### A keystroke with nowhere to go (US-38)
Angel, on the search screen: "when typing a number or text it does not work".
The worst possible bug on this app — the app owns the keyboard, so the pad is
the only way to put a character on that screen. A swallowed key is not a glitch,
it is a dead tablet with a queue in front of it, and the only cure was a reload.

`padAppend` routed to the note draft whenever one existed:

    noteDraft ? setNoteDraft(...) : appendKey(k)

A draft outlives the screen it was written on. Start a note on a guest's card,
tap a metric pill — the slot swaps to the list, the editor is gone, the draft is
not. Every digit after that went into an invisible text box.

The question is never "is there a draft" but **"is there an editor on screen to
type into"**. A note is always about a guest, so no guest means no editor,
whatever got left behind — and the draft is cleared when the guest goes as well.

**R31 walks the states rather than the happy path**: at rest, with a filter
running, after a note was started and abandoned, after the drawer and the
activity sheet have been through, and in letters. Five for five.

**My probe lied first.** It read `[data-role="search-field"]` — the wrapper div,
not the input inside it — and reported all five states dead, including the one
that had always worked. A green harness that measures the wrong element is the
same failure as a red one, in the other direction; the difference is that this
one was caught by disbelieving a result that was too bad to be true.

## 2026-08-08 (afternoon) — ten groups on a morning with none

### Where the group data comes from, and why it was wrong
Angel: "I don't really have a group at the hotel", with a report showing **10
blocs** and chips reading PV2G, PV2B, PV2A, ESPC.

The chain, in full: the arrivals list's **column 12** is the package code; a
room counts as a group room when it matches `BKF GRP`; rooms are then clustered
by **rate code + arrival + departure**, and any cluster of more than one room
became a block. The name on the chip is the **rate code** — the list has no
group-name column, so the app never had a tour's name to show.

Nothing was invented. The design was wrong, in two ways his own data made
obvious:

- **Two rooms is not a coach.** A pair on one rate arriving the same day is a
  couple, or a family split over two rooms.
- **26/06 → 24/08 is not a tour.** A two-month stay on a shared rate is a
  contract — crew, long-stay corporate — and it never arrives together, so it
  changes nothing about the peak.

`MIN_BLOCK_ROOMS = 3`, `MAX_BLOCK_NIGHTS = 14`, and a block whose dates cannot
be read is not a block: OCR loses a date often enough that "unknown" must not
default to "short". On the fixture built from his screenshot, ten blocks become
three.

Both numbers are conservative on purpose. A missed coach shows up as a queue
reception can see; a phantom one quietly makes "10 blocs" mean nothing, and a
number nobody trusts is worse than no number at all.

### "I click one and they all get selected"
Literally true, and not the filter's fault: `DayGroups` was **one button around
every row**, and each row took its colour from the filter's own state. Turning
Groupes on painted all ten gold.

A row is a block now — it lights when that block is picked and tapping it picks
it, sharing the same state as the chips, so the panel and the checklist cannot
tell different stories. And when two blocks share a rate code the chips carry
the arrival date, because two identical chips is a control you cannot aim.

### The top margin, on screens that are STATES not routes
`/upload` alone has four views. R30 sweeps routes at rest, so it never reached
"Traitement en cours" — the header Angel photographed under the iPad's clock.

The inset moved up an altitude: `.screen-safe` on the container that claims the
display, not on each header that has to remember. `box-sizing: border-box` is
what makes it safe on `h-dvh` — the padding comes out of the 100dvh instead of
adding to it. **47 screens** carried it after one pass.

`safe-area-shells.test.ts` reads every `.tsx` in the repo and fails on a shell
without it, which is the half a browser sweep cannot do: it sees the view
nobody opened, and the one somebody adds next month. Verified on a real build
across five states, including the PDF screen.

## 2026-08-08 — before production

**Branch** `claude/checkin-app-registration-bug-3lpy9c` · 547 tests across 46
files · **116/116 design rules** · **24/24 preflight**, both orientations, on a
real build driving the app's own demo data.

### Récents was showing fiction (US-36)
Angel, testing on the demo day: a room he had just checked in was not at the top
of Récents. Two faults, one line of code.

`${date}T08:30:00.000Z` — the **Z is UTC**, and reception is in Paris. A
breakfast seeded for 08:30 read 10:30 on the tablet, which is why the demo's
Récents looked like a lunch service.

Worse, and the reason it would have hurt this morning: a seeded arrival ahead of
the clock **sorts above every real check-in** in a newest-first list. At 07:00
during service the room just entered would sit under a pile of guests who
"arrived" at 13:00 and had not arrived at all. The one question Récents answers
is "did I already do 224?" — and it would have answered with fiction.

`serviceStamp` is local time, clamped to now.

**Why no rule caught this.** `design-rules.mjs` seeds localStorage itself, so it
has never once run the seeder. A harness that builds its own fixtures cannot
see a bug in the fixture builder. `scripts/preflight.mjs` clicks "Charger un
service de démo" like a person, then checks a guest in and asks the screen
whether it noticed: 24 checks across both orientations.

### One bar, two hands (US-37)
"On the horizontal, the metrics are too much." They were: up to eight pills,
each narrower than the last, the label the first casualty — 128px a pill on an
iPad.

Landscape is the portrait bar now — six slots, ranked, funnel for the rest. Not
a copy of the logic: the same `metric-choice`, the same checklist sheet
(extracted to `MetricChecklistSheet`), the same stored preference, so a choice
made sideways holds when the tablet is stood up. Two bars that disagreed about
which metrics exist would be two mental models for one number, and reception
turns the tablet round twenty times a morning.

Measured: 6 pills at 111px minimum in landscape (was 8), 4 at 148px in portrait,
one funnel each, and the same nine options behind it.

## 2026-08-07 (night) — the gate, 116/116

**Branch** `claude/checkin-app-registration-bug-3lpy9c` · 542 tests across 45
files · **116 design rules, all passing** — the first clean pass covering the
whole day's work.

Four failures on the way there, and what they were is the interesting part:

- **R20 ×2, real, mine.** `.pt-safe` defaulted to 10px, which is off the 4pt
  scale — so every header I converted to it drifted. The rule reads rendered
  padding, and it caught a design-system regression introduced while fixing
  something else. 12px now.
- **R28 ×2, the rule's fault.** It measured the dock's box, and the dock is
  SUPPOSED to reach the bottom edge — that is what cover buys. What must clear
  the home indicator is the last key. The same mistake R26a exists to prevent,
  made in my own rule one screen later, two days after writing the lesson down.

Also on the way: run 5 died at 49 checks with a browser crash, unrelated to the
app, and run 4's R25h crash turned out to be a rule whose assumption had expired.

## 2026-08-07 (night) — a quiet screen, and the way out

### The resting frame is off by default (US-35)
It shipped ON because an empty band above the pad looked unfinished — measured
in a desktop browser, where the band is smaller and there is no queue. With a
real day on a real tablet the answer came back the other way: "too big, hide it
by default". At rest reception is looking at the pad, not at a list of who has
already come down.

Off, and smaller when it is on: 24vh capped at 280px rather than filling the
slot. The **resolved guest card still fills it** — that card is the reason the
screen exists, and no preference may shrink it.

Silence means off here, and on for the swipe. Both are right for their own
reason: a frame at rest takes half the screen, a swipe takes nothing away. The
defaults are asserted in `idle-preview.test.ts` rather than assumed.

### A back button in portrait
Portrait shipped without one because search is the root of the service. That is
true and it is not the point: reception's only route back to the arrivals list
was two taps deep in the drawer, and a screen with no way out reads as a trap
however logical the reason. Beside the burger, on the same hand.

### R29 re-aimed, and R25b/R25d taught the new default
R29 was written about the resting frame — no dead band under it. The tablet then
said the opposite about that frame, so the rule now measures the **guest card**:
when someone is standing there, dead space between their card and the button is
the thing worth forbidding. Re-aimed, not deleted, and stated here because a
rule that changes shape to keep passing has to justify the new shape.

R25b and R25d both read the resting carousel, so they turn the preference on
first. What R25b protects — the card and the list never sharing the slot — is
hardest to hold when the frame IS present, so testing it on is testing the
harder case.

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
