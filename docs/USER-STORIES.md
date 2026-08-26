# User stories

Why each thing exists, who it is for, and what proves it still works.

## How to use this

One story per capability. Not per screen, not per component — per *thing a
person needs to get done*. The format:

```
US-n — short name
  As      <role>
  I need  <capability>
  So that <outcome that matters to them>

  Scenario: <the situation, in their words>
    Given  <state of the world>
    When   <what they do>
    Then   <what must be true>

  Never:  <the failure that would make this worse than the paper list>
  Proof:  <the test or design rule that holds it>
```

Two lines carry the weight.

**Never** is the one to write first. It is the failure mode that would make
reception go back to paper, and it is almost always more specific than the
happy path. "An allergy is never one tap away from being skipped" decided the
whole shape of the search screen's green button.

**Proof** is what keeps this file from rotting. Every story names the automated
check that enforces it — a Vitest test (`npx vitest run`) or a design rule
(`node scripts/design-rules.mjs`). A story with no proof is a wish. If you
cannot name one, the story is not done, however good the screen looks.

Roles, so we stop saying "the user":

- **Réception** — at the desk during service, 06:30–10:30. Standing, one hand,
  a queue in front of them. Optimises for speed and for not being wrong.
- **F&B / manager** — reads the report after service and briefs the afternoon
  team. Optimises for understanding what happened.
- **Direction** — money and trend. Not in this app; the dashboard.

---

## Service

### US-1 — Check a room in by its number

    As      Réception
    I need  to enter a room number and record who walked in
    So that the count is right without leaving the desk

    Scenario: the 07:40 queue
      Given  room 224 expects 3 people and nothing needs deciding
      When   I type 224 and press the green button
      Then   3 are recorded, the field clears, and the next guest can be typed

    Never:  a check-in that did not save shows a green confirmation.
    Proof:  R16c/R16e (design rules) · checkin-flow.test.ts · storage-quota.test.ts

### US-2 — Never skip what needs a decision

    As      Réception
    I need  the shortcut to refuse to fire when the room needs a human
    So that a payment, a flag, or an allergy is never entered past by reflex

    Scenario: 224 has a nut allergy on file
      Given  the room resolves and one of its notes is an alert
      When   I look at the action button
      Then   it reads "Vérifier", is gold, and opens the room's own screen

    Never:  a one-tap check-in on a guest with an alert note.
    Proof:  R10 · R16e · the `needsScreen` guard in search/page.tsx

### US-3 — Correct the number of people before recording it

    As      Réception
    I need  to say 2 walked in when the reservation says 4
    So that the count reflects the room, not the booking

    Scenario: half the family comes down
      Given  room 402 expects 4 and 2 are standing there
      When   I tap − twice and press enter
      Then   2 are recorded and 2 are still expected

    Never:  the stepper offers more people than the room still expects.
    Proof:  R16c · pax-discrepancy.test.ts

### US-4 — Find a guest by name

    As      Réception
    I need  to search by name when someone does not know their room
    So that I do not send them back upstairs to look

    Scenario: "Lefèvre, I think room 8-something"
      Given  I do not have a room number
      When   I switch to letters and type LEF
      Then   the match resolves and I can check them in from there

    Never:  the iPad's own keyboard covers the screen; accents are required to
            find an accented name.
    Proof:  R21a–R21d · search-accents.test.ts

### US-5 — Know who already came down

    As      Réception
    I need  to see recent arrivals without leaving the search screen
    So that I can answer "did I already do 224?" without a second thought

    Scenario: a guest comes back for more coffee
      Given  I am mid-service
      When   I look at the preview panel, or swipe to Récents
      Then   I see the service's arrivals, newest first, with time and count

    Never:  the panel moves while a guest is on screen.
    Proof:  the `auto` flag in PreviewCarousel (idle only) · R16b

---

## Guest knowledge

### US-6 — Record something about a guest that must not be lost

    As      Réception
    I need  to write a note that the next shift will see
    So that an allergy or a preference survives the handover

    Scenario: nut allergy mentioned at breakfast
      Given  I am on room 515
      When   I add an Alerte note
      Then   it is pinned by default and visible on the card without opening
             anything, this shift and every future one

    Never:  a first-visit guest has no route to their notes.
    Proof:  R10 · R11/R11b · notes.test.ts · notes-crypto.test.ts

### US-7 — See everything known about the guest in front of me

    As      Réception
    I need  one place that shows the complete visit record AND every note
    So that "Tout" means everything, not "everything except the notes"

    "Everything known" is exactly two things and nothing else: the visit
    record (every stay, and today's entries with day, date, hour and count)
    and the notes (all of them, with what they say). If a third kind of guest
    knowledge ever exists, "Tout" owes it a place too.

    Scenario: a regular arrives
      Given  they have 6 previous stays and 2 notes
      When   I open Activité › Tout
      Then   I see today's entries with day, date, hour and count; their past
             stays; and their notes, each showing what it actually says

    Never:  a tab labelled "Tout" omits a category of information.
    Proof:  — TO BE WRITTEN (see Open below)

---

## After service

### US-8 — Brief the afternoon team

    As      F&B / manager
    I need  one table of what happened this morning, with how each room was covered
    So that I can run the briefing without reconciling two documents

    Scenario: 15:00 handover
      Given  the service is over
      When   I open the report
      Then   I see arrivals in order, the affluence curve, presence, and a
             Formule column — and no money anywhere

    Never:  a figure on the report disagrees with the figure next to it.
    Proof:  R17a–R17f · report.test.ts · report-v2 tests

### US-9 — Close the day without losing what matters

    As      Réception
    I need  the day to close and the next one to start clean
    So that the tablet keeps working on day 40 as well as day 1

    Scenario: end of service
      Given  30 days of history are already stored
      When   I close the day
      Then   it is compacted, anything older than 30 days is dropped, and the
             new session is accepted even if that means evicting the oldest

    Never:  a new session is refused because storage is full.
    Proof:  retention.test.ts · storage-quota.test.ts

---

## Portrait — where it starts

Portrait is not landscape made narrower. Landscape has two columns because
the hand rests on the right and the eye reads on the left. Portrait has one
column, one thumb, and a keyboard-sized zone at the bottom that is the only
part of the screen a standing person can reach without regripping.

So the order is not "port the screens". It is: settle the pad, because
everything else is what fits above it.

**The reachable zone decides the layout.** On a phone held one-handed the
bottom third is comfortable, the middle is a stretch, and the top is a
two-handed operation. The pad and the commit button live in the bottom third.
The guest card lives directly above them. The results list gets whatever is
left and scrolls under both.

### US-P1 — The pad never leaves — BUILT

    As      Réception
    I need  the keypad and the commit button fixed to the bottom of the screen
    So that the next guest can be entered without finding anything first

    Scenario: the queue, on a phone
      Given  I have typed a room and results are showing
      When   I scroll the results
      Then   the pad and the button do not move, and the list scrolls under them

    Never:  the primary action leaving the screen. Never a layout where the
            keyboard region changes height between states.
    Proof:  R25a (three portrait viewports, before and after a scroll) ·
            R25e (both pads share one box, so the button never shifts)

    Fixed, not hide-on-scroll. Hiding a toolbar on scroll is a reading
    pattern — Safari does it because a web page is content. This is a tool,
    and the moment you scroll the results is the moment you are deciding, so
    it is the worst possible moment to take the commit button away. It also
    costs a gesture to get it back, which is the thing portrait has least of.

### US-P2 — The guest card above the pad — BUILT (Option B)

    As      Réception
    I need  the resolved guest directly above the keys
    So that what I am about to record and the button that records it are one
            glance apart

    Scenario: a room resolves
      Given  I typed 224
      When   the card appears
      Then   room, name, pax, dates and any alert are readable without
             scrolling, and the card does not push the pad down

    Never:  a card that grows and moves the keys. Never the card and the list
            on screen at once.
    Proof:  R25b (idle → list → card, and the two never coexist) ·
            portrait.test.ts `portraitSlot` (8 cases)

    **The open question, settled.** Both options were built in HTML at 320px
    before a line of code. Option A kept the results list under the field and
    shrank the card to fit: the room number came down to 34px and there was no
    line left for an allergy chip. Option B gives the whole slot to whichever
    is being used, and they are never both being used — at rest you are looking
    at the last guest, while typing you are looking at candidates. The list
    returns on the first keystroke, so nothing is lost.

    The rule lives in `portraitSlot`, not in the component, so it can be argued
    with in a test rather than in a screenshot.

### US-P3 — Notes and history without leaving the screen

    As      Réception
    I need  the same carousel faces portrait gives room for
    So that reading a note does not cost a screen change

    Never:  a modal for a one-line note.
    Proof:  — to be written

    The carousel and the pencil are already there in portrait; what is missing
    is US-17's in-frame reading and editing, which is the same work in both
    orientations.

### US-P4 — The drawer, the way iOS already taught everyone — BUILT

    As      Réception
    I need  the navigation to look like what the iPad does everywhere else
    So that there is nothing to learn — a tool that resembles the system reads
            as safe

    Scenario: I open the menu mid-service
      Given  I am on the search screen in portrait
      When   I tap the burger at the top left
      Then   a glass drawer slides in from the edge, the screen behind stays
             visible and dimmed, and the same four controls as landscape are
             there: Récents · Rapport · Gaucher · Clôture

    Never:  a full-screen menu that costs the context. Never different icons or
            different words from landscape — one tool does not introduce itself
            twice.
    Proof:  R25c (four controls present, panel narrower than the screen, a real
            backdrop-filter)

    **Why glass here and nowhere else.** Landscape taught us that
    `backdrop-filter` over a flat page is invisible AND expensive — 170 blurred
    elements is what made the iPad unusable. A drawer reverses the argument:
    there is genuinely a screen behind it, staying visible is the entire reason
    it is a drawer rather than a page, and it is one element rather than a
    hundred. Radius capped, nothing stacked on top.

### US-24 — Find the guests who need a decision — BUILT

    As      Réception
    I need  to filter the day down to the rooms whose breakfast is not included
    So that the VIP who can swap their points is findable

    Scenario: a VIP on a points rate is somewhere in a full house
      Given  the swap switch lives on that guest's own screen
      When   I put "Non inclus" on the bar and tap it
      Then   I get exactly the rooms whose answer to "petit-déjeuner ?" is not
             yes, and the swap is two taps away

    Never:  a control that can only be reached by already knowing the room
            number. A switch nobody can find is a switch nobody built.
    Proof:  — to be written

    This is the missing half of US-16. The switch was built, tested and shipped
    months ago and was reported as "removed" — it was not; it was unreachable.
    Verified present and on-screen without scrolling in both orientations, at
    which point the real defect was obvious: nothing led to it.

### US-26 — Know how this guest paid last time — BUILT

    As      Réception
    I need  each past stay to say how the breakfast was covered
    So that I stop asking a question this guest has already answered

    Scenario: a regular on their sixth morning
      Given  the last three went on the room
      When   I open their screen
      Then   each stay carries its formule, and the habit is stated once at the
             top: "D'habitude · Chambre · 4 fois"

    Never:  "à encaisser" on a morning they never came down. A guest who did
            not come down did not decline to pay, and an absence must not be
            reported as a refusal.
    Proof:  stay-formule.test.ts (7 cases)

    The answer was never missing, only unread. Reception's choice at the door
    is saved on the check-in record and the closed session keeps both — so the
    row said "1 pers · ch. 718" while the storage knew it was a room charge.

    Uses `formuleOf`, the report's own function, so the same morning cannot be
    "inclus" on the guest screen and something else in the 15:00 briefing. The
    guest is matched by name rather than door number: someone moved overnight
    is the same person, which is the rule US-15 already follows.

    Three occurrences before it is called a habit. Two is a coincidence, and a
    wrong "d'habitude" is worse than none — it puts a sentence in reception's
    mouth about a guest standing in front of them.

### US-27 — Correct an entry where it is listed — BUILT

    As      Réception
    I need  to undo a mis-tapped arrival from the list I am already reading
    So that fixing a typo does not cost a screen

    Scenario: 224 was entered twice in the rush
      Given  the drawer is open on the day's activity
      When   I tap the undo arrow on that row
      Then   the row asks "Annuler l'entrée de 224 ?" in place, and the second
             tap removes it — the list is still under my thumb

    Never:  a one-tap destroy. Never a modal for it either: undo removes a
            record, and a dialog mid-service is one more thing to dismiss.
    Proof:  verified on a real build — 3 rows, arm, confirm, 2 rows; arm then
            cancel leaves 2. Design rule to be written.

    The drawer used to carry a button to a screen whose only job was this. A
    trip to correct a typo you are already looking at. The button is gone.

    The row arms rather than confirming in a dialog: a mis-tap costs one extra
    tap, which is the right price for something that cannot be un-done. Two
    buttons in a div, not a button inside a button — the nesting is invalid
    HTML and Safari resolves it by dropping one of them.

### US-28 — Know when this guest comes down — BUILT

    As      Réception
    I need  each regular's usual arrival time, and what it is built on
    So that I know whether the room I am waiting on is late or simply theirs

    Scenario: a regular on their seventh morning
      Given  six recorded mornings, all around half past seven
      When   I open their screen
      Then   it reads "Descend vers 07:34 · 6 matins"

    Never:  a confident time with two mornings behind it. Never a minute picked
            out of a two-hour spread and presented as a habit — a guest who
            comes at 06:40, 08:00 and 09:40 has no usual time, and the screen
            says "entre 07:20 et 08:50" rather than inventing one.
    Proof:  arrival-pattern.test.ts (8 cases)

    **This is MEASURED, not Fact** — the second tier from US-10/US-15. It comes
    from our own history, so it carries its basis on the same line and refuses
    to speak below three mornings. A measured number without its basis is a
    guess wearing a uniform.

    The median, not the mean: one guest who overslept to 10:15 once should not
    drag their 07:30 habit half an hour later. The middle half, not min-to-max:
    a single outlier defines the extremes and says nothing about the habit.

    The first arrival of a morning is the observation. A second cup at 09:50 is
    not a second data point about when they come down.

### US-25 — Turn the resting preview off — BUILT

    As      Réception
    I need  to hide the frame at rest
    So that some mornings the pad and the list have the screen to themselves

    Never:  this switch touching the RESOLVED guest card. That card carries the
            allergy, and US-2 exists so it cannot be skipped — a preference
            must not be able to hide it.
    Proof:  — to be written

### US-23 — The gestures are an option, not a condition — BUILT

    As      Réception
    I need  to turn the carousel's swipe on or off
    So that the good surprise stays a surprise and never becomes a trap

    Scenario: the tablet lies flat and a tray brushes it
      Given  I prefer the dots to the gesture
      When   I turn Balayage off in the drawer
      Then   the carousel stops answering to a swipe, the dots still work, and
             nothing has become unreachable

    Never:  information that exists only behind a gesture. Everything a swipe
            reaches must be reachable by a tap.
    Proof:  R25d (swipe off, every face still on a dot) · gestures.test.ts

    Same principle as the left/right hand setting. Default on: a setting saved
    before the toggle existed has no opinion, and silence is not a refusal.

## Proposed — closing the landscape app (stories → HTML → build)

From the tablet session. Written first, on purpose: the last round proved
stories find more than building does.

Three of these were not design problems at all. The dates, the groups and the
VIP switch all existed and all looked missing, because the demo seeder wrote
empty dates, handed `BKF GRP` out at random with no rate code, and buried the
one VIP who needed a payment choice among a hundred rooms. Fixed, with tests —
mock-seeder.test.ts now asserts the demo day can exercise every feature the
app can show. **A test fixture that cannot reproduce the product is a fixture
that lies about it.**

### US-17 — Read and write a note without leaving the queue — BUILT

    As      Réception
    I need  to open, read, edit and start a note inside the preview frame
    So that the card behaves like a watch face, not a door to another screen

    Scenario: a note is on the guest in front of me
      Given  the Notes face of the carousel is showing
      When   I tap one
      Then   it opens IN the frame — readable, editable, and a new one starts
             there too, with the frame never changing size

    Never:  a full-screen panel for a one-line note during service. Never the
            search field losing the guest the note is about.
    Proof:  verified on a real build — list → compose → typed on the pad →
            saved → read, with the search field still holding "310" throughout.
            Design rule to be written.

    **The pad is the keyboard.** A note editor needs one, the app owns the
    keyboard everywhere, and it is already on screen six inches below the
    frame — so the draft lives on the page and the pad's keys go to it while
    one is open. Building a second keyboard inside a 340px box was never going
    to fit; borrowing the one already there is what makes this feature possible
    at all.

    Two consequences that had to be handled rather than discovered:
    starting a note switches the pad to letters (a note is words), and the
    alphabet switch stops clearing the search field, because mid-note that
    would drop the guest and take the frame with them.

### US-18 — Write a note in one gesture — BUILT

    As      Réception
    I need  a note to need one field, not a title and a description
    So that writing one costs less than skipping it

    Scenario: 07:40, someone says "no nuts"
      Given  I have started a note
      When   I pick the tone and type the words
      Then   it saves — no second field, no decision about which box gets what

    Never:  two text fields between reception and a recorded allergy.
    Proof:  the frame's composer has one field · notes.test.ts holds
            `shouldPinByDefault`, so an Alerte is still pinned without asking

### US-18 — Write a note in one gesture

    As      Réception
    I need  a note to need one field, not a title and a description
    So that writing one costs less than skipping it

    Scenario: 07:40, someone says "no nuts"
      Given  I have started a note
      When   I pick the tone and type the words
      Then   it saves — no second field, no decision about which box gets what

    Never:  two text fields between reception and a recorded allergy.
    Proof:  — to be written

    Alerts stay pinned by default whatever else changes (already true:
    `shouldPinByDefault`), and un-pinning stays possible afterwards.

### US-19 — Choose which metrics I want to see — BUILT (portrait)

    As      Réception
    I need  to pick the metrics on the bar, and have the rest fold away
    So that the bar stays readable on a small screen and when zoomed

    Scenario: zoomed to 125% on the iPad
      Given  eight metrics exist
      When   the bar cannot fit them
      Then   it shows the ones I chose, the rest go behind a funnel, and each
             visible one keeps its spacing — nothing is cut

    Never:  a metric sliced by the panel edge, or a bar that reflows into a
            second line and eats the list under it. Never an empty bar.
    Proof:  metric-choice.test.ts (10 cases) · R25e (no spill at three widths)

    The funnel is a CHECKLIST of what is on the bar, not a second filter.
    Filtering stays on the pill, where reading a number and acting on it are
    the same gesture; the sheet decides membership. Two invariants hold it up:
    with nothing chosen the ranking picks (and re-picks as the day moves), and
    a chosen metric the day has none of never takes a slot — it is listed
    greyed with a dash, so "why is Groupes missing" answers itself.

    The choice is stored (`AppSettings.metrics`) and survives the shift.

    Still landscape-only work: the wide bar shows everything and wraps when
    zoomed. Same mechanism, not yet carried across.

### US-20 — Read the report for a day, or a week, or a month

    As      F&B / manager
    I need  the report's date to be selectable, including a range
    So that I can look at yesterday, or the week, without a second tool

    Scenario: Monday briefing
      Given  I am on the report
      When   I tap the date
      Then   I can pick yesterday, any past day, or a cumulative week/month,
             and every figure on the screen re-reads that range

    Never:  a heading that says one date while a figure below counts another.
    Proof:  — to be written

    The affluence curve and the arrival list are per-service. Over a range
    they have to mean something different — an average morning, not eleven
    mornings stacked — and that is the part to get right before it is built.

### US-21 — Filter to one group, not all of them — BUILT (search screen)

    As      Réception / F&B
    I need  to select a single tour block
    So that I can see how that coach behaved, not all groups at once

    Scenario: two coaches, one left early
      Given  the house has TOMEU (8 rooms) and TOALP (5)
      When   I tap Groupes and tick TOMEU
      Then   the list shows those 8 rooms and nobody else
      And    unticking it shows all 13 again — not none

    Never:  "Groupes" as a single on/off that lumps every tour together.
            Never an empty screen from a stored pick the day no longer has:
            the coach that was here yesterday is gone by the time this morning's
            list is uploaded, and "no groups today" is a different and wrong
            fact. All of them beats none of them.
    Proof:  group-pick.test.ts (7 cases) · R26c

    Nothing ticked means all of them, so the pill on its own behaves exactly as
    it always did — the checklist is what you open when you want less than
    everything. It is not shown at all when the day has one block: a control
    with a single option only ever teaches you it does nothing.

    **On the report too, now.** The same picker, the same `pickGroups`, under
    the tiles in the panel and in the full-screen sheet. Two sets deliberately:
    the tile counts every group room in the house — it is the door into the
    filter, and a door that renames itself once you walk through it is not a
    door — while the list narrows to the coach you ticked.

### US-39 — The way out never moves — BUILT

    As      Réception
    I need  the back button in the same corner whichever hand is set
    So that leaving a screen is never something I have to look for

    Scenario: a left-hander takes over the desk
      Given  the drawer's Gaucher / Droitier is flipped
      Then   the burger moves to the other thumb and the back button does not

    Never:  an exit that changes corner. Handedness reverses the top row so the
            menu falls under the free thumb — it took the way out with it, and
            you do not hunt for an exit.
    Proof:  R32 (same x, y, width and height for either hand)

    **Balayage is gone from the drawer**, at reception's request. The swipe
    itself stays on; what went is the control for turning it off. US-23's
    promise survives without it, because it never rested on the toggle: every
    face of the carousel is also on a dot, so the gesture has always been a
    shortcut rather than the only way through. R25d asserts that directly now
    instead of asserting the switch.

### US-38 — The pad always types — BUILT

    As      Réception
    I need  a key press to put a character on screen, in every state
    So that the tablet never goes deaf with a queue in front of it

    Scenario: a note started and walked away from
      Given  I began a note on a guest, then tapped a metric pill
      When   I press 2 2 4
      Then   the field reads 224

    Never:  a keystroke swallowed by something not on screen. The app owns the
            keyboard, so the pad is the ONLY way to type here — a lost key is
            not a glitch, it is a dead tablet, and the only cure was a reload.
    Proof:  pad-target.test.ts (4 cases) · R31 (five states, digits and letters)

    The rule is not "is there a draft" but "is there an editor on screen to type
    into". A note is always about a guest: no guest, no editor, whatever state
    was left behind. The draft is cleared when the guest goes, too — belt and
    braces, because this one costs a service.

### US-36 — The demo day keeps the desk's clock — BUILT

    As      Réception
    I need  a check-in I just made to be the newest thing in Récents
    So that "did I already do 224?" is answered by the screen, not by memory

    Scenario: testing on the demo day before service
      Given  the demo service is loaded
      When   I check a room in
      Then   it is the first row of Récents, at the time on the wall clock

    Never:  a seeded arrival stamped in the future. Newest-first means a mock
            guest who "arrived" at 13:00 sits above every real check-in for the
            whole morning — the one question Récents answers, answered with
            fiction.
    Never:  UTC. The seeder wrote `${date}T08:30:00.000Z`; reception is in
            Paris, so a breakfast seeded for 08:30 read 10:30 on the tablet and
            Récents looked like a lunch service.
    Proof:  mock-clock.test.ts (5 cases) · scripts/preflight.mjs

### US-37 — The same bar in both hands — BUILT

    As      Réception
    I need  landscape's metrics bar to show five or six, not everything
    So that the labels are readable and the rest is one tap away

    Scenario: a day with eight metrics in it
      Given  I am holding the tablet sideways
      Then   six pills, each wide enough for its label, and a funnel carrying
             the rest

    Never:  two bars that disagree about which metrics exist. Same
            `metric-choice`, same checklist sheet, same stored preference —
            reception turns the tablet round twenty times a morning.
    Proof:  preflight.mjs (metrics-count · metrics-width · metrics-funnel ·
            checklist-opens, both orientations)

    Six across a 1194px iPad is ~170px a pill. Eight was 128px and the label was
    the first casualty — a number with no name on it.

### US-35 — A quiet screen at rest, and a way back — BUILT

    As      Réception
    I need  the resting frame off unless I ask for it, and a back button
    So that the screen at rest is the pad, and the app is not a dead end

    Scenario: nothing typed
      Given  I have not turned the resting preview on
      Then   the space above the pad is empty, and the guest card still fills
             it the moment a room resolves

    Never:  this preference touching the RESOLVED guest card. That card carries
            the allergy and US-2 exists so it cannot be skipped.
    Proof:  idle-preview.test.ts (3 cases) · R25b (turns it on, then asserts the
            card and the list never share the slot)

    **Two reversals, both from the tablet.** The frame shipped ON because an
    empty band looked unfinished in a desktop browser; with a real day in it the
    answer was "too big, hide it by default". And portrait shipped with no back
    button because search is the root of the service — but the only route back
    to the arrivals list was two taps deep in the drawer, and a screen with no
    way out reads as a trap however logical the reason.

    Off means off here, unlike the swipe: an unset preference is off, because a
    frame at rest takes half the screen while the swipe takes nothing away.

### US-34 — Give a leaving coach its breakfast boxes — BUILT

    As      Réception
    I need  a list of one group's rooms with one tap each
    So that a coach leaving at 06:45 gets its bags without forty searches

    Scenario: TOMEU leaves before the restaurant opens
      Given  I have ticked TOMEU in the Groupes checklist
      When   I turn on Paniers
      Then   I see its rooms in ROOM ORDER, one line each, with how many each
             is due, and a counter reading 0/8
      And    one tap serves a whole room and the counter moves

    Never:  a bag that does not count as breakfast. A box IS breakfast — the
            morning's figure would be short by a coach and the kitchen's
            numbers would stop meaning anything.
    Never:  a box recorded as a payment. `viaBox` sits BESIDE `paymentAction`,
            never instead of it: a group on a room charge that takes bags is
            still a room charge.
    Never:  a second tap double-counting a room that is already served.
    Never:  the list re-sorting under the finger. Room order, because it is read
            against the coach's paper manifest and a coach's rooms run
            consecutively — arrival order would reshuffle it on every tick.
    Proof:  box-list.test.ts (12 cases)

    Someone who ate in the restaurant counts as served here too. They had
    breakfast; showing them as still owed a bag sends reception chasing a guest
    who is sitting down eating.

    Undo removes only what THIS run recorded (`viaBox`). Undoing a restaurant
    arrival from the box list would delete a fact somebody else entered on
    another screen.

    The report row carries a **PANIER** chip. Forty bags and forty covers are
    the same count and not the same morning, and 15:00 is where the difference
    is read.

### US-32 — Swap a metric without unticking one first — BUILT

    As      Réception
    I need  ticking a metric on a full bar to put it on the bar
    So that the checklist does what a checklist looks like it does

    Scenario: four slots, all taken
      Given  Total · Entrés · Restants · Attendus are on the bar
      When   I tick Comp
      Then   Comp is on the bar and Attendus is not

    Never:  a tick that changes nothing. It appended to the stored list and the
            bar sliced to its slots, so the fifth tick landed in fifth place and
            nothing moved — a checkbox that does not work, with no clue that
            something has to come off first.
    Never:  the trio that answers "where are we" evicted by a tap somewhere
            else. The NEW one takes the LAST slot, so the slot you are choosing
            is always the same one.
    Proof:  metric-swap.test.ts (7 cases)

### US-33 — How many are coming, and how many came — BUILT

    As      Réception
    I need  the subset pills to read "2/15", not "15"
    So that I know how much of that group is still to come

    Scenario: fifteen comps, two down
      Then   COMP reads 2/15 — on the bar and in the checklist

    Never:  5/4. Three people on a room booked for two is an écart, which the
            report names and reception settles; a pill that reads more-arrived-
            than-expected just looks broken, and the bar is not where that
            conversation belongs.
    Proof:  metric-progress.test.ts (5 cases)

    Landscape has said 2/15 for comps since the beginning. The portrait bar
    lost it in the port — and the half it dropped is the half that changes what
    happens next: fifteen comps with two down is a morning with thirteen
    conversations still in it. Comp, VIP, Groupes, Enfants and Non inclus all
    answer the same question, so they all answer it the same way.

### US-31 — Read every chip in the guest's panel — BUILT

    As      Réception
    I need  the notes filters legible in the theme I am actually in
    So that the tab I have selected can tell me it is selected

    Scenario: dark mode, guest screen, Notes
      Given  "Tout" is the selected filter
      Then   I can read the word, and it reads as chosen

    Never:  a literal colour on a themed surface. Every other chip was fine —
            they take their colour from a tone, and tones are `--aur-*` tokens
            that flip with the theme. "Tout" has no tone, so it had been handed
            #1C1C1C and a ring of rgba(0,0,0,.25): black ink and a black ring on
            a near-black panel. A literal is a colour that has only ever been
            checked against one background.
    Proof:  tone-chip.test.ts (4 cases) · R27 (both themes)

    The second half of the same bug: the Info tone's ink was `--tab-idle`, which
    is the colour of a chip nobody has chosen — so a chosen Info chip looked
    exactly like an unchosen one.

    R18 sweeps /search and /report for contrast. The guest screen's side panel
    was never swept, which is how this shipped. R27 sweeps it, in both themes.

### US-29 — Read the arrival list on the whole screen — BUILT

    As      Réception
    I need  the report's arrival list at full size, with its search and filters
    So that "who came at 8?" is answered by reading, not by squinting at a panel

    Scenario: the morning is over and F&B asks about room 402
      Given  I am on the report
      When   I tap the expand button on "Par ordre d'arrivée"
      Then   the same list fills the screen, with the search field, the tiles,
             and the pad in the sheet's own column
      And    closing it leaves my query and my filter exactly as they were

    Never:  a second list with its own state. Two views of one state, or the
            filter you set in the sheet is lost the moment you close it.
    Never:  the pad floating over the rows. Stacked on top it was a grid of keys
            with guest names showing through the gaps — every row it covered was
            one you could neither read nor tap.
    Proof:  R26b (phone + iPad)

### US-30 — The pad stays on the screen — BUILT

    As      Réception
    I need  every key reachable on the tablet I actually hold
    So that the last row is not under the home indicator

    Scenario: the report's search, on an iPad in portrait
      Given  I tap the search field
      Then   the pad opens and its last row of keys is above the bottom edge

    Never:  a pad measured by its own box. The box can sit where it belongs
            while a taller key inside it hangs below the fold — which is what a
            key with its own min-height inside a shorter container does.
            The last key is what gets measured.
    Proof:  R26a (320×568, 390×844, 834×1194, 1194×834)

    The app had no `viewport-fit` and no safe-area handling at all: installed as
    a PWA, iOS hands back a viewport that includes the home indicator's band and
    every dock in the app was drawing into it. `viewportFit: "cover"` plus a
    `.pb-safe` utility on the docks, and the pad's height is a share of the
    viewport rather than whatever its keys ask for.

### US-22 — Come back to where I came from — BUILT

    As      Réception
    I need  back to return me to the screen I arrived from
    So that opening a guest from the report does not lose my place in it

    Scenario: I open a room from a filtered report
      Given  I arrived at the guest from a report row
      When   I press back
      Then   I am on the report, and the button said "Rapport" before I tapped

    Never:  back to a random screen. Never an origin from an hour ago
            resurrected by a reload.
    Proof:  back-nav.test.ts (5 cases)

    Kept out of the URL for the same reason the room number is: nothing about
    where reception has been needs to reach a server log. Reading consumes it,
    so a stale origin cannot outlive the journey that set it.

## Proposed — tomorrow's covers (not built)

The question behind these: *how many people will come down tomorrow, and
when?* Written as stories first so we build the decision, not the number.

Before anything: three tiers, and the UI must never blur them.

| | source | example |
|---|---|---|
| **Fact** | tonight's report | 212 people sleep here tonight; 3 groups; 62 of them leave tomorrow |
| **Measured** | our own 30 days | groups attend at 94%, individuals on a paying rate at 31% |
| **Guess** | anything else | one specific guest's habits with 2 observations |

A forecast that is wrong is worse than no forecast, because someone staffs to
it. So every predicted figure carries how many days it is based on, and with
too little history the app says so instead of inventing.

### US-15 — Know who is likely down this morning, without guessing — BUILT

    As      Réception
    I need  how many of yesterday's breakfast guests are still in the house
    So that I know the shape of the morning before it starts

    Scenario: 06:30, the list is loaded
      Given  yesterday's service was closed and today's report is in
      When   I look at the metrics bar
      Then   "Attendus" shows the people who came down yesterday and have not
             checked out, and it says which day it is measured against

    Never:  a confident number with no history behind it. With no previous
            session the tile does not appear at all.
    Proof:  expected.test.ts (8 cases)

    This is the FACT half of US-10 and it is deliberately not the forecast
    half. Both inputs are recorded events: a check-in we saved, and a
    reservation that has not ended. The person carries over, not the room —
    matching on the door number would drop every guest who was moved
    overnight.

### US-16 — Offer a VIP breakfast instead of their points — BUILT

    As      Réception
    I need  to swap a VIP's points for breakfast charged to the room
    So that the answer to "not included" is not only pay or refuse

    Scenario: a VIP on a points rate comes down
      Given  their booking gives points rather than breakfast
      When   I offer the swap and they accept
      Then   one switch records it, nothing is collected, and the report shows
             them under "Échangé" rather than "Inclus"

    Never:  a swap that looks identical to a booking that always included
            breakfast. The hotel gave something away; the briefing should see
            how often.
    Proof:  report-v2.test.ts (formule + filter)

### US-10 — Know how many to prepare for tomorrow

    As      F&B / manager
    I need  tomorrow's expected covers, with a range and its basis
    So that I order and staff to something better than last week's guess

    Scenario: Sunday evening, ordering for Monday
      Given  the day is closed and 30 days of history exist
      When   I open the daily detail
      Then   I see eligible covers (fact), an expected range (measured), the
             number of days that range is built from, and the expected peak

    Never:  a single confident-looking number with no basis. Never a forecast
            at all before there is enough history to make one.
    Proof:  — to be written

### US-11 — See the groups, because the groups are the morning

    As      F&B / manager
    I need  how many groups, how big, and when they come down
    So that I staff the peak rather than the average

    Scenario: three coaches on Tuesday
      Given  tomorrow has 3 group blocks totalling 62 people
      When   I open the daily detail
      Then   I see each group's size, its rooms, and the time band its people
             came down on previous mornings

    Never:  62 people in one group counted the same way as 62 individuals.
    Proof:  — to be written

    Why this one first: a tour has a coach at a fixed hour, so it attends near
    100% and arrives inside twenty minutes. The most operationally important
    part of the morning is also the most predictable part — which is not
    usually how forecasting goes. An individual-level prediction changes no
    decision; a group of 40 at 07:00 changes every decision.

### US-12 — See the cliff, not just the level

    As      F&B / manager
    I need  tomorrow's departures and the day after's drop
    So that I do not order Tuesday's volume for a Wednesday when the tour left

    Scenario: the group checks out Wednesday morning
      Given  62 people share a departure date
      When   I read the detail page
      Then   Wednesday shows a large early peak AND Thursday shows the drop

    Never:  a departure day looks like an ordinary day.
    Proof:  — to be written

### US-13 — Find out whether the forecast is any good

    As      F&B / manager
    I need  yesterday's forecast shown against what actually happened
    So that I learn whether to trust it

    Scenario: the morning after
      Given  the app predicted 180–200 and 174 came
      When   I open the detail page
      Then   I see the prediction, the actual, and the running accuracy

    Never:  a forecast that is never scored. Without this the number is
            decoration with a good font.
    Proof:  — to be written

**What we can already compute, with no new data:** who sleeps here tomorrow
(departure dates), which rooms carry breakfast, group blocks (`BKF GRP` plus a
shared rate code and stay window), per-segment attendance rates and arrival
curves (30 days of `clients` + `checkIns`), and the last-morning effect —
guests departing that day come down earlier and more reliably.

**What we cannot, yet:** the coach's actual departure time. Everything above
infers timing from history; a rooming list with the pickup time would beat all
of it.

### US-14 — Order to the change, not to the level

    As      Direction / F&B on the dashboard
    I need  the day-to-day delta in covers, with its cause named
    So that I order for the week rather than repeating yesterday

    Scenario: a 62-person tour checks out Wednesday morning
      Given  the block shares a departure date
      When   I read the dashboard
      Then   Wednesday reads "+62 early, group departure" and Thursday reads
             "−62, group gone" — the cause next to the number

    Never:  a delta shown without what caused it. "Down 60" sends someone
            hunting; "down 60, the Meunier group left" ends the question.
    Proof:  — to be written

    Note: this is a Direction/F&B story on the dashboard, not a Réception
    story in this app. Reception cannot act on next Thursday. Keeping it here
    so the shared arithmetic (`report-v2`, group detection) is built once and
    read twice, but the surface it lands on is the dashboard.

### US-40 — A note outlives the stay it was written in — BUILT

    As      Réception
    I need  a note I wrote against a guest to still be there when they come
            back, whatever room they are given
    So that an allergy recorded in March is read in August

    Scenario: the morning after
      Given  I wrote "allergie arachide" on SHEN, JIA in room 451 yesterday
      When   the day is closed, tomorrow's sheet arrives, and she is in 208
      Then   the note is on her screen before I have finished reading her name

    Never:  a note that survives the encryption, the reload and the day close,
            and is lost by a room change. That is worse than paper — paper does
            not quietly pretend the allergy was never written.
    Proof:  notes-identity.test.ts (15) · notes-migrate.test.ts (20) ·
            `node scripts/prove-notes.mjs` N1–N4, which writes the note through
            the compose panel, closes the day, and reads it back in another room

    The key used to be `sha256(salt | room | name)`. Rooms are not identity;
    they are where somebody slept once. The room is out of the key, and
    `guestIdentity` — the function `expected-soon` already used to recognise a
    guest's arrival habit across days — decides who is who. One definition, so
    a guest whose habit the app remembers and whose allergy it does not can no
    longer exist.

    The two real documents taught it the rest: the VIP list prints
    "SHEN,JIA,Mrs" and the roster prints "SHEN, JIA" on the same morning, so
    honorifics and lone initials are not identity either.

### US-41 — Notes written before the fix come back — BUILT

    As      Réception
    I need  the notes I already wrote to reappear, not to start again
    So that trusting the app once does not cost me the work

    Scenario: the update lands on the tablet
      Given  notes are stranded under room-scoped keys nobody can compute
      When   I open the app
      Then   they are back on their guests, and the orphans are gone

    Never:  a blob deleted because it could not be read this morning.
            Unreadable today is not worthless.
    Proof:  notes-migrate.test.ts (20) · `node scripts/prove-notes.mjs` R1–R6,
            which strands a note the app itself encrypted, photographs the
            empty panel, then shows it recovered

    Bounded honestly: the rooms come from the device's own 30-day history, so a
    stay already aged out cannot be found. Runs once, merges across rooms, and
    deletes the old address only after the new one is written.

### US-42 — A VIP not on the breakfast list still has their dates — BUILT

    As      Réception
    I need  arrival and departure for every guest on the screen, including the
            VIP whose breakfast is not included
    So that I can answer "how long are you with us?" without the paper

    Scenario: room 451, 20/08
      Given  SHEN, JIA is on the VIP list and NOT on the R118 roster
      When   I open her card
      Then   17/08/26 and 21/08/26 are on it, as printed on the sheet

    Never:  a field that is blank on the tablet and filled on the paper next to
            it. That is the moment reception stops believing the screen.
    Proof:  vip-dates.test.ts (18) over the real 20/08 documents —
            fixtures/vip-inhouse-2008.md and roster-r118-2008.md, whose row
            alignment reproduces the report's own "Total Rooms 14  Total 21 0" ·
            `node scripts/prove-notes.mjs` V1

    Two defects met here. `VipField` had no date members, so the VIP parser
    could not return a date it had read; and `mergeVipIntoClients` never
    backfilled dates onto a matched guest. Thirteen of the fourteen VIPs looked
    right only because the roster supplied their dates — 451 is the one not on
    the roster, so it showed the bug alone.

## Privacy — we are the processor, the hotel is the controller

These stories have a second role. **Hôtel (contrôleur)** is the property's own
compliance contact: not in the app, but the person whose questions the app has
to be able to answer. And **Client** is the guest, whose rights the hotel
exercises on their behalf.

Every Never below is a real defect that was in the code, not a hypothetical.

### US-43 — A stolen tablet gives up nothing — BUILT

    As      Hôtel (contrôleur)
    I need  the guest list on the reception tablet to be unreadable off the device
    So that a lost or copied iPad is not a data breach I have to declare

    Scenario: the tablet goes missing after service
      Given  the morning's roster and last month's history are on the device
      When   someone copies its browser storage
      Then   they hold ciphertext — no name, no room number, no allergy

    Never:  the allergy a receptionist TYPED is encrypted while the same allergy
            arriving on the VIP sheet sits in plaintext beside the guest's name.
            That asymmetry was real: notes-crypto.ts protected one and nothing
            protected the other.
    Proof:  `roster-encryption.test.ts` — drives the real storage API, then
            dumps the disk and asserts nothing readable. Watched go red: making
            secure-store write plaintext fails 4 of its assertions.

### US-44 — The morning does not change — BUILT

    As      Réception
    I need  the app to open exactly as it did yesterday
    So that encryption is something I never have to think about at 06:30

    Scenario: the tablet is updated overnight
      Given  a device already in service, holding today's roster in plaintext
      When   reception opens the app the next morning
      Then   every guest is still there, and nobody types a password

    Never:  an upgrade that looks like every guest vanishing. Hydration ADOPTS
            existing plaintext and re-writes it encrypted; ignoring it would
            empty the roster on the one morning nobody could tolerate it.
    Never:  the screen renders before the roster is decrypted. The search page
            computes expected-arrivals in a useMemo that runs once — an early
            render would compute it against an empty store and show a morning
            with no guests in it.
    Proof:  `roster-encryption.test.ts` ("adopts a tablet that is already in
            service"), and the unlock gate in `AppContext`. Cost measured at
            ~56ms for a full house across 90 days; the real per-device figure
            prints in the nav drawer, because an estimate is not a measurement.

### US-45 — A check-in still cannot fake success — BUILT

    As      Réception
    I need  to be told when a check-in did not save
    So that I do not send a guest through on a green tick that recorded nothing

    Scenario: the tablet's storage is full mid-service
      Given  room 224 is checked in and the device cannot persist it
      When   I press the green button
      Then   I am warned, and the check-in is not shown as recorded

    Never:  the write is queued, the screen says saved, and the check-in is gone
            on the next reload. Encryption is async, so the space is reserved
            synchronously — with a marker carrying no guest data — and the
            in-memory value is rolled back when there is no room.
    Proof:  `storage-safety.test.ts` — "returns false when the write cannot be
            persisted", which is the pre-existing guarantee this work had to
            preserve rather than a new one.

### US-46 — Guest data does not live forever — BUILT

    As      Hôtel (contrôleur)
    I need  guest data to delete itself on a schedule I set
    So that I can answer "how long do you keep it?" with one number

    Scenario: the DPO asks at the pilot review
      Given  a retention window of 90 days (30 recommended, one env var)
      When   the app opens on any morning
      Then   everything past the window is gone, and the purge is logged

    Never:  a store that quietly escapes the purge. Three of five did — guest
            profiles, notes and morning briefs were kept forever while only
            session history aged out.
    Never:  a purge log that lists the guests it deleted. It records counts,
            stores and date ranges, and outlives the data it describes.
    Proof:  `retention.test.ts` — 20 checks, including one asserting the store
            list itself, so a sixth store is a deliberate decision.

### US-47 — One guest, exported or erased — BUILT

    As      Client
    I need  the hotel to be able to show me, or delete, everything held about me
    So that my rights under Articles 15 and 17 are not theoretical

    Scenario: a guest writes to the hotel after their stay
      Given  they are on three past days, have a profile and an allergy note
      When   the hotel runs an erasure for them
      Then   they are gone from every store, and no other guest is touched

    Never:  an erasure that misses a store. Guest data spans five of them, and
            one missed is not an erasure.
    Never:  the access log is erased along with the data. It holds a salted
            hash, never a name, and it is the hotel's evidence under Art. 5(2)
            that the erasure happened.
    Proof:  `subject-rights.test.ts` — 17 checks, per guest and per property,
            including one asserting nothing belonging to another guest leaks in.

### US-48 — Hotel A cannot read hotel B — BUILT (schema, not yet switched on)

    As      Hôtel (contrôleur)
    I need  certainty that another property cannot see my guests
    So that one shared database is not one shared breach

    Scenario: the second hotel signs
      Given  two properties in one Supabase project
      When   hotel A queries anything — a table, a join, a view, an RPC
      Then   it sees zero of hotel B's rows, and cannot write into B either

    Never:  RLS enabled and then neutralised by `using (true)`. That was the
            shipped schema: it reads like security in review and is identical to
            RLS being off, with a key that ships in every browser.
    Never:  `using` without `with check`. It governs what a tenant can SEE, not
            what it can WRITE — without it, A can stamp a row as B.
    Proof:  `rls-isolation.test.ts` — 25 assertions against a real Postgres,
            enumerating views and functions from `pg_catalog` so one added later
            is covered the day it is added. Watched go red: restoring the
            permissive policies fails 19. `rls-policy-static.test.ts` runs in
            the ordinary suite so the defect cannot return silently.

### US-49 — Collect nothing we do not use — BUILT

    As      Hôtel (contrôleur)
    I need  the app to hold only what the breakfast service needs
    So that there is less to lose, rather than more to protect

    Scenario: the data-minimisation review
      Given  the roster carries twelve columns
      When   we ask which of them changes what the app does
      Then   four never did, and are no longer collected

    Never:  a field re-added by copying an OCR prompt, with nothing noticing.
            confirmationNumber, rtc, reservationStatus and roomType are gone.
    Never:  a parser that stops recognising a column it no longer stores. An
            unclassified "CKIN" lands in the guest's name, and an unclassified
            "Room Type" header is read as the room number.
    Proof:  `data-minimisation.test.ts` — a ratchet. It checks for the field as
            a property, not as a word, because recognising a column is not
            storing it and the test has to draw that line too.

### US-51 — Injected script cannot reach the guest list — BUILT

    As      Hôtel (contrôleur)
    I need  the encryption on the device not to be undone by one injected script
    So that the protection I was shown is the protection I actually have

    Scenario: a script is injected into the page
      Given  the roster is encrypted, and decrypting it is a function call away
      When   that script tries to run
      Then   the browser refuses it, because it carries no nonce

    Never:  the app's own scripts blocked along with the injected one. Removing
            `'unsafe-inline'` without a nonce blocks Next's hydration scripts
            and renders every page BLANK — and the Vitest suite could not see
            it, because nothing in jsdom loads the real document.
    Proof:  `csp.test.ts` for the policy; `scripts/csp-smoke.mjs` for the
            outcome — a real browser across seven pages, failing on any
            violation, console error or empty body. Watched go red by dropping
            the nonce. Cost measured: 8ms median, 10ms p95 per page load.

### US-50 — Nothing leaves the EU — BUILT

    As      Hôtel (contrôleur)
    I need  guest data to stay in Europe
    So that I do not need a transfer mechanism I have not signed

    Scenario: the compliance contact asks where the data is
      Given  OCR runs at Mistral in Paris
      When   the app's own functions execute
      Then   they execute in Paris too, and the answer is one country

    Never:  the region left to the platform default. It was `iad1` — US East,
            Virginia — so every uploaded roster was read on US soil.
    Never:  the region pinned only in a dashboard, where it can be changed
            without a trace.
    Proof:  `deployment-region.test.ts` — reads `vercel.json` and fails on any
            non-EU region. Watched go red with `iad1`.

## Open — stories without proof yet

These are the honest gaps. Each is a rule waiting to be written.

- **US-7** has no automated check. Nothing asserts that "Tout" contains notes,
  which is exactly how it came to omit them.
- **Every card has a visible edge in both themes.** The preview card had no
  light-theme fill for weeks and no check caught it — contrast rules test text,
  not surfaces.
- **US-P3.** The carousel is in portrait, but reading and editing a note in the
  frame is US-17's work and is not built in either orientation.
- **US-19.** The portrait metrics bar already ranks and folds
  (`compactMetrics`); the landscape one still shows everything and wraps when
  zoomed. Same mechanism, not yet carried across.
- **Names at day close.** The audit recommends replacing a name with a salted
  hash and initials when a day is closed into history — nothing in the
  analytics layer reads `name`, so nothing would regress. Not built, so the
  app still holds a rolling multi-week list of who slept in which room.
  (docs/GDPR-AUDIT.md §1.3)
- **US-48 is proven but not switched on.** The policies and their test are
  real; no code calls Supabase yet. The story is only true on the day the
  first `supabase.from()` is written, and the test is the gate for it.
- **The CSP still permits `unsafe-inline` and `unsafe-eval`.** With the roster
  encrypted, script injection is the residual path to the data, so this is the
  boundary that now matters most and no rule enforces it.
