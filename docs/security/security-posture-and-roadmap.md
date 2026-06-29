# Imarketin — Security & Privacy Posture + Roadmap

**Product:** Check-in (hotel breakfast PWA) · **Owner:** Angel (CEO) + Claude (security co-founder)
**Jurisdiction:** France / EU — RGPD (GDPR), regulator **CNIL**. EU AI Act Art. 50 transparency duties live **2 Aug 2026**.
**Status date:** 2026-06-29 · **Goal level:** defensible to a French regulator *and* Marriott's security team.
**Reality check:** running **real guest data since day 1** on **localStorage across multiple browsers** at Courtyard. Securing it is now urgent and is also the unlock for the product's value.

---

## 0. Operating principle (locked — "from now on")
The order we think in, every feature, no exceptions:
1. **Security first** — what data is touched, where it lives, who can see it, what can go wrong.
2. **Protocols & use-cases** — enumerate the situations (theft, loss, attack, leak, mistake) and cover each.
3. **User need** — the one job the screen does.
4. **Hook / delight** — make it so easy and satisfying they *want* to use it.
5. **Design** — the interface falls out of 1–4. Intentional, not guessed. Inspired by Granola, Revolut, Notion, Claude, Asana.

Security is a *feature we sell*, not a tax. "Your guests' data never leaves the EU / never leaves your building" is a closing line.

---

## 1. What we protect (data map + classification)
| Data | Sensitivity | Notes |
|---|---|---|
| Guest name | **PII** | identifies a person |
| Room number | **PII** (linkable) | + presence/location pattern |
| VIP / comp / package status | PII (commercial) | reveals status |
| Allergy / dietary notes | **Special category (health, Art. 9)** | extra protection required |
| Daily report **photo** | **PII bundle** | the whole list in one image — highest-value asset |
| Access codes | **secret** | peppered + hashed, never stored raw |

**Minimization rule:** collect only what breakfast service needs; never free-text more health data than necessary; anonymize history after the retention window.

---

## 2. Where the data lives — today vs target
- **Today (risk):** browser `localStorage`, **per device, per browser**. → no central truth, no month/over-time view, no cross-staff continuity, PII scattered on unmanaged browsers, gone if a device is wiped/stolen, no audit, no erasure path.
- **Target:** single **Supabase project, eu-west-3 (Paris)** — encrypted at rest (AES-256) + in transit (TLS), **RLS** tenant isolation, audit log, offline-first cache that drains to the cloud. localStorage stays only as an **offline buffer**, not the system of record.

> The Supabase cutover *is* the security fix **and** the product unlock (central manager view, history, dashboard). Same move.

---

## 3. Threat model — situations we must cover
| # | Situation | Covered by |
|---|---|---|
| T1 | iPad/laptop lost or stolen | central cloud (not device) + scoped session + remote code rotation |
| T2 | Shared browser, wrong staff sees data | session per location + role + audit |
| T3 | Stolen/guessed access code | peppered HMAC + rate-limit + manager rotation |
| T4 | Cross-tenant leak (Hotel A sees B) | RLS deny-by-default, keyed on `location_id` |
| T5 | Secret leaked from code/git | **gap** → move pepper/keys to secret store (S1) |
| T6 | PII sent to a non-EU AI (Google) | **gap** → Mistral EU / on-prem (S3) |
| T7 | DDoS / bot flood / credential stuffing | Vercel WAF + BotID + Attack Mode + rate-limit (S5) |
| T8 | Prompt injection via uploaded image | structured-output parsing + validation + no tool exposure (S3/S5) |
| T9 | Data breach | encryption + audit + **72h CNIL notification runbook** (S5) |
| T10 | Guest exercises RGPD rights | export + erasure endpoints + retention auto-delete (S4) |

---

## 4. Decision record — OCR / AI engine
**Decision:** move OCR off **Google Gemini** → **Mistral OCR 4** (French, EU jurisdiction).
**Why:** RGPD/CNIL fit + EU AI Act timing + it's a French-sovereignty *sales asset* for a French hotel. Mistral OCR 4 returns structured output (blocks, bounding boxes, confidence), 170 languages, ~$4 / 1,000 pages (batch $2).
**Two-phase:**
- **Phase 1 — Mistral EU API** + signed DPA + documented "no training on our data." Fast to ship.
- **Phase 2 — self-hosted single container on the Paris server** (Mistral OCR 4 supports this) → **guest data never leaves our infrastructure.** Flip on when a buyer/compliance demands full sovereignty.
**Alternatives considered:**
- *Claude (Anthropic):* excellent model, API not trained on, zero-retention option — but **US-based**, so EU-residency friction. Not the compliance-winning choice for a French hotel. Keep as a possible cleanup/structuring model only if EU-resident path exists.
- *Tesseract.js (local):* keep as **offline fallback**; quality on phone photos too low to be primary.
- *Self-host from day 1:* premature ops/GPU burden for a solo founder; staged into Phase 2.
**Fallback chain:** Mistral (EU/on-prem) → Tesseract (offline) → manual entry.

---

## 5. RGPD / CNIL obligations — checklist
- [ ] Lawful basis documented · data minimization enforced
- [ ] **Storage limitation** — retention window + auto-delete/anonymize (see §8 S4)
- [ ] Data-subject rights — **access, export, erasure, rectification**
- [ ] **72h breach notification** runbook (to CNIL)
- [ ] **DPA** signed: us ⇄ hotel, and with every sub-processor
- [ ] Sub-processor register kept current (§6)
- [ ] Records of processing (RoPA) — light version
- [ ] EU data residency proven (`get_project` region assert before any write)

---

## 6. Sub-processor register
| Processor | Purpose | Residency | DPA |
|---|---|---|---|
| Supabase | DB / storage / auth | EU (Paris) | ☐ |
| Vercel | hosting / functions | EU region + WAF | ☐ |
| Mistral | OCR | EU / on-prem | ☐ (replaces Google) |
| ~~Google Gemini~~ | ~~OCR~~ | US/global | **remove** |

---

## 7. The maturity ladder — "central-bank levels"
Each rung has a **verification gate**. We do not claim a level until its proof exists.

| Level | Name | What it means | Verification gate (proof) |
|---|---|---|---|
| **L0** | Contained | We know exactly what data we hold & where; no secrets in code | data map done · secret-scan clean · pepper/keys in vault |
| **L1** | Central & encrypted | Off localStorage → Supabase EU, RLS, at-rest+transit, audit | cutover live · `advisors(security)=0` · cross-tenant test passes · region asserted |
| **L2** | Sovereign AI | No PII to non-EU; Mistral EU/on-prem; DPA signed | Google removed · round-trip OCR via Mistral · DPA on file |
| **L3** | Rights & retention | Auto-delete, erase, export, full audit | erasure endpoint round-trips · retention job deletes on schedule · export verified |
| **L4** | Hardened & monitored | WAF/BotID, rate limits, alerting, **pen-test** | WAF on · rate-limit test · independent pen-test report = no criticals |
| **L5** | Contract-ready | DPA pack, security questionnaire, breach runbook, (ISO/SOC2 path) | Marriott questionnaire answered · runbook rehearsed · cert path documented |

**Today we are ≈ L0→L1 in progress.** Marriott-signable ≈ **L4**. Central-bank-grade ≈ **L5**.

---

## 8. Roadmap — ordered sprints (one thing at a time)
Each sprint = a rung. DoD = its verification gate. No sprint "done" without attached proof.

**S1 · Contain the bleeding → L0**
- Inventory data (this doc §1) · move pepper + keys out of code into Supabase/Vercel secrets · rotate the bootstrap token · secret-scan the repo.
- *Proof:* secret-scan clean · `auth-location` works with vaulted pepper (round-trip).

**S2 · Cutover off localStorage → L1** *(biggest value + biggest risk killer)*
- Turn on sync at Courtyard · dual-run 48h · divergence detector = 0 · localStorage demoted to offline buffer.
- *Proof:* `advisors(security)=0` · cross-tenant isolation test · 48h divergence-0 · region asserted before write.

**S3 · Sovereign OCR (Mistral) → L2**
- Swap Gemini → Mistral OCR 4 (EU API) · DPA · remove Google · validate against malicious-image (prompt-injection) cases.
- *Proof:* round-trip OCR via Mistral on real reports · Google key deleted · DPA on file.

**S4 · RGPD rights & retention → L3**
- Retention auto-delete/anonymize (window TBD — §10) · erase-guest endpoint · export endpoint · audit completeness.
- *Proof:* erasure round-trips (gone on re-read) · scheduled delete observed · export matches.

**S5 · Hardening + contract pack → L4/L5**
- Vercel WAF + BotID + rate limits · independent pen-test · 72h breach runbook · Marriott security-questionnaire pack + DPA bundle.
- *Proof:* pen-test report (no criticals) · WAF/rate-limit tests · runbook rehearsed.

---

## 9. Incident & breach response (outline — built in S5)
Detect (audit + alerts) → Contain (rotate codes/keys, isolate) → Assess (what data, whose) → **Notify CNIL ≤72h** + affected hotel → Remediate → Post-mortem into BUGS.md + this doc.

---

## 10. Open decisions for Angel
1. **Retention window** — 30 / 60 / **90** days before delete-or-anonymize? (recommend 90, documented justification: operational + billing-dispute window.)
2. **Phase 2 self-host timing** — wait for Marriott to demand it, or pre-empt as a sales asset?
3. **Pilot data** — confirmed real data → S1+S2 are now P0, this week.
