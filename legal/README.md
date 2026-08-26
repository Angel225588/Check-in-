# /legal — draft documents

**These are drafts prepared by an engineer from the codebase, not legal advice.**
They are a starting point for a lawyer, and every one of them contains
`> **[LAWYER]**` callouts marking the points where a professional decision is
needed rather than a technical one.

| File | What it is |
|---|---|
| `DPA.md` | Accord de sous-traitance (Art. 28 data processing agreement) to offer hotels |
| `REGISTRE-DES-TRAITEMENTS.md` | Record of processing activities (Art. 30) |
| `PRIVACY-POLICY.md` | Privacy policy |
| `SECURITY-SUMMARY.md` | One-page plain-language summary for a hotel's compliance contact |

## Before any of these is sent to a hotel

Four things must be settled first. They are technical facts the documents
assert, and I could not verify them from the codebase:

1. **Mistral's contractual terms** — whether the plan in use excludes submitted
   data from model training, and its stated retention for OCR uploads. EU
   hosting (confirmed: `api.mistral.ai`, Paris) solves data *residency*; it does
   not by itself answer training or retention.
2. ~~**Vercel's execution region**~~ — **RESOLVED 2026-08-26.** It was `iad1`
   (US East). Now pinned to `cdg1` (Paris) in `vercel.json`. The documents'
   "no transfer outside the EEA" statements are accurate as written.
3. **Who the counterparty is** — a Marriott franchised property, its management
   company, and Marriott International are three different signatories.
4. **Whether Marriott's own agreements permit sending guest data to a
   third-party AI provider at all.** This question comes *before* the GDPR one.

See `docs/GDPR-AUDIT.md` §8 for the full list of open items.
