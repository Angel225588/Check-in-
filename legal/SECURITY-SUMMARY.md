# Check-in — Security and Compliance Summary

**For a hotel's compliance contact. One page, plain language.**
Prepared 2026-08-23. Supplier: ______________

---

## What this application does

Reception photographs your existing breakfast list. The app reads it, shows a
searchable list of rooms at the restaurant door, and records who was served.
That is the whole job.

**Your hotel owns the data. We only handle it, on your instructions.** You are
the controller; we are the processor.

---

## What we hold about a guest

Name, room number, arrival and departure dates, how many adults and children,
and whether breakfast is included. Then what happened at service: when they
came, how many were served, and how it was paid — points, room charge, on-site,
or complimentary.

**We hold no card details.** We hold no booking reference: we used to extract
the confirmation number, room type, rate class and reservation status, found
they changed nothing the app does, and stopped collecting them.

**We hold allergies.** Reception can record a note against a guest — an allergy,
a dietary requirement, an accessibility need. That is health information, and it
is the most sensitive thing here. It is also the reason the feature exists: an
allergy nobody reads before service is a real risk to a real person.

---

## Where it goes

Two places, and no further.

**Mistral AI, in France**, reads the photograph of your report and returns the
text. It is the only cloud service that receives guest data. You can switch on a
local mode in which the reading happens on the device and **nothing leaves the
hotel at all**.

Our hosting runs in **Paris**. **Nothing leaves the EU.**

**The reception device.** Today the data lives in the browser on your own
tablet, not on our servers. That means it does not leave your property except
during the reading step above.

We do not sell it, use it for advertising, or use it to train AI models.

---

## How long it is kept

**90 days by default. We recommend you set it to 30.** Deletion is automatic and
covers everything — the daily lists, the history, guest notes, returning-guest
records and the morning briefing.

Two things are kept longer on purpose: a record of **who accessed guest data**
(1 year) and a record of **what was deleted and when** (2 years). Neither
contains a guest's name. They exist so you can answer an auditor after the data
itself is gone.

---

## How it is protected

| | |
|---|---|
| Everything over the network | Encrypted (TLS) |
| Guest notes — the allergies | Encrypted where stored, with a key that cannot be extracted from the device even by someone who copies the storage |
| Guest names on the device | Encrypted, same as the allergies |
| One hotel reaching another's data | Prevented by the database, and proved by automated tests that try to break in and must fail |
| Who looked at what | Logged, with the guest identified by a scrambled code rather than a name |
| Technical logs | Guest names removed before anything is written |

---

## Two things we want you to know before you ask

We would rather you hear these from us.

**1. Encryption on a tablet has a limit.** Everything is encrypted where it is
stored, so a copied tablet, a device backup, or a stolen storage dump gives up
nothing readable. What it cannot stop is code running inside the app itself,
which is allowed to ask for the data. No browser-based app can. We would rather
state the boundary than let you assume it is absolute.

**2. There is no individual login.** Access is controlled by physical access to
the reception tablet, so the access log attributes an action to the device, not
to a named person. If you need per-user accountability, tell us — it changes
what we need to build for you.

---

## If a guest exercises their rights

Ask us and we will act, for any guest right under the GDPR:

- **Export** everything held about one guest
- **Delete** everything held about one guest
- **Export or delete everything for your entire property** — including at the end
  of our contract

Erasure deliberately leaves the access-log entries. They contain no name, and
they are *your* proof that the erasure happened.

---

## What we need from you

1. **Confirm your legal basis for the allergy information.** Normally the
   guest's explicit consent at booking. This is yours to establish, not ours,
   and we should have it in writing before we start.
2. **Decide your retention window.** 30 days is our recommendation.
3. **Sign the data processing agreement** (Article 28). We have one drafted.
4. **Tell us who your data protection contact is.**

---

## Still open — our own list

We would rather show you this list than have you find it.

- **Our AI provider's contract terms** on data retention and model training need
  confirming in writing. The servers are in France; the contract wording is what
  remains to be nailed down.
- ~~Our hosting region~~ — **fixed 26 August 2026.** It was running in the US
  (Virginia). It now runs in Paris, pinned in our code and checked
  automatically on every build.
- **Whether a formal impact assessment (DPIA) is needed.** Because we handle
  allergy information and keep returning-guest records, our own reading is that
  one is probably required. We would rather raise it than wait for you to.

---

**Contact:** ______________ · **Full documentation:** `/legal` (data processing
agreement, register of processing activities, privacy policy) and the technical
audit at `docs/GDPR-AUDIT.md`.
