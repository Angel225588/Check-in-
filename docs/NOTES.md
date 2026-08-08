# Guest notes

Encrypted, per-guest notes surfaced on the check-in screen: allergies,
preferences, loyalty context, one-off events.

## Why the design is shaped this way

Every rule below traces to a specific defect, not a preference.

| Rule | The defect it prevents |
|---|---|
| The notes tab renders for **every** guest | It used to be gated on `!isFirstVisit`. A first-time guest had no route to their own notes, so an allergy recorded at booking was unreachable from the screen that decides whether they eat. |
| Alert and Event pin themselves | Requiring someone to remember to pin an allergy is a design that fails on the busy mornings it matters most. |
| Alerts sort above everything, pinned or not | The tone carries the urgency. An unpinned alert still outranks a pinned loyalty note. |
| Pinned chips capped at 3, remainder counted | The mockup left a fourth chip clipped at 75% behind a scroll gesture nobody discovers — which reads as "there is nothing more here". |
| The cap can never hide an alert | Because alerts sort first, the note pushed into `+2` is always the least urgent one. |
| A row's tone colours the whole row | Testers read an Alert and a Preference as the same card when the only difference was a 12px dot. |
| Delete sits in the header, not the thumb zone | Delete was the easiest control to hit by accident, on a screen where the accident erases an allergy. |
| Delete asks first | Same reason. One tap should not destroy a medical note. |
| Detail opens in the sidebar | The centred variant blocked the whole screen and put its close button 1029px from the thumb on a landscape iPad. `⤢` promotes it when the text is long. |

## Storage and encryption

Three files, deliberately separated so the logic is testable without a browser:

- `src/lib/notes.ts` — pure logic: tones, ordering, caps, edit history. No I/O.
- `src/lib/notes-crypto.ts` — AES-GCM 256, gzip, envelope format.
- `src/lib/notes-store.ts` — encrypted CRUD over localStorage.

### Threat model — stated plainly

**Defends against:** reading localStorage in devtools on a shared reception
iPad; a device backup or profile copy leaking note text; a localStorage export
pasted into a support ticket; XSS that scrapes localStorage. All of these yield
ciphertext only.

**Does not defend against:** code running in the page that calls
`decryptString` itself. No browser-side scheme can, and claiming otherwise
would be security theatre. The mitigations there are the strict CSP and keeping
note text out of logs.

### Why the key is meaningfully protected

The key is an AES-GCM 256 `CryptoKey` created with `extractable: false` and
stored in IndexedDB as a live key object. Its raw bytes never exist as JS
values, so they cannot be read out, logged, or copied to another device — even
by code running in the page. `crypto.subtle.exportKey` on it rejects; there is
a test asserting exactly that.

### Two separate leaks are closed

1. **The value** — encrypted.
2. **The key** — a localStorage key of `notes_524_POLANCO` would hand over the
   guest list to anyone who opens devtools, no matter how well the value is
   encrypted. Keys are a salted SHA-256 digest (`gn_<32 hex>`).

The salt is per-device and stored beside the data, so it does not hide anything
from someone who already has the device. Its job is to stop one dump's digests
being reused against another device. The encryption is what protects content.

### Envelope format

```
<version>.<iv-base64>.<ciphertext-base64>
  v1   AES-GCM over raw UTF-8
  v1z  AES-GCM over gzipped UTF-8
```

Compression runs before encryption and is kept only when it actually wins (gzip
framing makes short strings bigger). The version prefix exists so a future
format cannot silently mis-read notes written by an older build.

`decryptString` returns `null` on **every** failure — wrong key, tampered
bytes, truncated blob, unknown version. Never a partial or guessed result:
showing one guest's allergy on another guest's screen is worse than showing
nothing.

### Failure paths are silent on purpose

There is no `console.error` carrying note content anywhere in these files. A
log line with a note body would undo the encryption by writing the plaintext
somewhere far easier to read. A test drives the whole CRUD cycle with every
console method spied on and asserts nothing leaks.

### Writes fail loudly

`addNote` and friends throw when the write does not land, and the panel shows
"Note NON enregistrée — stockage plein". This is the same lesson the check-in
button already learned: a UI that says "saved" when nothing was saved is worse
than one that admits the failure.

## Handedness

Reception staff hold the tablet in whichever hand is free. The activity panel,
its trigger button, and the docked column all follow a persisted
`handSide` setting (`AppSettings.handSide`, default `left`), flipped by the
toggle in the top row.

This started as a real mismatch: the trigger sat top-**right** while the panel
slid in from the **left**, so you reached across the screen to summon something
that then appeared under your other hand.

Implementation note: the mirroring uses `flex-row-reverse`, so auto margins
(`ml-auto`) cannot be used for spacing inside those rows — they resolve against
the main axis and flip meaning. Use an explicit `flex-1` spacer.

## Tests

| File | Covers |
|---|---|
| `notes.test.ts` | Ordering, pin defaults, chip cap, validation, compaction, edit history |
| `notes-crypto.test.ts` | Roundtrip, non-extractability, IV uniqueness, tamper rejection, wrong-key rejection, compression |
| `notes-safety.test.ts` | Key opacity, no plaintext at rest, console silence, guest separation, hostile input, quota failure |

Plus design rules R10–R13, which drive the real composer in a real browser —
notes are encrypted under a non-extractable key, so there is no way to plant
one from the outside, and going through the UI is the stronger test anyway.

## Not built yet

- Sync to Supabase (everything here is device-local).
- Recurring-note suggestions (detected locally, nothing leaves the device).
- A "forget this device" action — `notes-crypto.ts` is already written so that
  deleting the IndexedDB database renders every stored note permanently
  unreadable, which is the mechanism that would back it.
