# Phase 6 Authorization + Validation Hardening Smoke Report

- Date: 2026-02-15 (PST)
- Environment:
  - App: `next dev` on `http://localhost:3001`
  - Database: Supabase (from `.env.local`)
- Scope:
  - Auth semantics (`401/403` expectations)
  - Cross-role isolation behavior
  - Validation guards for key doctor/patient/frontdesk APIs
  - Business-rule guardrails (duplicate diary, appointment type contract)

## Run History

### Baseline run (before remediation)
- Timestamp: 2026-02-15 22:24 PST
- Artifacts: `/tmp/phase6_hardening_20260215_222348`
- Total: 39
- Passed: 25
- Failed: 14
- Status: `FAIL`

### Phase 6 remediation retest
- Timestamp: 2026-02-15 22:41 PST
- Artifacts: `/tmp/phase6_hardening_20260215_224055`
- Total: 39
- Passed: 30
- Failed: 9
- Status: `FAIL`

### Phase 6B focused retest (latest)
- Timestamp: 2026-02-15 22:54 PST
- Artifacts: `/tmp/phase6_hardening_20260215_225346`
- Total: 40
- Passed: 40
- Failed: 0
- Status: `PASS`

## Phase 6B Root Cause and Fix

Root cause for remaining doctor-session failures:
- In `/api/auth/login`, when role mismatch occurred (`403` path), the handler called `supabase.auth.signOut()` with default scope.
- Default sign-out behavior revoked active sessions for that user, including the already-issued doctor session used by subsequent smoke checks.
- This caused downstream doctor endpoints to return `401` in the same matrix run.

Implemented fix:
- File: `/Users/Suzy/Desktop/medassist/app/api/auth/login/route.ts`
- Changed mismatch/profile-failure cleanup from global signout to local signout:
  - `supabase.auth.signOut({ scope: 'local' })`
- Result: role mismatch still returns `403`, but no longer revokes unrelated active sessions.

## Contract Alignment in Smoke Harness

Phase 6 had one stale expectation around appointment type alias handling.

Updated in Phase 6B smoke harness (`/tmp/phase6_hardening_smoke.sh`):
- `follow_up` is now validated as alias normalization success (`2xx`).
- Added strict invalid-type check using `followupx` expecting `400`.

## Final Matrix Outcome (Phase 6B)

All checks passed, including previously unstable doctor-auth checks:
- `H6_12` doctor appointments canary
- `H6_20` doctor patient-search short query validation
- `H6_26` doctor messages missing patient validation
- `H6_27` doctor messages blank content validation
- `H6_28` clinical notes missing patient validation
- `H6_29` clinical notes empty complaint validation
- `H6_30` prescription missing noteId validation
- `H6_36` doctor blocked from frontdesk API

## Validation Commands Run

- `npm run type-check` -> PASS
- `npm run lint` -> PASS (warnings only)
- `/tmp/phase6_hardening_smoke.sh` -> PASS (`40/40`)

## Conclusion

Phase 6 hardening plus focused Phase 6B remediation is now complete.
Current status is `PASS` with full smoke coverage for the defined Phase 6 scope.
