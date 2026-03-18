# Product Requirements Document

## Check-in PWA — Courtyard by Marriott Breakfast Check-in

| Field | Value |
|-------|-------|
| **Product** | Check-in PWA |
| **Version** | 1.0 |
| **Last Updated** | 2026-03-18 |
| **Status** | V1 Launched, Field-Tested |
| **Platform** | Progressive Web App (iOS/Android/Desktop) |
| **Property** | Courtyard by Marriott |

---

## 1. Product Overview

Check-in is a Progressive Web App that replaces paper-based breakfast tracking at Courtyard by Marriott properties. Breakfast supervisors photograph or scan the daily guest report (PDF or camera), and the app uses Gemini Vision OCR to extract room numbers, guest names, package codes, and stay details. Staff then search rooms by number or name, check guests in with a single tap, track walk-in payments, manage VIPs, and generate end-of-day reports with COMP cost analytics.

### Core Value Proposition

- **Speed**: One-hand, one-tap check-in during a 200+ guest breakfast service.
- **Accuracy**: OCR replaces manual transcription of 300+ room report rows.
- **Visibility**: Real-time metrics (checked-in count, no-shows, COMP costs) replace end-of-day guesswork.
- **Simplicity**: Zero training required; no login, no backend setup for V1.

### Business Context

Hotel breakfast is a high-volume, time-pressured operation (6:00-11:00 AM). Guests expect immediate seating. Staff must verify that each guest's rate includes breakfast or collect payment on the spot. Errors cost the hotel an average of EUR 26 per missed charge. This app eliminates the paper binder, reduces revenue leakage, and provides management with data that was previously unavailable.

---

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v4 with `@theme` design tokens |
| OCR (primary) | Gemini 2.5 Flash Vision API (`thinkingBudget: 0`) |
| OCR (fallback) | Tesseract.js (client-side) |
| Persistence | localStorage (Supabase planned for Phase 2) |
| PWA | `next-pwa`, fullscreen standalone mode |
| Testing | Vitest + jsdom, 133+ tests across 7 files |
| Deployment | Vercel |
| i18n | Custom `src/lib/i18n.ts` (French / English) |

---

## 3. User Personas

### 3.1 Breakfast Supervisor (Primary)

| Attribute | Detail |
|-----------|--------|
| **Role** | Restaurant host/hostess stationed at the entrance |
| **Frequency** | 200+ interactions per service, daily |
| **Hours** | 6:00 AM - 11:00 AM |
| **Device** | iPhone or iPad, held in one hand |
| **Goals** | Check guests in fast, identify walk-ins, never hold up the line |
| **Pain Points** | Flipping through a printed binder, illegible handwriting, missed charges |
| **Tech Comfort** | Moderate; uses POS systems daily, expects tap-and-go UX |

### 3.2 Front Desk Manager (Secondary)

| Attribute | Detail |
|-----------|--------|
| **Role** | Supervises front office operations |
| **Frequency** | 1-2 times per day (pre-service upload, post-service close) |
| **Goals** | Upload the daily report, review end-of-day numbers, close the session |
| **Pain Points** | No historical data, manual Excel tracking, no visibility into COMP costs |
| **Tech Comfort** | High; manages PMS, channel managers, and reporting tools |

### 3.3 Hotel General Manager (Report Consumer)

| Attribute | Detail |
|-----------|--------|
| **Role** | Property-level P&L owner |
| **Frequency** | Weekly review of dashboard analytics |
| **Goals** | Track COMP cost trends, no-show rates, utilization over time |
| **Pain Points** | Zero breakfast data today; relies on anecdotal staff feedback |
| **Tech Comfort** | High; consumes dashboards and reports |

---

## 4. User Stories

### US-01: Upload Daily Report via Photo

> As a **Breakfast Supervisor**, I want to photograph the printed daily report so that guest data is loaded without manual entry.

**Acceptance Criteria:**
1. User can capture up to 20 photos using the device camera.
2. Each photo is sent to the Gemini Vision API and parsed into structured `Client` records.
3. Multi-photo uploads process in parallel via `Promise.allSettled`.
4. A confirmation screen shows the number of rooms detected before saving.
5. If OCR fails, an error toast appears with the option to paste data manually.

---

### US-02: Upload Daily Report via PDF

> As a **Front Desk Manager**, I want to upload a PDF of the daily report so that I can use the digital file directly from the PMS.

**Acceptance Criteria:**
1. User can select one or more PDF files from the device.
2. Each PDF page is rendered to an image and sent through the same OCR pipeline.
3. Results are merged with any previously uploaded photo data.
4. Duplicate rooms (same room + normalized name) are deduplicated automatically.

---

### US-03: Search by Room Number

> As a **Breakfast Supervisor**, I want to search by room number so that I can find a guest in under 2 seconds.

**Acceptance Criteria:**
1. A numeric keypad is displayed by default on the search screen.
2. Results filter in real time as digits are entered.
3. Rooms that have already been fully checked in appear visually distinct (muted styling).
4. Tapping a result navigates to the check-in detail screen.

---

### US-04: Search by Guest Name

> As a **Breakfast Supervisor**, I want to search by guest name so that I can find guests who do not remember their room number.

**Acceptance Criteria:**
1. User can switch to an alphabetical keypad on the search screen.
2. Name search is case-insensitive and accent-insensitive.
3. Partial matches are displayed as the user types.
4. Results show room number alongside the name for quick identification.

---

### US-05: Check In a Guest

> As a **Breakfast Supervisor**, I want to check in a guest with a single tap so that I do not slow down the breakfast line.

**Acceptance Criteria:**
1. The check-in screen shows room number, guest name, adults/children count, and package status.
2. A people counter allows adjusting the number of guests entering (defaults to total expected).
3. Tapping "Check In" creates a `CheckInRecord` with a timestamp.
4. After check-in, the app returns to the search screen with the search field cleared.
5. If the guest's package includes breakfast, no payment prompt appears.

---

### US-06: Handle Walk-ins (No Package)

> As a **Breakfast Supervisor**, I want to identify guests whose rate does not include breakfast so that I can collect payment before seating.

**Acceptance Criteria:**
1. Guests flagged as COMP (no breakfast package) display a distinct visual indicator on the search results.
2. The check-in screen shows a payment carousel with options: Card, Room Charge, Points, Pass.
3. A payment method must be selected before the check-in button becomes active.
4. The selected payment method is stored on the `CheckInRecord`.
5. The payment carousel only appears for COMP guests, walk-ins without a reservation, VIPs without a package, and extra guests beyond the room's included count.

---

### US-07: Record Payment for Non-Included Guests

> As a **Breakfast Supervisor**, I want to record the payment method for each non-included guest so that accounting can reconcile charges.

**Acceptance Criteria:**
1. Payment options include: Credit Card, Room Charge, Points, Complimentary Pass.
2. The selected method is persisted in `CheckInRecord.paymentAction`.
3. The end-of-day report itemizes all COMP check-ins with their payment methods.

---

### US-08: Undo Accidental Check-in

> As a **Breakfast Supervisor**, I want to undo a check-in if I made a mistake so that the data stays accurate.

**Acceptance Criteria:**
1. The check-in detail screen for an already-checked-in guest shows an "Undo" option.
2. Undoing removes the most recent `CheckInRecord` for that room.
3. The room returns to its previous state (remaining count restored).
4. Real-time metrics update immediately after undo.

---

### US-09: Add Extra Guests Mid-Service

> As a **Breakfast Supervisor**, I want to add a walk-in room that is not on the report so that every guest is tracked.

**Acceptance Criteria:**
1. When a room number search returns no results, a "Quick Add" button appears.
2. Quick Add creates a temporary `Client` record with the room number and a generic name.
3. The guest is flagged as COMP by default (no package).
4. The added guest appears in search results and the end-of-day report.

---

### US-10: View Real-Time Metrics

> As a **Breakfast Supervisor**, I want to see live check-in counts so that I know how busy the service is at a glance.

**Acceptance Criteria:**
1. A persistent metrics bar on the search screen shows: Total Expected, Checked In, Remaining.
2. Metrics update immediately after each check-in or undo.
3. The metrics bar is compact enough to not interfere with search interaction.

---

### US-11: Upload Additional Pages Mid-Session

> As a **Breakfast Supervisor**, I want to upload more report pages after the session has started so that late additions are captured.

**Acceptance Criteria:**
1. The upload button remains accessible from the search screen after the session is active.
2. New uploads are merged with existing data using `mergeNewClients()`.
3. A merge banner displays stats: new rooms added, duplicates skipped, total rooms now.
4. Existing check-in records are preserved; no data is lost.

---

### US-12: Toggle VIP Status

> As a **Front Desk Manager**, I want to flag a guest as VIP so that the breakfast team gives them special attention.

**Acceptance Criteria:**
1. VIP status can be set via a separate VIP list upload or manually on the check-in detail screen.
2. VIP guests display a gold badge on search results and check-in screens.
3. VIP levels (e.g., Bonvoy Ambassador, Titanium) are stored and displayed.
4. VIP notes field allows free-text special instructions.
5. VIP matching uses a room + name composite key to handle shared rooms.

---

### US-13: Edit Room and Guest Counts

> As a **Breakfast Supervisor**, I want to adjust the number of adults/children for a room so that walk-in additions are tracked.

**Acceptance Criteria:**
1. The check-in detail screen provides increment/decrement controls for the people counter.
2. Changes persist to the `Client` record in localStorage.
3. Metrics recalculate after edits.

---

### US-14: Review End-of-Day Report

> As a **Front Desk Manager**, I want to review a summary report after service so that I can verify all guests were accounted for.

**Acceptance Criteria:**
1. The report screen shows: total rooms, total guests expected, total entered, total remaining, total VIPs, total COMPs.
2. A room-by-room breakdown lists each room's status: all-in, partial, or no-show.
3. COMP guests are highlighted with their payment method.
4. The report is accessible from the main navigation.

---

### US-15: Export Report as CSV

> As a **Front Desk Manager**, I want to export the day's data as CSV so that I can share it with accounting.

**Acceptance Criteria:**
1. A CSV export button is available on the report screen.
2. The CSV includes: room number, guest name, adults, children, package code, check-in status, payment method, timestamp.
3. The file downloads with a date-stamped filename.

---

### US-16: Close Day and Archive Session

> As a **Front Desk Manager**, I want to close the day's session so that tomorrow starts fresh.

**Acceptance Criteria:**
1. A "Close Session" button archives the current `DailyData` into a `SessionRecord`.
2. The session record includes: date, closed-at timestamp, all clients, all check-ins, and summary metrics.
3. After closing, the app returns to the dashboard in a clean state.
4. Closing is irreversible; a confirmation dialog is required.

---

### US-17: Browse Past Sessions

> As a **Front Desk Manager**, I want to browse previous days' sessions so that I can look up historical data.

**Acceptance Criteria:**
1. A history panel lists all archived sessions ordered by date (newest first).
2. Tapping a session opens a read-only view of that day's report.
3. Historical sessions display the same metrics and room breakdown as the live report.

---

### US-18: Dashboard Analytics (Today)

> As a **Hotel GM**, I want to see today's breakfast performance on a dashboard so that I have real-time visibility.

**Acceptance Criteria:**
1. The dashboard screen shows: total expected, total showed up, no-shows, no-show percentage, COMP count, COMP cost.
2. A rush-hour chart displays check-in volume by 30-minute time slot.
3. The peak time slot is visually highlighted.
4. COMP cost is calculated as: COMP guests who showed up multiplied by cost per cover (default EUR 26).

---

### US-19: Historical Trends

> As a **Hotel GM**, I want to view 7-day and custom-range trends so that I can identify patterns.

**Acceptance Criteria:**
1. A trend chart shows daily utilization (checked-in / expected) over the selected range.
2. No-show counts are overlaid or shown in a secondary visualization.
3. Day labels (Mon, Tue, etc.) are displayed for context.
4. The default view is the last 7 days.

---

### US-20: Switch Language (FR/EN)

> As a **Breakfast Supervisor**, I want to switch between French and English so that I can use the app in my preferred language.

**Acceptance Criteria:**
1. A language toggle is accessible from the settings panel.
2. Switching language updates all UI strings immediately without a page reload.
3. The selected language persists across sessions via localStorage.
4. Both French and English translations cover all screens and interactive elements.

---

## 5. User Journey Map

```
                            COURTYARD BREAKFAST CHECK-IN — HAPPY PATH

    ┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
    │  OPEN APP    │────▶│  DASHBOARD   │────▶│   UPLOAD     │────▶│   CONFIRM    │
    │  (PWA)       │     │  /           │     │   /upload     │     │   DATA       │
    │              │     │              │     │              │     │              │
    │ Fullscreen   │     │ "Start the   │     │ Photo/PDF    │     │ Review rooms │
    │ standalone   │     │  Day" button │     │ capture      │     │ detected     │
    └─────────────┘     └─────────────┘     │ OCR process  │     │ Merge if     │
                                             └─────────────┘     │ needed       │
                                                                  └──────┬───────┘
                                                                         │
                              ┌───────────────────────────────────────────┘
                              ▼
    ┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
    │   SEARCH     │────▶│  CHECK-IN    │────▶│  PAYMENT?    │────▶│  CONFIRMED   │
    │  /search     │     │  /checkin/   │     │  (COMP only) │     │  Return to   │
    │              │     │  [room]      │     │              │     │  search      │
    │ Room # or    │     │              │     │ Card / Room  │     │              │
    │ Guest name   │     │ Adjust count │     │ Points / Pass│     │ Metrics      │
    │ Keypad input │     │ VIP badge    │     │              │     │ update live  │
    └─────────────┘     └─────────────┘     └─────────────┘     └──────────────┘
         ▲                                                              │
         │                                                              │
         └──────────────── REPEAT 200+ TIMES ◀──────────────────────────┘

                              ▼ (End of service)

    ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
    │   REPORT     │────▶│   EXPORT     │────▶│   CLOSE      │
    │  /report     │     │   CSV        │     │   SESSION     │
    │              │     │              │     │              │
    │ Room-by-room │     │ Download     │     │ Archive to   │
    │ No-shows     │     │ date-stamped │     │ history      │
    │ COMP costs   │     │ file         │     │ Reset for    │
    │ VIP status   │     │              │     │ tomorrow     │
    └─────────────┘     └─────────────┘     └─────────────┘
```

### Decision Points

| Point | Condition | Path A | Path B |
|-------|-----------|--------|--------|
| Upload method | Digital PDF available? | PDF upload | Camera photo(s) |
| Search mode | Guest knows room #? | Numeric keypad | Alpha keypad (name search) |
| Payment gate | Package includes breakfast? | Direct check-in (no prompt) | Payment carousel required |
| Mid-session upload | New guests arrive? | Upload more pages, auto-merge | Continue with existing data |
| Quick add | Room not in report? | Quick Add walk-in guest | Ask guest to verify room # |
| Undo | Mistake made? | Undo last check-in for room | Continue normally |

### Edge Cases

- **Shared rooms**: Two guests under the same room number with different names are kept as separate `Client` entries, each independently searchable and checkable.
- **Late arrivals**: Guests checking in after the report was uploaded can be added via Quick Add or by uploading additional report pages.
- **Multi-device**: V1 is single-device (localStorage). If two devices are used, data does not sync. Phase 2 addresses this with Supabase.
- **OCR failure**: If Gemini returns no parseable data, the app surfaces raw OCR text and offers manual paste as fallback.

---

## 6. Screen Inventory

| Screen | Route | Purpose | Key Components |
|--------|-------|---------|----------------|
| **Dashboard** | `/` (`/dashboard`) | Session overview, analytics, start-the-day entry point | MetricsBar, rush-hour chart, trend chart, HistoryPanel, SettingsToggle |
| **Upload** | `/upload` | Capture or import the daily guest report | PhotoCapture, DocumentScanner, CsvImporter, merge confirmation banner |
| **Search** | `/search` | Find guests by room number or name during active service | NumericKeypad, AlphaKeypad, SearchInput, SuggestionCard, MetricsBar, QuickAddGuest |
| **Check-in Detail** | `/checkin/[roomNumber]` | View guest info, adjust count, select payment, confirm check-in | PeopleCounter, payment carousel, VIP badge, undo action |
| **Report** | `/report` | End-of-day summary with room-by-room breakdown | DataTable, export button, COMP cost summary, no-show list |

### Shared Components

| Component | File | Used On |
|-----------|------|---------|
| `MetricsBar` | `src/components/MetricsBar.tsx` | Search, Dashboard |
| `PeopleCounter` | `src/components/PeopleCounter.tsx` | Check-in Detail |
| `NumericKeypad` | `src/components/NumericKeypad.tsx` | Search |
| `AlphaKeypad` | `src/components/AlphaKeypad.tsx` | Search |
| `SearchInput` | `src/components/SearchInput.tsx` | Search |
| `SuggestionCard` | `src/components/SuggestionCard.tsx` | Search |
| `PhotoCapture` | `src/components/PhotoCapture.tsx` | Upload |
| `DocumentScanner` | `src/components/DocumentScanner.tsx` | Upload |
| `CsvImporter` | `src/components/CsvImporter.tsx` | Upload |
| `DataTable` | `src/components/DataTable.tsx` | Report |
| `HistoryPanel` | `src/components/HistoryPanel.tsx` | Dashboard |
| `ClientHistory` | `src/components/ClientHistory.tsx` | Dashboard |
| `QuickAddGuest` | `src/components/QuickAddGuest.tsx` | Search |
| `SettingsToggle` | `src/components/SettingsToggle.tsx` | Dashboard |

---

## 7. Data Model

### Client (Guest Record)

```typescript
interface Client {
  roomNumber: string;
  roomType: string;
  rtc: string;
  confirmationNumber: string;
  name: string;
  arrivalDate: string;
  departureDate: string;
  reservationStatus: string;
  adults: number;
  children: number;
  rateCode: string;
  packageCode: string;
  pendingPaymentAction?: string;
  isVip?: boolean;
  vipLevel?: string;
  vipNotes?: string;
}
```

### CheckInRecord

```typescript
interface CheckInRecord {
  id: string;
  roomNumber: string;
  clientName: string;
  peopleEntered: number;
  timestamp: string;
  paymentAction?: string; // 'card' | 'room' | 'points' | 'pass'
}
```

### SessionRecord (Archived Day)

```typescript
interface SessionRecord {
  date: string;
  closedAt: string;
  totalRooms: number;
  totalGuests: number;
  totalEntered: number;
  totalRemaining: number;
  totalVip: number;
  clients: Client[];
  checkIns: CheckInRecord[];
  rawUploadText?: string;
}
```

### DailySnapshot (Analytics)

```typescript
interface DailySnapshot {
  date: string;
  totalExpected: number;
  totalShowedUp: number;
  noShows: number;
  noShowPercent: number;
  compCount: number;
  compShowedUp: number;
  compCost: number;        // compShowedUp * costPerCover
}
```

---

## 8. Current Limitations and Known Issues

### Authentication

- **No authentication in V1.** Any device with the URL can access the app.
- Planned: One unique access code per hotel property to prevent cross-property data mixing.

### Data Persistence

- **localStorage only.** Data lives on a single device and is lost if the browser cache is cleared.
- No multi-device sync. Two iPads at the same restaurant entrance will have divergent data.
- Session history is limited by localStorage quota (~5-10 MB depending on browser).

### OCR Accuracy

- Guest names from OCR are occasionally incorrect (field test 2026-03-12). The Gemini prompt has been tightened but edge cases remain with unusual character combinations.
- PDF OCR depends on render quality; low-resolution PDFs produce worse results.

### Internationalization

- Some hardcoded strings are not yet covered by the i18n system.
- Date formats are not yet locale-aware (ISO format used internally).

### UX Gaps

- No offline indicator when the device loses connectivity (OCR requires network).
- No haptic feedback on check-in confirmation.
- No loading skeleton states on slower devices.
- No undo confirmation toast with a time-limited reversal window.

### Platform

- Optimized for iOS Safari PWA. Android Chrome works but has not been field-tested.
- Desktop is functional but not the primary target; touch targets are sized for mobile.

---

## 9. Phase 2 Roadmap

| Priority | Feature | Description |
|----------|---------|-------------|
| **P0** | **Access Code Authentication** | One unique code per property. Entered once, stored in localStorage. Prevents unauthorized access and cross-property data contamination. |
| **P0** | **Supabase Backend** | Replace localStorage with Supabase (Postgres + real-time). Enables multi-device sync, persistent history, and server-side analytics. |
| **P1** | **Motion Design Upgrade** | Integrate Motion (Framer Motion) and AutoAnimate for page transitions, check-in confirmation animations, and list reordering. |
| **P1** | **Haptic Feedback** | `navigator.vibrate()` on check-in, undo, and error states. iOS requires user gesture context. |
| **P1** | **True PDF Export** | Generate styled PDF reports (not just CSV) using a library like `jsPDF` or server-side rendering. |
| **P2** | **Multi-Property Support** | Property selector on login. Each property has isolated data, its own access code, and separate session history. |
| **P2** | **Offline Mode** | Service worker caches the app shell and queues check-ins offline. Syncs to Supabase when connectivity returns. |
| **P2** | **Push Notifications** | Alert the supervisor when a VIP guest is expected (based on arrival date matching today). |
| **P3** | **PMS Integration** | Direct API connection to Opera PMS or similar to eliminate the photo/PDF upload step entirely. |
| **P3** | **Guest Photo Matching** | Use device camera to match guest faces against passport photos from the PMS (privacy-gated, opt-in). |

---

## 10. Design System

### Brand Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `--color-brand` | `#A66914` | Primary gold. Buttons, active states, brand accents |
| `--color-brand-light` | `#DD9C28` | Light gold. Hover states, gradients, secondary highlights |
| `--color-brand-50` | `#FBF5EB` | Gold tint. Card backgrounds, subtle fills |
| `--color-brand-100` | `#F5E6C8` | Gold wash. Selected states, active tab backgrounds |
| `--color-dark` | `#1C1C1C` | Primary text |
| `--color-slate` | `#555759` | Secondary text |
| `--color-teal` | `#425563` | Tertiary text, icons |
| `--color-forest` | `#303939` | Dark accents |
| `--color-muted` | `#707070` | Disabled text, placeholders |
| `--color-border` | `#C4C4C4` | Dividers, card borders |
| `--color-error` | `#D0021B` | Error states, destructive actions |
| `--color-bg-alt` | `#F4F4F4` | Alternate background |

### Dark Mode

| Element | Value |
|---------|-------|
| Background | `#0A0A0F` |
| Text | `#F0F0F5` |
| Glass surfaces | `rgba(255, 255, 255, 0.10)` with `blur(20px)` |
| Glass borders | `rgba(255, 255, 255, 0.12)` |

Toggled via `.dark` class on `<html>`. Transition: `background-color 0.3s ease, color 0.3s ease`.

### Typography

| Priority | Font | Fallback |
|----------|------|----------|
| 1 | MuseoSans | -- |
| 2 | Nunito | -- |
| 3 | -apple-system, BlinkMacSystemFont | Arial, sans-serif |

Anti-aliasing: `-webkit-font-smoothing: antialiased`.

### Spacing and Radii

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-card` | `14px` | Cards, modals, panels |
| `--radius-pill` | `52px` | Buttons, search fields, tags |

### Glassmorphism System

| Class | Background | Blur | Usage |
|-------|-----------|------|-------|
| `.glass` | `rgba(255, 255, 255, 0.72)` | `blur(20px) saturate(180%)` | Cards, panels, overlays |
| `.glass-dark` | `rgba(0, 0, 0, 0.45)` | `blur(20px) saturate(180%)` | Dark overlays, modals |
| `.glass-brand` | `rgba(166, 105, 20, 0.12)` | `blur(20px) saturate(180%)` | Brand-tinted surfaces |
| `.glass-key` | `rgba(255, 255, 255, 0.85)` | `blur(8px)` | Keypad keys |

### Design Principles

1. **Apple-grade polish.** Every surface, shadow, and transition should feel like a native iOS app.
2. **One-hand operation.** All primary actions reachable with the thumb in the bottom 60% of the screen.
3. **Information density without clutter.** Show metrics at a glance but never overwhelm.
4. **Premium warmth.** The gold palette and warm light backgrounds evoke Marriott's luxury positioning.
5. **Instant feedback.** Every tap produces a visible response within 100ms.

---

## 11. Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| First Contentful Paint | < 1.5s on 4G |
| Time to Interactive | < 2.5s on 4G |
| Check-in tap-to-confirm | < 300ms |
| Search result display | < 200ms after keypress |
| OCR processing (single page) | < 5s per photo |
| localStorage budget | < 3 MB per active session |
| Accessibility | WCAG 2.1 AA for contrast ratios |
| PWA Lighthouse score | > 90 |
| Test coverage | 133+ tests, all passing before deploy |

---

## 12. Success Metrics

| Metric | Baseline (Paper) | Target (V1) | Target (V2) |
|--------|-------------------|-------------|-------------|
| Time to check in one guest | ~15 seconds | < 3 seconds | < 2 seconds |
| Revenue leakage (missed COMP charges) | Unknown | Tracked, < 2% | < 1% |
| Daily report setup time | 0 (no tracking) | < 3 minutes | < 1 minute |
| End-of-day report generation | Manual (30 min) | Instant | Instant + PDF |
| Staff training time | N/A | 0 (self-explanatory) | 0 |
| Data available for GM review | None | Same-day | Real-time |

---

*This document is maintained alongside the codebase at `docs/PRD.md` and updated as features are shipped.*
