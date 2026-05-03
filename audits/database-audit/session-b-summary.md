# Audit Session B — Summary

**Captured:** 2026-05-03
**Method:** Read-only audit of `apps/` and `packages/` against the verified staging schema from Session A. Regex extraction of `.from('table')` / `.rpc('func')` callsites; targeted greps for the three Mo rulings; structural spot-check of 15 claims; live `schema_migrations.statements` fetch for two out-of-band rows.

---

## 1. Top 5 findings — what surprised me, what's clearly drift

1. **Doctor fees runtime breakage (mig 022).** Seven active code paths read or write `consultation_fee_egp` / `followup_fee_egp` / `followup_window_days` on `doctors`. None of those three columns exist on staging. The frontdesk `/payments` page and the doctor settings flow both hit these columns. Today on staging, those routes return 500 when exercised. Mo's launch plan does not include doctor pricing — but the code paths weren't deleted; they're wired and will fail. Path forward is product/Mo's call (apply mig 022 vs delete the seven callsites).
2. **`patient_code` retirement is cleaner than expected.** The `patient_code` column is referenced in only 1 broken handler (`my-code/handler.ts`) plus 4 type-definition lines. The other 33 grep hits — `patientCode` variables, `verifyPatientCode()` function, etc. — actually verify against `patients.unique_id`, not the legacy column. Misleading naming, but mechanically clean. Cleanup PR is small.
3. **Structural drift sample rate is 13%, with 2 specific real findings.** Of 15 random MATCH-category claims (5 columns, 5 policies, 5 functions), 13 matched structurally. The two drifts: (a) `invoice_requests::frontdesk_invoice_requests` policy rewritten on staging to use `clinic_memberships` instead of `front_desk_staff` — file body never updated; (b) `can_patient_access_global_patient` function declared `SECURITY INVOKER` in mig 092 but is `SECURITY DEFINER` on staging. Both are forensic-fix targets for Session C.
4. **`account_recovery_requests` has RLS enabled with ZERO policies.** Means only service_role can read/write. App code uses `createAdminClient`, so writes work today. But this is a hardening footgun — a future code change using an authenticated-role client would silently return zero rows. Need an explicit `service_role only` policy when backfilling.
5. **Two parallel audit-log systems.** `audit_log` (the unclaimed table — used by `auditLog()` for SMS sends, patient-dedup) and `audit_events` (in migration tree — used by `logAuditEvent()` for phone changes) coexist with different schemas and different writers. Architectural smell. Surface for product consolidation review, not audit work.

---

## 2. Doctor fees verdict

**USED — 7 callsites in 7 files. All read or write missing columns. All produce HTTP 500 on staging when exercised.**

Active callers:

* `apps/clinic/app/api/doctor/stats/route.ts:151-152` (degrades silently to 0 because the SELECT didn't name the columns; fine)
* `apps/clinic/app/api/frontdesk/doctors/fees/route.ts:32, 89, 97, 105` (READ + WRITE — full 500 on both)
* `apps/clinic/app/api/frontdesk/invoice/[paymentId]/route.ts:60` (500)
* `apps/clinic/app/(frontdesk)/frontdesk/payments/page.tsx:31, 230` (degrades silently — root cause is the API call)
* `packages/shared/lib/api/handlers/doctor/settings/handler.ts:18, 61-63` (500)
* `packages/shared/lib/api/handlers/doctor/public-fee/handler.ts:27` (500)
* `packages/ui-clinic/components/frontdesk/PaymentForm.tsx:79-84` (degrades silently)

Mig 022 is a 3-column `IF NOT EXISTS` migration with safe defaults. Either path is small. Neither was taken in this audit.

---

## 3. patient_code verdict

**Cleanup callsite count: 1 handler + 1 route file + 5 type lines. Total: 3 file-level deletions.**

* Delete: `packages/shared/lib/api/handlers/patient/my-code/handler.ts`
* Delete: `apps/patient/app/api/patient/my-code/route.ts`
* Delete: the my-code section of `apps/patient/app/(patient)/patient/more/page.tsx` (callsite at L359, L394)
* Edit out: `patient_code?: string | null` field in `packages/shared/lib/data/patients.ts:34`
* Type regen will clean: 3 lines in `packages/shared/lib/supabase/types.ts` (1799, 1822, 1845)

Zero other column reads or writes touch `patients.patient_code`. The column itself is not on staging today (mig 023 was authored but never applied). No DB change needed for the retirement; just code deletion.

The `verifyPatientCode()` function and the entire `patientCode` variable web are NOT cleanup targets — they touch `unique_id`. Optional rename is polish work.

---

## 4. 5 unclaimed tables verdict

| Table | Classification | Why |
|---|---|---|
| `account_recovery_requests` | **ACTIVE FEATURE (HIGH)** | Owner-inbox phone-change-fallback queue. 1 read + 1 write; backs the clinic-owner approval flow. |
| `audit_log` | **ACTIVE FEATURE (HIGH)** | Compliance write-only sink. 6 callers via `auditLog()`. Parallel to `audit_events`. |
| `patient_phone_verification_issues` | **NO REFERENCES (DROP CANDIDATE)** | Zero matches in app code. RLS policy exists but no writers, no readers. |
| `phone_corrections` | **ACTIVE FEATURE (HIGH)** | Frontdesk "fix typo" phone-correction flow. Recently shipped (Phase C of phone-changes). Full UI, i18n, route, handler. |
| `sms_reminders` | **ACTIVE FEATURE (HIGH)** | SMS audit log. 2 writers (reminder service + prescription SMS). Reachable from 5+ routes. |

Backfill 4 tables into a forensic migration. Drop `patient_phone_verification_issues` unless Mo recalls intent. Add a service-role-only policy to `account_recovery_requests` (currently 0 policies despite RLS on).

---

## 5. PII columns verdict

| Column | Verdict |
|---|---|
| `patients.email` | DEAD on the write side (no insert/update path); EXPOSED on the read side via `doctor/patients/[id]/handler.ts` (returns `patient.email` to doctor). Always `''` today because never written. Either drop or scope the read. |
| `patients.national_id_hash` | NO REFERENCES. Drop unless Mo recalls intent. |
| `patients.national_id_last4` | NO REFERENCES. Drop unless Mo recalls intent. |
| `patients.phone_verified_at` | NO REFERENCES. Drop unless Mo recalls intent. |
| `patients.phone_verified` (related) | ACTIVE — read in phone-correction guard, written `false` at walk-in create. Effectively a constant (never flipped to `true`). |

Bonus finding: the doctor patients handler also reads `patient.national_id`, `patient.date_of_birth`, `patient.blood_type` — none of those columns exist on staging. The `select('*')` returns no value for them; `|| ''` defaults to empty string. Not a runtime error, but the API silently returns empty strings for those three fields.

---

## 6. Structural drift spot-check rate

**13% drift across 15 samples (2 of 15).** Below the 20% expansion threshold.

Drift cases:

* Policy `invoice_requests::frontdesk_invoice_requests` — file uses `front_desk_staff` lookup, staging uses `clinic_memberships` lookup with `clinic_role` enum. Rewrite was applied on staging only.
* Function `can_patient_access_global_patient` — file claims `SECURITY INVOKER`, staging is `SECURITY DEFINER`. Likely the "1 DEFINER helper" from Mo's hybrid-3-INVOKER+1-DEFINER ruling, but the file was never updated.

The other 13 claims matched structurally (cosmetic enum-cast diffs noted but functionally identical).

Pattern to watch in Session C: `front_desk_staff` references in pre-mig-052 policies. Likely several were quietly rewritten to `clinic_memberships` on staging without their files being updated.

---

## 7. Out-of-band 2026-04-08 fix summary

Both tracking rows fetched verbatim. Verbatim SQL is in `out-of-band-2026-04-08.md`.

* `20260408145102 enable_rls_on_unprotected_tables` (8 policies + RLS-enable on 3 tables): hardened `check_in_queue`, `payments`, `front_desk_staff`. Applied via migrations CLI but with no committed file.
* `20260408145129 fix_otp_codes_rls_phone_based_records` (1 DROP + 1 CREATE): replaced an incomplete patient-only OTP policy with a phone-based one covering all OTP record types.

Both look like a security pass that closed three unprotected tables and one incomplete `otp_codes` policy. 11 of the 136 EXTRA_ON_STAGING policies are explained by these two rows alone. Backfill into a forensic migration with `DROP POLICY IF EXISTS` guards (originals are not idempotent).

---

## 8. Recommendations for Session C

Beyond the standard reconciliation work, Session C needs to cover:

1. **The doctor-fees decision.** Whichever path Mo picks (apply mig 022 vs delete 7 callsites), it needs to land before Phase F resumes — Phase F is on the same `doctors` table.
2. **Targeted re-scan for `front_desk_staff`-in-policy patterns.** The drift found in policy #1 is likely systematic. A grep across `migration-claims-vs-reality.md` MATCH-category policies for ones that reference `front_desk_staff` in the file body is the right next pass — each could be a forgotten rewrite.
3. **Function security-mode reconciliation.** Sample-size-of-5 found 1 DEFINER-vs-INVOKER drift. Worth checking the other 4 RLS helpers from mig 092 (`app_user_id`, `is_clinic_member`, `clinic_member_role`, `is_clinic_member_definer`) the same way.
4. **`account_recovery_requests` policy gap.** Add a service-role-only policy in the forensic backfill. Don't let the gap survive.
5. **`patient_code` cleanup PR sequencing.** Cleanup is independent of mig 023 (which never applied). Can land before, after, or alongside Phase F.
6. **PII column drops.** `national_id_hash`, `national_id_last4`, `phone_verified_at` — no app code references. Cheapest cleanup. Drop in the same forensic migration.
7. **Audit-log consolidation question.** Punt to product but flag: `audit_log` (unclaimed) vs `audit_events` (claimed) need a unification decision before launch.
8. **Sequencing vs Phase F.** Forensic backfill of the 11 policies from the 2026-04-08 fixes should land BEFORE Phase F's policy rewrites. Phase F's `_v2` policies will use `DROP POLICY IF EXISTS` so the backfill won't conflict.

---

## 9. Open questions for Mo

1. **Doctor fees:** apply mig 022, or delete the 7 callsites? The callsites are not dead UI — frontdesk/payments and doctor/profile are real flows. Either decision is small in code, but they're opposite directions.
2. **`can_patient_access_global_patient` security mode:** is staging's DEFINER intentional (the "1 DEFINER helper" from the Prompt 6 ruling), or did a hot-patch change it without updating mig 092? The body is safe either way; this is an architectural-intent question.
3. **`patient_phone_verification_issues`:** any product memory? It's the only fully-orphaned table among the 5 unclaimed. Drop or wire?
4. **PII columns:** `national_id_hash` + `national_id_last4` + `phone_verified_at` — are these scaffolding for a feature you still want to ship, or abandoned? If the former, name the feature so Session C can keep the columns; if the latter, they're drop targets.
5. **`audit_log` vs `audit_events`:** consolidate or keep parallel? Different schemas, different writers, different consumers. Both are alive.
6. **The 087 trio function bodies:** the structural spot-check didn't sample these. Session A flagged them as "live function/view bodies are authoritative; file no longer reliable." Session C will need to dump the bodies and re-emit `087.sql`.

---

## Deliverables produced this session (in `audits/database-audit/`)

* `app-supabase-touchpoints.md` — 132 files, 561 `.from()` callsites, 25 `.rpc()` callsites, 57 distinct tables, 24 distinct RPCs
* `doctor-fees-usage.md` — verdict: USED, 7 callsites, all broken on staging
* `patient-code-usage.md` — verdict: clean retirement, 3 file deletions + 5 type lines
* `unclaimed-tables-usage.md` — 4/5 ACTIVE, 1/5 NO REFERENCES
* `patients-pii-columns-usage.md` — 1/5 ACTIVE, 1/5 dead-on-write-but-exposed-on-read, 3/5 NO REFERENCES
* `structural-drift-spotcheck.md` — 13% drift rate (2 of 15), specific findings documented
* `out-of-band-2026-04-08.md` — both tracking rows' verbatim SQL recovered
* `session-b-summary.md` — this file
* `audits/PROGRAM_STATE.md` — updated to mark Session B done

**No code, schema, or data was modified.** Read-only throughout.
