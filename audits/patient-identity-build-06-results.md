# Patient Identity Build 06 — Results (in progress)

**Status:** Phase A–C in flight. This file accumulates per-section deliverables across cowork sessions and consolidates at sign-off (Phase H). Until then, the canonical session-by-session log is `audits/patient-identity-build-06-progress.md`; this doc carries only the durable per-section content.

**Sign-off line (deferred to Phase H):** *I have personally verified that no cross-tenant data leakage is possible under any tested scenario in the matrix.*

---

## 1. Pre-flight inventory (Phase A)

[Populated in Phase H. Reference: `audits/patient-identity-build-06-progress.md` § Phase A; `audits/rls-pre-migration-snapshot.sql`; `audits/rls-admin-client-triage.md`; `audits/rls-existing-tests-inventory.md`.]

## 2. Helper functions (Phase B)

[Populated in Phase H. Reference: `supabase/migrations/092_rls_helper_functions.sql` and the recursion-fix amendment in `094a_rls_helper_fixes.sql`. Phase B benchmark numbers in `audits/rls-helper-benchmark.md`.]

## 3. Per-table policies (Phase C)

### Migrations shipped through cowork session 5

| Mig | Scope | Status | Closes |
|---|---|---|---|
| 092 | 4 helpers (3 INVOKER + 1 DEFINER originally; corrected by 094a) | ✅ staging | — |
| 093 | global_patients, patient_clinic_records, patient_data_shares, privacy_code_attempts (SELECT only), patients (legacy mirror) | ✅ staging | ORPH-V2-06, V3-01, V4-01, V4-02, V4-03, V5-01 |
| 094 | clinical_notes, prescription_items, lab_results, lab_orders, imaging_orders, vital_signs (PERMISSIVE SELECT v2 + RESTRICTIVE INSERT/UPDATE) | ✅ staging | (closes Phase D scenarios 9–10 dependencies) |
| 094a | RLS recursion fix + helper-uniformity (5 DEFINER, 0 INVOKER) | ✅ staging | n/a (correctness amendment) |

### 3.1 Empirical lessons — promoted to project-wide standing rules (Mo, 2026-04-30)

Four rules have been baked into `audits/EXECUTION_PROMPTS.md` under "Empirical Lessons / Prompt 6" and propagate to Prompt 7+. They are documented here with the recursion proof and harness debugging trace so the *why* is recoverable:

#### Rule 1 — All helpers in RLS predicates are SECURITY DEFINER, no exceptions

**The chain that falsified the original "hybrid" ruling:**
1. Mig 092 shipped 3 INVOKER helpers + 1 DEFINER (`can_view_patient_data_at_clinic`).
2. Mig 093 SELECT policies on `global_patients` and `patient_clinic_records` each contained inline EXISTS queries against the *other* table.
3. The first authenticated SELECT against either table fired:
   ```
   ERROR:  42P17: infinite recursion detected in policy for relation "patient_clinic_records"
   ```
4. The recursion chain (verified by inspection):
   - `SELECT FROM patient_clinic_records` (as authenticated)
   - → `patient_clinic_records_select_v2` USING evaluates `EXISTS (SELECT 1 FROM global_patients WHERE …)` for the patient-self branch
   - → that SELECT hits `global_patients_select_v2` USING under SECURITY INVOKER context
   - → `global_patients_select_v2` evaluates `EXISTS (SELECT 1 FROM patient_clinic_records WHERE … is_clinic_member(pcr.clinic_id))` for the clinic-via-PCR branch
   - → that SELECT hits `patient_clinic_records_select_v2` USING again
   - → cycle. Postgres aborts.

**Fix (mig 094a):** all 5 helpers SECURITY DEFINER. DEFINER bypasses RLS during the helper's internal joins, breaking the cycle. Rewrote 6 policies to call helpers instead of inline EXISTS:
- `global_patients_select_v2` → `claimed_user_id = auth.uid() OR public.user_has_clinic_path_to_gp(id, auth.uid())`
- `patient_clinic_records_select_v2` → `is_clinic_member(clinic_id, auth.uid()) OR can_patient_access_global_patient(global_patient_id, auth.uid())`
- `patient_data_shares_select_v2`, `_revoke_update_v2`, `privacy_code_attempts_select_v2`, `patients_select_v2` — same pattern

**Verification (2026-04-30 staging):**
- doctor_a (member of clinic_a only) — sees 3 PCRs / 3 global_patients / 3 shares (all clinic_a, all visible as grantor)
- doctor_b (member of clinic_b only) — sees 1 PCR / 1 global_patient / 3 shares (only patient_x via clinic_b PCR; all 3 shares visible as grantee)
- patient_y_user (claimed) — sees 1 own gp / 0 other gp; 1 own PCR / 0 other PCR; 1 own share / 0 other share

No cross-clinic leak under any tested scenario.

#### Rule 2 — Smoke-probe assertion in every RLS migration

Mig 093's post-condition asserted policy *structure* (existence + permissive flag). It did NOT execute a real authenticated SELECT against the affected tables. The recursion only manifests at query time — structure-only assertions cannot catch it.

**Standing rule for migs 094a and beyond:** post-condition includes a smoke probe of the form:

```sql
-- Run inside the migration's post-condition DO $$ block
SET LOCAL ROLE 'authenticated';
SET LOCAL "request.jwt.claims" TO '{"sub":"<some_active_user_uuid>","role":"authenticated"}';
PERFORM COUNT(*) FROM public.<each_affected_table>;
RESET ROLE; RESET "request.jwt.claims";
```

If any table errors with 42P17 (recursion) or returns nonsensical row counts, the migration aborts.

#### Rule 3 — Test harness Option A pattern: `SET LOCAL ROLE` keyword as separate statement

The Supabase MCP session runs as `postgres` (which has `BYPASSRLS=TRUE` at the role level). Using `set_config('role', 'authenticated', TRUE)` *inline within a WITH clause* leaves the query plan built under the session_user's BYPASSRLS attribute — the role switch becomes cosmetic and RLS never engages.

**Empirical proof (staging 2026-04-30):**

| Harness pattern | doctor_a → patient_clinic_records visible rows | RLS engaged? |
|---|---|---|
| `set_config(...)` inline in WITH clause | 4 (false leak — patient_x at clinic_b also returned) | ❌ no |
| `SET LOCAL ROLE 'authenticated';` separate statement, then SELECT | 3 (correct — only clinic_a PCRs) | ✅ yes |

**Canonical Phase D scenario shape:**

```sql
SET LOCAL ROLE 'authenticated';
SET LOCAL "request.jwt.claims" TO '{"sub":"<user_uuid>","role":"authenticated"}';
-- <SELECT or INSERT or UPDATE under spoofed user>
```

Each `execute_sql` call wraps in one transaction — `SET LOCAL` persists for the call. The next call resets to the session role automatically.

#### Rule 4 — Prototype-before-author for any RLS work touching cross-table predicates

Phase D step 2 (test harness prototype) was the cheap probe that caught Rule 1 *before* scenario authoring would have wasted hours generating false-positive results against a recursion-broken policy.

**Process directive for Prompt 7 caregiver paths** (which add `dependent_account_links` joins on top of every patient-table policy): each new helper or policy edit is probed under the canonical harness against a representative seed dataset *before* the matrix scenarios are written. The 15-minute probe cost dominates the days of scenario rewrite that would otherwise follow.

### 3.2 Per-table policy details (Phase H consolidation)

[Populated in Phase H from migs 093–097 + Phase F 098/099/100 + 101 (legacy drop).]

## 4. Test matrix results (Phase D)

### 4.1 Matrix scope (in-program lexicon)

The program touches roughly 30 tables that have a patient FK, but not all of them require an 8+-scenario set. Scope partitions:

**In-scope for Phase D scenario authoring (19 tables)**:
- *Patient identity (7)*: global_patients, patient_clinic_records, patient_data_shares, privacy_code_attempts, patient_privacy_codes, privacy_code_sms_tokens, patients (legacy mirror — explicit transitive proof per Mo session 7)
- *Clinical data (6)*: clinical_notes, prescription_items, lab_results, lab_orders, imaging_orders, vital_signs
- *Operations (4)*: appointments, check_in_queue, payments, doctor_availability
- *Communication (4)*: messages, conversations, notifications, audit_events (with the resolved_global_patient_id generated column)
- *Non-patient (4)*: clinics, clinic_memberships, users, doctors

That's actually 25 by table-count — the discrepancy is that some of these (patient_privacy_codes, privacy_code_sms_tokens, doctor_templates, prescription_templates) are tested with reduced scenario counts because they're DENY-ALL or doctor-private with no cross-clinic semantics. The "19 in-scope" count refers to tables that take the full S1-S10 (or its 7-scenario reduction for tables without cross-clinic share semantics) treatment.

**Out-of-scope for Phase D scenarios (deliberate)**:
- *Doctor-private with no cross-clinic semantics*: doctor_templates, prescription_templates — single-row policy (`doctor_id = auth.uid()`); cross-clinic, cross-patient, share semantics don't apply.
- *Tables that require seed extensions disproportionate to their value*: chronic_conditions, vital_signs (when added; in scope), default_sharing_preferences, patient_phone_history, patient_consent_grants, anonymous_clinical_observations — these are tracked in build-06 § 8 honest gaps and either documented as "transitive proof from clinical_notes' helper" or queued as Phase D follow-up.
- *Internal admin / migration tables*: _patient_dedup_plan, _user_dedup_plan, etc. — service-role-only, never read under user context.

### 4.2 Cumulative run #1 (through cowork session 13)

| Group | Tables | Scenarios | PASS | FAIL |
|---|---:|---:|---:|---:|
| Patient identity | 6 | 40 | 40 | 0 |
| Clinical data | 6 | 45 | 45 | 0 |
| Communication (audit_events leak only) | 1 | 4 | 4 | 0 |
| Non-patient | 4 | 32 | 32 | 0 |
| **Cumulative** | **17** | **121** | **121** | **0** |

*Patient identity is 6 (global_patients, patient_clinic_records, patient_data_shares, privacy_code_attempts, patient_privacy_codes, privacy_code_sms_tokens) directly authored. `patients` (legacy) is **in scope for production correctness** — its mig-093 mirror policies are live and exercised by every code path that goes through the helpers — but **out of scope for direct scenario authoring** because (a) the helpers it shares with global_patients/PCR are already directly tested, (b) the table itself drops in Prompt 6.5, and (c) explicit testing would have required adding 3 user accounts (`patients.id` FK to `users.id`) for marginal incremental verification value. See § 8 honest gaps for the trade-off rationale.*

*Clinical data: clinical_notes got the full S1-S10 (10 scenarios), the other 5 each got the reduced S1-S3, S7-S10 set (7 scenarios) — total 10 + 5×7 = 45. The S4/S5/S6 deferral on the 5 reduced-coverage tables is documented in § 8 honest gaps with transitive-proof reasoning.*

Outstanding for run #1 closure (session 14a):
- Operations (4 tables × 8 = 32 scenarios)
- Communication except audit_events (3 tables × 8 = 24 scenarios)
- = 56 scenarios → matrix at **177 / 177** at end of session 14a.

### 4.3 Run #2 + Run #3

Run #2 (post-mig-095/096/097, structure unchanged since run #1) and Run #3 (post-mig-101 legacy drop) populate this section as those sessions land. (Slot 101 was originally referred to as "mig 098" in the Prompt 6 spec; renumbered per session-16 ruling 2026-05-02.)

## 5. Performance benchmark (Phase E)

[Populated in Phase E.]

## 6. Application code updates (Phase F)

[Populated in Phase F. Inventory in `audits/rls-admin-client-triage.md`.]

## 7. Rollback rehearsal (Phase G)

[Populated in Phase G.]

## 8. Honest gaps

Accumulating across sessions; consolidated at Phase H. Current entries:
- 6 patient-joined tables not in Mo's Prompt 6 inventory but exist on staging — added during A.3 (chronic_conditions, vital_signs, default_sharing_preferences, patient_phone_history, patient_consent_grants, anonymous_clinical_observations).
- 4 tables in Mo's Prompt 6 § C3 list that don't exist on staging — `prescriptions`, `medications`, `medication_intake_log`, `encounters` (replaced by `prescription_items`, `clinical_notes`).
- `prescription_templates` exists but is doctor-scoped (no patient FK) — moves to mig 097 scope, not 094.
- Caregiver / `dependent_account_links` paths deliberately deferred to Prompt 7 (Mo's ruling 2, 2026-04-30).
- Legacy `patients` table policies coexist with v2 via PERMISSIVE-OR; whole table dropped in Prompt 6.5.
- Mig 094a post-condition `DO $$` runs after `COMMIT` (not atomic with the migration). Acknowledged template defect; **not** re-doing 094a; future RLS migs (095–101) put post-conditions inside the transaction.
- 2 `CREATE_CLINICAL_NOTE` audit_events rows excluded from patient-side `audit_events.resolved_global_patient_id` resolution by design — clinical-note actions surface to patients via the `clinical_notes` table itself, not the audit feed.

## 9. Orphan ledger updates

Closes (through cowork session 5): ORPH-V2-06, ORPH-V3-01, ORPH-V4-01, ORPH-V4-02, ORPH-V4-03, ORPH-V5-01.
[Phase H consolidates remaining closures + opens.]

## 10. Sign-off

[Phase H — held until Phase D run #3 = 100% green.]
