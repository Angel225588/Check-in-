# OCR Pipeline Audit — Check-in PWA

**Date**: 2026-05-09
**Status**: Pilot in progress, ~30+ days of field use

---

## 1. Current pipeline

```
                  ┌──────────────────────────┐
   Photo / PDF ──→│ POST /api/ocr (or /pdf)  │
                  └────────────┬─────────────┘
                               │
                               ▼
                    Gemini 2.5 Flash Vision API
                       (Google Cloud)
                               │
                               ▼
                       JSON response
                               │
                               ▼
                       parser.ts → save → localStorage
```

**Fallback to Tesseract.js** (browser-side) **only triggers when**:
- `GEMINI_API_KEY` env var is missing
- The endpoint returns 500 with "not configured"

---

## 2. Risks identified

### 🔴 Critical — Confidentiality

- Guest names, room numbers, payment data, VIP status are sent to Google's API.
- Google may retain inputs per their generative AI Terms (zone grise GDPR).
- No DPA (Data Processing Agreement) signed between hotel and Google for this use.
- **Marriott's Global Privacy Policy** likely conflicts with this flow.

### 🔴 Critical — Operational continuity

- If Gemini hits rate limit (10-15 PDFs in 5 min during morning rush), the app freezes.
- Tesseract fallback DOES NOT trigger on real failures (only on missing key).
- Result: morning service blocked, team reverts to paper.

### 🟠 High — Logging leakage

- `console.error("Failed to parse Gemini response:", cleaned)` (in `/api/ocr/route.ts`)
- Raw Gemini responses can contain extracted guest names.
- Vercel logs are accessible to project members.

### 🟡 Medium — No quota visibility

- No tracking of monthly Gemini API usage.
- No alert when 80% of quota reached.
- Risk of mid-month service disruption.

---

## 3. Mitigations shipped (2026-05-09)

| # | Fix | Status |
|---|-----|--------|
| 1 | Smart fallback — 2 failures → auto-Tesseract | ✅ Pending this commit |
| 2 | Settings toggle "Mode Local" — force Tesseract | ✅ Pending this commit |
| 3 | Log sanitization — strip guest names from `console.error` | ✅ Pending this commit |
| 4 | Tesseract worker pre-warm | ✅ Pending this commit |

---

## 4. V2 / Contract migration plan

### Phase A — Pilot (current)

- Keep Gemini as default for OCR speed and accuracy.
- "Mode Local" toggle available for paranoid use cases.
- Log sanitization always on.

### Phase B — Pre-contract (next 2 weeks)

- Document data flow in proposal email + DPA template.
- Offer hotel choice: "Gemini fast" vs "Local secure".
- Add cost-per-cover Gemini usage estimate to V2 pricing.

### Phase C — Contract signed

- **Default = Local OCR (Tesseract)** for new tenants.
- Gemini opt-in only with explicit Marriott data-handling sign-off.
- DPA executed with Google before any opt-in.

### Phase D — Long-term (post-V2)

- **Opera PMS API integration** — auto-sync the morning guest list.
  - Eliminates OCR entirely for properties that grant API access.
  - Direct, secure, real-time data feed.
- **On-device ML model** (Apple Neural Engine, Android NNAPI) for properties without Opera.
- Quota dashboard for ops monitoring.

---

## 5. Test scenarios

When changing OCR code, manually run:

1. **Happy path** — clean PDF → all clients extracted correctly.
2. **Rate limit** — simulate 429 from Gemini → confirm fallback to Tesseract triggers.
3. **Network down** — block API URL → confirm Tesseract takes over.
4. **No key** — unset `GEMINI_API_KEY` → confirm app uses Tesseract immediately.
5. **Garbage input** — random JPG of a wall → confirm `[]` returned, no crash.
6. **PII leak check** — trigger an error, confirm `console.error` shows only error type, no names.

---

## 6. Decision log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-05-09 | Smart fallback enabled | Tomorrow's morning service must not depend on Gemini uptime. |
| 2026-05-09 | "Mode Local" toggle added | Marriott-friendly path for confidentiality-first deployments. |
| 2026-05-09 | Log sanitization mandatory | GDPR + Marriott Data Policy. |
| TBD | Default = Local OCR | At V2 contract signature. |

---

*Maintained alongside `PROCESSES.md`. Update after every OCR-related change.*
