# [TASK024] - Refactor AmazonService Class to Functions

**Status:** Pending
**Added:** 2026-03-10
**Updated:** 2026-03-10
**Priority:** LOW
**Category:** Code Quality / Convention Alignment

## Original Request

Audit finding: `src/services/amazon.ts` uses a **class** (`AmazonService`) with instance methods and a singleton pattern. The project convention (from `project-context.instructions.md`) states: "Prefer functions over classes (except where classes are already established, e.g., `AmazonService`)".

While the instruction explicitly grants an exception for `AmazonService`, the class pattern adds unnecessary ceremony (constructor, `this`, singleton management). Module-level closures can achieve the same encapsulation.

## Detailed Analysis

### Current Pattern

```typescript
class AmazonService {
  private accessToken?: string;
  private tokenExpiry = 0;

  async getAccessToken(): Promise<string> { ... }
  async getProductDetails(asins: string[]): Promise<Map<string, AmazonProduct>> { ... }
}

export const amazonService = new AmazonService();
```

### Proposed Pattern

```typescript
let accessToken: string | undefined;
let tokenExpiry = 0;

async function getAccessToken(): Promise<string> { ... }
async function getProductDetails(asins: string[]): Promise<Map<string, AmazonProduct>> { ... }

export const amazonService = { getAccessToken, getProductDetails };
```

### Benefits

- Aligns with "functions over classes" convention
- Simpler to test (can mock individual functions)
- No `this` context issues
- Same runtime behavior and encapsulation

### Risks

- Low-impact refactor with no functional change
- Can be deferred to later phases

## Implementation Plan

- [ ] Convert class methods to module-level functions
- [ ] Replace `this.` references with direct variable access
- [ ] Keep the same export shape for backward compatibility
- [ ] Remove standalone test block at the end of file (see TASK017)
- [ ] Update any tests if needed

## Progress Tracking

**Overall Status:** Not Started - 0%

### Subtasks

| ID   | Description                                           | Status      | Updated | Notes |
| ---- | ----------------------------------------------------- | ----------- | ------- | ----- |
| 24.1 | Convert AmazonService class to module-level functions | Not Started |         |       |
| 24.2 | Remove standalone test block                          | Not Started |         |       |
| 24.3 | Verify all consumers still work                       | Not Started |         |       |

## Progress Log

### 2026-03-10

- Task created from comprehensive codebase audit
