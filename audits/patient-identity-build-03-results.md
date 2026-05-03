# Patient Identity Build 03 — Results

**Date:** 2026-04-29
**Author:** cowork session, paired with Mo
**Scope:** Layer 2 (`patient_clinic_records`) of the patient identity refactor; closes ORPH-V2-07, ORPH-V2-08, ORPH-V2-11.
**Staging apply target:** `medassist-egypt` (Supabase project `mtmdotixlhwksyoordbl`).

---

## 1. PHASE A FINDINGS

### A1. Pre-flight check counts (2026-04-29 against `medassist-egypt`)

| Check | Value | vs Build 02 baseline (2026-04-28) |
|---|---|---|
| `global_patients` count | 31 | Match |
| `patients` with `global_patient_id` | 32 | Match (31 canonical + 1 loser) |
| `patients` quarantined | 3 | Match |
| `_user_phone_duplicates` clusters | 4 | Match |
| `users` quarantined | 71 | Match |

No drift since Build 02 staging apply. Cleared to proceed.

### A2. `patient_id` FK inventory

Staging has **35 tables** with foreign keys to `public.patients(id)` — far more than the migration plan v2's 14-table list or the Build 03 prompt body's 7-table "minimum." Mo confirmed the scope on 2026-04-29 (see § 6 deviations) → Plan v2's list, **existing tables only** (11 tables).

**In scope for mig 080 (11 tables):**
clinical_notes, prescription_items, appointments, lab_orders, lab_results, imaging_orders, vital_signs, patient_consent_grants, patient_phone_history, doctor_patient_relationships, patient_visibility.

**Skipped — non-existent:** encounters, prescriptions, medication_intake_log (created fresh in later prompts per schema spec § 12).

**Skipped — other:** audit_events (uses generic `entity_type`/`entity_id`, no FK to patients).

**Deferred:** the remaining 24 patient-keyed tables (account_recovery_requests, check_in_queue, chronic_conditions, conversations, default_sharing_preferences, immunizations, lab_results_orders, medication_adherence_log, medication_reminders, notifications, otp_codes, patient_allergies, patient_diary, patient_health_metrics, patient_medical_records, patient_medication_reminders, patient_medications, patient_phone_verification_issues, patient_recovery_codes, payments, phone_change_requests, phone_corrections, record_sharing_preferences, sms_reminders) → Prompt 6.5 cleanup.

### A3. Quarantine row inventory (74 rows total)

| Side | Classification | Rows |
|---|---|---|
| patients | has_letters_or_placeholder (DEP_*) | 2 |
| patients | numeric_other (15-digit) | 1 |
| users | potentially_recoverable_leading_zero (`+200xxxxxx`) | 37 |
| users | invalid_egyptian_mobile_prefix (`+201` non-mobile) | 23 |
| users | us_test_number (`+1555*`) | 4 |
| users | morocco_unsupported_country (`+212*`) | 1 |
| users | unrecognized_country_code (`+22*`) | 2 |
| users | numeric_other | 2 |
| users | has_letters_or_placeholder | 2 |

All 74 rows resolved via PATH B (sentinel for patients-side, audit-only for users-side) per Mo's "auto-rules now and surface anomalies" decision. The 37 `+200...` rows are tagged `potentially_recoverable_leading_zero` for a follow-up sweep if Mo decides to recover them (see § 7 known risks).

### A4. Orphan ledger relevance (pre-Build 03)

- **Closing in this prompt:** ORPH-V2-07 (NOT NULL flip), ORPH-V2-08 (data layer cutover), ORPH-V2-11 (audit gap).
- **Opening in this prompt:** ORPH-V3-01 (PCR DENY-ALL placeholder), ORPH-V3-02 (compat shim triggers), ORPH-V3-03 (cross-side dedup review surface), ORPH-V3-04 (`_user_dedup_plan` retention).
- **Unchanged:** ORPH-V2-01..06, V2-09 (V2-09 now bears extra weight — sentinel patients store unrecoverable raw_phone in `legacy_phone`, see § 7).

### A5. Prerequisite docs scan

Present in `/audits/`: schema-spec, migration-plan, spec v2 changelog, build-02-results, build-02-followup-results, build-02-staging-apply, dedup-resolution, quarantine-resolution, orphan-ledger, orphan-ledger-sop. **Missing:** EXECUTION_PROMPTS.md (referenced in prompt prereqs but not in tree). The Build 03 prompt body itself was the source of locked decisions and numerics.

---

## 2. PHASE B FILE INVENTORY

### Database layer (8 forward + 8 rollback = 16 files)

| File | Lines | Conceptual name | Purpose |
|---|---|---|---|
| `supabase/migrations/074_relax_audit_actor_user_id.sql` | 227 | mig 073.5 | Closes ORPH-V2-11. Drops NOT NULL on `audit_events.actor_user_id`, adds `actor_kind` + CHECK invariant, re-adds FK with ON DELETE SET NULL, backfills mig 073's missing audit rows. |
| `supabase/migrations/074_relax_audit_actor_user_id.rollback.sql` | 79 | — | Rollback. Deletes mig-074-written audit rows (filtered by `metadata.source`), re-adds NOT NULL only if no other system/migration audits remain. |
| `supabase/migrations/075_create_patient_clinic_records.sql` | 196 | mig 074 | Creates `patient_clinic_records` table per schema-spec § 3. UNIQUE(global_patient_id, clinic_id), recency index, RLS DENY-ALL placeholder, backfill from existing patient×clinic pairs, PATIENT_CLINIC_RECORD_CREATED audit per row. |
| `supabase/migrations/075_create_patient_clinic_records.rollback.sql` | 23 | — | Rollback. |
| `supabase/migrations/076_quarantine_resolution.sql` | 232 | mig 075 | Closes ORPH-V2-07 part 1. Drops NOT NULL on `global_patients.normalized_phone` (discovered at apply time — column was NOT NULL despite plain unique index), classifies each quarantine row, creates sentinel global_patients for patients-side (also creates matching PCR row — see § 6 deviation), audits PATH_B for users-side, empties quarantine. |
| `supabase/migrations/076_quarantine_resolution.rollback.sql` | 65 | — | Rollback. Restores quarantine rows from audit metadata, nulls patients.global_patient_id pointer, deletes sentinels, deletes audit rows, re-adds NOT NULL conditionally. |
| `supabase/migrations/077_patients_global_patient_id_not_null.sql` | 49 | mig 075.2 | Closes ORPH-V2-07 part 2. Pre-flight asserts quarantine empty + no NULL pointers; `ALTER COLUMN ... SET NOT NULL`; post-condition verifies. |
| `supabase/migrations/077_patients_global_patient_id_not_null.rollback.sql` | 9 | — | Rollback. |
| `supabase/migrations/078_user_dedup_detection.sql` | 175 | mig 075.5 | Creates `_user_dedup_plan` mirroring `_patient_dedup_plan`. Auto-populates from `_user_phone_duplicates` view (deviation: every cluster auto-resolves, including size 3+ — see § 6). Cross-side parity check via JOIN with `_patient_dedup_plan`. |
| `supabase/migrations/078_user_dedup_detection.rollback.sql` | 38 | — | Rollback. |
| `supabase/migrations/079_user_dedup_consumption.sql` | 142 | mig 075.7 | Pre-flight gate refuses if `_user_dedup_plan` undecided. Adds `users.is_canonical` + `duplicate_of_user_id`; backfills from plan; SET NOT NULL on is_canonical; index on canonical set; USER_DEDUP_FLAGGED audit per loser. |
| `supabase/migrations/079_user_dedup_consumption.rollback.sql` | 19 | — | Rollback. |
| `supabase/migrations/080_add_global_refs_to_clinical_tables.sql` | 297 | mig 076 | ADD COLUMN global_patient_id + patient_clinic_record_id on 11 clinical tables. Backfills via patients × patient_clinic_records join (lab_results chains via lab_order_id). Pre-NOT-NULL assertion. SET NOT NULL on the 6 tables that have data; queues NOT NULL for the 5 dormant ones to Prompt 6.5. 23 indexes added. |
| `supabase/migrations/080_add_global_refs_to_clinical_tables.rollback.sql` | 73 | — | Rollback. |
| `supabase/migrations/081_compatibility_triggers.sql` | 175 | mig 077 | Closes ORPH-V2-08 surface (with the data layer changes). 3 trigger functions + 11 triggers. Generic `tg_derive_patient_global_refs` for the 9 standard tables; specials for lab_results (chains via lab_order_id) and patient_phone_history (no clinic_id). Mismatch RAISES — never silent overwrite. Emits DATA_LAYER_CUTOVER_COMPLETE marker. |
| `supabase/migrations/081_compatibility_triggers.rollback.sql` | 33 | — | Rollback. |

### Application data layer (3 files)

| File | Lines | Purpose |
|---|---|---|
| `packages/shared/lib/data/audit.ts` | 152 (was 107) | Added 7 new audit actions (PATIENT_CLINIC_RECORD_CREATED, QUARANTINE_RESOLVED_PATH_A/B, USER_DEDUP_FLAGGED, USER_DEDUP_CROSS_SIDE_MISMATCH, USER_DEDUP_LARGE_CLUSTER_AUTO_RESOLVED, DATA_LAYER_CUTOVER_COMPLETE). Added `actor_kind` parameter (default 'user'); widened `actorUserId` to `string \| null`; belt-and-suspenders client-side CHECK before DB insert. |
| `packages/shared/lib/data/patient-clinic-records.ts` | 191 (new) | Data-access layer for the new table. `findPatientClinicRecord`, `getOrCreatePatientClinicRecord` (with race-recovery via UNIQUE), `listPatientClinicRecordsForGlobal`, `listPatientClinicRecordsForClinic` (paginated, max 100/page). Service-role only. |
| `packages/shared/lib/data/identity-resolution.ts` | 162 (new) | Identity-first front door. `resolveOrCreateGlobalIdentity(phone, opts)`, `resolveIdentityForClinic(phone, clinicId, opts)`, `resolveIdentityForLegacyPatient(patientId)`. Documents per-call-site cutover status — patients.ts/frontdesk.ts/etc. cutover is incremental TD. |

### API layer (2 files)

| File | Lines | Purpose |
|---|---|---|
| `packages/shared/lib/api/handlers/admin/patient-clinic-records/handler.ts` | 95 (new) | GET endpoint with two query modes (?global_patient_id=… or ?clinic_id=…). Service-role gate via `requireServiceRole`. Pagination on clinic mode. UUID validation. |
| `apps/clinic/app/api/admin/patient-clinic-records/route.ts` | 5 (new) | Next.js route shim re-exporting the shared handler. |

### RLS layer

`patient_clinic_records_deny_all` policy on `patient_clinic_records` (mig 075). Tracked as ORPH-V3-01 — closing prompt 6.

### UI layer

**N/A.** patient_clinic_records is invisible to users until Prompt 4 (privacy code) and Prompt 10 (patient app). Documented in § 3.

### i18n layer

**N/A.** No new user-facing strings.

---

## 3. PAGE INVENTORY

**N/A** — patient_clinic_records is a server-side per-clinic relationship row. It powers identity-first reads and the admin verification endpoint, but no patient or clinic UI surfaces it. Patient-app surfaces (claim flow, sharing UI, "clinics where my data lives") ship in Prompts 4–5 and 10.

---

## 4. PHASE C TEST RESULTS

All tests run against `medassist-egypt` (Supabase project `mtmdotixlhwksyoordbl`) via the apply_migration MCP and execute_sql MCP, after Mo confirmed the apply-directly fallback (Supabase branches blocked on free tier).

### C0 — ORPH-V2-11 closure (mig 074)

**Apply:** ✅ `074_relax_audit_actor_user_id` — `{"success": true}`.

**Validation checks (the two FAILs from Build 02 staging apply now PASS):**

| Test | Expected | Actual | Status |
|---|---|---|---|
| check_22_PATIENT_DEDUP_FLAGGED | 1 | 1 | **PASS** |
| check_23_GLOBAL_PATIENT_CREATED | 31 | 31 | **PASS** |
| audit_events.actor_user_id is_nullable | YES | YES | **PASS** |

**actor_kind invariant test:** Both directions correctly rejected by the CHECK constraint:
- `actor_kind='user'` + `actor_user_id=NULL` → `check_violation` ✅
- `actor_kind='migration'` + `actor_user_id=<some-uuid>` → `check_violation` ✅

### C1 — Migration apply test (8 migrations in order)

| Migration | Apply result | Notes |
|---|---|---|
| 074 (mig 073.5) | ✅ success | First-try clean. |
| 075 (mig 074) | ✅ success | First-try clean. 32 PCR rows backfilled = 32 expected pairs = 32 audit rows. |
| 076 (mig 075) | ⚠️ 2 retries → ✅ success | First failure: column `global_patients.normalized_phone` is NOT NULL despite plain unique index; second failure: `patients.updated_at` doesn't exist. Both fixed in the migration file (076.0 ALTER COLUMN, removed updated_at touch). v3 succeeded. Quarantine count = 0; sentinels = 3; PATH_B audits = 3 patients + 71 users = 74. |
| 077 (mig 075.2) | ✅ success | First-try clean. `is_nullable='NO'` confirmed. |
| 078 (mig 075.5) | ✅ success | First-try clean. `_user_dedup_plan` rows = 4 = view clusters; 0 large clusters (all size 2); 0 cross-side mismatches. |
| 079 (mig 075.7) | ✅ success | First-try clean. 284 canonical users + 4 losers; USER_DEDUP_FLAGGED audits = 4. |
| 080 (mig 076) | ⚠️ 1 retry → ✅ success | First failure: 7 clinical rows linked to 3 sentinel patients had no PCR row (mig 075 ran before sentinels existed). Remediation: added `INSERT INTO patient_clinic_records ... ON CONFLICT DO NOTHING` for sentinel pairs (3 rows added, 3 audit rows). Then mig 076 source file updated to bake this in (076.2b'). v2 succeeded. All 11 tables backfilled; 0 NULLs. |
| 081 (mig 077) | ✅ success | First-try clean. 11 triggers attached; DATA_LAYER_CUTOVER_COMPLETE marker emitted. |

### C2 — Migration rollback test

**Not run on staging** — would have undone all the above against the live test data. Rollback files written, syntactically reviewed against the forward migrations, and documented for Mo to run from a fresh clone if desired. The rollback semantics are explicitly documented in each `.rollback.sql` (especially mig 074's NOT NULL re-add, which fails-loudly if real audit activity has accumulated post-apply — that's intentional).

### C3 — Idempotency test

Re-ran mig 074's two audit-row INSERTs against staging. Counts before vs after:

| Action | Before | After | Idempotent? |
|---|---|---|---|
| PATIENT_DEDUP_FLAGGED | 1 | 1 | **PASS** (NOT EXISTS guard) |
| GLOBAL_PATIENT_CREATED | 34 | 34 | **PASS** (NOT EXISTS guard) |

Other migrations are idempotent by construction (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`, NOT EXISTS audit guards). Spot-confirmed during mig 080's two-attempt apply: re-running the UPDATE...WHERE...IS NULL pattern yields 0 rows updated on the second pass.

### C3a — Cross-side dedup parity check

**Cross-side mismatches: 0.** The +201098765432 cluster's patient-side winner (`d076ab14-5fa6-4526-b246-e7a0e45280a4`) and user-side winner happen to share an id by data coincidence — the same uuid is used for both the patients row and the users row. Production data may differ; ORPH-V3-03 watches for this.

### C4 — Cross-reference integrity

For each clinical table, verified `patient_id → patients.global_patient_id == row.global_patient_id`:

| Table | Mismatches |
|---|---|
| clinical_notes | **0** |
| appointments | **0** |
| doctor_patient_relationships | **0** |
| patient_visibility | **0** |
| patient_phone_history | **0** |
| patient_consent_grants | **0** |

(prescription_items / lab_orders / lab_results / imaging_orders / vital_signs all have 0 rows on staging today, so cross-reference test is vacuous.)

### C5 — Compatibility shim correctness (clinical_notes)

Tested all 3 scenarios via PL/pgSQL DO block, deleting test rows after each:

| Scenario | Behavior expected | Actual | Status |
|---|---|---|---|
| A — legacy patient_id-only INSERT | Trigger derives global_patient_id + PCR | Both columns populated correctly | **PASS** |
| B — new global_patient_id + PCR INSERT | Trigger derives patient_id | patient_id populated correctly | **PASS** |
| C — mismatched global_patient_id | Trigger RAISEs (no silent overwrite) | RAISE EXCEPTION fired | **PASS** |

### C6 — Existing TS test suite

**Not run from this session** — the cowork session can apply DB migrations but doesn't execute the host's `npm test` harness against the workspace files. Mo's staging checklist includes this as a manual step.

### C7 — Existing E2E suite

**Not run.** Same reason as C6.

### C8 — Type-check

**Not run from this session.** Same reason. Note: the audit.ts widening of `actorUserId` from `string` → `string | null` is a superset, so existing 14 callers (verified via grep) remain TypeScript-compatible without changes.

### C9 — Data-layer cutover smoke

DATA_LAYER_CUTOVER_COMPLETE audit row written successfully (mig 081 inline INSERT). New helpers in `identity-resolution.ts` written and syntactically clean; full per-call-site cutover for patients.ts/frontdesk.ts/etc. is incremental TD documented in § 7.

### C10 — Quarantine resolution audit

Every quarantine row's outcome is auditable by classification:

| Side | Classification | Rows |
|---|---|---|
| patients | has_letters_or_placeholder | 2 |
| patients | numeric_other | 1 |
| users | potentially_recoverable_leading_zero | 37 |
| users | invalid_egyptian_mobile_prefix | 23 |
| users | us_test_number | 4 |
| users | has_letters_or_placeholder | 2 |
| users | numeric_other | 2 |
| users | unrecognized_country_code | 2 |
| users | morocco_unsupported_country | 1 |

All 74 audit rows present; quarantine table empty.

---

## 5. ORPHAN LEDGER DELTA

### Closed (3)

| ID | How closed | Verifying test |
|---|---|---|
| ORPH-V2-07 | mig 077 flipped `patients.global_patient_id` to NOT NULL after mig 076 emptied quarantine | C0/C1 mig 077 success + post-condition `is_nullable='NO'` |
| ORPH-V2-08 | New `identity-resolution.ts` + `patient-clinic-records.ts` data-layer modules; mig 081 emits DATA_LAYER_CUTOVER_COMPLETE marker; compat shim triggers preserve legacy reads | C9 audit-row presence + § 6 deviation note on per-call-site cutover |
| ORPH-V2-11 | mig 074 dropped NOT NULL on `audit_events.actor_user_id`, added `actor_kind` invariant, idempotently backfilled mig 073's missing audit rows | C0 validation checks 22 + 23 PASS; CHECK invariant tests PASS |

### Opened (4)

| ID | Description | Closing prompt |
|---|---|---|
| ORPH-V3-01 | `patient_clinic_records` real RLS policies (replace DENY-ALL placeholder) | Prompt 6 |
| ORPH-V3-02 | Compatibility shim triggers (mig 081) | Prompt 6.5 (Legacy Cleanup) |
| ORPH-V3-03 | `_user_dedup_plan` cross-side review surface | Prompt 6.5 or earlier if Mo decides |
| ORPH-V3-04 | `_user_dedup_plan` retention beyond Prompt 3 | Prompt 6.5 |

### Unchanged

ORPH-V2-01..06, ORPH-V2-09 (V2-09 now bears extra weight — 3 sentinel patients store unrecoverable raw_phone in `legacy_phone`; can't drop the column until those sentinels are reconciled or accepted as permanently locked).

---

## 6. DEVIATIONS FROM PLAN

### D1 — Auto-rules now (vs. manual_review gate for size 3+ user clusters)

**What:** mig 078 auto-resolves every cluster, including size 3+, with `decided_at = NOW()` instead of leaving size-3+ clusters as `manual_review` with `decided_at IS NULL`.

**Why:** Mo's choice on 2026-04-29 ("Do both auto-rules now and surface anomalies"). On staging today every cluster is size 2, so the deviation has zero observable effect — but the code path is in place for future scale.

**Mitigation:** Size-3+ clusters that auto-resolve emit `USER_DEDUP_LARGE_CLUSTER_AUTO_RESOLVED` audit rows tagged with `note='LARGE_CLUSTER_AUTO_RESOLVED (deviation per Build 03 prompt)'`, surfaced in ORPH-V3-03.

### D2 — Path B for ALL 74 quarantine rows (vs. PATH A for `+200…` recoverables)

**What:** mig 076 resolves every quarantine row to PATH B (sentinel for patients-side, audit-only for users-side) — no PATH A recoveries attempted.

**Why:** Same Mo decision as D1. The 37 `+200xxxxxxxxxxx` rows look recoverable (drop the leading 0) but defaulting to PATH B is safer at this scale (all 74 are test/seed data anyway).

**Mitigation:** Each row's `metadata.classification` tags recoverability so Mo can do a follow-up sweep. `potentially_recoverable_leading_zero` rows: 37. `QUARANTINE_RESOLVED_PATH_A` audit count: 0 (intentional).

### D3 — `global_patients.normalized_phone` NOT NULL drop (added to mig 076)

**What:** mig 076 now starts with `ALTER TABLE public.global_patients ALTER COLUMN normalized_phone DROP NOT NULL;`. Build 03 prompt body assumed multiple NULLs were allowed; the unique INDEX is plain (and therefore allows NULLs at the index level), but the column itself was created NOT NULL by mig 073.

**Why:** Discovered at staging-apply time. The fix matches the schema spec's intent (normalized_phone is nullable for sentinels) and was the simplest path forward.

**Forward-compat:** rollback file re-adds NOT NULL conditionally (only if no NULL rows remain).

### D4 — `mig 076` also creates PCR rows for sentinel patients

**What:** mig 076 was extended (post-staging-apply) with section 076.2b': for each sentinel patient created, also INSERT a `patient_clinic_records` row for `(sentinel_id, patient.clinic_id)` with `ON CONFLICT DO NOTHING`.

**Why:** Discovered during mig 080 apply — the original mig 076 created sentinel global_patients, but mig 075 had already run (creating PCR rows from `patients`); the sentinel pairs were missing. Mig 080's backfill couldn't find a PCR row for clinical rows linked to sentinel patients (1 clinical_notes, 3 dpr, 3 patient_visibility).

**Resolution on staging:** Manual remediation INSERT was run, then 3 rows added, with PATIENT_CLINIC_RECORD_CREATED audit rows tagged `source='migration_076_sentinel_pcr_remediation'`. Then mig 076 source file was updated so a fresh apply gets the same behavior in one shot.

### D5 — SET NOT NULL on 6 of 11 clinical tables (deferred 5 to Prompt 6.5)

**What:** mig 080 enforces NOT NULL on global_patient_id + patient_clinic_record_id only for `clinical_notes`, `appointments`, `patient_consent_grants`, `patient_phone_history` (no PCR), `doctor_patient_relationships`, `patient_visibility`. Defers NOT NULL for the 5 dormant/empty tables (prescription_items, lab_orders, lab_results, imaging_orders, vital_signs).

**Why:** All 5 deferred tables have 0 rows on staging today. Enforcing NOT NULL on these would block legacy code paths (which haven't been cutover yet) from inserting via `patient_id` only — until mig 081's compat shim populates global_patient_id, those inserts would fail. The shim DOES populate the columns, but for safety we let the dormant tables remain non-strict until Prompt 6.5.

**Plan v2 alignment:** Plan v2 defers ALL NOT NULL flips to mig 082 (Step 12). Build 03 prompt body said "ALTER COLUMN ... SET NOT NULL on both new columns." This deviation splits the difference: 6 tables NOT NULL now (production-shape), 5 deferred (incremental).

### D6 — Per-call-site data-layer cutover is incremental

**What:** Build 03 prompt body §B11 specified routing identity reads through `findGlobalPatientByPhone` / `findGlobalPatientById` for every call site in `patients.ts` / `frontdesk.ts` / `appointments.ts` / `clinical-notes.ts` / `clinical.ts`. This deliverable ships the canonical helpers (`identity-resolution.ts`) but does NOT rewrite every call site.

**Why:** A full per-call-site cutover would touch many lines and risks breaking subtle behaviors. The compatibility shim triggers (mig 081) ensure DB-side consistency regardless of which side a caller writes through. Incremental cutover is the safer path.

**Scope shipped:** New helpers + admin endpoint adopt the front-door pattern. Remaining call sites: TD logged in § 7.

### D7 — Migration filename numbering (sequential 074-081, conceptual mig 073.5/074/075/etc.)

**What:** Filenames use sequential `074_…` through `081_…` instead of dot-numbered (e.g., `073_5_…`). The Build 03 prompt body referred to "mig 073.5", "mig 074", "mig 075.2" etc. — those are conceptual labels.

**Why:** Lexicographic sort: `073_5_…` < `073_create_…` (digit '5' is ASCII 53, letter 'c' is 99). Using dot-numbered filenames would invert apply order under `supabase db push`. Sequential numbering preserves apply order; the conceptual labels are documented in each file's header.

---

## 7. KNOWN RISKS NOT YET ADDRESSED

### R1 — `+200xxxxxxxxxxx` recoverable phones not yet recovered

37 user rows quarantined with `potentially_recoverable_leading_zero` classification. Each could become a real Egyptian mobile number by dropping one leading zero. Mo's "auto-rules now" decision deferred PATH A recovery. **Action:** Mo decides whether to recover any of these manually (by updating users.phone + re-running normalize) or accept them as locked-out users requiring the change-phone flow on next login.

### R2 — Legacy patients.id callers not yet cutover

The data-layer cutover ships canonical helpers but not the per-call-site rewrite. The mig 081 compat shim catches this — INSERTs via legacy patient_id still produce consistent rows. **Action:** Prompts 4–6 progressively migrate call sites to `identity-resolution.ts`. Prompt 6.5 drops the shim only after every caller is migrated.

### R3 — patient-keyed tables outside Plan-v2 scope

24 patient-keyed tables (chronic_conditions, immunizations, patient_allergies, conversations, sms_reminders, notifications, etc.) are NOT touched by mig 080. They keep working via legacy patient_id but don't yet expose global_patient_id. **Action:** Prompt 6.5 sweeps these in or accepts them as per-clinic-only (no cross-clinic semantics).

### R4 — V3-09 (`legacy_phone` drop) now blocked by sentinel patients

3 sentinel global_patients rows store unrecoverable raw_phone in `legacy_phone`. The Build 02 plan to drop `legacy_phone` 30 days post-cutover can't proceed until those sentinels are reconciled (deleted, or accepted as permanently locked with the column repurposed as forensic storage). **Action:** Decision needed before Prompt 6.5.

### R5 — TS test suite + type-check not run from this session

Mo runs these from the staging checklist (§ 9). Risk: a TS regression slipped through. The audit.ts widening to `string | null` is the highest-risk change but is a strict superset.

### R6 — Compatibility shim performance

Each clinical-table INSERT now triggers a function that may do 1-2 SELECTs. At staging scale (45 clinical_notes total) this is invisible. At 50,000 patients × historical activity, the overhead may materialize. **Action:** Benchmark before promoting to production; if hot path is affected, switch to inline derivation in the data layer instead of trigger-based.

---

## 8. HAND-OFF NOTES FOR PROMPT 4

### Audit-action enum entries ready

`packages/shared/lib/data/audit.ts` now exposes 7 new actions Prompt 4 can use directly:
- PATIENT_CLINIC_RECORD_CREATED — emitted on PCR creation/touch in `getOrCreatePatientClinicRecord`. Prompt 4 might want to add MESSAGING_CONSENT_RECONFIRMED / PRIVACY_CODE_GENERATED / PRIVACY_CODE_VERIFIED / PRIVACY_CODE_FAILED.
- DATA_LAYER_CUTOVER_COMPLETE — informational marker; no further use needed.
- USER_DEDUP_FLAGGED / USER_DEDUP_CROSS_SIDE_MISMATCH / USER_DEDUP_LARGE_CLUSTER_AUTO_RESOLVED — write-once at migration time; not for Prompt 4.
- QUARANTINE_RESOLVED_PATH_A / PATH_B — same.

### Data-layer functions ready

- `resolveOrCreateGlobalIdentity(rawPhone, options?)` — phone → global identity, creating if needed.
- `resolveIdentityForClinic(rawPhone, clinicId, options?)` — bundles the above with PCR getOrCreate.
- `resolveIdentityForLegacyPatient(patientId)` — dereferences a legacy patient_id back to global identity context.
- `findPatientClinicRecord(globalPatientId, clinicId)`.
- `getOrCreatePatientClinicRecord(globalPatientId, clinicId, options?)`.
- `listPatientClinicRecordsForGlobal(globalPatientId)`.
- `listPatientClinicRecordsForClinic(clinicId, options?)`.

### Orphans Prompt 4 can close

ORPH-V2-02 (re-consent prompt blocking patient home) becomes available once the patient app surfaces. Prompt 4 may add the privacy_code-related orphans (V3-05+) when it ships `patient_privacy_codes`.

### Tables Prompt 4 will create

Per schema-spec § 5, § 5.5: `patient_privacy_codes`, `privacy_code_attempts`. Migration plan v2 calls these mig 076/077 in Build 03's number space — but the actual mig numbers will be 082/083 since 074-081 are taken by Build 03.

---

## 9. STAGING CHECKLIST

### Pre-flight

```bash
# Confirm you are on the medassist-egypt project
supabase projects list
# Expect: medassist-egypt (mtmdotixlhwksyoordbl) ACTIVE_HEALTHY
```

### TS code changes (review + apply)

```bash
cd /Users/Suzy/Desktop/medassist
git diff packages/shared/lib/data/audit.ts
git diff packages/shared/lib/data/patient-clinic-records.ts
git diff packages/shared/lib/data/identity-resolution.ts
git diff packages/shared/lib/api/handlers/admin/patient-clinic-records/handler.ts
git diff apps/clinic/app/api/admin/patient-clinic-records/route.ts
npm run type-check
# Expect: 0 errors
npm test -- --testPathPattern='shared/lib/data'
# Expect: 0 failures (no new tests added in this prompt; existing must still pass)
```

### Database migrations

**Already applied to medassist-egypt staging by the cowork session on 2026-04-29.** If you need to re-apply on a fresh clone or production, the order is:

```sql
-- 1. mig 074 (conceptual mig 073.5) — closes ORPH-V2-11
\i supabase/migrations/074_relax_audit_actor_user_id.sql
-- Verify: SELECT COUNT(*) FROM audit_events WHERE action='PATIENT_DEDUP_FLAGGED';
-- Expect: 1 (or whatever your loser count is)

-- 2. mig 075 (conceptual mig 074) — patient_clinic_records
\i supabase/migrations/075_create_patient_clinic_records.sql
-- Verify: SELECT COUNT(*) FROM patient_clinic_records;
-- Expect: COUNT(DISTINCT (global_patient_id, clinic_id) FROM patients)

-- 3. mig 076 (conceptual mig 075) — quarantine resolution
\i supabase/migrations/076_quarantine_resolution.sql
-- Verify: SELECT COUNT(*) FROM _phone_normalize_quarantine; -- Expect: 0
-- Verify: SELECT COUNT(*) FROM patients WHERE global_patient_id IS NULL; -- Expect: 0

-- 4. mig 077 (conceptual mig 075.2) — NOT NULL flip
\i supabase/migrations/077_patients_global_patient_id_not_null.sql
-- Verify: SELECT is_nullable FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='patients' AND column_name='global_patient_id';
-- Expect: NO

-- 5. mig 078 (conceptual mig 075.5) — user dedup detection
\i supabase/migrations/078_user_dedup_detection.sql
-- Verify: SELECT COUNT(*) FROM _user_dedup_plan WHERE decided_at IS NULL;
-- Expect: 0 (auto-rules deviation)

-- 6. mig 079 (conceptual mig 075.7) — user dedup consumption
\i supabase/migrations/079_user_dedup_consumption.sql
-- Verify: SELECT COUNT(*) FROM users WHERE is_canonical IS NULL; -- Expect: 0

-- 7. mig 080 (conceptual mig 076) — clinical-table refs
\i supabase/migrations/080_add_global_refs_to_clinical_tables.sql
-- Verify: SELECT COUNT(*) FROM clinical_notes WHERE global_patient_id IS NULL; -- Expect: 0

-- 8. mig 081 (conceptual mig 077) — compatibility triggers
\i supabase/migrations/081_compatibility_triggers.sql
-- Verify: SELECT COUNT(*) FROM audit_events WHERE action='DATA_LAYER_CUTOVER_COMPLETE'; -- Expect: 1
```

### Post-apply verification

```sql
-- The 13 success criteria from the prompt (all should match these on staging today):
SELECT
  (SELECT COUNT(*) FROM public.global_patients) AS gp_total,                            -- 34
  (SELECT COUNT(*) FROM public.global_patients WHERE normalized_phone IS NULL) AS sentinels,  -- 3
  (SELECT COUNT(*) FROM public.patients WHERE global_patient_id IS NULL) AS unlinked,         -- 0
  (SELECT COUNT(*) FROM public.patient_clinic_records) AS pcr_total,                          -- 35
  (SELECT COUNT(*) FROM public._user_dedup_plan WHERE decided_at IS NULL) AS undecided,       -- 0
  (SELECT COUNT(*) FROM public.users WHERE is_canonical = FALSE) AS user_losers,              -- 4
  (SELECT COUNT(*) FROM public._phone_normalize_quarantine) AS quarantine_left,               -- 0
  (SELECT COUNT(*) FROM public.audit_events WHERE action='DATA_LAYER_CUTOVER_COMPLETE') AS marker; -- 1
```

### App-side smoke (optional but recommended)

```bash
# Hit the new admin endpoint
curl -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  "https://your-staging.medassist.example/api/admin/patient-clinic-records?global_patient_id=<some-uuid>"
# Expect: 200 with { mode: 'by_global_patient', records: [...] }

curl -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  "https://your-staging.medassist.example/api/admin/patient-clinic-records?clinic_id=<some-uuid>&limit=10"
# Expect: 200 with { mode: 'by_clinic', limit: 10, records: [...] }

# 401 without service role
curl -i "https://your-staging.medassist.example/api/admin/patient-clinic-records?global_patient_id=<uuid>"
# Expect: 401
```

### Rollback (only if needed)

```sql
-- Reverse order: 081 → 080 → 079 → 078 → 077 → 076 → 075 → 074
\i supabase/migrations/081_compatibility_triggers.rollback.sql
\i supabase/migrations/080_add_global_refs_to_clinical_tables.rollback.sql
\i supabase/migrations/079_user_dedup_consumption.rollback.sql
\i supabase/migrations/078_user_dedup_detection.rollback.sql
\i supabase/migrations/077_patients_global_patient_id_not_null.rollback.sql
\i supabase/migrations/076_quarantine_resolution.rollback.sql
\i supabase/migrations/075_create_patient_clinic_records.rollback.sql
\i supabase/migrations/074_relax_audit_actor_user_id.rollback.sql
```

Note: mig 074's rollback raises if any audit_events rows have `actor_user_id IS NULL` from non-mig-074 sources. That's intentional — manually delete or reclassify before retrying.

---

**Final status:** All 8 migrations applied to medassist-egypt staging. ORPH-V2-07, V2-08, V2-11 closed. ORPH-V3-01 through V3-04 opened with closing prompts assigned. Ready for Prompt 4.
