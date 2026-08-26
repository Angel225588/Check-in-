# Accord de sous-traitance
## Data Processing Agreement — Article 28 GDPR

> ⚠️ **DRAFT — NOT LEGAL ADVICE.**
> Prepared by an engineer from the application source code. Every factual
> statement about the software is accurate as of the commit noted below; every
> *legal* formulation needs a lawyer's review before this is offered to a hotel.
> Points requiring professional judgement are marked **[LAWYER]**.
>
> **Basis:** `Angel225588/Check-in-`, branch `claude/gdpr-compliance-audit-vdkmyn`.
> **Prepared:** 2026-08-23.

---

## 1. Parties

**The Controller** ("le Responsable de traitement") — the hotel:

| | |
|---|---|
| Legal name | ______________________ |
| Registered address | ______________________ |
| SIRET | ______________________ |
| Represented by | ______________________ |
| DPO / privacy contact | ______________________ |

> **[LAWYER]** For a Marriott property, establish whether the signatory is the
> individual property, its management company, or Marriott International. A
> franchised and a managed property differ, and signing with the wrong entity
> makes the agreement unenforceable where it matters.

**The Processor** ("le Sous-traitant") — the supplier of the Check-in application:

| | |
|---|---|
| Legal name | ______________________ |
| Registered address | ______________________ |
| SIRET | ______________________ |
| Contact for data protection matters | ______________________ |

> **[LAWYER]** Whether an Art. 27 EU representative or an Art. 37 DPO is
> required depends on the Processor's own establishment and scale. Neither is
> assumed here.

---

## 2. Subject matter, duration, nature and purpose (Art. 28(3))

**Subject matter.** Processing of hotel guest data for the operation of a
breakfast check-in service at the Controller's property.

**Nature and purpose.** The Processor's application:

1. accepts photographs or PDFs of the Controller's own daily reports (breakfast
   roster, VIP/preferences list, morning briefing) uploaded by reception staff;
2. extracts the tabular contents by OCR;
3. presents a searchable list of rooms and breakfast entitlements at the
   restaurant door;
4. records who was served, how many covers, and how the breakfast was paid for;
5. stores notes recorded by reception staff about individual guests, including
   allergies and dietary requirements;
6. produces aggregate reports and statistics for the Controller.

The Processor processes the data **only on the Controller's documented
instructions**. This Agreement, together with the service contract, constitutes
those instructions.

**Duration.** For the term of the service contract, plus the return-or-deletion
period in §12.

---

## 3. Categories of data subject

- Guests of the Controller's property, including accompanying minors (recorded
  only as a **count** of children, never by name).
- Employees of the Controller named in the morning briefing (duty roster,
  service anniversaries, complaint records).

> **[LAWYER]** Employee data is a materially different processing activity from
> guest data: different lawful basis, and in France potentially subject to
> works-council (CSE) information/consultation. It is included here for
> completeness. Consider whether it belongs in a separate agreement.

---

## 4. Categories of personal data

### 4.1 Guest data

| Category | Fields |
|---|---|
| Identification | Guest name as printed on the Controller's report |
| Stay | Room number, arrival date, departure date |
| Party composition | Number of adults, number of children |
| Entitlement | Package code, rate code, VIP status and loyalty tier |
| Service record | Check-in time, covers served, takeaway-box flag, payment routing |
| Free-text notes | Notes recorded by reception staff (see 4.2) |
| Returning-guest profile | Visit count, first and last visit, last five room numbers, optional birthday and notes |

The Processor does **not** process payment card data. The "payment" field
records only how a breakfast is to be settled (loyalty points, room charge,
on-site payment, or complimentary), never a card number.

The following were previously extracted and have been **removed** from the
software as unnecessary to the purpose (Art. 5(1)(c) data minimisation):
confirmation/reservation number, RTC code, room type, reservation status.

### 4.2 Special categories (Article 9) — IMPORTANT

Guest notes and the imported VIP/preferences list **routinely contain data
concerning health**: food allergies, dietary requirements, and accessibility or
mobility needs. This is not incidental — surfacing a severe allergy to
reception before a guest is served is a designed and safety-critical function
of the application.

Accordingly:

- The Parties acknowledge that **Article 9 special-category data is processed**.
- Establishing an Art. 9(2) condition for that processing is the **Controller's**
  responsibility (typically Art. 9(2)(a) explicit consent obtained at booking,
  or Art. 9(2)(c) vital interests).
- The Processor applies the reinforced measures in §7 and Annex 2 to this data.

> **[LAWYER]** Confirm the Controller's Art. 9 condition in writing before the
> service begins. Also assess whether a DPIA (Art. 35) is required: special-
> category data combined with the returning-guest profiling in §4.1 makes one
> more likely than not, in the drafter's non-legal opinion.

---

## 5. Processor's obligations (Art. 28(3)(a)–(h))

The Processor shall:

**(a) Documented instructions.** Process personal data only on the Controller's
documented instructions, including as to international transfers, unless
required otherwise by Union or Member State law — in which case it shall inform
the Controller before processing, unless that law prohibits such notice.

The Processor shall **immediately inform** the Controller if, in its opinion, an
instruction infringes the GDPR or other data protection provisions.

**(b) Confidentiality.** Ensure that persons authorised to process the data are
bound by confidentiality obligations.

**(c) Security.** Implement the measures in Art. 32 as detailed in Annex 2.

**(d) Sub-processors.** Engage sub-processors only under §6.

**(e) Data subject rights.** Assist the Controller, by appropriate technical and
organisational measures, in responding to requests under Chapter III. The
application provides:
- export of all data held about one identified guest;
- erasure of all data held about one identified guest;
- export of all data for the Controller's entire property;
- erasure of all data for the Controller's entire property.

**(f) Assistance with Arts. 32–36.** Assist the Controller in ensuring security,
notifying breaches, and carrying out data protection impact assessments, taking
into account the nature of processing and the information available.

**(g) Return or deletion.** At the end of the service, at the Controller's
choice, delete or return all personal data and delete existing copies, unless
storage is required by law. See §12.

**(h) Audit.** Make available all information necessary to demonstrate
compliance, and allow for and contribute to audits, including inspections,
conducted by the Controller or an auditor it mandates.

> **[LAWYER]** Audit clauses are usually negotiated: frequency, notice period,
> cost allocation, and confidentiality of the Processor's environment. Nothing
> is stipulated here.

---

## 6. Sub-processors

The Controller gives **general written authorisation** for the engagement of the
sub-processors listed below. The Processor shall inform the Controller of any
intended addition or replacement, giving the Controller **thirty (30) days** to
object.

> **[LAWYER]** 30 days is a placeholder. Also settle the consequence of an
> objection — typically the Controller's right to terminate without penalty.

### Authorised sub-processors

| Sub-processor | Role | Data processed | Location | Transfer basis |
|---|---|---|---|---|
| **Mistral AI SAS** (France) | OCR and text extraction from uploaded report images and PDFs | Uploaded report files and their contents: guest names, room numbers, dates, party counts, package codes, VIP preferences (which may include allergy information) | France (`api.mistral.ai`) | Within the EU — no Chapter V transfer |
| **Supabase Inc.** | Database and file storage | All stored guest data, when the server-side deployment is in use | Configured region: EU (Paris, `eu-west-3`) | See note below |
| **Vercel Inc.** | Application hosting and serverless execution | Data in transit through the application; server logs | France (Paris, `cdg1`) — pinned in `vercel.json` | Within the EU — no Chapter V transfer |

**Notes on the table above:**

1. **Mistral is the only cloud AI provider that receives guest data.** No data is
   sent to any other AI or OCR service. The application also offers a local OCR
   mode (Tesseract, in the browser) in which **no guest data leaves the device
   at all**.

2. **Supabase — current status.** As of the date of this draft, the application
   stores data **on the reception device**, not on a server. The Supabase
   integration is prepared but not active. This row is included because it is
   the intended architecture; it must be updated to reflect reality on the day
   the agreement is signed.

3. > **[LAWYER] — UNVERIFIED, MUST BE CONFIRMED BEFORE SIGNATURE.**
   > - **Mistral's terms**: whether the Processor's plan excludes submitted data
   >   from model training, and Mistral's retention period for uploaded
   >   documents. EU hosting is confirmed from the source code; the contractual
   >   terms are not something the drafter could verify.
   > - **Vercel's region**: resolved 2026-08-26. It was `iad1` (US East,
   >   Virginia); it is now pinned to `cdg1` (Paris) in `vercel.json` and
   >   guarded by an automated test. No transfer outside the EEA arises from
   >   hosting.
   > - Whether **US-parent EU-region hosting** (Supabase, Vercel) requires SCCs
   >   in the Parties' view, notwithstanding EU data location. This is now the
   >   only open hosting question — the data itself stays in France.

---

## 7. Security measures

Set out in **Annex 2**. Summary of the principal measures:

- **In transit:** TLS on every connection, with HSTS (two years, including
  subdomains, preload) enforced by the application.
- **Guest notes at rest:** AES-GCM-256. The key is generated in the browser as a
  **non-extractable** key and held in IndexedDB; its raw bytes never exist in
  JavaScript and cannot be read out, logged, or copied to another device. Notes
  are stored under a salted hash, so the storage key itself does not reveal a
  guest's name.
- **Tenant isolation:** where the server-side deployment is in use, every table
  is protected by row-level security scoped to a verified property claim, with
  anonymous access revoked. This is verified by an automated test suite that
  attempts cross-property reads and writes and fails the build if any succeeds.
- **Retention:** a configurable window (default 90 days) with an automatic purge
  covering every store, and an append-only purge log.
- **Access logging:** every access to guest data is recorded against an actor,
  with the subject identified by a salted hash rather than a name. Retained
  separately from, and longer than, the data itself.
- **Logging discipline:** guest names and identifiers are stripped before any
  server-side log entry is written.

> **[LAWYER]** Annex 2 states what is true today, including where a measure is
> not yet in place. It should not be edited into a marketing document — an
> overstated Annex 2 is a misrepresentation in a contract.

---

## 8. Personal data breach

The Processor shall notify the Controller **without undue delay and in any event
within twenty-four (24) hours** of becoming aware of a personal data breach
affecting the Controller's data, providing the information required by Art. 33(3)
so far as it is available, and shall supply further information as it emerges.

> **[LAWYER]** 24 hours is a common commercial term chosen so the Controller can
> meet its own 72-hour obligation. Confirm it is achievable operationally before
> committing to it.

---

## 9. International transfers

The Processor shall not transfer personal data outside the EEA without the
Controller's prior written authorisation and an appropriate Chapter V transfer
mechanism.

Current position: **all processing takes place in France.** The AI
sub-processor (Mistral) is in Paris, and the application's serverless functions
are pinned to Paris (`cdg1`). See §6 note 3 for the remaining question on
Mistral's contractual terms.

---

## 10. Retention

Guest data is retained for a configurable window, **90 days by default**, after
which an automatic purge removes it from every store. Each purge is recorded in
an append-only log holding record counts and date ranges only — never names.

The Controller may set a shorter window. **The Processor recommends 30 days**,
which is sufficient for the reporting the application supports.

Retained longer, deliberately:
- **access logs** — 365 days, so that "who accessed this guest's data?" remains
  answerable after the data itself is gone;
- **purge logs** — 730 days, as evidence that retention was applied.

Neither contains a guest name.

---

## 11. Data subject rights

The Processor shall, on the Controller's instruction, and without undue delay:

| Right | Provision |
|---|---|
| Access / portability (Arts. 15, 20) | Structured export of all data for one identified guest |
| Erasure (Art. 17) | Deletion of all data for one identified guest, across every store |
| Rectification (Art. 16) | Correction through the application interface |
| Restriction / objection (Arts. 18, 21) | By instruction to the Processor |

Where the Processor receives a request directly from a data subject, it shall not
respond substantively but shall forward it to the Controller without undue delay.

**Note on erasure.** Erasing a guest deliberately leaves the access log entries
recording that the guest's data was accessed and erased. Those entries hold a
salted hash and never a name, and are the Controller's evidence under Art. 5(2)
that the erasure was carried out.

---

## 12. Return or deletion at end of contract (Art. 28(3)(g))

Within **thirty (30) days** of the end of the service, at the Controller's
written choice, the Processor shall either return all personal data in a
structured, machine-readable format, or delete it and all copies, and certify
the deletion in writing.

> **[LAWYER]** Where data is held on the Controller's own reception devices —
> which is the current architecture — deletion is an action the Controller
> performs using the tool the Processor supplies. Allocate that responsibility
> explicitly; it is unusual and it will be misread if left implicit.

---

## 13. Liability, term, governing law

> **[LAWYER]** Not drafted. Liability caps, indemnities, term, termination and
> governing law are commercial negotiations, not technical facts, and nothing
> here should be treated as a starting position. French law and the courts of
> ______________ would be the expected choice for a French property.

---

## Signatures

| The Controller | The Processor |
|---|---|
| Name: | Name: |
| Title: | Title: |
| Date: | Date: |
| Signature: | Signature: |

---

# Annex 1 — Processing details

| | |
|---|---|
| **Subject matter** | Breakfast check-in at the Controller's property |
| **Duration** | Term of the service contract + 30 days |
| **Nature** | Collection by OCR, storage, consultation, use, erasure |
| **Purpose** | Verifying breakfast entitlement, recording service, reporting |
| **Data subjects** | Hotel guests (incl. accompanying children, as counts); Controller's employees named in the morning briefing |
| **Data categories** | See §4 |
| **Special categories** | **Yes** — health data (allergies, dietary requirements, accessibility needs). See §4.2 |

---

# Annex 2 — Technical and organisational measures (Art. 32)

Stated as of 2026-08-23. **Where a measure is not in place, it says so.**

### Encryption

| | |
|---|---|
| In transit (all connections) | TLS. HSTS `max-age=63072000; includeSubDomains; preload` |
| Guest notes at rest | AES-GCM-256; non-extractable key in IndexedDB; salted-hash storage keys |
| Roster data at rest on the device | **Not encrypted** — plaintext in browser storage. See "Known limitations" |
| VIP preference text at rest | AES-GCM-256 — encrypted with the roster it travels in |
| Server database at rest | AES-256 (Supabase platform default), when the server deployment is in use |
| Uploaded files at rest | No file storage bucket currently in use |

### Access control and isolation

- Row-level security on every table, scoped to a verified property claim;
  anonymous database access revoked; RLS forced so that table owners do not
  bypass it; database views declared `security_invoker`.
- Cross-tenant isolation verified by an automated test suite (25 assertions,
  including reads, joins, writes with a forged tenant identifier, unauthenticated
  callers, every view and every function) which runs in continuous integration
  and fails the build if any cross-tenant access succeeds.
- API routes enforce same-origin: a request from another site, or from a script
  sending no `Origin`, is refused. This is a narrowing control, **not
  authentication** — see Known limitation 4.
- The diagnostic page is disabled in production.

### Accountability

- Access logging: actor, action, resource, timestamp; subject as a salted hash.
- Purge logging: counts, stores and date ranges; append-only.
- Guest names and identifiers stripped from server logs before writing.

### Resilience

- Rate limiting on API routes.
- Content Security Policy; `X-Frame-Options: DENY`; `X-Content-Type-Options:
  nosniff`; `Referrer-Policy: strict-origin-when-cross-origin`; restrictive
  `Permissions-Policy`.

### Known limitations — stated deliberately

1. **Encryption on the device is bounded by the browser.** It defends against a
   storage dump, a device backup or profile copy, and script injection that
   scrapes browser storage. It does not defend against code running inside the
   application page, which can ask for the data legitimately. No browser-side
   scheme can, and the Processor will not claim otherwise.
2. **The Content Security Policy permits `unsafe-inline` and `unsafe-eval`
   scripts.** Given item 1, script injection is the residual path to the data,
   so this is a real weakening of that boundary. Remediation is planned.
3. **Rate limiting is per-instance** and consequently less effective on a
   multi-instance serverless deployment.
4. **The application has no user authentication.** Access is controlled by
   physical access to the reception device. Access-log actors are therefore
   attributed to a device or a named role, not to an authenticated individual.

> **[LAWYER]** Item 4 is material. A Controller may reasonably require
> per-user authentication before signing, and it is the kind of gap that a
> compliance reviewer will find. It is disclosed here rather than omitted.
