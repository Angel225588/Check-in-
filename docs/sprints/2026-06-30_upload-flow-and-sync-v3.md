# Sprint — Upload flow rework + Sync v3 (active-list visibility)

**Date:** 2026-06-30 · **Owner:** Claude (Dir. of Dev) · **Trigger:** Angel field-test feedback on the Sync v2 / analyse-screens preview.

## 1. Problem statement
Three issues from the field test, in priority order:

1. **Sync regression — can't see the active list on a 2nd device.** With the same code, device B connects but the active roster doesn't appear. Roster push WORKS (43 clients in Supabase, fresh). So the fault is in **connect → pull → display**, not the push. Suspect: in `SyncDrawer.connect()` I made `pullCheckinsFromSupabase` block the roster-pull→redirect. If it errors or reorders, the redirect to `/search` is skipped → B never lands on the list.
2. **Upload flow is heavy + has a dead middle screen.** Today: upload → *full-screen* timed narration + big standalone "14s" circle → **review screen** ("Données nettoyées" table) → impact. The narration is fake (timed, not the real step), takes too much space, and the counter is a separate big circle. The review screen is redundant once the impact/resume screen exists.
3. **Impact boxes are confusing.** "À vérifier" has no link to *what* to verify. The distribution should be the real package breakdown from the doc (Total · Inclus · Comp · Groupe · Hors-liste), not an ambiguous flag.

## 2. Constraints
- Pilot reality: reception devices share **one staff code** → same code = same zero-knowledge key = can decrypt the same roster. Manager code = non-PII dashboard (counts are stored in clear). So per-code keys are fine; **no wrapped-DEK needed now** (documented as a known design point for multi-role PII later).
- Offline-first: localStorage stays authoritative; sync is additive and must never block the UI.
- Zero-knowledge preserved: PII stays ciphertext on the server and over Realtime.
- Must be testable end-to-end on preview; I can mint a throwaway location+code (pepper readable via service-role) to prove two-device myself.

## 3. Decision — target design

### A. Sync v3 — active list "just works"
- `connect()`: pull roster (blocking → drives redirect); fire `pullCheckins` **non-blocking** (never gates the redirect). Redirect to `/search` whenever the location has a roster (pulled>0 **or** roster already in cloud).
- Persistent **"Connecté · synchronisé"** indicator so staff know sync is live.
- `useLiveSync` already reconciles roster+checkins on mount/poll(12s)/Realtime/focus — keep, and make every pull failure swallow silently.

### B. Upload flow — compact, real progress, one screen less
`home → processing(compact narration) → impact/resume(distribution + list toggle + sticky CTA) → /search`. **Delete the `review` view.**
- **Compact narration** (`AnalyseProgress`): a slim card, not a full-screen list. Horizontal mini-stepper (5 dots) + current step label + **inline elapsed counter** (no separate big circle). Steps reflect the **actual** stage, driven by real `pdfUploads` status: Téléversement → Lecture (OCR) → Extraction → Doublons → Prêt.
- **Impact = the resume + review + confirm screen** (computed from the parsed doc, before save):
  - Hero "Bonjour l'équipe · voici la journée" + real "analysé en X s".
  - Big gold **TOTAL** + distribution boxes **Inclus · Comp · Groupe · Hors-liste**, **VIP** overlay, **Chambres**. **No "À vérifier", no coherence banner.**
  - **Cleaned list as a collapsible toggle** ("Données nettoyées (N)").
  - **Sticky bottom CTA**: "Démarrer la Session (N chambres)" → save + autosync + drop raw text → `/search`.

### C. Distribution (`computeImpact` rework) — strict package partition (pax)
- **Comp** = BKF COMP · **Groupe** = BKF GRP · **Inclus** = other covered (BKF INC/EXCL/GTT/UPS PDJ) · **Hors-liste** = needs payment (no bkf pkg).
- Total = Comp+Groupe+Inclus+Hors (coherent by construction). **VIP** = isVip pax (overlay). **Chambres** = rooms. Drop `aVerifier`.

## 4. Priorities / roadmap / milestones
- **P0-1 Sync v3 connect robustness** → device B sees the active list. *Milestone: two-device active-list visible on preview.*
- **P0-2 computeImpact distribution rework** (TDD). *Milestone: green test, partition sums to total.*
- **P0-3 Upload flow rework** (compact real-progress narration + counter; delete review; impact-as-resume; sticky CTA; list toggle). *Milestone: visual walk on dev server.*
- **P1 End-to-end verify on preview** (mint throwaway code → two-device sync proof; upload→narration→impact visual). *Milestone: Angel tests end-to-end.*
- **Later** Proposal/sales doc + RGPD law list + Courtyard recall message (separate task).

## 5. Verification plan
- Unit: `impact.test.ts` updated for the new partition (failing first).
- Build: `next build` + tsc + full vitest green.
- Visual: dev-server walk — compact narration shows real stages + inline counter; impact shows distribution + list toggle + sticky CTA; no review screen.
- Sync: mint throwaway location+code → device-A push + device-B connect → assert active list visible; round-trip via SQL.

## 6. DoD gates
- Failing test first for `computeImpact` partition.
- Two-device active-list proof (not a console log) before "done".
- No regression: 270+ existing tests stay green.
