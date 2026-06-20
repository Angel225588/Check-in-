# Check-in PWA


## Overview
Hotel breakfast check-in PWA. Upload daily report photos (Gemini Vision API), search rooms, check in guests.

## Status Pulse — "where are we at?" (MANDATORY when asked)
When the user asks "where are we at" (or similar), do NOT answer from git alone. Pull the real state and synthesize **signal vs noise so we focus on value**:
1. **Git** — current branch, clean/dirty, recent commits.
2. **ClickUp** — read the live tasks. Workspace: `Imarketin` (space `90143235266`).
   - Client deal — folder **Marriott — Courtyard Paris Porte de Versailles** (`90149650540`): lists `📋 Now — Pré-signature` (`901416757254`), `🚀 Next — Post-signature build` (`901416757259`), `✅ Done` (`901416757260`).
   - Platform/GTM — folder **Imarketin Hôtellerie** (`90149952181`): `🌐 GTM & Assets — Site·Landing·Démo` (`901417135321`), `🧩 Produit & Modules (Roadmap)` (`901417135322`), `🧠 Stratégie & Décisions` (`901417135324`), `🎯 Acquisition & Pipeline` (`901417135326`), `🗄️ Supabase — Migration & Sync` (`901417152354`).
3. **Devlog** — session journal (ClickUp doc "Journal de bord"); also repo `BUGS.md`, `PROCESSES.md`, `OCR-AUDIT.md`, `docs/PRD.md`.
4. **Synthesize** — lead with the highest-value / time-sensitive items (urgent + pre-signature), separate them from noise, recommend the next move. Then ask where we're heading.

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
