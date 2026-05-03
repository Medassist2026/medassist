# Phase A.4 — Existing tests inventory (RLS-relevant)

**Scope:** Prompt 6 / Phase A.4. Inventory every test file that exercises queries through `createAdminClient` / `createClient` / referenced policy infrastructure. Determines whether the existing test suite has silent RLS dependencies that Phase F's "re-run all tests" check needs to surface.
**Date:** 2026-04-30

## Test surface today

```
packages/shared/hooks/__tests__/useOfflineMutation.test.ts
packages/shared/lib/utils/__tests__/phone-normalize-sql-parity.test.ts
packages/shared/lib/utils/__tests__/phone-normalize.test.ts
packages/shared/lib/api/handlers/admin/global-patients-lookup/__tests__/handler.test.ts
packages/shared/lib/api/handlers/frontdesk/payments/create/__tests__/handler.test.ts
packages/shared/lib/data/__tests__/drug-interactions.test.ts
packages/shared/lib/analytics/__tests__/doctor-stats.test.ts
```

Total: **7 test files**, all under `packages/shared`. Zero test files in `apps/clinic/**`, `apps/patient/**`, or repo-root e2e/.

## Test runner status

The repo **does not yet have a runtime test runner configured** (per the in-file comment in `frontdesk/payments/create/__tests__/handler.test.ts` lines 8–17 and `ARCHITECTURE.md` § 14: "vitest is the planned choice"). The 7 files contain either:
- Pure-function tests against helpers that don't touch the database (e.g., `phone-normalize.test.ts` — string transformation only)
- A hand-rolled `test()` harness in `doctor-stats.test.ts` that works for pure functions but cannot mock module graphs
- Type-level assertions at `tsc --noEmit` time + pseudocode `// VITEST:` blocks describing what runtime tests *would* assert once a runner ships

## RLS-relevant references

A grep for `createAdminClient | createClient | RLS | policy | auth\.uid | service_role` across all 7 test files returned exactly **one match** — and it's a doc comment in `frontdesk/payments/create/__tests__/handler.test.ts` line 14 explaining why module-graph mocking can't be done today (the comment names `createClient` as one of the things that *would* need mocking).

**No test currently invokes `createAdminClient`. No test currently invokes `createClient` against a real Supabase. No test depends on RLS being on or off.**

## Implication for Prompt 6

Mo's prompt § F2 says: "Run the full existing test suite. Every test that previously passed must still pass. New failures = the test was implicitly relying on RLS being off."

**Result: trivially satisfied.** No existing test exercises a query path. No silent RLS dependency to break.

This means the **Phase D test matrix becomes the de-facto first real RLS test surface in the codebase**. § F3's "add minimum 5 application-level integration tests" is also the *first* set of integration tests touching the database in this repo.

When vitest lands (post-Prompt-6 work), the team should backfill DB-touching tests for the MIGRATE-TO-USER callsites identified in Phase A.2 — specifically the 5 dependency hot-spots (`patient-privacy-checks`, `clinic-context`, `visibility`, `prescription-sync`, `lab-results`). Tracked as a follow-up beyond Prompt 6's scope.

## Honest risk acknowledgment

The lack of pre-existing RLS coverage means Phase D's matrix bears 100% of the regression-protection load. Mo's "8+ scenarios per patient-joined table" floor is therefore non-negotiable — there's no second line of defense to catch a missed scenario.
