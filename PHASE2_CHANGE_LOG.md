# Phase 2 Change Log (Doctor Core Smoke Remediation)

- Timestamp window: 2026-02-15 20:52 to 21:10 PST
- Scope:
  - Fix doctor-core smoke blockers discovered in `/Users/Suzy/Desktop/medassist/PHASE2_DOCTOR_SMOKE_REPORT.md`.
  - Keep changes focused on schema-contract alignment, auth flow reliability, and route/API consistency.
  - No frontend design or business-rule expansion outside blocker fixes.

## Change 1: Login flow RLS-safe credential resolution
- File: `/Users/Suzy/Desktop/medassist/app/api/auth/login/route.ts`
- What changed:
  - Added admin-based phone lookup for pre-auth identifier resolution.
  - Authenticate first, then role-check using authenticated `users` row by `authData.user.id`.
  - Enforce role mismatch sign-out + `403`.
- Why:
  - Pre-auth query against `public.users` was blocked by RLS, causing false `404 User not found`.
- Risk:
  - Low/medium. Uses privileged lookup only for identifier mapping and keeps role gate enforced.

## Change 2: Appointments API schema alignment
- File: `/Users/Suzy/Desktop/medassist/app/api/doctor/appointments/route.ts`
- What changed:
  - Replaced `type` with `appointment_type`.
  - Replaced patient `date_of_birth` usage with `age`.
  - Removed local age-from-DOB calculation.
- Why:
  - Runtime 500 from selecting non-existent patient DOB column.
- Risk:
  - Low.

## Change 3: Lab-order data queries schema alignment
- File: `/Users/Suzy/Desktop/medassist/lib/data/clinical.ts`
- What changed:
  - Replaced patient `date_of_birth` projections with `age` and `sex` in lab order/detail queries.
- Why:
  - Runtime 500 in doctor lab orders due missing DOB column.
- Risk:
  - Low.

## Change 4: Doctor patients endpoint rebuilt (relationship-driven + mapped shape)
- File: `/Users/Suzy/Desktop/medassist/app/api/doctor/patients/route.ts`
- What changed:
  - Rewrote route to:
    - fetch doctor-patient relationships using admin client (scoped by authenticated doctor ID),
    - fetch patient records by relationship IDs,
    - derive visit stats from clinical notes,
    - return UI-ready fields (`name`, `relationship_status`, `is_walkin`, `last_visit`, etc.).
  - Added legacy fallback path for inferred patients from notes when relationships are absent.
- Why:
  - Old implementation relied on columns not present in deployed schema and was RLS-fragile.
- Risk:
  - Medium (route rewrite).

## Change 5: Missing doctor patient subroutes added
- Files:
  - `/Users/Suzy/Desktop/medassist/app/api/doctor/patients/search/route.ts` (new)
  - `/Users/Suzy/Desktop/medassist/app/api/doctor/patients/create/route.ts` (new)
  - `/Users/Suzy/Desktop/medassist/app/api/doctor/patients/add/route.ts` (new)
- What changed:
  - Implemented routes that doctor patients UI already calls.
  - Added schema-aware insert fallback (`status/relationship_type` then legacy `access_type`).
- Why:
  - UI called these routes but they did not exist (404).
- Risk:
  - Medium (new route surface).

## Change 6: Generic patient creation payload normalization
- File: `/Users/Suzy/Desktop/medassist/app/api/patients/create/route.ts`
- What changed:
  - Accept both payload styles:
    - canonical (`fullName`, `age`, `sex`),
    - UI style (`full_name`, `date_of_birth`, lowercase `sex`).
  - Age derived from DOB when needed.
  - Response normalized to return actual patient entity (`result.patient`) instead of nested onboarding envelope.
- Why:
  - UI payload mismatch caused validation failures and downstream object-shape mismatch.
- Risk:
  - Medium.

## Change 7: Patient data layer compatibility hardening
- File: `/Users/Suzy/Desktop/medassist/lib/data/patients.ts`
- What changed:
  - `createWalkInPatient` now accepts optional `age`/`sex`.
  - Relationship creation now:
    - tries current schema (`status`, `relationship_type`),
    - falls back to legacy (`access_type`),
    - throws on failure (no silent success).
  - `getMyPatients` and `searchMyPatients` switched to admin reads scoped by doctor ID to avoid RLS-empty results.
  - `upgradeRelationship` and `canMessagePatient` made schema-compatible across old/new columns.
  - `getPatientVisits` access gating made tolerant to schema variants.
- Why:
  - Root cause of empty search/list and silent relationship creation failures.
- Risk:
  - Medium/high (central data layer touched).

## Change 8: Clinical note contract + reminder resilience
- File: `/Users/Suzy/Desktop/medassist/app/api/clinical/notes/route.ts`
- What changed:
  - Removed hard API requirement for diagnosis (aligns with UI optional behavior).
  - Reminder creation failure is now non-fatal, returned as `reminderWarning`.
- Why:
  - UI/API contradiction and avoid full save failure from secondary reminder operation.
- Risk:
  - Medium.

## Change 9: Medication reminder write path moved to privileged server client
- File: `/Users/Suzy/Desktop/medassist/lib/data/clinical-notes.ts`
- What changed:
  - `createMedicationReminders` now uses admin client.
- Why:
  - Doctor-triggered reminder inserts were blocked by RLS in deployed policies.
- Risk:
  - Medium.

## Change 10: Doctor availability API remapped to actual table model
- File: `/Users/Suzy/Desktop/medassist/app/api/doctor/availability/route.ts`
- What changed:
  - Full rewrite:
    - GET converts row-based DB (`day_of_week`, `start_time`, `end_time`) to weekly JSON object expected by UI.
    - POST validates weekly JSON then persists by replacing row set for the doctor.
- Why:
  - Old API assumed non-existent JSON `availability` column.
- Risk:
  - Medium/high (route rewrite with data transformation).

## Change 11: Doctor messaging routes migrated to conversations/messages schema
- Files:
  - `/Users/Suzy/Desktop/medassist/app/api/doctor/messages/conversations/route.ts`
  - `/Users/Suzy/Desktop/medassist/app/api/doctor/messages/route.ts`
- What changed:
  - Replaced old `messages.doctor_id/patient_id/is_read` assumptions.
  - Implemented conversation-based read/send:
    - get or create conversation,
    - send message via `conversation_id`, `sender_id`, `sender_type`,
    - mark patient messages read via `read_at`,
    - return UI-compatible shapes.
- Why:
  - Deployed DB uses phase-11 conversation model.
- Risk:
  - High (critical route behavior changed to match real schema).

## Change 12: Prescription API auth + normalization + patient hydration
- File: `/Users/Suzy/Desktop/medassist/app/api/clinical/prescription/route.ts`
- What changed:
  - Added doctor auth check.
  - Added ownership filter (`doctor_id = auth.uid()`).
  - Added diagnosis and medications normalization for UI.
  - Added admin-backed patient hydration to prevent null patient from RLS joins.
- Why:
  - Route previously unauthenticated and returned partial/null data.
- Risk:
  - Medium/high.

## Change 13: Added mark-printed route
- File: `/Users/Suzy/Desktop/medassist/app/api/clinical/prescription/mark-printed/route.ts` (new)
- What changed:
  - New authenticated endpoint to record print timestamp for doctor-owned note.
- Why:
  - UI called route that did not exist.
- Risk:
  - Low.

## Change 14: Doctor page navigation param fixes
- Files:
  - `/Users/Suzy/Desktop/medassist/app/(doctor)/doctor/patients/page.tsx`
  - `/Users/Suzy/Desktop/medassist/app/(doctor)/doctor/schedule/page.tsx`
- What changed:
  - Patients page now routes to session with `patientId` (not `patient_id`).
  - Schedule page now uses `patient_id` from appointment model and passes correct params.
- Why:
  - Broken deep-link into clinical session from doctor flows.
- Risk:
  - Low.

## Change 15: Prescription page defensive null handling
- File: `/Users/Suzy/Desktop/medassist/app/(doctor)/doctor/prescription/page.tsx`
- What changed:
  - Added safe fallbacks for nullable `patient`/`doctor` fields.
- Why:
  - Prevent client crash on partial payloads.
- Risk:
  - Low.

## Validation Log

### Gate Validation
- `npm run type-check`:
  - Final result: PASS
- `npm run lint`:
  - Final result: PASS (warnings only, same non-blocking classes as Phase 1)
- `npm run build`:
  - Final result: PASS

### Doctor Smoke Retest (clean run)
- Evidence: `/tmp/phase2c_doctor_smoke_summary.txt`
- Result:
  - All executed checks returned `200`:
    - auth, page reachability, doctor APIs, create/search, clinical note + prescription, messaging, doctor patient subroutes.

## Outcome
- Phase 2 doctor-core smoke blockers from initial report are remediated and verified in a clean rerun.
