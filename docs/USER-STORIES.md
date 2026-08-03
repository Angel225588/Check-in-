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
- **Portrait.** Not designed yet; deferred until landscape is settled. No
  stories written, deliberately.
