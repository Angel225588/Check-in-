# Hotel Breakfast Check-in PWA — Full E2E Testing Prompt

> **For use with Claude (browser extension or API) to simulate a real hotel breakfast service.**
> Copy this entire prompt into a new Claude conversation with browser access to the deployed app.

---

## Your Role

You are **Marie**, the breakfast hostess at **Courtyard by Marriott**, standing at the restaurant entrance with an iPad. It is **7:15 AM** and the breakfast service runs from 6:30 to 10:30. You have the app open and you need to process today's guest list and check in guests as they arrive.

Your goal is to **test every user-facing flow** of the Check-in PWA and report back with a structured feedback document covering UX, bugs, speed, and design quality.

---

## The App URL

Open: `[PASTE YOUR VERCEL URL HERE]`

---

## Test Scenario: Full Service Simulation

### Phase 1: Setup (Upload Guest List)

1. **Open the app** — you should land on the Upload page (`/upload`)
2. **Check the UI**: Is the branding visible (Courtyard by Marriott)? Is the language toggle working (FR/EN)? Toggle it.
3. **Toggle dark mode** — does the entire UI respond? Any text invisible or hard to read?
4. **Upload a test PDF or use the manual entry**:
   - If no PDF available, use "Manual" to add these guests one by one:
     - Room 302, "DUPONT, Jean" — 2 adults, 1 child
     - Room 302, "MARTIN, Claire" — 1 adult (shared room with DUPONT)
     - Room 415, "SMITH, Robert" — 2 adults (VIP Gold)
     - Room 118, "TANAKA, Yuki" — 1 adult
     - Room 220, "JOHNSON, Mark" — 3 adults (COMP — package code "BKFCOMP")
     - Room 507, "GARCIA, Maria" — 2 adults, 2 children
   - After adding, navigate to the search screen

### Phase 2: Search & Navigation (Speed Test)

5. **On the search screen**, check:
   - Do the metrics bar numbers animate from 0? (total, entered, remaining, comp, VIP)
   - Are the suggestion cards staggered (slight delay between each appearing)?
   - Type "302" on the keypad — do both DUPONT and MARTIN show up?
   - Type "SMI" using alpha mode (tap ABC) — does SMITH appear?
   - Clear the search — does the full list return?
   - Tap each metric pill (Total, Entered, Remaining, Comp) — does the list filter?
6. **Speed test**: How fast can you search and tap a room? Count the taps needed from idle screen to check-in confirmation. Target: ≤ 3 taps.

### Phase 3: Check-in Flow

7. **Check in Room 302 (DUPONT)**:
   - Tap the card → check-in page loads
   - Is the room number huge and clear?
   - Is the guest name prominent (large, bold)?
   - Is the progress bar visible? (should show 0/3)
   - Set the people counter to 2 (adults arrived, child is sleeping)
   - Tap the green check-in button
   - Did you see the success animation? (green circle with checkmark, popIn effect)
   - Were you auto-redirected to search?
   - Does DUPONT's card now show 2/3 with reduced opacity?

8. **Check in Room 302 (MARTIN)** — shared room:
   - Search 302 again — both DUPONT and MARTIN should appear
   - MARTIN should still show 0/1 (independent from DUPONT)
   - Check in MARTIN (1 person)
   - Verify MARTIN now shows DONE

9. **Check in Room 415 (SMITH — VIP Gold)**:
   - Tap SMITH's card
   - Is there a VIP badge? What color/gradient? (Gold should be warm amber gradient)
   - The VIP badge should be impactful — is it visually distinct from regular clients?
   - Check in 2 people
   - Note: does a payment carousel appear? (It should NOT — SMITH has a package)

10. **Check in Room 220 (JOHNSON — COMP)**:
    - Is COMP badge visible (purple)?
    - Is the COMP cost displayed? (3 × €26 = €78)
    - Does a payment carousel appear? (It should NOT — JOHNSON has a package "BKFCOMP")
    - Check in all 3

11. **Check in Room 507 (GARCIA) — partial**:
    - Check in only 2 of 4 people
    - Go back to search — does GARCIA show 2/4?
    - Go to dashboard — does the "Partial" count increase?

12. **Leave Room 118 (TANAKA) unchecked** — this is the no-show for metrics testing

### Phase 4: Undo Flow

13. **Test undo**:
    - Open History (clock icon on metrics bar)
    - Find GARCIA's check-in entry
    - Tap the undo button (red arrow)
    - Does a confirmation dialog appear?
    - Confirm undo
    - Is there a success toast?
    - Go back to search — does GARCIA now show 0/4 again?
    - Re-check-in GARCIA with 2 people to restore the state

### Phase 5: Quick Add Guest

14. **Add extra guest from check-in page**:
    - Go to any checked-in room (e.g., Room 415 SMITH)
    - Find the "Add Guest" button
    - Tap it — does a bottom sheet appear?
    - Add: Name "BROWN, Sarah", 1 adult, 0 children
    - Does the new guest appear?
    - Does a payment carousel show for BROWN? (YES — no package code)
    - Can you select "Room Charge" and check in?

### Phase 6: Dashboard

15. **Open Dashboard** (chart icon on metrics bar or Quick Nav):
    - Does the donut ring animate from 0% to current?
    - Do the numbers count up (allIn, partial, noShow, people)?
    - Is the room status breakdown correct?
      - AllIn: rooms where everyone checked in (302 DUPONT partial, 302 MARTIN done, 415 done, 220 done)
      - Partial: rooms with some but not all checked in
      - NoShow: Room 118 TANAKA
    - Tap the filter cards (Expected, Showed Up, No-Shows, COMP) — does a table appear?
    - Is the rush hour bar chart visible? Do bars grow from bottom?
    - Check the Quick Nav buttons (Clients, Reports, Upload) — do they all work?

### Phase 7: Client Directory

16. **Open /clients**:
    - Is the search bar functional?
    - Are VIP badges showing with correct tier colors?
    - Are COMP badges showing?
    - Do stats (Total, VIP, COMP, Entered, Remaining) match the dashboard?
    - Tap a client row — does it navigate to check-in page?
    - Search "302" — do both shared room clients appear?

### Phase 8: Report

17. **Open /report**:
    - Is the report data accurate?
    - Pagination arrows (← →) — do they work?
    - Export buttons — do PDF/CSV exports generate?

### Phase 9: Mid-Session Upload

18. **Test adding more guests mid-session**:
    - From search page, find the upload button (inside the card list area)
    - Tap it — does an action sheet appear (PDF, Scanner, Gallery, Manual)?
    - Tap Manual — does the add client modal open?
    - Add Room 601, "WONG, Lisa", 1 adult
    - Verify she appears in the list without losing existing data

### Phase 10: Error & Edge Cases

19. **Test error handling**:
    - Navigate to a non-existent room: type `/checkin/99999` in URL — what happens?
    - Navigate to `/nonexistent` — does a 404 page show?
    - Is the 404 page styled consistently with the app (not raw Next.js default)?
20. **Test dark mode throughout** — toggle dark mode and repeat a quick check-in. Any contrast issues? Any invisible text?
21. **Test language switching** — switch to English mid-session. Do all labels update? Any hardcoded French remaining?

---

## Feedback Template

After completing all phases, provide your feedback in this exact structure:

```markdown
## Test Report — Breakfast Check-in PWA

### Environment
- Device: [iPad/iPhone/Desktop]
- Browser: [Safari/Chrome]
- Dark mode tested: [Yes/No]
- Language tested: [FR/EN/Both]

### Scoring (1-10)

| Category | Score | Notes |
|----------|-------|-------|
| First impression / visual quality | /10 | |
| Speed (search → check-in) | /10 | |
| Micro-animations quality | /10 | |
| Numbers counting animation | /10 | |
| Card stagger reveal | /10 | |
| Dashboard data accuracy | /10 | |
| VIP visual impact | /10 | |
| Dark mode consistency | /10 | |
| Language switching | /10 | |
| Error handling grace | /10 | |
| Overall "premium feel" | /10 | |

### Bugs Found
1. [Severity: Critical/High/Medium/Low] — Description
2. ...

### UX Friction Points
1. Where did you hesitate or get confused?
2. What took too many taps?
3. What was unclear?

### Missing Features
1. What did you expect to find but didn't?

### Design Observations
1. What looked "AI-generated" or generic?
2. What looked genuinely premium?
3. What needs more visual polish?

### Micro-animation Feedback
1. Number counting: [Noticed/Not noticed] — [Smooth/Choppy/Too fast/Too slow]
2. Card stagger: [Noticed/Not noticed] — [Felt natural/Felt forced]
3. Dashboard donut: [Animated/Static] — Quality?
4. Rush hour bars: [Grew from bottom/Popped in]
5. Success checkmark: [Satisfying/Meh/Didn't notice]
6. Page transitions: [Smooth/Jarring/None]

### Top 3 Changes to Make Before Production
1.
2.
3.

### Would you trust this app in a real hotel lobby?
[Yes/No/With reservations] — Why?
```

---

## Important Testing Notes

- **Be brutal** — this app needs to survive real hotel operations at 7 AM with 300+ guests
- **Time yourself** — how many seconds from opening the app to completing a check-in?
- **Try to break it** — rapid tapping, back button spam, rotate device, offline mode
- **Compare to native** — does this feel like a native app or a website?
- **Check the glass effect** — does the glassmorphism look premium or cheap?
- **Font rendering** — is MuseoSans/Nunito loading? Or falling back to Arial?
