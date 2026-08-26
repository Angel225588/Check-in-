# Privacy Policy — Check-in

> ⚠️ **DRAFT — NOT LEGAL ADVICE.** Prepared by an engineer from the application
> source code. **[LAWYER]** marks points needing professional judgement.
>
> **Basis:** `Angel225588/Check-in-`, branch `claude/gdpr-compliance-audit-vdkmyn`.
> **Last updated:** 2026-08-23.

---

## Who this is for, and who is responsible for your data

Check-in is a tool used by hotel reception and restaurant staff to manage
breakfast service. It is supplied to hotels by ______________ ("we", "the
supplier").

**We do not decide what happens to your data.** The hotel where you are staying
does. In the language of the GDPR, the hotel is the **controller** and we are its
**processor**: we handle guest data only on the hotel's documented instructions.

If you want to exercise a right over your data, **contact the hotel**. They can
instruct us and we will act on it. If you contact us directly, we will forward
your request to the hotel rather than answer it ourselves — we are not permitted
to act on your data without their instruction.

> **[LAWYER]** This document serves two audiences that are usually separated: a
> guest reading it, and a hotel's compliance officer assessing it. Consider
> whether to split it into a guest-facing notice the hotel adopts into its own
> policy, and a supplier transparency document.

---

## What we hold about you

### From your hotel's daily reports

Your hotel prints a breakfast list each morning. Reception photographs or uploads
it, and the application reads:

- your **name**, as printed on that report
- your **room number**
- your **arrival and departure dates**
- **how many adults and children** are in your room
- your **breakfast entitlement** — the package or rate code that says whether
  breakfast is included, and any VIP or loyalty tier

### What we record during service

- the **time** you came to breakfast and **how many people** were served
- whether breakfast was taken **as a takeaway box**
- **how it was paid for** — loyalty points, charged to the room, paid on site, or
  complimentary

**We never see or store payment card details.** The application records only
which of those four routes applies.

### Notes about you — including allergies

Reception staff can record notes against your stay: a food allergy, a dietary
requirement, an accessibility need, a room preference, or an occasion such as an
anniversary. Notes may also be imported from your hotel's own VIP and
preferences report.

**Allergy and dietary information is data about your health**, which the law
protects more strictly. We handle it because knowing about a severe allergy
before serving you is a safety matter. Your hotel is responsible for having a
proper legal basis for recording it — normally your explicit consent, given when
you booked or checked in.

Notes typed by staff are **encrypted** on the device, using a key that cannot be
read out of the browser even by someone who has copied the storage.

### If you have stayed before

The application keeps a record of returning guests: your name, how many times you
have stayed, when you first and last came, and the last five rooms you have
occupied. Staff may add your birthday or a note. This is how reception sees that
you are a regular.

If you would prefer not to be recognised this way, tell the hotel and ask them to
have the record erased.

### What we deliberately do **not** collect

We used to extract your reservation/confirmation number, room type, rate class
code and reservation status. None of them affected anything the application does,
so we stopped collecting them. We hold nothing about your booking beyond what is
needed to serve you breakfast.

---

## Where your data goes

Your data stays at the hotel, with one exception.

**Reading the daily report.** To turn a photograph of your hotel's report into a
list, the image is sent to **Mistral AI**, a French company, whose servers are in
**France**. It reads the text and returns it. This is the only cloud service that
receives guest data.

Your hotel can switch on a **local reading mode**, in which the report is
processed entirely on the device and **nothing at all leaves the hotel**.

**Where the data lives.** Currently the data is stored **in the browser on the
hotel's own reception device** — not on our servers. The application also
supports a hosted database (Supabase, EU region, Paris) which some hotels may
use.

**Hosting.** The application runs on Vercel, in **Paris, France**.

**Your data does not leave the European Union.**

We do not sell your data. We do not use it for advertising. We do not use it to
train AI models, and our AI provider is contractually engaged only to read your
hotel's document and return the text.

> **[LAWYER]** The training statement must be verified against the actual
> Mistral contract before this document is published. It is stated here as the
> intended position, not as a verified fact.

---

## How long we keep it

Guest data is deleted automatically after a set period — **90 days by default**,
and hotels can set it shorter. We recommend 30 days.

Two records are kept longer, on purpose:

- a **log of who accessed guest data**, for one year. It identifies you only by a
  scrambled code, never by name. It exists so that your hotel can answer the
  question "who looked at this guest's information?" — which is usually asked
  after the information itself has been deleted.
- a **log of deletions**, for two years. It records how many records were deleted
  and when. It contains no names.

If you ask for your data to be erased, these two logs keep their entries. They
hold nothing that identifies you, and they are the hotel's proof that your
erasure was actually carried out.

---

## Your rights

Under the GDPR you can ask your hotel to:

- **see** the data held about you (Art. 15)
- **correct** anything wrong (Art. 16)
- **erase** it (Art. 17)
- **restrict** or **object to** its use (Arts. 18, 21)
- **receive it in a portable format** (Art. 20)

The application supports all of these. Ask the hotel; they instruct us; we act.

You also have the right to complain to a supervisory authority. In France this is
the **CNIL** — [www.cnil.fr](https://www.cnil.fr).

---

## How your data is protected

- Everything sent over a network is **encrypted in transit** (TLS).
- **Your name, your room number and your notes are all encrypted where they are
  stored**, with a key that cannot be extracted from the device.
- Where a hotel uses the hosted database, **each hotel can only reach its own
  data**. This is enforced by the database itself and verified by automated tests
  that attempt to read another hotel's records and must fail.
- Access to guest data is **logged**.
- Guest names are **stripped from technical logs** before they are written.

**Honestly stated:** encryption on a tablet has a limit. It means a copied
device, a backup, or a stolen storage dump gives up nothing readable. It cannot
stop code running inside the application itself, which is allowed to ask for the
data. No browser-based app can. We would rather tell you where the line is than
let you assume there isn't one.

---

## Children

Where children are part of your booking we record **only how many**, never their
names or details.

---

## Changes

We will update this policy when the application changes. The date at the top
shows the current version.

---

## Contact

| | |
|---|---|
| **Your hotel** (controller — start here) | *shown at reception* |
| The supplier | ______________________ |
| Data protection contact | ______________________ |
| CNIL | [www.cnil.fr](https://www.cnil.fr) |
