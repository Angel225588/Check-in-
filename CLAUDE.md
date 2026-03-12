# Check-in PWA


## Overview
Hotel breakfast check-in PWA. Upload daily report photos (Gemini Vision API), search rooms, check in guests.

## Tech Stack
- Next.js 16 App Router, TypeScript, Tailwind CSS v4
- Gemini 2.5 Flash Vision API for OCR
- Tesseract.js as fallback
- localStorage for persistence
- Vitest + jsdom for testing

## TDD Workflow (MANDATORY)
1. **Write tests FIRST** before implementing any feature or fix
2. Tests live in `src/__tests__/` with pattern `*.test.ts`
3. Run tests: `npx vitest run`
4. Run single file: `npx vitest run src/__tests__/filename.test.ts`
5. All tests must pass before committing — currently 91 tests across 5 files
6. Test files: `parser.test.ts`, `ocr-api.test.ts`, `photo-capture.test.ts`, `vip.test.ts`, `report.test.ts`

## Key Paths
- API routes: `src/app/api/ocr/route.ts`, `src/app/api/ocr-vip/route.ts`
- Pages: `src/app/upload/`, `src/app/search/`, `src/app/checkin/[roomNumber]/`, `src/app/report/`
- Components: `src/components/`
- Logic: `src/lib/` (types, storage, parser, vip, report, utils)
- Tests: `src/__tests__/`

## Brand & Design
- Primary gold: `#A66914`, Light gold: `#DD9C28`
- Font: MuseoSans > Nunito > Arial
- Card radius: 14px, Pill buttons: 52px radius
- Apple-style glassmorphism: backdrop-blur, translucent backgrounds
- CSS tokens defined in `src/app/globals.css` via `@theme`

## Conventions
- "use client" on all interactive components
- Gemini API uses `thinkingBudget: 0` (no thinking mode) for speed
- Multi-photo uploads process in parallel via `Promise.allSettled`
- Shared rooms (same room, different names) are kept as separate entries
- VIP matching uses room+name composite key
