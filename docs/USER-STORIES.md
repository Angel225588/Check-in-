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

### US-17 — Read and write a note without leaving the queue

    As      Réception
    I need  to open, read, edit and start a note inside the preview frame
    So that the card behaves like a watch face, not a door to another screen

    Scenario: a note is on the guest in front of me
      Given  the Notes face of the carousel is showing
      When   I tap one
      Then   it opens IN the frame — readable, editable, and a new one starts
             there too, with the frame never changing size

    Never:  a full-screen panel for a one-line note during service.
    Proof:  — to be written

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

### US-21 — Filter the report to one group

    As      F&B / manager
    I need  to select a single tour block
    So that I can see how that coach behaved, not all groups at once

    Scenario: two coaches, one left early
      Given  the Groupes panel lists both
      When   I tap one
      Then   the list, and the figures that follow it, show only that block

    Never:  "Groupes" as a single on/off that lumps every tour together.
    Proof:  — to be written

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
