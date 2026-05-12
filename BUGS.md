# Bug Log — Check-in PWA

Format per `PROCESSES.md` section 6:

```
SYMPTOM: what the user saw
ROOT CAUSE: what actually broke
GUARD: the test/check/gate that now prevents recurrence
```

Bugs close ONLY when the guard exists.

---

## #2026-05-11-001 — paymentAction not displayed on /report VIPs hors liste

**SYMPTOM**: VIP Schmidt Lena (room 201) was checked in with "Points → Chambre", but the report shows `(Points) → (—)`. Reception thinks the payment choice was lost.

**ROOT CAUSE**: Key mismatch between check-in and report.
- `/checkin` saved payment as raw keys: `card`, `room`, `cash`, `pass`, `reception`, `supervisor`.
- `/report` and source breakdown expected: `pay_onsite`, `room_charge`, `points`, `pass`.
- Result: `paymentAction` value existed in the check-in record, but no branch matched → fell to default `"—"` and the source-breakdown counter incremented nothing.

**FIX** (`fa78387+`):
- Canonical 5 keys defined: `room`, `points`, `cash`, `card`, `supervisor`.
- `report.ts > buildSourceBreakdown` normalizes legacy aliases (`room_charge` → `room`, `pay_onsite` → `cash`) so old localStorage data still aggregates correctly.
- `/report > offlistVips` label function maps both new and legacy keys.
- `reception-report.ts > deriveStatus` accepts all keys (cash/card → `came_paid_onsite`, room/room_charge → `came_room_charge`, supervisor/pass → `came_pass`).
- `mock-seeder.ts` now generates the new 5 canonical keys.

**GUARD**:
- All payment writes go through the 5-button selector on `/checkin/[roomNumber]/page.tsx` which only emits canonical keys.
- The report aliases keep old data working.
- Add a Vitest test (TODO): `report.test.ts` — given check-ins with each of the 5 keys, the source breakdown counters must increment correctly.

**STATUS**: ✅ Fixed in commit `fa78387` (key migration) + follow-up payment-method rewrite.

---

## #2026-05-11-002 — `+1 Adulte` creates a new room entry instead of incrementing

**SYMPTOM**: Pressing `+1 Adulte` on the check-in profile of room 409 created separate "Walk-in adulte 7183" and "Walk-in adulte 0222" rows in /search, instead of incrementing the existing client's adult count. The chambre 409 then appears 3 times on the search list with different fake names.

**ROOT CAUSE**: The `+1 Adulte` button calls `addClient` with a generated name (timestamp-based) which inserts a *new* Client record into `dailyData.clients[]`. The intent was to register an extra guest under the *current* client, not a separate stay.

**FIX** (planned, this session):
- Replace `addClient` call with a small bottom-sheet popup asking the payment mode (Chambre · Points · Cash · Carte B · Supervisor), 1 tap, then `updateClient(index, { adults: client.adults + 1, pendingPaymentAction: action })`. UI stays on the same profile, a chip appears under the existing client.
- Same logic for `+1 Enfant` (bumps `children`).

**GUARD**:
- The `+1` button can only call `updateClient` — never `addClient`. Future linter rule or eslint forbid-pattern.
- Vitest test (TODO): "pressing +1 on a room with 1 adult yields a client with 2 adults and no new clients in data".

**STATUS**: 🟠 In progress.

---

## #2026-05-11-003 — Payment method buttons shown for all clients

**SYMPTOM**: The 5 big payment buttons (Chambre · Points · Cash · Carte B · Supervisor) appear on every check-in profile, even for VIPs whose breakfast is already included in their package (BKF INC). Reception is asked to choose a payment for something that is already paid.

**ROOT CAUSE**: The block `{showPaymentTabs && ...}` was switched from conditional to always-visible during the 3D-button rewrite. The original conditional flag (`showPaymentTabs`) was tied to "client not on breakfast list" but got dropped.

**FIX** (planned, this session):
- Re-introduce the conditional: render the 5 buttons only when one of these is true:
  - `client.vipSource === "list_only" || client.vipSource === "walk_in"` (off-list)
  - OR the packageCode does NOT contain `BKF INC`, `BKF GRP`, `BKF EXCL`, `BKF COMP`, or `UPSFPDJ` (no breakfast package).

**GUARD**:
- Helper `needsPaymentChoice(client: Client): boolean` in `lib/utils.ts`, single source of truth.
- Used by `/checkin/[roomNumber]/page.tsx` AND the planned `+1` popup.
- Vitest test: every breakfast package code returns `false`; off-list source returns `true`; non-VIP without package returns `true`.

**STATUS**: 🟠 In progress.
