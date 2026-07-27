# Check-in — design system & rules

The premium feel of this product is not a matter of taste we re-argue every
session. It is a small set of decisions, each one made because something
concrete went wrong, and each one protected by an automated check.

Run the checks: `npm run design-rules` (starts its own server, tears it down).

---

## 1. Why the screen used to look cheap

A design review of the landscape redesign found the check-in screen was
assembling *another vendor's* visual language instead of using the one this
repo already ships. Three findings, in order of impact:

**Emoji as product iconography.** Payment methods rendered 🏨💳💵🧑‍💼; dates
rendered 🛬🛫; "breakfast not included" was the string `"☕✕"` — two glyphs
glued together, which rendered visibly broken at 40px. Emoji are a different
illustration style, drawn by a different vendor, dropped inside your brand.
One consistent stroke family reads as *designed*; a pile of emoji reads as
*assembled*.

→ Everything is now `@phosphor-icons/react` at `weight="duotone"`.

**Stock framework colours instead of the brand palette.** The CTA used
Tailwind's `green-500/600` — a cold, screen-saturated success-toast green —
against a warm cream and gold palette. The active payment state was pure
black, the only pure black anywhere on the screen.

→ Both now use tokens that already existed in `globals.css` and were simply
not being used: `--aur-good` for the CTA, `--aur-gold-soft-2` + a brand ring
for the active payment state.

**Blue-black dark mode under a warm gold brand.** `#0A0A0F` / `#14141A` read
like a different product at night.

→ Warmed to `#12100E` / `#1B1815` across all 12 files that hardcoded them.
Partial renames are worse than none: half the app warm and half blue is more
obviously broken than a consistently cold one.

---

## 2. Tokens

| Token | Value | Use |
|---|---|---|
| `--color-brand` | `#A66914` | large / decorative gold |
| `--brand-ink` | `#8F5A10` light · `#E3AA45` dark | **gold at text sizes** |
| `--aur-good` | `#2f6f4f` | the primary CTA |
| `--aur-bad` | `#a13b2c` | breakfast-not-included only |
| `--tab-idle` | `#5C564C` light · `#B4ADA1` dark | unselected tab labels |
| `--r-sm / --r-md / --r-lg` | `12 / 18 / 24px` | the only radii (buttons use `--radius-pill`) |
| `--shadow-warm-1 / -2` | warm, brand-tinted | elevation |

Two of these exist purely because measurement contradicted intuition:

- **`--brand-ink`** — `#A66914` looks like a perfectly readable gold, but it
  measures **4.44:1** on the app's glass surfaces: just under the 4.5 floor.
  Large gold stays `--color-brand`; gold *text* uses `--brand-ink`.
- **`--shadow-warm-*`** — neutral black shadows go muddy over `#FBF8F3`.
  Elevation is tinted `rgba(120,84,30,…)`.

### The VIP card

`linear-gradient(135deg, #96590F, #B57619 48%, #8A5010)` with **dark** scrims
(`bg-black/20–25`) on the chips sitting over it.

The earlier, brighter gradient peaked at `#DD9C28`, which put the 64px room
number and the guest name at **2.37:1** — under the 3:1 floor even for large
text. White scrims on top made it worse by lightening the gold further, so the
13px dates measured 3.61:1. Dark scrims *deepen* the backdrop instead. The
card ended up reading richer and less highlighter-yellow, so accessibility and
craft pointed the same direction here.

---

## 3. The rules

Each rule is a bug we shipped or nearly shipped. `scripts/design-rules.mjs`
asserts all of them against the **real rendered app** — contrast,
reachability and tap size cannot be checked from source.

| | Rule | Origin |
|---|---|---|
| **R1** | The primary CTA is reachable without scrolling | The original incident: on a landscape iPad the green button fell below the fold. Checked at 5 viewports × 2 guest types, including a 520px-tall split view. |
| **R2** | A first-visit guest shows no invented history | The UI once told a brand-new guest they were a "client fidèle · 3ᵉ séjour". |
| **R3** | A COMP guest never shows a price | Cost is dashboard information; reception must not read it aloud. |
| **R4** | Payment methods appear only when `needsPaymentChoice()` | Asking a guest to pay for breakfast they already paid for. |
| **R5** | The CTA colour is constant | It used to turn gold on a first visit — status dressed up as an action. |
| **R6** | Red is reserved for "breakfast not included" | If everything can be red, nothing is urgent. |
| **R7** | No emoji as product iconography | See §1. |
| **R8** | Every interactive element is ≥ 44×44 CSS px | Sidebar tabs were 34px tall, the close ✕ was 32px. |
| **R9** | Text meets WCAG AA (4.5:1, or 3:1 when large) | Caught the invisible selected tab, the faint active payment label, and the gold card. |

### Two things R9 gets right that a naive check does not

**Gradients.** An early version read only `backgroundColor`, so text on the
gold card was measured against whatever solid colour showed through — it
reported white-on-white at 1.06:1. It now extracts gradient colour stops and
asserts the **worst** stop, because a gradient must stay legible across its
whole span.

**Translucency.** Glass surfaces stack several semi-transparent layers. The
checker composites the whole ancestor chain down to solid RGB rather than
guessing. This is how it caught idle tabs at 4.24:1 — invisible to the eye,
one point under the line.

---

## 4. A gate that lies is worse than no gate

Two harness faults were fixed rather than worked around, because both made
the suite blame the app for its own breakage:

- **Stale chunk manifest.** Rebuilding `.next` underneath a running
  `next start` makes every asset 500; the page never hydrates and all 22
  checks "fail" with *button not found*. The gate now asserts the page
  hydrated and reports the real cause.
- **Browser death mid-suite.** 22 sequential contexts exhaust shared memory
  in a sandbox. The browser is recycled every 6 contexts.

If a check fails, it should be because the design regressed. Anything else is
a bug in the gate.

---

## 5. Open

- **Notes** is designed and mocked (`mockups/notes-flow.html`,
  `mockups/notes-detail.html`) but not built. It needs encrypted-at-rest
  storage and its own security pass before it ships.
- **A first-visit guest currently has no path to notes at all** — the tab row
  only renders when the guest has history. For a guest with an allergy and no
  prior stay, the note is unreachable. This must be fixed as part of the Notes
  build; it is a safety issue, not a polish item.
- Simulated usability testing has real limits. One morning of watching a
  receptionist work the 7am rush will surface more than another audit round.
