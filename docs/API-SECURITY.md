# API security

Companion to `docs/GDPR-AUDIT.md`. That document covers guest data; this one
covers who may call `/api`, how often, and what it may cost.

## Audit — the seven routes as they were

| Route | AI | Authenticated? | Rate limited? | Input validated? | Cost in a loop? |
|---|---|---|---|---|---|
| `/api/ocr` | Mistral OCR | Same-origin only | One shared 30/min per IP | 10 MB ✓ · client MIME ✗ · GIF+BMP allowed | Yes |
| `/api/ocr-unified` | Mistral OCR | same | same bucket | same | Yes |
| `/api/ocr-pdf` | Mistral OCR | same | same bucket | 20 MB only — **no type check at all** | Highest: OCR bills per page |
| `/api/ocr-morning-brief` | OCR + chat | same | same bucket | 20 MB per file · client MIME | Priciest per call |
| `/api/verify-extraction` | OCR + chat | same | same bucket | **`content-length` only** · unbounded entries | Yes |
| `/api/privacy/erase` | none | same | same bucket | `actor` **self-asserted** | Destructive once Supabase lands |
| `/api/privacy/export` | none | same | same bucket | `actor` **self-asserted** | Mass guest read once Supabase lands |

## What "authenticated" means here — and what it does not

**It is still not authentication.** `GDPR-AUDIT.md` §2 C3 records that this app
has no login, and `middleware.ts` explains why a shared bearer token cannot
supply one for a PWA the browser calls directly: the secret would ship inside
the bundle. Nothing here changes that. Real authentication is the Supabase Auth
work, still not shipped.

What was added is a **metering identity**: an HMAC-signed, HttpOnly,
SameSite=Lax cookie minted on page load. Nobody is prompted for anything. It
exists so rate limits and spend can be keyed on something better than an IP
address — a whole hotel behind one NAT used to share a bucket while an attacker
got a fresh one per address.

Anyone who can load the page gets a cookie, and a script that forges `Origin`
can fetch one. This raises the cost of drive-by abuse and makes spend
attributable. It does not prove who a person is.

**Deliberately public routes: none.** Five spend money; two touch guest data.

### `API_AUTH_TOKEN` is optional and additive

`.env.sample` called it "required in production". It is not, and setting it used
to 401 every upload because the tablet sends no `Authorization` header. Now: a
token that is offered and wrong is rejected; a token that is not offered falls
through to the same-origin check. Setting one cannot take the app down, and
cannot lock the browser API down either.

## Rate limiting

Two dimensions — per device identity and per IP — each with a per-route tier,
replacing the single 30/min-per-IP bucket shared by all seven routes.

| Route | Per identity | Per IP |
|---|---|---|
| `/api/ocr`, `/api/ocr-unified` | 12 / 5 min | 24 / 5 min |
| `/api/ocr-pdf`, `/api/verify-extraction` | 6 / 5 min | 12 / 5 min |
| `/api/ocr-morning-brief` | 4 / hour | 8 / hour |
| `/api/privacy/*` | 5 / hour | 10 / hour |

The IP dimension is what catches a client discarding its cookie to reset the
identity bucket.

> **Known limit.** In-memory, so on serverless the effective ceiling is
> (limit × instances) and a cold start resets it. This is why the spend cap
> exists as the hard backstop rather than the rate limit alone.

## Uploads

- **Hard per-route body limit**, enforced on real bytes. `/api/verify-extraction`
  trusted the `content-length` header, so omitting it removed the cap entirely.
- **File type decided by magic bytes**, never the extension or `Content-Type`.
  The detected type is what goes upstream. PDF, JPEG, PNG, WebP only — GIF and
  BMP were accepted and never needed.
- **Page cap before spending.** `/api/ocr-pdf` counts pages locally with pdf-lib
  before a byte is sent, so an oversized document is refused for free and the
  budget reservation uses the real page count.
- **Bounded fan-out.** `MAX_VERIFY_ENTRIES` on the array serialised into the
  verification prompt; `MAX_BRIEF_FILES` plus one *shared* byte budget across
  the brief's files, rather than N × the per-file cap.

## Spend cap

Per-property and global monthly USD ceiling that **fails closed** — including
when the ledger itself cannot be read.

Priced to Mistral's shape: **OCR bills per page, chat bills per token.**

**Reserve-then-commit, not check-then-spend.** Several uploads that each merely
checked the balance would all see room and blow through together. Each request
reserves its worst case, then reconciles to what was actually used.

A reservation is **released only if the provider was never reached**. Once a
call is made we may already have been billed — a multi-page OCR that fails
part-way still pays for the pages it processed — so a later failure keeps the
pessimistic reservation. Under-spending is the safe direction for a cap;
releasing there would let repeated failures spend without ever being counted.

> **Known limit.** The default ledger is in-memory and counts per instance. For
> a cap that holds, set `BUDGET_STORE=supabase` and apply the `ai_spend` table
> in `supabase/schema.sql`; the atomic `ai_spend_add` RPC is what makes
> concurrent instances contend on one counter. Prices are **estimates for
> budgeting, not a billing record** — reconcile against the Mistral console.

## Errors

The routes were already careful: `AiError` text is never echoed, only canned
strings. One real leak was found and fixed — every OCR route answered a missing
key with `"OCR non configuré sur ce serveur (MISTRAL_API_KEY manquant)"`,
naming both the provider and the variable to anyone who asked.

Rejections now also carry a stable machine-readable `code`. That fixed a live
bug: `PhotoCapture` decided its Tesseract fallback with
`error.includes("not configured")` while the route answered in French, so the
fallback never fired at all when the key was missing.

## Privacy routes

`actor` is a caller-supplied label — a client can put any name in it. The signed
device identity is now bound alongside it, so the audit trail records something
the caller cannot choose, and `propertyCode` must match the device's own scope
rather than whatever the body claims. Proof of a device is not proof of a
person; that arrives with Supabase Auth.

## Secrets in git history

Full-history content scan for Google/Mistral-shaped keys, OpenAI keys, JWTs,
`service_role` tokens, PEM private keys, GitHub tokens and AWS keys: **zero
hits.** `.env` and `.env.local` were never tracked. **Nothing to rotate.**

```sh
git log --all -p | grep -Ein "AIza[0-9A-Za-z_-]{20,}|sk-[A-Za-z0-9]{20,}|eyJhbGciOi[A-Za-z0-9._-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|service_role|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}"
```

## Tests

| Area | File |
|---|---|
| Magic bytes | `src/__tests__/security-magic-bytes.test.ts` |
| Rate limiting | `src/__tests__/security-rate-limit.test.ts` |
| Spend cap | `src/__tests__/security-budget.test.ts` |
| Device identity | `src/__tests__/security-identity.test.ts` |
| Error sanitisation | `src/__tests__/security-errors.test.ts` |
| Body limits + policy | `src/__tests__/security-upload-guard.test.ts` |
| Routes actually wired | `src/__tests__/security-route-wiring.test.ts` |
| Middleware end-to-end | `src/__tests__/security-middleware.test.ts` |

`security-route-wiring.test.ts` is the one that matters for new routes: the
failure mode a new endpoint introduces is not a broken check but a **missing**
one, which no test of the check itself can see. Both its central assertions
were watched going red against deliberately reverted code before being kept.
