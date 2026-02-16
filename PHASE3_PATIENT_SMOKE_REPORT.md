# Phase 3 Patient Core Journey Smoke Report

- Date: 2026-02-15 21:16 PST
- Environment:
  - App: `next dev` on `http://localhost:3001`
  - Database: Supabase (from `.env.local`)
- Scope (patient-first core journey):
  - Patient auth entry
  - Core patient APIs (`medications`, `records`, `labs`, `diary`, `messages`)
  - Core patient pages reachability
  - Basic create/read flows for patient-managed data

## Execution Summary

- Total checks executed: 31
- Passed: 22
- Failed: 9
- Overall Phase 3 (Patient core): `FAIL`

Evidence bundle:
- `/tmp/phase3_patient_20260215_211609/summary.txt`
- `/tmp/phase3_patient_20260215_211609/*.json`

## Smoke Matrix

| ID | Check | Result | Evidence |
|---|---|---|---|
| P-01 | Register doctor (for messaging target) | PASS | `/tmp/phase3_patient_20260215_211609/register_doctor.json` (`200`) |
| P-02 | Register patient | PASS | `/tmp/phase3_patient_20260215_211609/register_patient.json` (`200`) |
| P-03 | Patient login | PASS | `/tmp/phase3_patient_20260215_211609/login_patient.json` (`200`) |
| P-04 | `GET /api/patient/medications` initial | PASS | `/tmp/phase3_patient_20260215_211609/api_medications_get_initial.json` (`200`) |
| P-05 | `GET /api/patient/medication-reminders` | PASS | `/tmp/phase3_patient_20260215_211609/api_medication_reminders_get.json` (`200`) |
| P-06 | `GET /api/patient/records` initial | PASS | `/tmp/phase3_patient_20260215_211609/api_records_get_initial.json` (`200`) |
| P-07 | `GET /api/patient/lab-results` | PASS | `/tmp/phase3_patient_20260215_211609/api_lab_results_get.json` (`200`) |
| P-08 | `GET /api/patient/diary` initial | FAIL | `/tmp/phase3_patient_20260215_211609/api_diary_get_initial.json` (`500`) |
| P-09 | `GET /api/patient/messages/conversations` initial | FAIL | `/tmp/phase3_patient_20260215_211609/api_messages_conversations_initial.json` (`500`) |
| P-10 | `POST /api/patient/medications` | PASS | `/tmp/phase3_patient_20260215_211609/api_medications_post.json` (`200`) |
| P-11 | `GET /api/patient/medications` after create | PASS | `/tmp/phase3_patient_20260215_211609/api_medications_get_after_post.json` (`200`) |
| P-12 | `POST /api/patient/records` | PASS | `/tmp/phase3_patient_20260215_211609/api_records_post.json` (`200`) |
| P-13 | `GET /api/patient/records` after create | PASS | `/tmp/phase3_patient_20260215_211609/api_records_get_after_post.json` (`200`) |
| P-14 | `POST /api/patient/diary` | FAIL | `/tmp/phase3_patient_20260215_211609/api_diary_post.json` (`500`) |
| P-15 | `POST /api/patient/diary` duplicate same date | FAIL | `/tmp/phase3_patient_20260215_211609/api_diary_post_duplicate.json` (`500`) |
| P-16 | `GET /api/patient/diary` after create | FAIL | `/tmp/phase3_patient_20260215_211609/api_diary_get_after_post.json` (`500`) |
| P-17 | `POST /api/patient/messages` | FAIL | `/tmp/phase3_patient_20260215_211609/api_messages_post.json` (`500`) |
| P-18 | `GET /api/patient/messages?doctorId=...` | FAIL | `/tmp/phase3_patient_20260215_211609/api_messages_get.json` (`500`) |
| P-19 | `GET /api/patient/messages/conversations` after send | FAIL | `/tmp/phase3_patient_20260215_211609/api_messages_conversations_after.json` (`500`) |
| P-20 | `GET /api/patient/health-summary` | FAIL | `/tmp/phase3_patient_20260215_211609/api_health_summary_get.json` (`404`) |
| P-21 | Page `/patient/dashboard` | PASS | `/tmp/phase3_patient_20260215_211609/page_patient_dashboard.json` (`200`) |
| P-22 | Page `/patient/records` | PASS | `/tmp/phase3_patient_20260215_211609/page_patient_records.json` (`200`) |
| P-23 | Page `/patient/medications` | PASS | `/tmp/phase3_patient_20260215_211609/page_patient_medications.json` (`200`) |
| P-24 | Page `/patient/labs` | PASS | `/tmp/phase3_patient_20260215_211609/page_patient_labs.json` (`200`) |
| P-25 | Page `/patient/lab-results` | PASS | `/tmp/phase3_patient_20260215_211609/page_patient_lab_results.json` (`200`) |
| P-26 | Page `/patient/diary` | PASS | `/tmp/phase3_patient_20260215_211609/page_patient_diary.json` (`200`) |
| P-27 | Page `/patient/messages` | PASS | `/tmp/phase3_patient_20260215_211609/page_patient_messages.json` (`200`) |
| P-28 | Page `/patient/sharing` | PASS | `/tmp/phase3_patient_20260215_211609/page_patient_sharing.json` (`200`) |
| P-29 | Page `/patient/ai/summary` | PASS | `/tmp/phase3_patient_20260215_211609/page_patient_ai_summary.json` (`200`) |
| P-30 | Page `/patient/ai/medications` | PASS | `/tmp/phase3_patient_20260215_211609/page_patient_ai_medications.json` (`200`) |
| P-31 | Page `/patient/ai/symptoms` | PASS | `/tmp/phase3_patient_20260215_211609/page_patient_ai_symptoms.json` (`200`) |

## Confirmed Root Causes

1. Patient diary API is using non-existent schema columns
- File: `/Users/Suzy/Desktop/medassist/app/api/patient/diary/route.ts`
- Symptoms:
  - `column patient_diary.date does not exist`
  - `Could not find the 'date' column of 'patient_diary'`
- Cause:
  - Route expects columns like `date`, `mood`, `energy`, `sleep_quality`, `sleep_hours`, `symptoms`, `notes`.
  - Current migration schema (`supabase/migrations/010_phase8_patient_empowerment.sql`) defines `entry_date`, `entry_type`, `title`, `content`, `severity`, `mood_score`, `tags`, `is_shared`.

2. Patient messaging API is still on legacy `messages` schema
- Files:
  - `/Users/Suzy/Desktop/medassist/app/api/patient/messages/route.ts`
  - `/Users/Suzy/Desktop/medassist/app/api/patient/messages/conversations/route.ts`
- Symptoms:
  - `Could not find the 'doctor_id' column of 'messages'`
  - `column messages.patient_id does not exist`
  - `Could not find a relationship between 'messages' and 'doctors'`
- Cause:
  - Routes still query legacy columns (`patient_id`, `doctor_id`, `is_read`) on `messages`.
  - Current schema (`supabase/migrations/011_phase11_messaging_sharing.sql`) uses `conversations` + `messages(conversation_id, sender_id, sender_type, read_at, sent_at)`.

3. Missing health summary endpoint used by records page
- File (caller): `/Users/Suzy/Desktop/medassist/app/(patient)/patient/records/page.tsx`
- Symptom:
  - `GET /api/patient/health-summary` returns `404`.
- Cause:
  - No route exists at `/Users/Suzy/Desktop/medassist/app/api/patient/health-summary/route.ts`.
  - Page silently falls back to mock data, masking missing backend integration.

## Notes

- No application source code was modified in this phase.
- The following patient pages are currently mock/fallback-heavy despite route reachability passing:
  - `/patient/records` (falls back when health-summary endpoint missing)
  - `/patient/sharing` (API calls commented out; mock dataset)
  - `/patient/ai/*` pages (mock/simulated behavior)

## Proposed Fix Plan (Approval Required Before Code Changes)

1. Rebuild `/api/patient/diary` against actual `patient_diary` schema.
- Map UI payload to existing columns (`entry_date`, `mood_score`, `tags`, `content`, etc.) and return UI-compatible response shape.

2. Migrate patient messaging routes to phase-11 schema.
- Implement conversation-first reads/sends (similar to doctor-side phase-2 fixes), including unread handling via `read_at` and conversation counters.

3. Add `/api/patient/health-summary` aggregator route.
- Return a stable minimal schema required by `/patient/records`, sourced from existing patient tables, without relying on mock fallbacks.

4. Optional follow-up (separate scope):
- Implement real `/api/patient/sharing` routes and connect the sharing page to backend preferences table.

## Remediation Retest (Post-Fix)

- Retest timestamp: 2026-02-15 21:35 PST
- Evidence bundle: `/tmp/phase3d_patient_20260215_213506/`
- Status: `PASS`
- Result summary:
  - Auth + setup: PASS (`register_doctor`, `register_patient`, `login_patient`)
  - Patient APIs: PASS (`medications`, `medication-reminders`, `records`, `lab-results`, `diary`, `messages`, `health-summary`)
  - Expected business validation: PASS (`api_diary_post_duplicate` returns `409` duplicate-date guard)
  - Patient pages reachability: PASS (all tested patient routes `200`)

Retest counts:
- Total checks: 31
- Passed: 31
- Failed: 0
