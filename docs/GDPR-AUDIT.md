# GDPR Audit — Check-in PWA (data processor role)

**Date:** 2026-08-23
**Scope:** `Angel225588/Check-in-` @ branch `claude/gdpr-compliance-audit-vdkmyn`
**Baseline:** 220 tests passing across 15 files, no code changed by this audit.
**Role assumed:** the hotel (Marriott property) is the **controller**; this app is the **processor** (sous-traitant), Art. 28 GDPR.

> This is a technical audit by an engineer, not legal advice. Items marked **[FLAG]**
> need a human decision or a lawyer before they can be closed.

---

## 0. The single most important structural fact

**Supabase is not used at runtime.** `src/lib/supabase.ts` creates a client that is
imported by **zero** files. Every byte of guest data today lives in the browser's
`localStorage` on the reception device. `supabase/schema.sql` has never been verified
as applied — the only candidate project in the account
(`anishbaamernlrijioic`, eu-west-3 / Paris) is **INACTIVE/paused** and could not be
queried. I did not restore it.

This has two consequences:

1. Today's "multi-tenant isolation" is **device isolation**. One tablet, one hotel.
   That is accidentally safe, and it is why nothing has leaked yet.
2. The schema as written is a **loaded gun for the day you wire it up** (§2). The
   isolation work must land *before* the first `supabase.from(...)` call, not after.

---

## 1. DATA MINIMISATION

### 1.1 Inventory — every personal-data field the app holds

Storage keys in `localStorage`:

| Key | Contents | Lifetime today |
|---|---|---|
| `dailyData_<YYYY-MM-DD>` | full `Client[]` + `CheckInRecord[]` + `rawUploadText` | until day close / auto-close |
| `sessionHistory` | last 30 closed days, **including full `clients[]` and `rawUploadText`** | ~30 sessions, no time bound |
| `guest_profiles` | cross-stay guest profiles | **forever** |
| `morningBrief_<date>` | employee duty roster, complaints, anniversaries, VIP names | **forever** |
| `app_settings`, `app-lang`, `app-dark`, `staffCount*` | non-personal | n/a |

### 1.2 Per-field analysis and recommendation

The test for each field is the one you set: **could this work with a room number and
an entitlement status instead?**

| # | Field | What it is actually used for (verified in code) | Verdict | Recommendation |
|---|---|---|---|---|
| 1 | `confirmationNumber` | **Nothing user-facing.** Parsed, stored, copied through `vip.ts`/`storage.ts`. Only functional use: one component of the chunk-dedup key in `ocr-helpers.ts:94`. Never rendered. | **DELETE** | Stop extracting. Change dedup key to `room + name`. Highest-value, lowest-risk deletion in the app — it is the field most directly linkable back to the PMS reservation. |
| 2 | `rtc` | **Nothing.** Parsed in `parser.ts` only. Never rendered, never decides anything. | **DELETE** | Remove from types, prompts, parser. |
| 3 | `rateCode` | **Nothing.** Parsed and copied. Never rendered. (Commercially sensitive to Marriott as well as personal.) | **DELETE** | Remove. |
| 4 | `reservationStatus` | **Nothing.** Parsed in `parser.ts`. Never rendered. | **DELETE** | Remove. |
| 5 | `name` | Alpha search (`utils.ts:81`), shared-room disambiguation, the check-in hero card, guest-profile key, reports/CSV. | **KEEP for the session, PURGE at close** | Cannot be removed outright: staff verify a person verbally at a breakfast door and shared rooms are deliberately separate entries. But it does **not** need to survive the day. See §1.3. |
| 6 | `roomNumber` | The primary key of the whole app. | **KEEP** | Pseudonymous on its own; still personal data in context. |
| 7 | `packageCode` | Drives `isComp()` and the "must ask for payment" logic — **this is the entitlement status.** | **KEEP** | This field is the answer to your question: it is what the app actually decides on. |
| 8 | `adults` / `children` | Cover counts, KPI maths, cost-per-cover. | **KEEP, reduce** | Keep the numbers. `children` is a data point about minors — keep the count, never a name. |
| 9 | `arrivalDate` / `departureDate` | Rendered on the check-in card only (`checkin/page.tsx:466,470`) and the DataTable. Informational. | **REDUCE** | Departure date has genuine operational use (last-morning breakfast). Arrival date has none I can find. Drop `arrivalDate`; keep `departureDate`. |
| 10 | `roomType` | Rendered nowhere except OCR round-trip. | **DELETE** | Not personal data strictly, but unused — delete for hygiene. |
| 11 | `isVip` / `vipLevel` | Badge on the card and report. Operationally real. | **KEEP** | `vipLevel` is a Marriott loyalty tier — keep, it is an entitlement. |
| 12 | `vipNotes` | Free text. Prompt instructs the model to combine **"all specials and preferences"**. | **[FLAG] — HIGH RISK** | In hotel PMS exports this field routinely carries allergies, dietary requirements, and mobility needs — i.e. **Article 9 special-category (health) data**. The app has no special handling for it. See §1.4. |
| 13 | `vipSource` | Distinguishes walk-in vs list. | **KEEP** | Non-identifying. |
| 14 | `pendingPaymentAction` / `paymentAction` | Payment routing at the door. | **KEEP** | Not card data — only a routing choice (`points`/`room`/`pass`). Confirm no PAN ever enters here. |
| 15 | `rawUploadText` | The **entire verbatim OCR text of the hotel's daily report**, stored on the device and copied into `sessionHistory`. Rendered in a debug panel on `/report`. | **DELETE (or session-only)** | This is a second, unstructured copy of *everything* — including guests who never came to breakfast and fields you just deleted above. Deleting fields 1–4 is pointless while this blob persists. Biggest single minimisation win after the dead fields. |
| 16 | `CheckInRecord.clientName` | Denormalised copy of the name for history/reports. | **REDUCE** | Once §1.3 lands, this becomes the last name-bearing record. Replace with `clientId` reference. |
| 17 | `GuestProfile.*` (`name`, `visitCount`, `firstVisit`, `lastVisit`, `roomHistory[5]`, `birthday`, `notes`) | Returning-guest badges ("Loyal", "Frequent"). | **[FLAG] — needs a controller decision** | This is **profiling across stays with no time limit**. It is the only feature in the app that genuinely needs a persistent identity. It is also the one a hotel's DPO will ask about first. See §1.5. |
| 18 | `MorningBrief.*` (`duty`, `internalAnniversary`, `complaints`, `ambassadors`, `topVips`) | Staff briefing screen. | **SEPARATE REGIME** | This is **employee** personal data, not guest data. Different lawful basis, different retention, and in France likely CSE/works-council implications. Never purged today. |

### 1.3 The core recommendation on names

Names are needed **during** a breakfast service and essentially never after it.

Proposed model:
- During the open session: keep `name` as today. Nothing changes operationally.
- At day close (`closeDay()` / `autoCloseStale()`): **pseudonymise before writing to
  `sessionHistory`.** Replace `name` with a salted hash + display initials
  (`"MARTIN, Jean"` → `"M., J."`), drop `rawUploadText` entirely.
- All dashboards, KPI maths, monthly stats, rush-hour buckets and cost-per-cover
  work on counts — I checked, **none of them read `name`**. They will not regress.
- `getClientHistory()` and the returning-guest badge are the only two features that
  break. Both can run off the salted hash instead of the plaintext name.

Net effect: the app stops holding a 30-day rolling list of who slept in which room
at a Marriott property, while keeping every number the business actually uses.
**This is the recommendation I would push hardest.**

### 1.4 [FLAG] `vipNotes` and Article 9

`ocr-vip/route.ts:22` instructs the model to capture *"all special notes/preferences
... (e.g. Member Rate (M5), High Floor Room (H1), Non Smoking Room (N3))"*. The
examples given are benign. Real Marriott VIP/preference exports also carry allergy,
dietary and accessibility flags. If those land in `vipNotes`, the app processes
health data, and the compliance bar rises sharply (explicit Art. 9 basis, likely a
DPIA).

I cannot tell from the code which it is — it depends on the actual PDFs.
**Decision needed:** either (a) confirm with the property that preference exports
never contain health data, or (b) allow-list `vipNotes` to known codes and discard
free text. I recommend (b) regardless — it is cheap and it removes the question.

### 1.5 [FLAG] Guest profiles

`recordGuestVisit()` builds a permanent record: how many times a named person stayed,
first and last visit, their last five room numbers, plus optional birthday and free
notes. Nothing ever deletes it.

Under a processor relationship this is the hardest feature to defend, because it
serves the *hotel's* marketing/recognition interest rather than the breakfast
service. **Options, in order of my preference:**
1. Drop the feature. Cleanest.
2. Keep it, keyed on the salted hash, with the same 90-day window as everything else
   (badges degrade but still work for regulars).
3. Keep it as-is and have the controller document it in *their* record of processing
   with their own lawful basis, and expose it to erasure requests.

**This one is your call, not mine.**

---

## 2. MULTI-TENANT ISOLATION — **CRITICAL**

You called this the one that ends the company. The audit agrees, with a caveat that
buys you time: it is not live yet (§0).

### C1 — RLS is enabled but neutralised
`supabase/schema.sql` ends with:
```sql
create policy "Allow all on clients" on clients for all using (true) with check (true);
```
…on all five tables. `alter table ... enable row level security` followed by a
`using (true)` policy is **functionally identical to no RLS at all**. The file's own
comment says "permissive for now — tighten later".

Combined with the fact that the key in use is `NEXT_PUBLIC_SUPABASE_ANON_KEY` — a key
that by design ships to every browser and is readable in devtools — the day this
schema is applied and wired up, **anyone who opens the app at any hotel can read
every guest row of every other hotel** with one `fetch`.

### C2 — There is nothing to scope a policy *by*
`property_code` exists on `sessions` only. `clients`, `check_ins`, `pdf_uploads` and
`billing_records` reach a tenant only through a `session_id` join. Correct policies
are still writable (via `exists (select 1 from sessions ...)`), but they are slower,
easy to get subtly wrong, and break the moment a row is orphaned. **Recommend a
denormalised, `not null` `property_code` on all five tables**, enforced by trigger.

### C3 — There is no authentication at all
No login, no user identity, no `auth.uid()`. The only gate is `API_AUTH_TOKEN` in
`middleware.ts` — **optional** (`if (apiToken)`), and a single shared secret for all
hotels if set. If it is unset in the Vercel project, every OCR endpoint is open to
the internet: anyone can POST images and consume your Gemini key.

RLS scoped "by hotel" is **impossible to write** until an authenticated identity
carries a property claim. This is a prerequisite, not a parallel task.

### Recommended fix (proposed, not yet implemented)
1. Supabase Auth, one account per property (or a `property_code` custom JWT claim).
2. `property_code text not null` on all five tables.
3. Replace all five `using (true)` policies with
   `using (property_code = (auth.jwt() ->> 'property_code'))`, separate policies per
   verb, plus `with check` on write.
4. **Revoke** all grants to `anon` on these tables. Anonymous access should be zero.
5. `security_invoker = on` on any view; `security definer` functions must filter
   explicitly — a `security definer` RPC bypasses RLS entirely and is the classic
   hole left after the table policies are fixed.
6. **The test you asked for:** two properties, two JWTs, seeded rows on both sides,
   asserting hotel A gets exactly zero of hotel B's rows through (a) direct table
   select, (b) each API route, (c) every view, (d) every RPC — and that a *write*
   with a forged `property_code` is rejected by `with check`. Enumerating views and
   RPCs from `pg_catalog` rather than hardcoding them, so a new one added later fails
   the test by default.

**[FLAG]** That test needs a live project (or a local `supabase start` stack) to run
against. The candidate project is paused. Tell me which project is the real one and
whether I may restore it, or whether to write the test against a local stack.

---

## 3. RETENTION — currently none

- `guest_profiles`: **unbounded, forever.**
- `morningBrief_*`: **unbounded, forever** (employee data).
- `sessionHistory`: capped at 30 entries — this is a *storage* cap, not a retention
  policy. 30 entries could be 30 days or 30 months. It also only shrinks when the
  quota errors out (`closeDay()` catch blocks), which is not a control.
- `dailyData_*`: cleared on close/auto-close. This one is actually fine.
- No purge job, no logging of deletion.

**Recommended:** `RETENTION_DAYS` (default 90, configurable), a purge that runs on
app load and on a Vercel Cron for the server side, covering all four key families,
writing an append-only purge log (counts and date ranges only — never names).

---

## 4. ERASURE AND EXPORT — absent

Nothing exists today. A guest asking a hotel to erase their data cannot be served,
and the hotel cannot get its own data out except by screenshotting `/debug`.
Needed: per-guest export + erasure, and whole-property export + erasure (the
processor's Art. 28(3)(g) return-or-delete obligation at end of contract).

---

## 5. ACCESS LOGGING — absent

No log of who read or wrote guest data. The `check_ins.checked_in_by` column exists
in the schema and **nothing ever populates it** — so even check-in attribution is
lost. Access logs must be retained separately from and outlive the data itself
(otherwise the purge erases the evidence of who touched it).

---

## 6. ENCRYPTION

| Layer | Status | Note |
|---|---|---|
| Browser ↔ Vercel | **OK** | HTTPS + HSTS `max-age=63072000; includeSubDomains; preload` in `next.config.ts`. |
| Vercel ↔ Google Gemini | **OK** | TLS. |
| Vercel ↔ Supabase | **OK** | TLS. |
| Supabase at rest | **OK (platform)** | AES-256 disk encryption is standard. Unverifiable while the project is paused. |
| **Browser localStorage at rest** | **NOT ENCRYPTED** | Plaintext JSON, all guest names, on a shared reception tablet. Readable by anyone with the device, and by any XSS. **This is where 100% of your production data lives today.** |
| Uploaded files in storage | **N/A today** | `pdf_uploads.file_url` exists but no Supabase Storage bucket is in use. Nothing to encrypt yet — and nothing configured for when there is. |
| **PDFs at Google** | **[FLAG]** | `ocr-pdf/route.ts` uploads whole PDFs to the Gemini **Files API**. Cleanup exists (`deleteGeminiFile`) but at line 247 it is **not awaited** — fire-and-forget, and swallows errors. Google also retains Files API uploads server-side (documented as up to 48h) irrespective of your delete call. |

Related weakness: the CSP allows `script-src 'self' 'unsafe-inline' 'unsafe-eval'`.
Since plaintext PII sits in `localStorage`, XSS containment *is* your at-rest control,
and `unsafe-eval`/`unsafe-inline` substantially weakens it.

---

## 7. Other findings

| ID | Sev | Finding |
|---|---|---|
| H6 | High | `/debug` is **unauthenticated in production** — enumerates every `localStorage` key with sizes, and offers seed/wipe buttons. |
| M5 | Med | `middleware.ts` rate limiter is an in-memory `Map` — per-instance, resets on cold start, ineffective across Vercel's serverless fleet. Also `setInterval` at module scope in edge middleware is unreliable. |
| M6 | Med | No documented confirmation that the Gemini API tier in use excludes prompt data from model training. **[FLAG] — see §8.** |
| L1 | Low | `CLAUDE.md` says "91 tests across 5 files"; actual is **220 tests across 15 files**. |
| L3 | Low | `log-safe.ts` is good and correctly motivated — but its `potential_room` pattern is defined and never applied, so 3–4 digit room numbers still reach logs via the `name` path. |

---

## 8. [FLAG] Things I am not confident about — do not let these pass silently

1. **Mistral is not in this codebase.** You listed sub-processors as *Mistral,
   Supabase, Vercel*. The code calls **Google Gemini 2.5 Flash**
   (`generativelanguage.googleapis.com`) from all five OCR routes, with `tesseract.js`
   as a local fallback. There is no Mistral dependency, key, or endpoint anywhere.
   A DPA that names Mistral while the app sends guest data to Google is **materially
   false** and is exactly the kind of error that voids the document.
   **I need you to tell me which is true:** are you switching to Mistral (EU-hosted,
   which would be a genuinely better GDPR posture), or is the DPA list wrong?
   I have drafted nothing until you confirm.
2. **Gemini API terms.** Free-tier and paid-tier Google AI terms differ on whether
   submitted data may be used to improve the service, and on EU data residency. I am
   not confident of the current terms and will not assert them in a legal document.
   Needs verification against your actual Google Cloud / AI Studio contract.
3. **Vercel function region.** Not pinned in `next.config.ts`. If functions execute
   in `iad1` (US default), guest data transits the US and you need a transfer basis.
   Easy fix (`vercel.json` region pin to `cdg1`), but I could not verify the current
   setting.
4. **Who is the controller, and who signs.** Marriott franchised vs managed
   properties differ. The counterparty for the DPA may be the individual property,
   the management company, or Marriott International. A lawyer should confirm.
5. **The `localOCR` "Marriott-confidential mode" flag** suggests someone already
   suspected that sending this data to a third-party LLM may breach a Marriott
   contract. **That contract question is prior to the GDPR question** and I cannot
   see the contract.
6. **DPIA.** My read: not mandatory today, *unless* §1.4 (health data in `vipNotes`)
   or §1.5 (indefinite cross-stay profiling) is confirmed — either would push toward
   one. Lawyer call.
7. **CNIL specifics.** France applies national rules on top of GDPR (and the
   `morningBrief` employee data may engage works-council consultation). Out of my
   depth; flagged for counsel.

---

## 9. Proposed remediation order

Ordered by risk removed per unit of work, not by your list order.

1. **Delete the dead fields** (`confirmationNumber`, `rtc`, `rateCode`,
   `reservationStatus`, `roomType`, `arrivalDate`) and **`rawUploadText`**. Pure
   deletion, no feature loss, removes a whole class of risk. *(§1.2)*
2. **Pseudonymise at day close.** *(§1.3)*
3. **Retention window + purge job + purge log.** *(§3)*
4. **Erasure + export endpoints.** *(§4)*
5. **Access logging.** *(§5)*
6. **Lock `/debug` behind an env flag.** *(H6)*
7. **The Supabase isolation work** — auth, `property_code`, real policies, and the
   A-cannot-read-B test — **as a gate on the first line of Supabase integration
   code.** *(§2)*
8. Legal documents in `/legal`, once §8.1 is answered.

Per the project's TDD rule, every one of these lands as a failing test first.
