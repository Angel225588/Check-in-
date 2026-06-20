# Sync Engine + Manager Access — Hardened Blueprint (2026-06-20)

> Produced by an adversarial design workflow (4 designs → 3 skeptics → hardened synthesis, 9 agents). Verified against the real code. This is the implementation contract for Phase 1+2. Build top-to-bottom per §17.

---

All adversarial premises are now confirmed against the real code:

1. **Shared-user-per-role auth** — confirmed (admin-provision line 105: `email = loc_${loc.id}_${c.role}@...`, ONE user per role, app_metadata baked at creation). `checked_in_by default auth.uid()` and `notes.author_user_id default auth.uid()` resolve to the shared user. Per-staff permissions and per-staff audit are unbuildable as drafted.
2. **Two divergent normalizers** — confirmed (`merge.ts` strong order/accent-insensitive vs `storage.ts:360` weak order/accent-sensitive).
3. **`set_updated_at` is `before update` only** (lines 184-191), no before-insert — confirmed, so re-flush bumps the clock and the LWW clock is "last to flush," not "last to edit."
4. **`sessions unique(location_id, service_date)`** with PK default `gen_random_uuid()` — confirmed; `onConflict:'id'` upsert can hit 23505.
5. **`sessions_delete_manager` allows hard DELETE** + clients/checkins `on delete cascade` — confirmed (lines 100, 129, 220).
6. **`clients` has no `device_id` column**; checkins/sessions do — confirmed.
7. **`checked_in_by default auth.uid()::text`** — confirmed (line 135). Upsert-as-update does not re-apply defaults.
8. **Project/region mismatch** — confirmed (migration header line 3: `qimhmwkmkbqxsvtayldn / eu-west-3` vs CLAUDE.md: `nkqrimicffbvnlqnzzkm / eu-central-1`).

I have everything needed to produce the final hardened blueprint.

---

# Check-in Sync Engine + Manager Access — FINAL Hardened Blueprint

This supersedes the draft. Every surviving adversarial hole is resolved inline. Read order assumed: this doc, then build top-to-bottom.

## 0. Pre-build resolutions (the draft's false premises, now fixed)

The draft inherited three assumptions the real code contradicts. These are resolved **before** any sync code:

| # | Reality (verified) | Resolution |
|---|---|---|
| R1 | `merge.ts` normalizer is order/accent-**insensitive** (`.sort().join("")`); `storage.ts:360 mergeSessionRecords` is order/accent-**sensitive**. Two normalizers ship today. | Unify on `merge.ts` (the stronger one). Refactor `mergeSessionRecords` to import it. **Behavior change → own failing test.** |
| R2 | `clientSyncId` over mutable `room+name` forks rows on every OCR correction (`updateClient` edits room at `checkin/[roomNumber]/page.tsx:158`) and resurrects via stale devices. | **Drop content-derived ids.** `Client.id = crypto.randomUUID()` minted once at first localStorage entry, immutable for life. Content key (`clientLocalKey`) is used ONLY for local dedupe and first-contact cross-device match. |
| R3 | One auth user **per (location, role)** (admin-provision:105). `auth.uid()` identical for all staff devices. | **Per-staff permissions = NOT BUILDABLE on shared users.** Ship **per-ROLE** permissions in `locations.settings` + acting identity carried as `device_id`/`staff_label`. Document audit granularity as role+device, not per-person. (Optional future: provision one user per staff.) |
| R4 | `set_updated_at` is `before update` only; re-flush bumps `updated_at`. | LWW clock is **client-authored `client_rev`/`client_updated_at`**, written into a real column, NOT server `updated_at`. Server `updated_at` is used only as the **pull watermark**. Needs a small migration `0002`. |
| R5 | `sessions unique(location_id, service_date)`, PK default random. `onConflict:'id'` can throw 23505. | Session upsert conflicts on the **business key** `(location_id, service_date)`, not PK. Device adopts server's returned id. |
| R6 | `sessions_delete_manager` allows hard DELETE; clients/checkins `on delete cascade`. | Migration `0002`: add `deleted_at` to sessions, replace hard-delete policy with tombstone UPDATE path, change child FKs `on delete cascade` → `on delete set null`. |
| R7 | Project/region documented two ways (`qimhmwkmkbqxsvtayldn/eu-west-3` vs `nkqrimicffbvnlqnzzkm/eu-central-1`). | **Release gate:** pin ONE project+region in CLAUDE.md, migration header, and assert via `get_project` before any live write. |

A new migration **`supabase/migrations/0002_sync_hardening.sql`** carries R4/R6 + RLS guards. It is the **first build step**.

---

## 1. Invariants (the contract every file obeys)

1. **localStorage is the source of truth** until the 48h `divergence===0` gate passes. Sync never reads-for-display from Supabase before cutover.
2. A mutation leaves the outbox **iff `verifyAfterWrite` proves the write LANDED** (re-read live state) — *not* that the row currently equals what we sent (a newer LWW winner is success, not failure).
3. **LWW by client-authored `client_rev`** (monotonic per row), tiebroken by `deviceId`. Server `updated_at` is the pull watermark only.
4. **Deletes are tombstones** (`deleted_at`); tombstones are **sticky** (an upsert can never clear `deleted_at`). Sessions are tombstoned too.
5. **Flag off ⇒ every sync call is a pure no-op.** The 157 existing tests stay green, byte-identical behavior.
6. **Never clear localStorage on a server write.** `clearDayData` gates on history-saved **AND** (when flag on) outbox-drained-for-that-date.
7. **The source-of-truth write always wins over sync state** under quota pressure: enqueue happens in the same try as the local write; if the outbox can't be persisted, the mutator surfaces failure (no false success), and sync state is coalesced/evicted before any SoT write is risked.

---

## 2. Identity model (R2 — random immutable ids)

- `Client.id = crypto.randomUUID()` minted **once** when a client first enters localStorage (upload merge, addClient, VIP merge). Immutable thereafter. Room/name edits never change it.
- `clientLocalKey(client)` = `merge.ts` `clientKey` (`normalizeRoomForKey::normalizeNameForKey`). Used for: (a) local dedupe (existing behavior), (b) **first-contact cross-device match** — on pull, if a server row's `client_local_key` matches a local row that has **no** server id yet, adopt the server id instead of creating a duplicate.
- **Shared-room safety:** two distinct guests sharing room+normalized-name get two distinct random ids (the id is per-Client-object, never per key) → both survive. Divergence's "match by id" is now consistent.
- `client_local_key` is persisted as a **column** on `clients` (migration `0002`) so cross-device first-contact match works server-side. It is advisory only (never a PK/unique).
- `sessionIdFor` is **dropped as a conflict target.** Sessions upsert on `(location_id, service_date)`; the device reads back the canonical `session_id` and stamps it on local clients/checkins for FK linkage.
- `CheckInRecord.id` already stable → reused unchanged.

**Files:** `src/lib/sync/ids.ts` exports `ensureClientId(client)` (mint if absent), `clientLocalKey` (re-export from merge.ts). No UUIDv5, no namespace constant, no golden vectors needed.

---

## 3. Migration `0002_sync_hardening.sql` (build step 1)

```sql
-- R4: client-authored LWW clock (server updated_at stays the pull watermark)
alter table public.clients   add column if not exists client_rev bigint not null default 0;
alter table public.checkins  add column if not exists client_rev bigint not null default 0;
alter table public.sessions  add column if not exists client_rev bigint not null default 0;
-- carry the acting device for cross-device tiebreak on clients (checkins/sessions already have device_id)
alter table public.clients   add column if not exists device_id text;
-- first-contact cross-device match key (advisory, not unique)
alter table public.clients   add column if not exists client_local_key text;
create index if not exists clients_local_key_idx on public.clients(location_id, client_local_key);

-- R6: sessions become tombstonable; children never cascade-hard-delete
alter table public.sessions  add column if not exists deleted_at timestamptz;
alter table public.clients   drop constraint if exists clients_session_id_fkey;
alter table public.clients   add  constraint clients_session_id_fkey
  foreign key (session_id) references public.sessions(id) on delete set null;
alter table public.checkins  drop constraint if exists checkins_session_id_fkey;
alter table public.checkins  add  constraint checkins_session_id_fkey
  foreign key (session_id) references public.sessions(id) on delete set null;
-- forbid manager hard-delete of sessions; route through tombstone UPDATE
drop policy if exists sessions_delete_manager on public.sessions;

-- R4 tombstone-stickiness + monotonic rev enforced in SQL (defends against any client bug)
create or replace function public.guard_row_write()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    -- never move client_rev backwards; never un-delete via a stale write
    if new.client_rev < old.client_rev then return old; end if;
    if old.deleted_at is not null and new.deleted_at is null
       and new.client_rev <= old.client_rev then
      new.deleted_at := old.deleted_at;  -- sticky tombstone
    end if;
    new.updated_at := now();             -- pull watermark advances on accepted change
  end if;
  return new;
end; $$;
drop trigger if exists trg_clients_guard  on public.clients;
create trigger trg_clients_guard  before update on public.clients  for each row execute function public.guard_row_write();
drop trigger if exists trg_checkins_guard on public.checkins;
create trigger trg_checkins_guard before update on public.checkins for each row execute function public.guard_row_write();
drop trigger if exists trg_sessions_guard on public.sessions;
create trigger trg_sessions_guard before update on public.sessions for each row execute function public.guard_row_write();

-- soft-delete authorization: who may set deleted_at null->non-null
-- DECISION: staff MAY tombstone checkins (undo is a staff action); clients tombstone = manager-only.
create or replace function public.deny_staff_client_softdelete()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.deleted_at is null and new.deleted_at is not null and not public.is_manager() then
    raise exception 'client soft-delete is manager-only';
  end if;
  return new;
end; $$;
drop trigger if exists trg_clients_softdelete_guard on public.clients;
create trigger trg_clients_softdelete_guard before update on public.clients for each row execute function public.deny_staff_client_softdelete();

-- audit integrity: actor forced to auth.uid(); client cannot spoof
drop policy if exists audit_insert on public.audit_log;
create policy audit_insert on public.audit_log for insert to authenticated
  with check (location_id = public.auth_location_id() and actor_user_id = auth.uid());
```

> Note the original `set_updated_at` `before update` triggers are **replaced** by `guard_row_write` (which also stamps `updated_at`). Keep `set_updated_at` on locations/notes/briefs.

**Failing test first:** `supabase/tests/0002_guards.test.ts` (or an `execute_sql`-driven Vitest harness) — (a) update with lower `client_rev` is a no-op; (b) upsert with `deleted_at=null` over a tombstone at equal/lower rev leaves row deleted; (c) staff JWT setting `clients.deleted_at` raises; (d) staff inserting `audit_log` with spoofed `actor_user_id` is rejected. **PoD:** `get_advisors(security)` = 0 new issues.

---

## 4. localStorage ↔ Supabase mapping table

`src/lib/sync/mappers.ts` — pure, sole owner of camelCase↔snake_case + the column contract. Mappers build an **explicit minimal SET list** for updates; they never send server-managed columns (`created_at`, `checked_in_by`, server `updated_at`). `breakfast_included` omitted on insert (DB default), ignored on read.

**`Client` ↔ `clients`**
| local | column | notes |
|---|---|---|
| `id` (randomUUID) | `id` | PK / conflict target |
| (live JWT) | `location_id` | sourced at **flush time** from JWT, never cached |
| `sessionIdFor`-resolved | `session_id` | from server session read-back |
| `clientLocalKey(c)` | `client_local_key` | first-contact match |
| `clientRev` (local counter) | `client_rev` | LWW clock |
| `getDeviceId()` | `device_id` | tiebreak |
| `deletedAt` | `deleted_at` | tombstone |
| `roomNumber` | `room_number` | |
| `roomType` | `room_type` | |
| `rtc` | `rtc` | |
| `confirmationNumber` | `confirmation_number` | |
| `name` | `name` | |
| `arrivalDate` | `arrival_date` | |
| `departureDate` | `departure_date` | |
| `reservationStatus` | `reservation_status` | |
| `adults` | `adults` | |
| `children` | `children` | |
| `rateCode` | `rate_code` | |
| `packageCode` | `package_code` | |
| `pendingPaymentAction` | `pending_payment_action` | |
| `isVip` | `is_vip` | |
| `vipLevel` | `vip_level` | |
| `vipNotes` (default `''`) | `vip_notes` | |
| `vipSource` | `vip_source` | |
| — | `breakfast_included` | omit on insert; ignore on read |

**`CheckInRecord` ↔ `checkins`**
| local | column |
|---|---|
| `id` | `id` |
| (live JWT) | `location_id` |
| resolved session id | `session_id` |
| `clientLocalKey`-resolved | `client_id` (best-effort) |
| `clientRev` | `client_rev` |
| `getDeviceId()` | `device_id` |
| `deletedAt` | `deleted_at` |
| `roomNumber` | `room_number` |
| `clientName` | `client_name` |
| `peopleEntered` | `people_entered` |
| `timestamp` | `checked_in_at` |
| `paymentAction` | `payment_action` |
| — | `checked_in_by` (server default; never sent) |

**`DailyData`/`SessionRecord` ↔ `sessions`** — conflict on `(location_id, service_date)`:
| local | column |
|---|---|
| `date` | `service_date` |
| (live JWT) | `location_id` |
| `'open'`/`'closed'` | `status` |
| `closeDay` reducers | `totals` (jsonb) |
| `rawUploadText` | `raw_upload_text` |
| `closedAt` | `closed_at` |
| `sessionRev` | `client_rev` |
| `getDeviceId()` | `device_id` |
| `deletedAt` | `deleted_at` |

**Reverse mappers** (`rowToClient`, `rowToCheckin`) set `serverUpdatedAt = row.updated_at`, `clientRev = row.client_rev`, drop server-only columns.

**Out of scope this pass:** `notes`, `morning_briefs`, `app_config`. `note` outbox entity reserved, no mutations emitted.

---

## 5. Type changes (`src/lib/types.ts`, additive only)

- `Client`: `id?: string`, `clientLocalKey?: string`, `clientRev?: number`, `serverUpdatedAt?: string`, `deletedAt?: string | null`, `deviceId?: string`.
- `CheckInRecord`: `clientRev?: number`, `serverUpdatedAt?: string`, `deletedAt?: string | null`, `deviceId?: string`.
- `DailyData`: `id?: string`, `sessionRev?: number`, `serverUpdatedAt?: string`.

All optional → parser/merge/report/dashboard compile unchanged.

---

## 6. Conflict rules (LWW + tombstones — the deterministic chain)

Applied identically on every device (in `pull.ts` and `engine.ts`):

1. **Idempotency:** every push is `upsert(row,{onConflict:'id'})` (clients/checkins) or `upsert(row,{onConflict:'location_id,service_date'})` (sessions). Re-flush never duplicates.
2. **LWW winner = greater `client_rev`** (client-authored, monotonic; bumped once per local edit). Server `updated_at` is NOT the LWW clock.
3. **Tie on `client_rev` → `deleted_at` wins** (delete beats edit).
4. **Still tied → lexically greater `device_id`** (total order; now persisted on clients too via `0002`).
5. **Tombstones are sticky** (SQL `guard_row_write` + engine pre-check): an upsert at `client_rev <= existing` can never clear `deleted_at`. Defends against the offline-resurrect-via-upsert race.
6. **Whole-row granularity with pull-before-push rebase** (resolves the silent field-clobber): before flushing an upsert, if the server row's `client_rev > the rev the mutation was built from`, re-base — re-apply only the dirty fields tracked on the mutation onto the fresh server row, bump `client_rev`, then upsert. A mutation records its `dirtyFields` at enqueue.
7. **`client_rev` is bumped exactly once per local user edit** (in the storage mutator), so "older edit flushed later" loses to "newer edit flushed earlier" regardless of flush order.
8. **Sessions** converge on `(location_id, service_date)`; cascade replaced by `set null` (R6) so a session tombstone never hard-deletes children. Pull treats a session `deleted_at` as a cascading tombstone for its children deterministically.
9. **Local merge stays local-first:** `mergeNewClients` keeps its key dedupe; sync stamps the random id on the survivor.
10. **RLS is the tenant guard:** `location_id` always from the live JWT; cross-tenant write fails loud.

---

## 7. verifyAfterWrite contract (round-trip-or-fail)

`src/lib/verify-after-write.ts` — called after EVERY write, BEFORE `remove`. **Proves the write LANDED, not that the row equals what we sent.**

- **write:** `upsert(...)` or tombstone `update({deleted_at, client_rev})`.
- **read:** SEPARATE `.select('id,updated_at,deleted_at,client_rev,<keyfields>').eq('id', id).maybeSingle()` — live state, never the write's echo.
- **assert (landed-not-equal):**
  - row exists (null read ⇒ write didn't land ⇒ throw `VerifyError`, retry).
  - `server.client_rev >= ourRev` — our write or a newer LWW winner is present. (A newer writer overwrote us = **success**, our write landed then lost LWW; never a verify failure → kills the retry-storm and false dead-lettering.)
  - for a **delete**: `deleted_at` is non-null (tombstone present). A concurrent un-delete would have needed a higher rev, which our delete's rev guards via stickiness.
  - **error classification:** distinguish RLS-deny (`42501`) and tenant mismatch (payload `location_id` ≠ JWT) → route to a **config-error state surfaced to the manager**, NOT infinite retry / silent dead-letter.
- mismatch/throw → `markTried` + `scheduleRetry`; mutation stays queued. Clean landed-proof → `remove`.

**Failing test first:** `verify-after-write.test.ts` — resolves on `client_rev>=ours`; throws on null read; tombstone pass-through; **a newer-rev row (we lost LWW) RESOLVES**; tenant-mismatch fast-fails with a distinct error (not retry).

---

## 8. Outbox extension (`src/lib/sync/outbox.ts` — extend, keep signatures)

Keep `enqueue/peekAll/remove/markTried/clearOutbox` (existing tests stay green). Add:
- `dedupeKey` (`${entity}:${rowId}`) → re-enqueue **coalesces** (replace queued, latest payload wins; merge `dirtyFields`).
- `dirtyFields: string[]` (for rebase, §6.6).
- `nextDueAt?: number`, `lastError?: string`; `peekDue(now)` (FIFO among due), `scheduleRetry(id, delayMs)`, `export const MAX_TRIES`.
- `hasPendingForDate(serviceDate)` (used by `closeDay` gate).
- `moveToDeadLetter(id)` → `imarketin_sync_deadletter`.
- **Concurrent-write safety (multi-tab):** wrap read-modify-write in `navigator.locks.request("imarketin_outbox", ...)` when available; always **re-read immediately before write** and operate by id-diff (never write a stale full snapshot). Applies to `remove`, `markTried`, `enqueue`, `scheduleRetry`.
- **Quota safety:** `write()` in try/catch. On `QuotaExceededError`: (1) coalesce redundant per-row mutations (dedupeKey) first; (2) trim `rawUploadText` from older `dailyData_*`/`sessionHistory` only (**allowlist those key prefixes — never touch the supabase auth-token key or the outbox key itself**); (3) retry. **Never drop a queued mutation to make room.** If still failing, surface failure so the SoT mutator does not falsely report success.

**Failing tests first:** `sync-outbox.test.ts` (extend) — quota surfaces failure + auth-token key never trimmed; dedupe coalesce (one entry, latest payload, merged dirtyFields); backoff (`nextDueAt` future, `peekDue` excludes/includes); **interleave: enqueue during a flush `remove` loses no queued id**; existing signatures green.

---

## 9. Flush engine (`src/lib/sync/engine.ts`)

- Single-flight module lock. `flushOnce()` guards `if (!SYNC_ENABLED || !hasSession()) return`.
- Process `peekDue(now)` FIFO. Per mutation:
  1. **location_id from live JWT** (`currentLocationId()`), not from cached/enqueue-time value.
  2. **Rebase** (§6.6): read server row; if `server.client_rev > mutation.baseRev`, re-apply `dirtyFields` onto fresh row, bump rev.
  3. **Stickiness pre-check:** if server `deleted_at` set and this is an upsert at `rev <= server`, downgrade to no-op (the SQL guard also enforces this).
  4. `upsert` (clients/checkins on `id`; sessions on `location_id,service_date`) or tombstone `update`.
  5. `verifyAfterWrite` (landed-proof) → **then** `remove(id)`.
- On throw: `markTried` + `scheduleRetry` (exp backoff 1s,2s,4s… cap 5min, jittered). After `MAX_TRIES` → `moveToDeadLetter` + surface in status + `audit_log` (`action:'sync_deadletter'`). **Config-errors (RLS/tenant) bypass retry → manager-surfaced state.**
- Triggers: `online`, `visibilitychange→visible`, debounced post-enqueue, periodic interval. `pagehide`/`beforeunload` best-effort; never assume success — unflushed entries stay durable.

**Failing tests first:** `sync-engine.test.ts` — conservation (remove only after landed-proof); crash-safety (throw between write/remove → still queued, re-flush idempotent); offline→reconnect property (enqueue N, fail K, reconnect → applied==N, outbox==0); poison → dead-letter, never silently gone; flag-off no-op; **concurrent A then B(higher rev): A's verify PASSES (landed), B wins LWW, neither dead-lettered**; **two devices edit different fields same id → both edits survive (rebase)**; **stale re-flush (lower rev) over newer row → newer survives**.

---

## 10. Pull (`src/lib/sync/pull.ts`) — dedicated LWW/tombstone-aware merge

Do **not** reuse `mergeNewClients` for pull (it can't update, can't tombstone, and duplicates corrected names). Instead:
- `pullSince(locationId, sinceIso)`: SELECT clients/checkins/sessions where `updated_at > since` (incl. tombstones), ordered by `updated_at`.
- **Watermark safety (out-of-order commit):** use `updated_at > cursor - SAFETY_MS` (re-fetch a trailing window, dedupe by id; safe because merge is idempotent under LWW). Advance cursor only AFTER local write succeeds.
- **Merge by `Client.id`:**
  - server row newer (`server.client_rev > local.clientRev`, then tiebreak chain) → apply field update.
  - server `deleted_at` set → tombstone local (keep the record with `deletedAt`, filter from UI; do **not** splice from store).
  - server id absent locally but `client_local_key` matches a local row with no server id → **adopt** server id (first-contact dedupe, no duplicate).
  - else append.
- **Own-pending-delete guard:** before re-adding/un-tombstoning any row, check the outbox for a pending `delete` (or higher-rev edit) on that id; if present, local intent wins — drop the incoming row. (Resolves the pull-resurrects-my-own-offline-delete race.)
- **Never shrinks localStorage; never drops a row with an unflushed outbox entry.**

**Failing tests first:** `sync-lww-tombstone.test.ts` — higher `client_rev` wins, lower ignored (even with future wall-clock); no-resurrection of server tombstone; equal-rev tiebreak by `device_id` deterministic across both devices; pull applies a server edit; pull applies a server tombstone (row disappears from UI, stays tombstoned); pull does NOT duplicate a corrected-name guest (adopts id via local_key); **pull does NOT resurrect my own pending offline delete**; pull-merge never drops a non-tombstoned local guest.

---

## 11. Divergence detector + cutover gate

`src/lib/sync/divergence.ts` — runs during dual-write; **FLAGS, never throws/fails.**
- `detectDivergence(locationId, serviceDate)` reads local from **`getDataForDate(date) OR matching sessionHistory record`** (union — so closed days compare sessionHistory vs server, not null vs server; resolves the closeDay phantom-divergence hole).
- **(A) Counts:** local clients vs server `count(*) where deleted_at is null`; checkins; `sum(peopleEntered)`.
- **(B) Key fields by `id`:** clients → `name, room_number, is_vip, adults, children, deleted_at`; checkins → `people_entered, room_number, payment_action, deleted_at`. Report orphans (id one side only). Shared rooms = distinct (match by random id).
- Tombstone-aware: `deleted_at != null` counted as absent.
- Output `{ serviceDate, ok, clients:{local,server,mismatches[]}, checkins:{...}, generatedAt }`. `divergenceCount = mismatches + orphans + count-deltas`. Writes report to `imarketin_divergence_report` + `audit_log` (`action:'divergence_check'`).

`src/lib/sync/cutover-gate.ts` — pure over a ring buffer `imarketin_divergence_log`.
- `recordDivergenceSnapshot({ts,count,outboxLen})`.
- `evaluateCutoverGate(now, windowMs=48h)` → **GO** only if: (a) a snapshot older than `now−48h` exists; (b) every in-window snapshot `count===0`; (c) ≥1 snapshot had `outboxLen===0` (queue actually drained — never penalize a day mid-flush). Returns `{decision, reason, worstCount, drainedAtLeastOnce}`.
- **Never auto-cuts over.** Until GO + Angel's call, localStorage stays read-truth; Supabase is shadow → data is never at risk.

**Failing tests first:** `sync-divergence.test.ts` — `ok:true` when equal; exact deltas otherwise; never throws; **closed-day compares sessionHistory not null**; shared-rooms distinct; remote `deleted_at` = absent. `cutover-gate.test.ts` — HOLD <48h; HOLD any nonzero; HOLD if never drained; GO only on full 48h all-zero AND drained ≥1 (clock injected).

---

## 12. storage.ts surgical edits (behind flag; byte-identical when off)

| Mutator | Edit |
|---|---|
| `mergeSessionRecords` (R1) | Import `clientKey`/`normalize*` from `merge.ts`; replace inline weak normalizer. **Own failing test:** two OCR variants of one guest collapse to ONE history client. |
| `saveClientsMerged` / `addClient` / `updateClient` / `mergeVipIntoSession` | `ensureClientId` + **bump `clientRev`** on affected client(s); record dirty fields; **enqueue in the same try as the local write** (R7), then `onClientUpsert`. `updateClient` keeps index access; random id frozen → same server row even when room/name edited. |
| `addCheckIn` | bump rev, `onCheckinUpsert(record, sessionId)`. |
| `removeCheckIn` | When flag on: set `deletedAt` tombstone **and keep the record in store** (filter from UI at read time — do NOT splice, so pull can see the local tombstone), bump rev, `onCheckinDelete(id)`. When off: unchanged hard-splice. (Resolves pull-resurrect-own-delete.) UI read paths (`getCheckInsForRoom`, dashboards) filter `deletedAt`. |
| `saveTodayData` / `closeDay` | `onSessionUpsert(data)` (closeDay → `status:'closed'` + totals). **`clearDayData` gate (I6):** when flag on, only clear after history saved **AND** `!outbox.hasPendingForDate(date)`; else keep `dailyData_<date>` and mark status closed in place until the flusher drains. closeDay's existing local-save-only clear logic is otherwise untouched. |
| `autoCloseStale` (empty-session hole) | When flag on, do **not** hard-delete an empty `dailyData_<date>` before a pull reconciles it. Skip empty-session deletion when flag on (or pull the server session first; delete locally only if server also empty/absent). Never let local-empty drive a server status change. |

Existing quota fallbacks (lines 230–253, 328–343) untouched, plus the key-allowlist rule for any trim loop.

---

## 13. Manager access / permission model (R3 — per-ROLE on shared users)

**Hierarchy:** `location > staff > allow/notallow`. Roles: `manager`, `staff` (reception/restaurant are staff sub-modes). Code is **auto-assigned at provisioning**; **only the manager** rotates a code or adds a location.

**Identity reality:** one auth user per (location, role). Therefore:
- **Permissions are per-ROLE, not per-individual-staff** (per-staff is NOT BUILDABLE on shared users — documented as out of scope until per-staff users are provisioned). Stored in `locations.settings.permissions[role]` (jsonb), keyed by `role` not `userId`.
- **Acting identity for audit** = `device_id` + optional `staff_label` (carried in the mutation/`checked_in_by` written explicitly), since `auth.uid()` is shared. Audit granularity is **role + device**, stated plainly in the RGPD doc.
- All manager ops are **server-authoritative**; the client only calls Edge Functions with the manager JWT. `currentRole()==='manager'` only hides UI.

`supabase/functions/manager-ops/index.ts` (new), reuses the auth-location pepper/HMAC:
- **`rotateCode({ role })`** — verify caller JWT `user_role==='manager'` for the `location_id`; mint a new code; store only `code_hash=HMAC(pepper,code)`; old code `active=false`; **also `admin.auth.admin.signOut(serviceUserId,'global')`** to revoke existing refresh tokens (resolves the false-revocation hole — old devices can't keep refreshing). Return plaintext once; write `audit_log`.
- **`addLocation({ name, region })`** — manager-only (or bootstrap-scoped); provisions `locations` + auto-assigned manager/staff codes + `location_members`.
- **`setRolePermissions({ role, permissions })`** — write per-screen allow/notallow into `locations.settings.permissions[role]`. **Reads are a per-request RLS/`locations.settings` lookup, NOT a JWT claim** — so a permission change takes effect immediately, no re-exchange lag (resolves the stale-JWT escalation hole). Short access-token TTL configured so role/revocation re-check happens ~hourly.

**Why `locations.settings` + per-request read (not JWT, not new tables):** schema already has `settings jsonb`; revocation is immediate; `location_codes`/`auth_attempts`/`app_config` stay service-role-only (RLS, no policies) so staff can never touch them.

**Failing tests first:** `manager-ops.test.ts` (live, real project) — staff JWT calling manager-ops rejected; manager rotates code → **old device's next token refresh 401s** (not just new logins blocked) → new code works via auth-location → `audit_log` row written; `setRolePermissions` change visible to a staff device **without re-exchange**.

---

## 14. Auth wiring (`src/lib/sync/session.ts`)

`exchangeCode(code)` → POST `auth-location` → `getSupabase().auth.setSession({access_token, refresh_token})`. Cache `{location_id, role, location_name}` in a small key for **offline display only**. `currentLocationId()/currentRole()/hasSession()` read from the **live session `app_metadata`** at call time (flush always uses live JWT location_id — never the cache). `signOut()` clears ONLY the supabase session. **Shared-device PII hygiene:** offer/force local PII wipe (`dailyData_*`/`sessionHistory`/divergence reports) on signOut **only after** the outbox is round-trip-confirmed empty.

---

## 15. RGPD (must exist before real guest data flows; does not block cutover-gate)

- **Pin project+region** (R7) in CLAUDE.md + migration header; assert via `get_project` in the live-verify step.
- **Erasure ≠ tombstone:** tombstones (`deleted_at`) converge deletes. A **separate server-side retention/erasure job** (service role) hard-nulls PII columns after the 90-day window or on an erasure request, and propagates a local purge.
- **Local PII retention:** cap `rawUploadText`/guest-detail age in localStorage to the same 90-day window; define a local-erasure path. Dead-letter entries get a TTL (escalate+drop with an `audit_log` entry rather than "never drop").
- **CORS:** tighten `auth-location`/`admin-provision`/`manager-ops` `Access-Control-Allow-Origin` from `*` to the known Vercel origin(s) before Btisseme rollout.

---

## 16. File-by-file plan (real paths, all under `/Users/angelpolanco/Documents/github-apps/Check-in-/`)

| File | New/Edit | Purpose |
|---|---|---|
| `supabase/migrations/0002_sync_hardening.sql` | New | R4/R6 + guards + audit/softdelete RLS (§3). |
| `src/lib/types.ts` | Edit | Optional id/rev/serverUpdatedAt/deletedAt/deviceId/localKey (§5). |
| `src/lib/merge.ts` | Edit | Export `clientKey`, `normalizeRoomForKey`, `normalizeNameForKey` (§0 R1). |
| `src/lib/storage.ts` | Edit | §12 surgical edits incl. `mergeSessionRecords` normalizer swap, rev bumps, tombstone-keep, clearDayData/autoCloseStale gates. |
| `src/lib/sync/outbox.ts` | Edit | §8 extensions; keep existing signatures. |
| `src/lib/sync/ids.ts` | New | `ensureClientId`, `clientLocalKey` re-export (§2). |
| `src/lib/sync/mappers.ts` | New | Bidirectional pure mappers + explicit minimal SET lists (§4). |
| `src/lib/sync/backfill.ts` | New | One-time `imarketin_id_backfill_v2`: walk `dailyData_*`+`sessionHistory`, mint random ids + localKey + rev=0, write back. Versioned + re-runnable on algo bump. |
| `src/lib/verify-after-write.ts` | New | Landed-not-equal contract + error classification (§7). |
| `src/lib/sync/engine.ts` | New | Flush loop, rebase, stickiness, backoff, dead-letter, config-error surfacing (§9). |
| `src/lib/sync/pull.ts` | New | Dedicated LWW/tombstone-aware merge + own-pending-delete guard + watermark safety (§10). |
| `src/lib/sync/divergence.ts` | New | Detector (sessionHistory union for closed days) (§11). |
| `src/lib/sync/cutover-gate.ts` | New | Pure gate over snapshot log (§11). |
| `src/lib/sync/session.ts` | New | Auth bridge, live-JWT reads, shared-device PII wipe (§14). |
| `src/lib/sync/hooks.ts` | New | `onClientUpsert/onCheckinUpsert/onClientDelete/onCheckinDelete/onSessionUpsert`; each `if(!SYNC_ENABLED) return`. |
| `src/lib/sync/manager.ts` | New | Manager client API: `rotateCode`, `addLocation`, `setRolePermissions` (§13). |
| `src/lib/sync/init.ts` | New | `initSync()` from app shell beside `autoCloseStale`: backfill, listeners, flush+pull loop — behind flag, idempotent. |
| `supabase/functions/manager-ops/index.ts` | New | Server-authoritative manager ops incl. session revocation (§13). |
| New tests | New | `sync-engine.test.ts`, `sync-ids.test.ts`, `sync-mappers.test.ts`, `sync-lww-tombstone.test.ts`, `verify-after-write.test.ts`, `sync-divergence.test.ts`, `cutover-gate.test.ts`, `manager-ops.test.ts`, `0002_guards.test.ts`; extend `sync-outbox.test.ts`; new `merge-normalizer.test.ts` for the R1 swap. |

---

## 17. Build order (each step independently shippable; failing test named first)

1. **Migration `0002`** — *test:* `0002_guards.test.ts` (rev-monotonic, sticky tombstone, staff softdelete denied, audit spoof denied). PoD: `get_advisors(security)=0`.
2. **Normalizer unify** (`merge.ts` export + `storage.ts mergeSessionRecords` swap) — *test:* `merge-normalizer.test.ts` (two OCR variants → one history client). Stands alone, flag-agnostic.
3. **Random ids + types + backfill** (`ids.ts`, `types.ts`, `backfill.ts`) — *test:* `sync-ids.test.ts` (id minted once + immutable across rename; two shared-room guests → two ids; backfill idempotent + versioned).
4. **Mappers + verifyAfterWrite** (`mappers.ts`, `verify-after-write.ts`) — *tests:* `sync-mappers.test.ts` (round-trip, breakfast_included, minimal SET, no server-managed cols), `verify-after-write.test.ts` (landed-not-equal; newer-rev resolves; tenant-mismatch fast-fail).
5. **Outbox extend** (`outbox.ts`) — *tests:* `sync-outbox.test.ts` (quota surfaces failure + auth-token never trimmed; dedupe coalesce; backoff; interleave no-loss; existing green).
6. **Engine** (`engine.ts`) — *tests:* `sync-engine.test.ts` (conservation, crash-safety, offline→reconnect 0-loss, poison→dead-letter, flag-off no-op, concurrent-A-passes/B-wins, two-field rebase, stale-reflush loses).
7. **Hooks + storage wiring** (`hooks.ts`, storage edits) — *test:* full `npx vitest run` — all 157 prior tests stay green (flag-off true no-op), plus the tombstone-keep/clearDayData/autoCloseStale gates.
8. **Pull + LWW** (`pull.ts`) — *tests:* `sync-lww-tombstone.test.ts` (full chain incl. own-pending-delete guard, corrected-name adopt, watermark out-of-order).
9. **Divergence + cutover gate** (`divergence.ts`, `cutover-gate.ts`) — *tests:* `sync-divergence.test.ts` (closed-day union), `cutover-gate.test.ts` (GO only on 48h-zero+drained).
10. **Session + init** (`session.ts`, `init.ts`) — *live PoD:* `exchangeCode` → offline check-in → reconnect → GET row asserts match → second-device pull shows it, 0 dups → `detectDivergence ok:true` → `get_advisors(security)=0`.
11. **manager-ops + manager.ts** — *test:* `manager-ops.test.ts` (staff rejected; rotate → old device refresh 401s; new code works; `setRolePermissions` immediate; audit written).
12. **RGPD release gate (§15)** — pin project/region (assert `get_project`), CORS lockdown, retention/erasure job + local-PII purge. Before real guest data; not a cutover-gate blocker.

**The one blocking prerequisite:** migration `0002` + random immutable ids + normalizer unify (steps 1–3). Every push/pull/LWW behavior depends on the client-authored `client_rev` clock and stable ids. Start there, RED first.

---

### Net changes from the draft (what the adversarial pass forced)

- **Identity:** content-hash UUIDv5 → **random immutable id** + advisory `client_local_key` (kills rename-fork, shared-room collision, resurrection).
- **LWW clock:** server `updated_at` → **client-authored `client_rev`** (migration `0002`); `updated_at` demoted to pull watermark (kills stale-reflush-clobbers-newer).
- **verifyAfterWrite:** equality-check → **landed-proof** (kills retry-storm/false dead-letter under concurrency).
- **Whole-row push:** added **pull-before-push rebase on dirty fields** (kills silent concurrent field-clobber).
- **Tombstones:** made **sticky in SQL**, sessions now tombstonable, child FKs `set null` (kills cascade-hard-delete + upsert-un-delete).
- **closeDay/autoCloseStale:** gated on **outbox-drained-for-date**; empty-session deletion suppressed when flag on; divergence reads **sessionHistory union** for closed days.
- **Pull:** dedicated **id-keyed LWW/tombstone merge** (not `mergeNewClients`) + own-pending-delete guard + watermark safety window.
- **Outbox:** **multi-tab lock + re-read-before-write**, key-allowlist trim, SoT-wins-under-quota.
- **Manager model:** per-staff → **per-ROLE** permissions in `locations.settings` (per-request read, immediate revocation); **rotateCode revokes sessions**; audit = role+device; per-staff users documented as future work.
- **RGPD:** project/region pin, erasure-vs-tombstone split, local-PII retention, CORS lockdown — added as an explicit pre-data gate.
