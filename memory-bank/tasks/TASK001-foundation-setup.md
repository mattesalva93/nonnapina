# [TASK001] - Project Transition Phase 1: Foundation Setup

**Status:** Pending
**Added:** 2026-03-07
**Updated:** 2026-03-07

## Original Request

Transition the Keepa Tracker project from a CLI script pipeline (v0.0.4) to a Dockerized Express/Prisma/PostgreSQL server application, as described in `project-evolution.instructions.md`. Phase 1 focuses on foundation setup.

## Thought Process

The transition needs to be incremental — existing JS code should continue working while new TypeScript infrastructure is set up alongside it. The order matters:

1. **TypeScript first** — enables typed code for all subsequent work
2. **Prisma + PostgreSQL** — defines the data model, which informs service interfaces
3. **Docker** — provides the runtime environment (especially for Chromium/Puppeteer)
4. **Vitest** — ensures quality from the start of the new codebase
5. **Config migration** — first module to migrate as it's a dependency of everything else

## Implementation Plan

- Step 1: Initialize TypeScript (`tsconfig.json`, install `typescript` + `tsx`)
- Step 2: Set up Vitest configuration
- Step 3: Design and create Prisma schema (Product, Deal, PriceHistory, ScrapeRun, Category)
- Step 4: Create Dockerfile (multi-stage with Chromium) and docker-compose.yml
- Step 5: Migrate `config/index.js` → `config/index.ts` with zod validation
- Step 6: Create Express server bootstrap (`server.ts`)

## Progress Tracking

**Overall Status:** Not Started - 0%

### Subtasks

| ID  | Description                            | Status      | Updated    | Notes                                                       |
| --- | -------------------------------------- | ----------- | ---------- | ----------------------------------------------------------- |
| 1.1 | Initialize TypeScript configuration    | Not Started | 2026-03-07 | tsconfig.json + dev dependencies                            |
| 1.2 | Set up Vitest                          | Not Started | 2026-03-07 | vitest.config.ts + first test                               |
| 1.3 | Design Prisma schema                   | Not Started | 2026-03-07 | Models for Product, Deal, PriceHistory, ScrapeRun, Category |
| 1.4 | Create Dockerfile + docker-compose.yml | Not Started | 2026-03-07 | Multi-stage, Chromium, non-root user                        |
| 1.5 | Migrate config to TypeScript with zod  | Not Started | 2026-03-07 | First TS module                                             |
| 1.6 | Create Express server bootstrap        | Not Started | 2026-03-07 | Basic server.ts with health endpoint                        |

## Progress Log

### 2026-03-07

- Task created during project analysis and transition planning
- All memory bank files initialized
- Current codebase verified: no errors, fully functional CLI pipeline
