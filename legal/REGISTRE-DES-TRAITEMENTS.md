# Registre des activités de traitement
## Record of Processing Activities — Article 30(2) GDPR (Processor)

> ⚠️ **DRAFT — NOT LEGAL ADVICE.** Prepared by an engineer from the application
> source code. **[LAWYER]** marks points needing professional judgement.
>
> **Basis:** `Angel225588/Check-in-`, branch `claude/gdpr-compliance-audit-vdkmyn`.
> **Prepared:** 2026-08-23. **Review due:** on any change to what is collected,
> to a sub-processor, or to the retention window.

This is the **processor's** register under Art. 30(2). Each controller (each
hotel) maintains its own Art. 30(1) register; this document supplies the facts
that hotel needs.

---

## Identification

| | |
|---|---|
| Processor | ______________________ |
| Address | ______________________ |
| Contact for data protection | ______________________ |
| Art. 27 representative | *N/A / ______________ — see [LAWYER] note in DPA §1* |
| DPO | ______________________ *(if appointed)* |

**Controllers on whose behalf processing is carried out:** hotel properties
under contract. Maintained as a separate list; each entry records legal name,
address, contact, and contract dates.

---

## Activity 1 — Breakfast entitlement check-in

| | |
|---|---|
| **Purpose (on controller's instruction)** | Verify a guest's breakfast entitlement at the restaurant door and record service |
| **Data subjects** | Hotel guests, including accompanying children |
| **Categories of personal data** | Guest name; room number; arrival and departure dates; number of adults; number of children; package code; rate code; VIP status and loyalty tier; check-in timestamp; covers served; takeaway-box flag; payment routing (points / room charge / on-site / complimentary) |
| **Special categories** | No (see Activity 2) |
| **Source** | The controller's own daily reports, uploaded as photographs or PDFs by reception staff |
| **Recipients** | Mistral AI SAS (OCR); Supabase Inc. (storage, when server deployment in use); Vercel Inc. (hosting) |
| **Third-country transfers** | **None.** OCR in Paris, hosting pinned to Paris |
| **Retention** | Configurable, default 90 days; automatic purge; 30 days recommended |
| **Security measures** | DPA Annex 2 |

**Not collected.** Confirmation/reservation number, RTC code, room type and
reservation status were previously extracted and have been removed as
unnecessary to the purpose (Art. 5(1)(c)).

**No payment card data** is processed. The payment field records only how a
breakfast is settled.

---

## Activity 2 — Guest notes (allergies, preferences, events)

| | |
|---|---|
| **Purpose** | Record and surface information reception must act on before serving a guest — above all food allergies |
| **Data subjects** | Hotel guests |
| **Categories of personal data** | Free-text note (title and body); tone (alert / preference / loyalty / event / info); author; creation and update timestamps; revision history |
| **Special categories** | **YES — Article 9 data concerning health.** Food allergies, dietary requirements, accessibility and mobility needs |
| **Art. 9 condition** | **The controller's responsibility.** Typically Art. 9(2)(a) explicit consent at booking, or Art. 9(2)(c) vital interests. Must be confirmed in writing before service begins |
| **Source** | Typed by the controller's reception staff; imported from the controller's VIP/preferences report |
| **Recipients** | Mistral AI SAS, where the note originates in an uploaded VIP report. Notes typed by staff are **never transmitted** — they stay on the device |
| **Retention** | Same window as Activity 1 |
| **Security measures** | Typed notes: AES-GCM-256 at rest with a non-extractable key; salted-hash storage keys. **Imported VIP preference text: not encrypted at rest** — see DPA Annex 2, known limitation 2 |

> **[LAWYER]** This activity is the reason a DPIA (Art. 35) may be required.
> Health data, processed systematically, about guests who are unlikely to
> expect it to reach a breakfast application. In the drafter's non-legal
> opinion a DPIA is more likely than not required, particularly in combination
> with Activity 3.

---

## Activity 3 — Returning-guest recognition

| | |
|---|---|
| **Purpose** | Recognise a returning guest and show reception a "regular / loyal" indicator |
| **Data subjects** | Hotel guests |
| **Categories of personal data** | Guest name; visit count; first visit; last visit; last five room numbers; optional birthday; optional free-text note |
| **Special categories** | No |
| **Retention** | Purged when a guest has not been seen within the retention window (measured from **last** visit, so a long-standing regular is retained while a one-off ages out) |
| **Security measures** | DPA Annex 2. **Not encrypted at rest** |

> **[LAWYER] — flagged deliberately.** This is **profiling across stays**. It
> serves the controller's guest-recognition interest rather than the breakfast
> service itself, and it is the activity a hotel DPO is most likely to
> challenge. The controller must state its own lawful basis for it. The
> supplier was advised to drop or shorten this feature and chose to retain it
> and document it, which is the reason for this entry's prominence.

---

## Activity 4 — Morning briefing (EMPLOYEE data)

| | |
|---|---|
| **Purpose** | Display the controller's daily internal briefing to reception |
| **Data subjects** | **Employees of the controller** |
| **Categories of personal data** | Names and roles on the duty roster; service anniversaries; guest complaint records naming staff; ambassador and recognition entries |
| **Special categories** | No |
| **Source** | The controller's own morning briefing document, uploaded by staff |
| **Recipients** | Mistral AI SAS (OCR); as Activity 1 |
| **Retention** | Same window as Activity 1 |

> **[LAWYER]** Employee data engages a different lawful basis from guest data,
> and in France may require works-council (CSE) information or consultation —
> particularly the complaint records, which concern individual employee
> performance. Out of the drafter's competence and flagged for counsel.

---

## Activity 5 — Access logging and audit

| | |
|---|---|
| **Purpose** | Art. 5(2) accountability — demonstrate who accessed guest data and when |
| **Data subjects** | Hotel guests (as pseudonyms); users of the application |
| **Categories of personal data** | Actor; action; resource; room number; timestamp; **subject as a salted hash — never a name** |
| **Retention** | **365 days — deliberately longer than the guest data.** A log proving who read a guest's allergy is worthless if deleted on the same schedule as the allergy |
| **Note** | Deliberately survives an erasure request. It holds no name, and it is the controller's evidence that the erasure was performed |

---

## Activity 6 — Retention purge logging

| | |
|---|---|
| **Purpose** | Evidence that the retention policy is actually applied |
| **Categories of data** | Store name; record counts; date ranges; retention window; trigger. **No personal data** |
| **Retention** | 730 days |

---

## Sub-processors

| Sub-processor | Role | Location | Data |
|---|---|---|---|
| Mistral AI SAS | OCR / text extraction | France | Uploaded report files and their contents, incl. VIP preference text |
| Supabase Inc. | Database and storage | EU (Paris, `eu-west-3`) *when in use* | All stored guest data |
| Vercel Inc. | Hosting, serverless execution | France (Paris, `cdg1`) — pinned in `vercel.json` | Data in transit; server logs |

> **[LAWYER] — three unverified items, all also in DPA §6:**
> 1. Mistral's contractual terms on model training and upload retention. EU
>    hosting is confirmed from source; the contract terms are not.
> 2. ~~Vercel's execution region~~ — resolved 2026-08-26. It was `iad1` (US
>    East); now pinned to `cdg1` (Paris). No Chapter V mechanism needed for
>    hosting.
> 3. Whether US-parent, EU-region hosting requires SCCs in the parties' view.

---

## Current storage architecture — material to this register

As of the date of this draft, guest data is stored **in the browser on the
reception device**, not on a server. Supabase is prepared but not active.

Consequences a hotel's DPO will want stated plainly:

- Data does not leave the property except during OCR (to Mistral, in France).
- Each device is naturally isolated from every other property's data.
- Deletion and export are actions performed on the device, using the tools the
  processor supplies.
- **Physical control of the reception device is a primary security control**,
  and it belongs to the controller.

---

## Change log

| Date | Change |
|---|---|
| 2026-08-23 | First version. Records removal of four unnecessary fields; addition of configurable retention, purge logging, access logging, and export/erasure; tenant-isolation policies and their automated verification |
