# Devlog

Each entry: what changed, why, how it was verified, and where it lives in
ClickUp. An entry is only "done" when something automated proves it.

---

## 2026-07-27 · Landscape check-in redesign + design-rule gate

**Branch** `claude/checkin-landscape-redesign`
**ClickUp** [Refonte check-in paysage + garde-fous design](https://app.clickup.com/t/wdy2xgx36e) · Live · Marriott
**Verify** `npm run design-rules` · `npx vitest run` · `npm run build`

### Why

On a landscape iPad the green **Enregistrer** button fell below the fold —
reception could not check a guest in without scrolling. Same failure class as
the original incident (a check-in that looks possible but isn't).

### What changed

**Layout.** The main column is now a scrollable region plus a *pinned* action
box, so the CTA is reachable at any zoom or screen height. The activity
sidebar docks on tablet, becomes a drawer on phone, can be hidden manually,
and auto-collapses when the guest has no history — an empty 300px column was
stealing width for nothing. The dead space on a breakfast-included guest now
carries a calm green "rien à encaisser" confirmation.

**Visual craft.** A design review found the screen was assembling other
vendors' visual language instead of using tokens this repo already ships:
emoji as product iconography (the `☕✕` was two glyphs glued together, broken
at 40px), Tailwind's stock green fighting a warm cream palette, pure black as
the active payment state, blue-black dark mode under a gold brand. All
replaced with Phosphor icons and the existing `--aur-*` tokens. Details and
reasoning in `docs/DESIGN-SYSTEM.md`.

**Accessibility.** Tap targets raised to 44×44 minimum; WCAG AA verified on
the real render in both colour schemes.

### How it is verified

`scripts/design-rules.mjs` asserts nine invariants (R1–R9) against the
**rendered** app — contrast, reachability and tap size cannot be checked from
source. Each rule exists because of a specific bug; the mapping is in
`docs/DESIGN-SYSTEM.md`.

Two things the contrast check does that a naive one does not: it resolves
**gradients** (asserting the worst colour stop, since a gradient must stay
legible across its span) and **translucent stacks** (compositing the whole
ancestor chain to solid RGB).

### What measurement caught that review did not

| Element | Measured | Cause |
|---|---|---|
| Selected tab, dark mode | invisible | `.dark .text-dark{…!important}` in `globals.css` beat the `dark:` variant → white on white |
| Idle tabs, light mode | 4.24:1 | one point under AA — not visible as "wrong" |
| VIP gold card (number + name) | 2.37:1 | the `#DD9C28` gradient stop; fixed by deepening to bronze, which also reads richer |
| Active payment label | 4.37:1 | gold on gold — the only place gold text sits on a gold-tinted ground |

The first was reported by the user from a screenshot; the other three were
invisible to the eye and only surfaced by measuring the real render.

### Harness faults fixed rather than worked around

Three runs "failed" for reasons that had nothing to do with the design: a
stale chunk manifest (rebuilding `.next` under a running server), the browser
exhausting shared memory mid-suite, and a server started through a pipe into
`head` — which answers SSR requests but serves no static assets, so every
element measured at its unstyled size (a 1128×64 CTA reporting as 81×21).

Each is now detected and named. A gate that reports infrastructure noise as a
design regression trains you to ignore it, which is worse than having none.

### Open

- Evaluate on a real iPad via the Vercel preview before merging to `main`.
- **Recommended:** 30 minutes observing a receptionist during the 7am rush.
  Scripted testers found real defects; they cannot tell you what someone
  actually does with three guests waiting and a tablet in one hand.

---

## 2026-07-27 · Notes — designed, not built

**ClickUp** [Notes client — flux validé](https://app.clickup.com/t/wdy2xgx36g) · Sale · Roadmap
**Safety issue** [1ʳᵉ visite = aucun accès aux notes](https://app.clickup.com/t/wdy2xgx36f) · Security · Backlog

Flow is settled and mocked (`mockups/notes-flow.html`, `notes-detail.html`,
`chip-ab.html`): list → filter → add → read → edit → delete, with a centred
composer over a blurred backdrop, pinned notes surfacing as scrollable cards
on the check-in screen, and note detail opening in the sidebar (with ⤢ to
expand) so check-in stays usable while reading.

Not built. It needs encrypted-at-rest storage, the opaque-token approach for
anything identifying, and a security pass first.

**One finding blocks the build regardless of design:** the notes tab only
renders when a guest has history, so a first-time guest has *no path to their
notes at all*. For a guest with a severe allergy, the note is unreachable.
That is a safety defect, not a polish item.
