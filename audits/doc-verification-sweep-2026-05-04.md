# Documentation Accuracy Verification Sweep
**Date**: 2026-05-04
**Scope**: ARCHITECTURE.md, DECISIONS_LOG.md, PRODUCT_SPEC.md
**Method**: Direct verification against code (`packages/shared/`, `apps/clinic/`, `apps/patient/`), schema (`audits/database-audit/staging-schema-2026-05-03.sql`), migration files (`supabase/migrations/`), and git history.

---

## Summary

- Total claims checked: ~95
- OK: ~70
- WRONG: 14
- PARTIAL: 7
- UNVERIFIABLE: 1
- Categories explicitly skipped (out of scope per task brief): architectural framing prose, strategic claims, forward-looking phase content.

The verification surfaced 14 hard factual errors (specific column names, function names, migration contents, alias declarations, count claims, internal-doc cross-references) plus 7 partial mismatches where the claim is broadly right but the specifics in the doc differ from what is on disk. Most errors cluster in three areas: (a) ARCHITECTURE §5.5 privacy-code table column names, (b) ARCHITECTURE §5.4 / D-069 enum value `'sentinel'` that does not exist, and (c) ARCHITECTURE §6.2 / D-051 `phone-changes.ts` function names.

---

## WRONG claims (require fix)

### ARCHITECTURE.md

- **§14 TypeScript Health — Path aliases**: Claim: `Path aliases: @/*, @shared/*, @ui-clinic/* in root tsconfig.json` — Actual root `tsconfig.json` `paths` block contains exactly `@shared/*`, `@ui-clinic/*`, `@patient/*`, `@clinic/*` and **no `@/*`** (deliberately retired by D-065 / commit `bb50305`). Fix: change to `@shared/*, @ui-clinic/*, @patient/*, @clinic/*` (drop `@/*`, add `@patient/*` and `@clinic/*`).

- **§5.4 Two-Layer Patient Identity — `account_status` enum values**: Claim: `account_status enum (patient_account_status: active/locked/sentinel)` — Actual `patient_account_status` enum (mig 073) contains: `active | suspended | locked | deceased | merged`. There is **no `sentinel` value**. The "sentinel" concept is real but is implemented as `account_status = 'locked'` + `normalized_phone = NULL` (mig 076). Fix: change enum value list to `active | suspended | locked | deceased | merged`; describe sentinels separately as `account_status='locked' AND normalized_phone IS NULL`.

- **§5.3 Patient Visibility Model — `visibility_mode` enum values**: Claim: `Two modes per clinic: DOCTOR_SCOPED, CLINIC_WIDE` — Actual `visibility_mode` enum (mig 053) contains 3 values: `DOCTOR_SCOPED_OWNER`, `CLINIC_WIDE`, `SHARED_BY_CONSENT`. The string `DOCTOR_SCOPED` does not exist. Fix: rename `DOCTOR_SCOPED` → `DOCTOR_SCOPED_OWNER`; either acknowledge `SHARED_BY_CONSENT` or note it is reserved for a future state.

- **§5.1 assistant_doctor_assignments scope enum**: Claim: `scope: 'PATIENT_DEMOGRAPHICS' | 'FULL_DOCTOR_SUPPORT'` — Actual `assignment_scope` enum (mig 020) contains 3 values: `'APPOINTMENTS_ONLY' | 'PATIENT_DEMOGRAPHICS' | 'FULL_DOCTOR_SUPPORT'`. Fix: add `'APPOINTMENTS_ONLY'` to the union.

- **§5.5 Privacy Code Mechanism — `patient_privacy_codes` columns**: Claim: `id, global_patient_id (FK), code_hash (bcrypt cost 12), regenerated_at, revoked_at` — Actual columns (mig 085) include `regenerated_count INTEGER` (not `regenerated_at`). There is no `regenerated_at` column. Fix: change `regenerated_at` → `regenerated_count`. (`code_hash` and bcrypt cost 12 are correct; verified at `gen_salt('bf', 12)` in mig 085 line 220 / mig 087 line 621.)

- **§5.5 Privacy Code Mechanism — `privacy_code_sms_tokens` column names**: Claim: `id, global_patient_id, requesting_clinic_id, requesting_doctor_id, sms_code (4-digit), expires_at (NOW + 5 min), consumed_at (nullable)` — Actual columns (mig 086) are `sms_code_hash` (bcrypt-hashed, not plaintext `sms_code`) and `used_at` (not `consumed_at`). Fix: rename `sms_code` → `sms_code_hash` and `consumed_at` → `used_at`.

- **§5.4 Two-Layer Patient Identity — `normalize_egyptian_phone` SQL function name**: Claim: `mig 071 (Egyptian phone normalization function normalize_egyptian_phone)` — Actual: mig 071 creates `normalize_phone_e164` (not `normalize_egyptian_phone`). The name `normalize_egyptian_phone` does not appear anywhere in `supabase/migrations/`. Fix: rename to `normalize_phone_e164`. The TS counterpart `normalizeEgyptianPhone` is real (in `phone-normalize.ts`); the SQL/TS parity test references `normalize_phone_e164` correctly.

- **§5.1 mig 052 cleanup scope**: Claim: `Mig 052 dropped clinic_doctors entirely and dropped the clinic_id column from front_desk_staff` — Actual: mig 052 drops `clinic_doctors`, **also drops `clinic_frontdesk` entirely**, AND drops the `clinic_id` column from `front_desk_staff`. The doc misses `clinic_frontdesk`. Fix: add `clinic_frontdesk` to the dropped-tables list.

- **§9.2 PrivacyCodeEntryModal location**: Claim under §5.1 / §9.2: PrivacyCodeEntryModal is in `packages/ui-clinic/components/frontdesk/`. Actual file: `apps/clinic/components/frontdesk/PrivacyCodeEntryModal.tsx`. Fix: change path. (No file by that name exists in `packages/ui-clinic/`.)

- **§6.2 phone-changes.ts function names**: Claim: `8 public functions … requestPhoneChange, verifyPhoneChangeOtp, cancelPhoneChange, openFallbackPhoneChange, approvePhoneChangeRequest, rejectPhoneChangeRequest, commitPhoneChange, correctPatientPhone` — Actual: there are 8 exported functions but the names differ. Actual exports: `requestPhoneChange`, `verifyPhoneChangeStep` (not `verifyPhoneChangeOtp`), `cancelPhoneChange`, `openPhoneChangeFallback` (not `openFallbackPhoneChange`), `getPendingPhoneChangeRequests` (not in claim), `approvePhoneChangeRequest`, `rejectPhoneChangeRequest`, `correctPatientPhone`. There is **no `commitPhoneChange`** function (commit logic is the SQL RPC `change_phone_commit`). Fix: rename three names; replace `commitPhoneChange` with `getPendingPhoneChangeRequests`.

- **§6.2 phone-changes.ts size**: Claim: `~1100 lines`. Actual: 1388 lines. Fix: change to `~1400 lines`.

- **§8.6 mig 098 columns**: Claim: `Schema columns (patient_code_hash, patient_code_generated_at, patient_code_expires_at, verification_method DEFAULT 'patient_code') applied…` — Actual mig 098 adds three columns (`patient_code_hash`, `patient_code_generated_at`, `patient_code_expires_at`) on `global_patients` and **does not add a `verification_method` column** of any kind. Fix: drop `verification_method DEFAULT 'patient_code'` from the column list.

- **§6.2 / §12 admin scope drift counts**: Claim: `current ALLOWED_ADMIN_SCOPES covers ~35 scopes while the codebase uses ~95` — Actual: ALLOWED_ADMIN_SCOPES set in `packages/shared/lib/supabase/admin.ts` contains 34 entries (`~35` is OK). Distinct `createAdminClient('…')` scope strings actually used in `packages/shared/lib`, `apps/clinic/app`, `apps/patient/app`: 135 unique values (not ~95). Fix: change `~95` to `~135`.

- **§6.2 / §12 / D-008 Phase F Task 16**: Claim (in 3 places): "Phase F Task 16" tracks the admin scope reconciliation — Actual: `audits/PROGRAM_STATE.md` Phase F task list contains tasks 1–9 only. Task 16 does not exist. Fix: change `Phase F Task 16` → `Phase F follow-up tasks` (or add the task to PROGRAM_STATE.md and renumber).

### DECISIONS_LOG.md

- **D-008 Amendment 2026-05-04 — admin-scope counts and Phase F Task 16**: Same two errors as above (~95 distinct scopes is actually 135; Phase F Task 16 does not exist). Same fix.

- **D-051 phone-changes.ts function-name list**: D-051 Outcome paragraph references "8 public functions" with the same incorrect names as ARCHITECTURE §6.2 (`verifyPhoneChangeOtp`, `openFallbackPhoneChange`, `commitPhoneChange`). Fix: rename or omit the function-name list.

- **D-066 mig 098 column claim**: D-066 Context says `companion mig 098 (schema columns: patient_code_hash, patient_code_generated_at, patient_code_expires_at, verification_method DEFAULT 'patient_code') had already been applied` — Actual mig 098 does not add a `verification_method` column or default. Fix: drop the `verification_method` claim.

- **D-069 Ghost Mode `account_status='sentinel'`**: D-069 Decision says `account_status = 'sentinel'` for the quarantine path. Actual enum (`patient_account_status`) has no `sentinel` value; the quarantine path uses `account_status='locked'` (mig 076 line 38: "Phone unrecoverable; sentinel global_patient created with account_status=locked"). Fix: change `'sentinel'` → `'locked'`; clarify "sentinel" is the conceptual name, `'locked'` is the enum value.

- **D-061 references "sentinel" account_status**: D-061 Outcome says "every gpid is a real human or a sentinel" — Decision section refers to the enum tuple `(active/locked/sentinel)`. Same enum-value bug as ARCH §5.4 / D-069. Fix: same as above.

- **D-064 RLS helper count split — `3 DEFINER + 2 INVOKER`**: D-064 Decision section claims **3 DEFINER + 2 INVOKER**, citing `is_clinic_member` (DEFINER), `can_view_patient_data_at_clinic` (DEFINER), `user_has_clinic_path_to_gp` (DEFINER) and `can_clinic_access_global_patient` (INVOKER), `can_patient_access_global_patient` (INVOKER). This list contains **5 helpers** total (3+2), but the When says "Empirical Lesson #1 amended" — and ARCHITECTURE §12 lists the same 5 helpers but introduces them as "3 DEFINER + 2 INVOKER" — the count is right (3+2=5). However, ARCHITECTURE §12 also describes the security mode as "**3 DEFINER + 2 INVOKER**" mid-paragraph and again "**3 DEFINER + 1 INVOKER**" in older auto-memory cross-references — this is internally consistent but the auto-memory entry for `project_prompt_06_architecture_rulings` shows older "3 INVOKER + 1 DEFINER helper" framing; treat as PARTIAL not WRONG. (No fix required to the doc; flag for memory cleanup separately.) — **moved to PARTIAL below.**

- **D-068 `granted_via` enum — claimed list**: Claim: `granted_via enum (PRIVACY_CODE | SMS_CODE | PATIENT_APP | AUTO_RENEW)` — Actual mig 090 implements `granted_via TEXT` with a CHECK constraint accepting exactly those four values. ✓ The enum value list is correct, but `granted_via` is a TEXT column with CHECK, not a Postgres enum type. Doc says "enum" loosely; technically it's a constrained TEXT. **PARTIAL — see below.**

### PRODUCT_SPEC.md

- **"Patient App (Phase 2)" section**: Claim: `### Patient App (Phase 2 — After clinic adoption proven) Patient mini-portal for accessing their health records, prescriptions, and booking follow-ups.` — Actual: D-072 (in DECISIONS_LOG.md, dated 26 April 2026) explicitly **promotes the patient app from Phase 2 to Phase 1**, with the patient app already shipped at `apps/patient/` (D-060). PRODUCT_SPEC.md still treats it as Phase 2. Fix: bring PRODUCT_SPEC.md "Apps & Portals" and "Phased Expansion" sections into agreement with D-072 — the patient app is Phase 1 now, with a narrowed scope (records read-only, consent UI, Rx PDFs, basic messaging).

- **PRODUCT_SPEC.md "Decision point: Build patient app when 50+ clinics are active"**: Same conflict — patient app is already built and shipped (Build 05, commit `61f8752`). Fix: drop or amend this note.

- **PRODUCT_SPEC.md "Phase 2: Patient Identity Network (Months 5-8)"**: Lists "Patient mini-portal (PWA via WhatsApp link, OTP login)" as Phase 2 deliverable. Per D-072, this lives in Phase 1. Fix: move to Phase 1.

---

## PARTIAL claims (require clarification)

### ARCHITECTURE.md

- **§12 AuditAction enum count breakdown**: Claim: `52 entries spanning original (≈18), phone-change (7), patient identity v2 (9 entries), privacy code + reconsent (Build 04, 11 entries), auth phone hygiene (1), directional consent (5)` = 51, total enum size 52. Actual: 52 entries total (✓). Reality of the per-bucket counts: original 18 (✓), phone-change 7 (✓), patient identity v2 9 (✓), auth phone hygiene 1 (✓), directional consent 5 (✓), but the Build-04 bucket is **12 entries** (`QUARANTINE_RECOVERED`, `RECOVERY_FAILED`, `RECOVERY_COLLIDED`, `PRIVACY_CODE_REGENERATED`, `PRIVACY_CODE_ATTEMPT_SUCCESS`, `PRIVACY_CODE_ATTEMPT_FAILURE`, `PRIVACY_CODE_LOCKED`, `SMS_CONSENT_SENT`, `SMS_CODE_VERIFIED`, `SMS_CODE_FAILED`, `MESSAGING_CONSENT_RECONFIRMED`, `MESSAGING_CONSENT_REVOKED`) — not 11. Bucket sums add to 52 with that correction. Fix: change `Build 04, 11 entries` → `Build 04, 12 entries`.

- **§5.6 `granted_via`**: doc calls it an enum. Implementation is `TEXT NOT NULL` with `CHECK (granted_via IN (…))`. The four values listed are correct. Fix: clarify "enum-via-CHECK" or call it a constrained TEXT column.

- **§8.3 / §8.5 11 clinical tables list**: §5.4 enumerates 11 tables; mig 080 ADD COLUMN list and mig 081 trigger list confirm 11 tables exactly. ✓ But the §8.5 callout mentions "patient_phone_history (One of the 11)" while patient_phone_history was added later than the original 10-table cohort and lacks `patient_clinic_record_id NOT NULL` (it has `global_patient_id NOT NULL` only). Reality: it is one of the 11 tables that received `global_patient_id` FK in mig 080, but the mig 081 trigger AND the `patient_clinic_record_id NOT NULL` set is on a 10-table subset. Doc is fine to call it "one of the 11" but should note the asymmetry.

- **§14 TypeScript test runner**: Claim: `doctor-stats.test.ts (31 tests) and drug-interactions.test.ts use a hand-rolled test() harness via npx tsx <file>`. Reality: `doctor-stats.test.ts` lives at `packages/shared/lib/analytics/__tests__/doctor-stats.test.ts` (test count: 31 ✓). `drug-interactions.test.ts` lives at `packages/shared/lib/data/__tests__/drug-interactions.test.ts`. Several other test files (`phone-normalize.test.ts`, `phone-normalize-sql-parity.test.ts`, `admin/global-patients-lookup/handler.test.ts`) also exist but are not enumerated. Doc text is correct as far as it goes; just incomplete.

- **§9.2 Component Architecture FrontdeskBottomNav**: Component exists ✓ and the route names listed (dashboard, check-in, appointments, payments, reports, account = 6 items) match the D-016 amendment. ✓ But "QueueList" and "CheckInForm" are listed in §9.2 even though TD-010 says these are orphaned (no route mounts them). Doc is internally inconsistent — §9.2 says they're mounted, §16 TD-010 says they aren't. Fix: pick one.

### DECISIONS_LOG.md

- **D-002 Outcome — `44 migrations and growing`**: Outdated relative to current 109 non-rollback migration files on disk. Decision is dated "Project inception"; the count is presumably accurate then but stale now. Fix: amend or footnote.

- **D-005 numbers — `60+ modules` / `26 components`**: D-005 Outcome says `@medassist/shared has 60+ modules` and `@medassist/ui-clinic has 26 components`. Actual: shared lib contains 164 .ts files in 145 directories (well above 60 — the claim is non-falsifiable in the literal "60+" sense), and ui-clinic has 30 .tsx components (claim: 26). Fix: bump component count to 30.

### PRODUCT_SPEC.md

- **"Phone-First Identity Principle (D-057)"**: This block correctly references D-057 and its UI rules. Internally consistent with ARCHITECTURE §15 + D-057. ✓ No fix.

---

## UNVERIFIABLE claims (flag for human judgment)

- **ARCH §2 / D-065 — "Empirical Lesson #14"**: Both ARCH §2 and D-065 claim this is "codified as Empirical Lesson #14 in audits/EXECUTION_PROMPTS.md". Actual: EXECUTION_PROMPTS.md headings show `### Lesson 6` through `### Lesson 12`. Lessons 1–5 are referenced as "documented in full in `audits/patient-identity-build-06-results.md` § 3.1" rather than carrying their own heading. There is no `Lesson 14` heading. D-065 itself notes "lands in Phase 5d as part of this audit" — i.e., the lesson is _planned_ but not yet written into the file. Reason can't verify: the lesson body either (a) is meant to be added in a future commit (lesson is a forward reference), or (b) the lesson number is wrong. Flag for a human decision: either land Lesson #14 in EXECUTION_PROMPTS.md, or change the cross-reference.

---

## OK claims (verified correct — for the record)

ARCHITECTURE.md
- ARCH §2 — 109 non-rollback migration files, highest base 106 ✓
- ARCH §3 — Next.js 14.2.25 (`apps/clinic/package.json`), Tailwind 3.4 ✓, Sentry 10.38 ✓, Husky 9.x ✓, Postgres 17.6 ✓, next-pwa 5.6 ✓
- ARCH §3 — root `package.json` pins `next: 14.1.0` (older, unused) ✓
- ARCH §3 — `npm run type-check` (root) + per-workspace gate ✓ (matches `.husky/pre-push` body)
- ARCH §4.3 — auth-login `enforceRateLimit(request, 'auth-login', 8, 60_000)` (8 attempts / 60s) ✓
- ARCH §5.1 — `clinic_role` enum `OWNER | DOCTOR | ASSISTANT | FRONT_DESK` ✓ (mig 018)
- ARCH §5.1 — `membership_status` enum `ACTIVE | INVITED | SUSPENDED` ✓ (mig 018)
- ARCH §5.4 — `global_patients` keyed by `normalized_phone UNIQUE` ✓
- ARCH §5.4 — `patients.global_patient_id NOT NULL since mig 077` ✓
- ARCH §5.4 — 11 clinical tables with global FKs (mig 080) — confirmed exactly: clinical_notes, prescription_items, appointments, lab_orders, lab_results, imaging_orders, vital_signs, patient_consent_grants, doctor_patient_relationships, patient_visibility, patient_phone_history ✓
- ARCH §5.5 — base32 alphabet `23456789ABCDEFGHJKLMNPQRSTUVWXYZ` ✓ (mig 087 line 94)
- ARCH §5.5 — bcrypt cost 12 ✓ (`gen_salt('bf', 12)` mig 085 / 087)
- ARCH §5.5 — `gen_random_bytes()` ✓ (mig 087 line 101)
- ARCH §5.5 — 5 attempts/hour per-clinic rate limit ✓ (mig 087 — sliding window query, `>= 5`)
- ARCH §5.5 — 5 lifetime failures → 24h hard lockout ✓ (mig 087 line 446 `INTERVAL '24 hours'`)
- ARCH §5.5 — SMS-consent token TTL 5 minutes ✓ (mig 086 / 087)
- ARCH §5.5 — uniform timing pad ≥ 50ms ✓ (`privacy-codes.ts` lines 14-15)
- ARCH §5.6 — default share expiry 90 days ✓ (mig 090 line 373)
- ARCH §5.6 — `create_shares_for_grantors` atomic helper RPC (mig 091) ✓
- ARCH §5.6 — Vercel cron `/api/cron/expire-stale-shares` 02:00 UTC ✓ (`apps/clinic/vercel.json` schedule `0 2 * * *`)
- ARCH §6.2 — phone-normalize SQL/TS parity test exists at `packages/shared/lib/utils/__tests__/phone-normalize-sql-parity.test.ts` ✓
- ARCH §7 — clinic-app route count: `find apps/clinic/app/api -name route.ts | wc -l = 110` ✓ (matches "~110")
- ARCH §7 — patient-app route count: 51 (matches "~50") ✓
- ARCH §8.5 — `audit_log` and `audit_events` both exist on staging schema ✓
- ARCH §8.6 — mig 045-051 enforce clinic_id NOT NULL across 21 tables (19 in mig 051 + clinical_notes mig 046 + payments mig 047) ✓
- ARCH §8.6 — clinical_notes 56 backfill rows, payments 9 deleted rows ✓ (mig 045 / 047 comments)
- ARCH §8.6 — mig 089 reconciles 29 staff `auth.users.phone` rows ✓ (`Migration 089 — Normalize auth.users.phone for the 29 R1-recovered users`)
- ARCH §8.6 — mig 094a creates `user_has_clinic_path_to_gp` (DEFINER) ✓
- ARCH §8.6 — mig 106 reverts helpers #2 + #3 to INVOKER (`ALTER FUNCTION ... SECURITY INVOKER`) ✓
- ARCH §8.6 — mig 100-106 forensic backfill set, only 106 carries behavioral change ✓
- ARCH §8.6 — mig 098 applied 2026-05-03 02:28 UTC; mig 099 deleted in commit `6adeffa` ✓ (commit exists, deletes 099)
- ARCH §10.2 — mig 069 adds `client_idempotency_key TEXT` with partial unique index `WHERE client_idempotency_key IS NOT NULL` on payments + clinical_notes ✓
- ARCH §12 — `EGYPT_LOCAL_PHONE_RE = /^01[0125]\d{8}$/` ✓ (`phone-validation.ts` line 46)
- ARCH §12 — RLS helper functions security mode after mig 106: 3 DEFINER (`is_clinic_member`, `can_view_patient_data_at_clinic`, `user_has_clinic_path_to_gp`) + 2 INVOKER (`can_clinic_access_global_patient`, `can_patient_access_global_patient`) ✓
- ARCH §12 — `requireServiceRole(request)` exists in `packages/shared/lib/auth/session.ts` ✓
- ARCH §12 — `consume_rate_limit` RPC + `api_rate_limits` table ✓ (mig 014)
- ARCH §13 — 4 dev test accounts at phones 01000000001-4, password Test1234! ✓ (mig 043)
- ARCH §15 — autoRenewOnVisit fire-and-forget exception in `patient-shares.ts` + check-in handler ✓
- ARCH §15 — `requireServiceRole(request)` timing-safe bearer compare against `SUPABASE_SERVICE_ROLE_KEY` ✓

DECISIONS_LOG.md
- D-001 — Next.js App Router with route groups `(doctor)`, `(frontdesk)`, `(auth)` ✓
- D-004 Amendment 2026-04-30 — DoctorShell uses `max-w-lg` at line 43 of `packages/ui-clinic/components/doctor/DoctorShell.tsx` ✓ (verified line 43 `<main className="pb-24 lg:pb-10 max-w-lg mx-auto…">`)
- D-006 — `clinic_memberships` introduced in mig 018 with role enum + status enum ✓
- D-008 — `createAdminClient(scope)` default `'api-route'` ✓
- D-019 — Phone regex `01[0125]\d{8}` ✓
- D-022 — Clinic invite codes (mig 034) ✓
- D-029 — Mig 043 creates 4 test accounts ✓
- D-035 — `cairoMonthStart()` and `cairoNMonthsAgoStart(n)` exist ✓
- D-038 — `payments.ts` exports `PAYMENT_STATUS` and `isCollectedPayment` ✓
- D-041 — `getFrontdeskClinicId(supabase, user.id)` exists in `frontdesk-scope.ts` ✓
- D-042 — Husky pre-push hook is at `.husky/pre-push` and runs both root tsc and clinic workspace type-check ✓
- D-043 — Capacitor scaffolding deleted (commit `a97a7c9`) ✓
- D-046 — `getEgyptianPhoneError` and `getEgyptianPhoneSearchError` in `phone-validation.ts` ✓
- D-048 — Mig 056 fixes `clinic_memberships` self-referential SELECT recursion ✓
- D-049 — Three RLS policy patterns (helper-function, is_clinic_member triple-OR, EXISTS-on-parent) — pattern IDs accurate ✓
- D-050 — `client_idempotency_key` migration is 069 ✓
- D-051 — Mig 070 carries `change_phone_commit` and `change_phone_rollback` SECURITY DEFINER RPCs ✓
- D-051 — `phone-changes.ts` is gated behind `FEATURE_PHONE_CHANGE_V2` env flag (verified across 8 handler files) ✓
- D-058 — `createDoctorAccount()` seeds 5 default availability rows (Sun-Thu 09:00-17:00, 15-min slots) using `upsert` with `ignoreDuplicates` ✓ (`packages/shared/lib/data/users.ts` lines 117-141)
- D-059 — commits `b61cb22` (availability) and `778467a` (clinic_id write-path) exist in git history ✓
- D-060 — `apps/patient/` is its own Next.js app with `tsconfig.json` and `tailwind.config.ts` ✓
- D-061 — Mig 081 compatibility shim triggers, 11 BEFORE INSERT triggers (one per table) ✓
- D-062 — `logAuditEvent` exported in `packages/shared/lib/data/audit.ts` ✓
- D-064 — Mig 094a creates `user_has_clinic_path_to_gp` DEFINER ✓
- D-064 — Mig 106 ALTER FUNCTION DEFINER → INVOKER for helpers #2 and #3 ✓
- D-065 — Per-app aliases `@patient/*`, `@clinic/*` in root tsconfig.json ✓; commit `bb50305` exists with the rename
- D-066 — Mig 099 deleted in commit `6adeffa` ✓; mig 098 columns persist on staging
- D-067 — Locked privacy-code numerics: 6-char base32, bcrypt cost 12, gen_random_bytes, 5/hr per clinic, 24h lifetime lockout, 5-min SMS TTL, 50ms timing pad — all verified against migration source ✓
- D-068 — `patient_data_shares` columns id, global_patient_id, grantor_clinic_id, grantee_clinic_id, granted_at, expires_at (NULL = permanent), revoked_at, granted_via, grant_reason ✓
- D-068 — `apps/clinic/app/api/cron/expire-stale-shares/route.ts` exists ✓
- D-068 — `apps/patient/app/(patient)/patient/sharing/page.tsx` exists ✓

PRODUCT_SPEC.md
- Egyptian Healthcare Digitalization Stack (Layers 1-5) — internally consistent with ARCH §1 ✓
- D-057 phone-first identity principle — internally consistent with ARCH §15 ✓
- OPD-001/002/003/004 statuses — internally consistent with D-032/D-034/D-041/D-053 ✓

Commit hashes (D-051, D-065, D-066, D-042, D-043, D-058, B04, B05)
- `bb50305` (per-app aliases retire @/*) ✓
- `f61356f` (B04 privacy code feature) ✓
- `61f8752` (B05 patient sharing lifecycle) ✓
- `6adeffa` (delete mig 099) ✓
- `b724eb1` (build break) ✓
- `035f141` (pre-push tsc gate) ✓
- `8be5484`, `1ab442d`, `cf7d465` (D-051 phone-change commit chain) ✓
- `a97a7c9` (Capacitor cleanup) ✓
- `8937b2e` (phone validation unification) ✓

---

## Verification gaps (claims I didn't check, with reason)

- **ARCH §1 / §2 layer-2 thesis prose** — out of scope per task brief (architectural framing).
- **ARCH §1 PWA + Capacitor narrative** — strategic; out of scope.
- **ARCH §15 patterns rationale paragraphs** — pattern existence verified above, but the *reasoning* text wasn't audited for accuracy of justification.
- **DECISIONS_LOG.md Alternatives sections** — out of scope per task brief (reasoning).
- **PRODUCT_SPEC.md "Hooks 1-3", "AI strategy", "Pricing", "Sales motion", "Onboarding", "Critical Dependencies", "Success Metrics"** — strategic; out of scope.
- **EXECUTION_PROMPTS Empirical Lesson body content** — the reference is correct that lessons exist; verifying their *content* matches the doc summaries is out of scope.
- **`audits/PROGRAM_STATE.md` Phase F task numbering beyond presence/absence of Task 16** — only verified Task 16 (claimed) is missing and Task 2 (D-066) exists.
- **Mig 087 `gen_random_bytes(6)` distribution test results** — implementation verified, but the empirical "±5% of uniform per position" test is harness-driven and not in scope to re-run.
- **Mig 022/068/099 RETIRED status decisions** — flagged in PROGRAM_STATE Phase F task list (#1, #6, #7); doc claims they exist as repo artifacts ✓ verified, but the retirement is operational, not factual.
- **D-061 mig 075 "patient_clinic_records" details** — confirmed mig 075 exists; full table-shape verification not performed in detail.
- **D-066 staging apply timestamp `2026-05-03 02:28 UTC`** — UNVERIFIABLE without direct staging audit-log query; the timestamp is referenced in `audits/database-audit/out-of-band-post-2026-04-08.md` per ARCH §8.6 row 098 but I did not pull that file.

---

*End of report. Generated 2026-05-04. Single-pass, no follow-up clarification round per task brief.*
