# GDPR Audit — Check-in PWA (data processor role)

**Date:** 2026-08-23
**Repo:** `Angel225588/Check-in-` — audited against `origin/main` @ `802d30d`
**Branch:** `claude/gdpr-compliance-audit-vdkmyn`
**Baseline:** 744 tests passing across 65 files. No application code changed by the audit itself.
**Role assumed:** the hotel (Marriott property) is the **controller**; this app is the
**processor** (*sous-traitant*), Art. 28 GDPR.

> Technical audit by an engineer, not legal advice. **[FLAG]** marks items needing a
> human decision or a lawyer.

---

## 0. Two facts that frame everything

**(a) There is no server-side database.** `src/lib/supabase.ts` does not exist on
`main`, and nothing imports `@supabase/supabase-js`. Every byte of guest data lives in
`localStorage` and IndexedDB **on the reception device**. `supabase/schema.sql` is an
unapplied design document. The only candidate project in the account
(`anishbaamernlrijioic`, eu-west-3 / Paris) is **paused**; I did not restore it.

So today's tenant isolation is *device* isolation — one tablet, one hotel. That is
accidentally safe, and it is why nothing has leaked. It is also why §2 must land
**before** the first `supabase.from(...)` call, not after.

**(b) The only cloud AI provider is Mistral, EU-hosted.** `src/lib/ai/config.ts` pins
`https://api.mistral.ai` (Paris) with `mistral-ocr-4-1` and `mistral-large-2512`.
Gemini is fully gone from the runtime — only four stale comments remain. This is a
materially better GDPR posture than the previous Google pipeline and it is what the
DPA will name.

> **Correction to the first draft of this audit.** It was written against a stale
> branch that predated the Mistral migration by ~19.6k lines and reported Google
> Gemini as the sub-processor, recommended deleting `rateCode` (now load-bearing),
> and reported findings since fixed on `main`. Superseded in full by this document.

---

## 1. DATA MINIMISATION

### 1.1 Where personal data actually lives

| Store | Key | Contents | Encrypted at rest? | Retention today |
|---|---|---|---|---|
| localStorage | `dailyData_<date>` | `Client[]`, `CheckInRecord[]`, `PaxDiscrepancy[]`, capped `rawUploadText` | **No** | cleared at day close / auto-close |
| localStorage | `sessionHistory` | closed days: full `clients[]` + `checkIns[]` | **No** | **30 days** (`RETENTION_DAYS`, hardcoded) |
| localStorage | `guest_profiles` | cross-stay profiles | **No** | **forever** |
| localStorage | `gn_<hash>` | guest notes — **allergies**, preferences, events | **Yes** — AES-GCM-256 | **forever** |
| localStorage | `gn_salt` | salt for the note key derivation | n/a | forever |
| IndexedDB | `checkin-notes-key` | the AES key, `extractable: false` | n/a (non-exportable) | forever |
| localStorage | `morningBrief_<date>` | **employee** duty roster, complaints, anniversaries | **No** | **forever** |
| localStorage | `value_ledger` | monthly **counts only** — covers, off-list covers, VIP tallies, peak | n/a (no personal data) | **forever, deliberately** |


### `value_ledger` — the one store that is meant to outlive retention

Added for the monthly value report. It is the exception to "every new store goes
in `PURGEABLE_STORES`", and the exception is only defensible because of what is
NOT in it.

The report needs totals from months whose guest data is long purged, and
"covers since they started" needs all of them. The obvious way to get that is to
raise `RETENTION_DAYS` to a year — and it would work: a compacted day measures
about 7 KB against a **measured 4.9 MB** localStorage ceiling, so a year of
history is roughly half the budget. Space was never the binding constraint.
**Exposure is.** Twelve months of names, room numbers and VIP notes on a tablet
that lives on a reception desk is twelve times the breach, to print a number.

So the report keeps the counts and lets the people go. Each service is folded
into its month — covers, off-list covers, VIP attendance, busiest service, worst
quarter hour — and the guest rows are purged on the existing schedule. **No name,
no room number, no confirmation number ever reaches this store**, which is what
makes "forever" acceptable: with no personal data in it there is nothing for a
retention window to protect, and nothing for an erasure request to erase.
`value-ledger.test.ts` asserts the serialised form contains neither a guest name
nor a room number, so the property is enforced rather than merely intended.

Measured on the demo dataset: **310 bytes for a month.** A decade is under 40 KB.

Two properties it must keep:

- **Counts, never euros.** Money is derived at render time from the current
  assumptions, so re-pricing a breakfast re-prices history instead of leaving
  old months frozen at an old rate.
- **The roll-up runs before anything that deletes.** `reclaimStorageSpace` and
  `purgeExpired` both prune by age, so `recordDays` is the first call in
  `AppContext.startup()`. Behind either of them, a service ageing out on that
  load would be gone before it was counted, and the total would lose a day every
  time the window moved.

If retention is later raised anyway, this store stays useful and stays correct —
recording is idempotent per service date, so a longer window simply re-presents
days it has already counted.

`notes-crypto.ts` and `notes-store.ts` are genuinely good work — non-extractable
CryptoKey, a hashed storage key so `gn_524_POLANCO` never appears, and an honest
threat model in the header that declines to overclaim. **That is the standard the rest
of the storage layer should be held to, and currently isn't.**

### 1.2 Per-field analysis

The test is the one you set: **could this work with a room number and an entitlement
status instead of a guest name?**

| # | Field | Actual use, verified on `main` | Verdict | Recommendation |
|---|---|---|---|---|
| 1 | `confirmationNumber` | Never rendered. Copied through `vip.ts`, `storage.ts`, `parser.ts`. One functional use: a component of the chunk-dedup key (`ocr-helpers.ts:94`). | **DELETE** | Stop extracting. Re-key dedup on `room + name`. It is the field that links most directly back to the Marriott PMS reservation — highest value per unit of effort. |
| 2 | `rtc` | Never rendered. Parsed in `parser.ts` / `mistral-parser.ts` only. | **DELETE** | Remove from type, parsers, column map. |
| 3 | `reservationStatus` | Never rendered. Parsed only. | **DELETE** | Remove. |
| 4 | `roomType` | Never rendered anywhere. Only parsed, merged in `vip.ts`, copied in `storage.ts`. | **DELETE** | Remove. |
| 5 | `rateCode` | **Load-bearing.** `groups.ts:83` keys group blocks on `rateCode + arrival + departure`; rendered by `GroupPicker` and `DayGroups`. | **KEEP** | *(The first draft wrongly said delete — that was true only on the stale branch.)* |
| 6 | `arrivalDate` / `departureDate` | **Load-bearing.** Group-block key, plus rendered on `GuestPreviewCard`, `DataTable`, the check-in card, `DayGroups`. | **KEEP** | |
| 7 | `name` | Alpha search, shared-room disambiguation, check-in card, note key derivation, reports. | **KEEP live, PSEUDONYMISE at close** | See §1.3. The single highest-value change in this audit. |
| 8 | `roomNumber` | Primary key of the app. | **KEEP** | |
| 9 | `packageCode` | Drives `isComp()` and the "must ask for payment" branch. | **KEEP** | This **is** the entitlement status — the answer to your framing question. |
| 10 | `adults` / `children` | Cover counts, KPIs, cost-per-cover. | **KEEP** | Counts only, never names. `children` is data about minors — keep it a number. |
| 11 | `isVip` / `vipLevel` | Badge on card and report. | **KEEP** | A loyalty tier is an entitlement. |
| 12 | `vipNotes` | Free text from the VIP sheet: "all specials and preferences combined". | **CONFIRMED Art. 9 risk** | See §1.4. |
| 13 | `vipSource` | walk-in vs list. | **KEEP** | Non-identifying. |
| 14 | `paymentAction` / `viaBox` | Payment routing and takeaway-box flag. | **KEEP** | No PAN involved — routing choice only. Verified. |
| 15 | `PaxDiscrepancy` | Records that the sheet said 1 and 3 arrived. Carries `clientName`. | **REDUCE** | The error-rate metric needs the delta, not the name. Drop `clientName`, keep `roomNumber`. |
| 16 | `rawUploadText` | Verbatim OCR dump, capped at 30k chars, shown in a debug view. | **DELETE at close** | Already `compactSession()`-stripped from history — good. Still an unstructured copy of everything for the live day, including guests who never came. |
| 17 | `CheckInRecord.clientName` | Denormalised name copy. | **REDUCE** | After §1.3 this is the last name-bearing record in history. |
| 18 | `GuestProfile.*` | `visitCount`, `firstVisit`, `lastVisit`, `roomHistory[5]`, `birthday`, `notes`. | **[FLAG] — you chose "keep as-is, document"** | §1.5. |
| 19 | `GuestNote.*` + `author` + `revisions[]` | Allergies and preferences, with author and edit history. | **KEEP, add retention** | Encrypted, and `author` gives real accountability. But **never purged** — an allergy note outlives the stay indefinitely. |
| 20 | `MorningBrief.*` | Duty roster, complaints, internal anniversaries. | **SEPARATE REGIME** | **Employee** data, not guest data. Different lawful basis, and in France plausibly CSE/works-council territory. Never purged. **[FLAG]** |

### 1.3 The core recommendation: names are needed *during* service, not after

Nothing in the analytics layer reads `name`. I checked every consumer —
`monthly-stats`, `kpi-math`, `rush-buckets`, `report-v2`, `package-forecast`,
`metric-*` — all operate on counts.

Proposed: at `closeDay()` / `autoCloseStale()`, before writing to `sessionHistory`,
replace `name` with salted-hash + display initials (`"MARTIN, Jean"` → `"M., J."`) and
drop `rawUploadText`. Reuse the existing `gn_salt` derivation so notes still resolve.

Only two features touch plaintext names historically — `getClientHistory()` and the
returning-guest badge — and both work off the hash instead.

**Net:** the app stops holding a rolling multi-week list of who slept in which room at
a Marriott property, and loses no number the business uses. This is the
recommendation I would push hardest.

### 1.4 `vipNotes` and Article 9 — now CONFIRMED, not a maybe

The first draft flagged this as *possible*. Reading `main` settles it: allergies are a
**designed, first-class feature**. `notes.ts` defines `tone: "alert"`,
`shouldPinByDefault()` auto-pins it, `PinnedNoteChips` surfaces it without opening
anything, and the code comments are explicit — *"a severe allergy that sorts below
three loyalty notes is an allergy nobody reads."*

That is **health data under Art. 9**, processed deliberately and correctly for guest
safety. This is not a defect — it is the right product decision. But it raises the
compliance bar, and it must be stated plainly rather than buried:

- The DPA and the register must name special-category data explicitly.
- The Art. 9 condition is the **controller's** to establish (Art. 9(2)(a) explicit
  consent at booking, or vital interests). As processor you inherit the obligation to
  handle it, not to justify it.
- It materially strengthens the case that a **DPIA** is warranted. **[FLAG]**
- Mitigations already in place and worth crediting: AES-GCM-256 at rest, hashed
  storage keys, notes excluded from logs.
- Still missing: notes are **never purged**, and `vipNotes` (the OCR-extracted field,
  as opposed to typed notes) is **not** encrypted — it sits in plaintext inside
  `dailyData_*` and `sessionHistory`. **That asymmetry is the real finding here:**
  the allergy a receptionist types is encrypted; the same allergy arriving on the VIP
  sheet is not.

### 1.5 Guest profiles — your decision recorded

You chose **keep as-is and document**. Recorded, and reflected in the register and the
DPA. For the record, the residual risk you are accepting:

`recordGuestVisit()` builds a permanent, unbounded record of how many times a named
person stayed, when they first and last came, and their last five room numbers. It is
the one feature that serves the hotel's recognition interest rather than the breakfast
service, and it is the first thing a hotel DPO will ask about.

Consequences of the choice, which the documents now carry:
- The register lists it as a distinct processing activity with **no time limit**.
- The controller must state its own lawful basis for it.
- It must be reachable by the erasure endpoint (§4) — which it will be.
- Erasure requests become **more** frequent to serve, not less, because the data
  outlives the stay.

I would still recommend the 90-day window over "forever", but it is your call and I
have implemented what you asked.

---

## 2. MULTI-TENANT ISOLATION — **CRITICAL (latent)**

Not exploitable today (§0a). Catastrophic the day Supabase is wired up.

### C1 — RLS is enabled and then neutralised
`supabase/schema.sql:105-116` enables RLS on all five tables, then:
```sql
create policy "Allow all on clients" on clients for all using (true) with check (true);
```
`enable row level security` followed by `using (true)` is **functionally identical to
no RLS**. The file's own comment says "permissive for now — tighten later".

The intended key is `NEXT_PUBLIC_SUPABASE_ANON_KEY` — by design shipped to every
browser. Applied as written, **any user at any hotel could read every guest row of
every other hotel with one `fetch`.**

### C2 — Nothing to scope a policy *by*
`property_code` exists on `sessions` only. `clients`, `check_ins`, `pdf_uploads`,
`billing_records` reach a tenant through a `session_id` join. Join-based policies are
writable but slower and easy to get subtly wrong. **Recommend a denormalised
`property_code text not null` on all five tables**, enforced by trigger.

### C3 — No authentication exists
No login, no `auth.uid()`. The only gate is `API_AUTH_TOKEN` in `middleware.ts:45`,
which is **optional** (`if (apiToken)`) and a single shared secret across all hotels if
set. If unset in Vercel, every OCR route is open to the internet and anyone can burn
your Mistral key.

**RLS scoped by hotel is impossible to write until an authenticated identity carries a
property claim.** This is a prerequisite, not a parallel task.

### Fix, and how it is proven
1. Supabase Auth, one account per property, `property_code` as a JWT claim.
2. `property_code text not null` on all five tables + trigger to derive it.
3. Per-verb policies scoped `property_code = auth.jwt() ->> 'property_code'`, with
   `with check` on every write.
4. **Revoke all grants to `anon`.**
5. `security_invoker = on` on views; `security definer` functions filter explicitly —
   a `security definer` RPC bypasses RLS and is the classic hole left behind after the
   table policies look correct.
6. **The test.** You said "no idea" what to run it against — decided: a **real local
   Postgres 16**, no Docker or Supabase CLI needed, so it runs in CI. Supabase's
   `auth.jwt()` reads `request.jwt.claims`, so a faithful stand-in is exact. It asserts
   hotel A sees zero of hotel B's rows via direct select, every view, and every RPC;
   that a forged `property_code` write is rejected by `with check`; and it enumerates
   views and functions from `pg_catalog` so **a new one added later fails the test by
   default** rather than being silently uncovered.

---

## 3. RETENTION — partial

Better than the first draft reported. `pruneByAge()` (`storage.ts:490`) is real, is
tested, and handles junk and future dates sensibly.

| Store | Covered? |
|---|---|
| `sessionHistory` | **Yes — 30 days**, but `RETENTION_DAYS = 30` is a hardcoded const |
| `dailyData_*` | Yes, via close / auto-close |
| `guest_profiles` | **No — forever** |
| `gn_*` notes (incl. allergies) | **No — forever** |
| `morningBrief_*` | **No — forever** (employee data) |

Gaps: not configurable; three of five stores uncovered; no purge log.

> **[FLAG] — you asked for a default of 90 days; the app currently keeps 30.**
> Implementing your instruction **triples** the window and is a step *away* from
> minimisation. I have built it configurable with a 90-day default as asked, but I
> recommend setting it to 30 in production. The knob is one env var.

---

## 4. ERASURE AND EXPORT — absent

Nothing exists. A guest asking a hotel to erase their data cannot be served, and the
hotel cannot extract its own data. Art. 28(3)(e) (assisting with data-subject rights)
and 28(3)(g) (return or delete at end of contract) are both unmet.

---

## 5. ACCESS LOGGING — partial

`GuestNote.author` and `NoteRevision{at, author, summary}` are real accountability for
*notes* — who wrote what, when, and an edit history. Credit where due.

Everything else is unlogged: no record of who viewed a guest, ran a search, checked
someone in, or exported a report. `check_ins.checked_in_by` exists in the schema and
**nothing populates it**. Access logs must also be retained **separately from and
outliving** the data, or the purge destroys the evidence of who touched it.

---

## 6. ENCRYPTION

| Layer | Status |
|---|---|
| Browser ↔ Vercel | **OK** — HTTPS, HSTS `max-age=63072000; includeSubDomains; preload` |
| Vercel ↔ Mistral (Paris) | **OK** — TLS, server-side only, key never reaches the browser |
| Supabase at rest | **N/A today**; AES-256 platform default when adopted |
| Guest **notes** at rest | **OK** — AES-GCM-256, non-extractable key in IndexedDB, hashed keys |
| Roster at rest (`dailyData_*`, `sessionHistory`) | **OK** — AES-GCM-256 via `secure-store.ts` |
| `vipNotes` at rest | **OK** — encrypted with the roster it travels in |
| `guest_profiles`, `morningBrief_*` at rest | **OK** — same store |
| Uploaded files in storage | **N/A** — no bucket in use; `pdf_uploads.file_url` unused |

~~**The asymmetry is the finding.**~~ **RESOLVED 2026-08-26.** The roster now uses the
same scheme as the notes. Two consequences worth recording:

- The app unlocks itself on open — a non-extractable key in IndexedDB, no
  password, no change to reception's morning. Measured at ~56ms for a full
  house across a 90-day window on a development machine; the real per-device
  figure is printed in the nav drawer, because an estimate is not a measurement.
- The envelope gzips before encrypting, so a 90-day window fell from **4.1MB to
  186KB — a 22x reduction.** iPad quota exhaustion was an existing failure mode
  for this app, so the privacy fix also removed a reliability one.

Same bounded threat model as `notes-crypto.ts`, deliberately: it defends against
a storage dump, a device backup, and XSS scraping localStorage. It does not
defend against code running in the page that calls `secureGet` itself.

Related: CSP still allows `script-src 'unsafe-inline' 'unsafe-eval'`. With plaintext
PII in `localStorage`, XSS containment *is* an at-rest control — `notes-crypto.ts`
says so itself. The CSP also still allows `connect-src ... generativelanguage.googleapis.com`,
which is **stale** — Gemini is gone. Remove it.

---

## 7. Other findings

| ID | Sev | Finding |
|---|---|---|
| M1 | Med | **Partly addressed, and the naive fix was worse.** A bearer token cannot gate an API called by an unauthenticated PWA's own browser. Same-origin now blocks curl and other sites (403); a forged `Origin` still passes. Real protection needs C3. |
| M2 | Med | Rate limiter is an in-memory `Map` — per-instance, resets on cold start, ineffective across Vercel's fleet. |
| M3 | Med | CSP `connect-src` still allows the retired Gemini endpoint. |
| L1 | Low | `CLAUDE.md` says "91 tests across 5 files"; actual is **744 across 65**. It also still says "Gemini 2.5 Flash Vision API" — stale since the Mistral migration. |
| L2 | Low | Four stale Gemini comments in `ocr-pdf/route.ts`, `ocr-morning-brief/route.ts`, `pdf-split.ts`, `ocr-helpers.ts`. |
| ✅ | — | **Fixed on `main` since the first draft:** `/debug` now refuses in production; `rawUploadText` capped at 30k and stripped from history; retention window exists; Gemini removed. |

---

## 8. [FLAG] Not confident — do not let these pass silently

1. **Mistral API terms.** I have not verified whether your Mistral plan excludes
   submitted data from training, or its stated retention for OCR uploads. EU hosting
   solves residency, **not** retention or training. Must be confirmed against your
   actual contract before the DPA is signed — I will not assert it in a legal document.
2. **Vercel function region.** Not pinned in `next.config.ts`. If functions run in
   `iad1` (US default), guest data transits the US and needs a transfer basis. Fix is
   a one-line `vercel.json` region pin to `cdg1`; I could not verify the current setting.
3. **Who signs.** Marriott franchised vs managed properties differ. The DPA
   counterparty may be the property, the management company, or Marriott International.
4. **The `localOCR` "Marriott-confidential mode" flag** implies someone already
   suspected sending this data to a third-party AI may breach a Marriott contract.
   **That contract question is prior to the GDPR question** and I cannot see the contract.
5. **DPIA.** With Art. 9 allergy data (§1.4) confirmed *and* indefinite cross-stay
   profiling retained by your choice (§1.5), my read is that a DPIA is now **more
   likely than not** required. Lawyer call.
6. **CNIL / French specifics**, and works-council implications of the `morningBrief`
   employee data. Out of my depth — flagged for counsel.

---

## 9. Remediation — status

| # | Item | Status |
|---|---|---|
| 1 | Delete the four dead fields | **Done** — `confirmationNumber`, `rtc`, `reservationStatus`, `roomType` removed from types, both parsers, the VIP merge, storage and the seeder. Chunk dedup re-keyed on room + name. Ratcheted by `data-minimisation.test.ts` |
| 2 | Encrypt roster and `vipNotes` at rest | **Done** — `secure-store.ts`. Names, room numbers, VIP preference text, guest profiles and morning briefs are all AES-GCM-256 at rest, reusing the non-extractable note key. Verified by mutation: writing plaintext turns 4 assertions red |
| 3 | Pseudonymise names at day close | **Not done** — §1.3 stands as the recommendation |
| 4 | Configurable retention + full purge + purge log | **Done** — `NEXT_PUBLIC_RETENTION_DAYS`, default 90, clamped 1–730. Purge covers all five stores; runs on load; idempotent; logged |
| 5 | Erasure + export, per guest and per property | **Done** — `src/lib/privacy/subject-rights.ts`. API routes answer 503 with a reason while data is device-local |
| 6 | Access logging, retained separately | **Done** — salted-hash subject, append-only, 365-day window untouched by the guest-data purge |
| 7 | API access control; CSP | **Done, after a wrong turn.** Failing closed on a missing `API_AUTH_TOKEN` **took the app down** — no deployment sets it, so every OCR upload returned `server_misconfigured`. Setting it would have failed too: these routes are called by the tablet's own browser, which sends no Authorization header, and a secret the browser must present is not a secret. The token is now optional (server-to-server), with **same-origin enforced** otherwise. That narrows drive-by abuse of the Mistral key; it is **not authentication** — that remains C3, open until Supabase Auth. CSP: see §6 |
| 8 | Supabase isolation + the A-cannot-read-B test | **Done** — schema rewritten with a tenant claim, per-verb scoped policies, forced RLS, revoked `anon`, `security_invoker` views. Proven by 25 assertions against a real Postgres, enumerating views and functions from `pg_catalog`. Verified by mutation: restoring the old permissive policies turns 19 red. CI runs it and fails if the suite skipped itself |
| 9 | Legal documents | **Drafted** — `/legal`, marked for lawyer review |

Still outstanding: **item 3** (pseudonymise names at day close), and one
configuration item in §8 — confirming Mistral's contractual terms on training
and upload retention. The Vercel region is resolved.

### Original ordering, for reference

Ordered by risk removed per unit of work.

1. Delete the four dead fields (`confirmationNumber`, `rtc`, `reservationStatus`,
   `roomType`) — pure deletion, no feature loss. *(§1.2)*
2. Encrypt the roster and `vipNotes` at rest, reusing `notes-crypto.ts`. *(§6)*
3. Pseudonymise names at day close. *(§1.3)*
4. Configurable retention + extend the purge to notes, profiles and morning briefs +
   a purge log. *(§3)*
5. Erasure + export, per-guest and per-property. *(§4)*
6. Access logging, retained separately. *(§5)*
7. `API_AUTH_TOKEN` fails closed; CSP cleanup. *(§7)*
8. Supabase isolation — auth, `property_code`, real policies, and the executable
   A-cannot-read-B test — **as a gate on the first line of Supabase code.** *(§2)*
9. Legal documents in `/legal`, naming Mistral, Supabase and Vercel.

Per the project's TDD rule, each lands as a failing test first.
