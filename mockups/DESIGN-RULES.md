# Check-in screen — design rules (verify these when we build)

State/layout invariants for the redesign. Each becomes a **Playwright/unit assertion**
in the validation gate so a regression can't ship. (This is the "verification
framework" for the redesign — the same idea as `VALIDATION.md`, applied to UI logic.)

| # | Rule | Why | How we verify |
|---|------|-----|---------------|
| **R1** | The **Enregistrer** button (and counter) are **pinned to the bottom** and fully visible at any zoom / viewport height — only the middle content scrolls. | This is the original incident: on a landscape/zoomed tablet the CTA fell off-screen and staff couldn't check anyone in. | E2E: render at several heights (e.g. 560/700/834px) and assert the button's rect is inside the viewport. |
| **R2** | **First visit ⇒ empty activity**: only the gold "Première visite" chip; no past visits, no loyalty note, no notes. A new guest cannot be a returning one. | Data consistency — a "3ᵉ séjour" tag on a first-timer is nonsense. | Unit: given `isFirstVisit`, the history list and notes render empty. |
| **R3** | The card shows **COMP** only — **never the price**. Prices live on the dashboard. | Staff at the door shouldn't see monetary amounts. | Unit/E2E: card contains "COMP", never a `€` amount. |
| **R4** | **Payment methods appear only when `needsPaymentChoice`** (VIP / off-list without breakfast). Otherwise hidden. | Breakfast is already covered for listed guests; asking to pay would be wrong. | Unit: payment block hidden unless `needsPaymentChoice(client)`. |
| **R5** | **First visit ⇒ the button is gold** (not green) until everyone in the room has entered; the gold chip in the bar confirms first-visit. Matching is by **guest identity (name + personal info), not room** (rooms change). | Visual confirmation of a new guest; identity-based so it survives room changes. | Unit: button variant = gold when `isFirstVisit && remaining>0`. |
| **R6** | Only the **red "PETIT-DÉJ NON INCLUS"** breakfast signal ever shows; the "inclus" tag is never rendered (implied by being on the list). | Less noise; the only actionable breakfast state is "not included". | Unit: no "inclus" tag in the DOM; warn tag only when not included. |

Notes taxonomy (for the notes-flow session): 🔴 Alerte · 🔵 Préférence · 🟡 Fidélité ·
🎉 Événement · ⚪ Info — pinnable, color-filterable, matched to the guest.

Reference mockup: `mockups/checkin-preview.html` (live preview published as an Artifact).
