# Reception → Restaurant pipeline — access model, user stories, test plan

**Date:** 2026-06-30 · **Purpose:** define the acceptance bar that guarantees the Marriott experience, and the access model — *before* building screens Marriott may not want.

## 1. Access model

### The crypto constraint that decides the shape
The zero-knowledge key is derived from the **access code**. So **two different codes = two different keys = they cannot read each other's encrypted roster.** This is the single most important design fact for the area model:

- **Réception uploads + encrypts** the roster. **Restaurant must read that same roster.** → They **must share the encryption key**.
- **Direction** only needs **non-PII counts** (dashboard), never guest names. → No PII key needed.

### Recommended model (ships today, no new crypto) — **2 keys, 3 doors**
- **Entry screen: Direction · Restaurant · Réception** (3 doors).
- **Réception + Restaurant share ONE operational code** (the "service" code) → same key → restaurant reads exactly what reception uploaded. The door only decides which *screen* you land on (upload vs serve).
- **Direction has its own code** → non-PII dashboard only (counts, no names).
- This delivers the reception→restaurant handoff **now**, with the security separation that actually matters (operational PII vs management).

### Full 3-code model (Réception ≠ Restaurant codes) — needs **shared-DEK** (later)
If Marriott wants reception and restaurant on **separate** codes that still share the roster, we add a **per-location data key wrapped by each code** (any valid code unwraps the same key; server only stores wrapped copies → still zero-knowledge). ~1 sprint. Build only if Marriott asks for it.

## 2. User stories (the breakfast use case)

**Réception (front desk)**
- As reception, I open the Réception door with the service code, **upload the daily report** (PDF/scan), see **"Reçu — analyse en cours"**, and walk away. Analysis + encryption + sync happen in the background.
- As reception, if I upload a second batch, it **merges** (never replaces).

**Restaurant (breakfast team)**
- As restaurant, I open the Restaurant door with the service code and immediately see **today's resume** (total couverts + Inclus/Comp/Groupe/Hors-liste) and **"Commencer le service"**.
- As restaurant, I **search a room/name**, **check a guest in**, and another station sees it **live** (no duplicate, "déjà pointé à HHh").
- As restaurant, I can **undo** a check-in and it disappears on every station.

**Direction (manager) — later, only if wanted**
- As direction, I open the Direction door and see **non-PII numbers** (covers, no-shows, comp cost, rush hour) — never guest names. I choose which metrics show.

## 3. Test plan (the "different tests" to guarantee quality)

**Happy path (must pass before any Marriott demo)**
1. Réception uploads the real PDF → Mistral (EU) reads it → resume shows correct totals + distribution. *(OCR verified live ✓)*
2. Restaurant (other device, same service code) → opens → sees the same roster → starts service.
3. Check-in on device A → device B reflects it within seconds; no duplicate. *(Sync verified ✓)*
4. Undo on A → removed on B.
5. Offline: pull the network → check-ins still work locally → reconnect → they sync. *(localStorage authoritative)*

**Edge cases (the bar that separates "demo" from "trustworthy")**
6. Same guest, two stations, same second → exactly one check-in survives (idempotent). *(proven by SQL ✓)*
7. Shared room / two names same room → kept separate.
8. Wrong code → rejected, rate-limited. *(edge function ✓)*
9. Different code than the uploader → cannot read PII (proves zero-knowledge). *(by design)*
10. Big report (300+ guests, multi-page) → all rows extracted, no truncation.
11. Lost code → data unreadable (accepted property; manager can rotate/re-provision).
12. Quota / storage pressure → never loses the open day.

**Security / RGPD bar (for the agreement)**
13. `get_advisors(security)` = clean. *(✓)*
14. No guest PII to any US service (Gemini removed from reception routes). *(✓ — vip/brief fast-follow)*
15. Raw OCR text dropped after parse; photos never persisted. *(✓)*
16. Data residency EU (Paris). *(✓)*

## 4. Sequencing — the heading

1. **Done:** OCR → Mistral (no Google on the reception flow). Sync working. Upload→resume working.
2. **Priority — proposal + security agreement (DPA).** Real guest data is now live in Supabase → the RGPD/security agreement is **time-sensitive**, and the proposal is what converts Marriott. The current pipeline already demos the value honestly. *Claude drafts; Angel sends.*
3. **In parallel — thin area-access** (2 keys, 3 doors): the reception/restaurant split as the demo backbone. **No manager dashboard until Marriott asks.**
4. **Then:** 7-day Courtyard pilot (48h dual-run, divergence 0) → scale to Btisseme's hotels.

**Why proposal before more building:** we have enough to close; Marriott's answer shapes what we build next; and the live-data clock makes the security agreement urgent. Build the thin access in parallel because it's the real product shape and makes the demo undeniable — but stop there until they commit.
