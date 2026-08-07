# Test pass — 2026-08-07

What to check on the tablet, in the order it makes sense to check it. Each line
says what "good" looks like, so a disagreement is a fact and not an impression.

**Before you start:** open the burger drawer and read the **build stamp at the
bottom**. If it does not match the one I sent, the tablet is on an older build
and everything below is a test of the wrong thing. Pull to refresh, or close and
reopen the installed app.

---

## 0 · The edges of the screen — **installed app, not the browser tab**

`viewport-fit: cover` gives the app the whole screen. That is what we want for
the pad, and it is a bargain: iOS still draws a clock in the top strip and an
indicator in the bottom one, and the app has to keep out of both.

| | Check | Good |
|---|---|---|
| 0.1 | **Recherche**, installed app, portrait | The burger and the metrics bar sit **below** the clock and the battery — not under them |
| 0.2 | Same, landscape | Same |
| 0.3 | **Rapport** | The back button and the date sit below the status bar |
| 0.4 | A guest screen | Same |
| 0.5 | Any screen with the pad open | The last row of keys is above the home indicator |

## 0b · The resting screen

| | Check | Good |
|---|---|---|
| 0b.1 | **Recherche** at rest, nothing typed | The Récents card **fills** the space between the search field and the commit button — no band of empty screen |
| 0b.2 | Drawer → **Aperçu au repos** off | The space is deliberately empty. That is the switch, not a fault — turn it back on if the empty screen is not what you wanted |
| 0b.3 | Type a room, then clear it | The frame is the **same size** resting and resolved; nothing jumps |

## 1 · The pad (report screen)

| | Check | Good |
|---|---|---|
| 1.1 | Open **Rapport**, tap the search field | The pad opens and **all four rows are visible** — the last row is not under the home bar |
| 1.2 | Same, tablet held **landscape** | Same |
| 1.3 | Switch to **ABC** and back | The pad keeps the same height; nothing above it jumps |
| 1.4 | With the app **installed to the home screen** | Still true — this is the case the browser tab does not test |

## 2 · The arrival list, full screen

| | Check | Good |
|---|---|---|
| 2.1 | On **Rapport**, find "Par ordre d'arrivée" → tap the **expand** button (top right of that card) | The list fills the screen |
| 2.2 | Look at the top of the sheet | Search field **and** the filter tiles (Entrés / Absents / Partiel / Groupes) |
| 2.3 | Type a room number in the sheet | The list narrows; the pad is **below** the list, not on top of it |
| 2.4 | Tap a filter tile, then **close** the sheet | The small panel behind shows the **same** filter and the **same** search — nothing was reset |
| 2.5 | Tap a row (today's report only) | It opens that guest |

## 3 · Groupes → checklist (search screen)

| | Check | Good |
|---|---|---|
| 3.1 | On **Recherche**, tap the **Groupes** pill | The list shows all group rooms, and a row of chips appears above it: **Tous · TOMEU · TOALP** (your real rate codes) |
| 3.2 | Tick one coach | Only that coach's rooms remain; the chip shows a tick |
| 3.3 | Tick the second as well | Both coaches |
| 3.4 | Untick everything | **All** the group rooms come back — never an empty screen |
| 3.5 | Tap **Tous** | Same as unticking everything |
| 3.6 | A morning with **one** coach only | No chips at all — one option is not a choice |
| 3.7 | Type a room number while Groupes is on | The chips step aside; you are searching, not filtering |

## 3b · The metrics bar and its checklist

| | Check | Good |
|---|---|---|
| 3b.1 | Funnel → tick a metric while the bar is **full** | It appears on the bar and the **last** one drops off — no unticking first |
| 3b.2 | Do it three times in a row | Total · Entrés · Restants never move; only the last slot changes |
| 3b.3 | Untick one | It leaves and the slot stays free until you tick something |
| 3b.4 | Look at **COMP** on the bar | It reads **entered / total** (e.g. 2/15), not a bare 15 |
| 3b.5 | Same for VIP, Groupes, Enfants, Non inclus | Same two numbers |
| 3b.6 | A metric the day has none of | Greyed with a dash in the checklist, never on the bar |

## 3c · Groupes on the report

| | Check | Good |
|---|---|---|
| 3c.1 | **Rapport** → tap the **Groupes** tile | The chips appear under the tiles: Tous · your rate codes |
| 3c.2 | Tick one coach | The list shows only that coach; the **tile keeps its full count** — it is the door in, not a mirror of the filter |
| 3c.3 | Expand the list full screen | The same chips are there, with the same ticks |
| 3c.4 | Untick everything | All group rooms again |

## 4 · The activity panel (guest screen) — the contrast fix

| | Check | Good |
|---|---|---|
| 4.1 | Open a guest → the side panel → **Notes** tab, **dark** mode | **Tout / Alerte / Préférence / Fidélité / Événement / Info** are all readable |
| 4.2 | Tap **Tout** | It looks selected — gold ring, gold text — and you can read the word |
| 4.3 | Same in **light** mode | Same |
| 4.4 | Tap **Info** | It looks different from an unselected chip (this was the second half of the same bug) |

## 5 · Things earlier rounds changed — worth one pass each

| | Check | Good |
|---|---|---|
| 5.1 | Guest screen, a regular with several stays | Each past stay says **how** it was paid (Inclus / Chambre / Encaissé), and "D'habitude · …" only from **3** stays up |
| 5.2 | Same guest | "**Descend vers 07:34 · 6 matins**" — and no time at all below 3 mornings |
| 5.3 | Search screen, resolve a room → tap the card | It opens that guest |
| 5.4 | Same card, **swipe** across it | It changes face and does **not** open anyone |
| 5.5 | Drawer → **Gaucher / Droitier** | The drawer itself moves to the other side |
| 5.6 | Drawer → **Liste** | The file picker opens — it does not navigate away |
| 5.7 | Drawer → **Récents** → undo an entry | Two taps to undo, in place, and the row updates |
| 5.8 | Metrics bar → the **funnel** | A checklist of what is on the bar; a metric the day has none of is greyed with a dash |
| 5.9 | A VIP on a points rate | The **points → petit-déjeuner** switch is on their screen without scrolling |
| 5.10 | Report → step back a day | **The date at the top changes with the figures** |

## 6 · The two that must never break

| | Check | Good |
|---|---|---|
| 6.1 | Open any guest and look at the address bar | **No room number in the URL** — ever |
| 6.2 | A guest with an allergy note | The alert is on the card you cannot skip past, in both orientations, whatever the preferences say |

---

## What I ran

- `npx vitest run` — 511 tests across 41 files
- `npx tsc --noEmit` — clean
- `npm run build` — clean
- `node scripts/design-rules.mjs` — **100/100**, no failures
- A scripted pass on a real build at 820×1180, 390×844 and 1194×834 measuring
  the pad's last key against the viewport, the sheet's list against the pad, and
  the group filter's row counts before/after a tick

**What a script cannot tell you:** whether the pad feels fast under a real
finger, whether the chips are readable at arm's length on the desk, and whether
the checklist is where your thumb expects it at 07:40 with a queue. That is what
this pass is for.
