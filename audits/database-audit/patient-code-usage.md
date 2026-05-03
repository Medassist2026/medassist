# Audit Session B — patient_code Usage Check

**Captured:** 2026-05-03
**Scope:** every reference in `apps/` and `packages/` to the legacy `patient_code` system — column reads/writes, the API route, variable usages, and the related (but distinct) `unique_id` column.
**Method:** `grep -rn` for `patient_code`, `patient-code`, `patientCode`, `verifyPatientCode`, `unique_id`.

## Verdict

**Cleanup target: 1 handler file (already known) + 5 type-definition entries + 0 other column reads/writes.**

The `patient_code` system as expressed in app code is a **string-token verification flow** that compares a user-entered code against `patients.unique_id` (which IS on staging) — not against `patients.patient_code` (which is NOT on staging). Most of the `patientCode` variable usages and the entire `verifyPatientCode()` function in `packages/shared/lib/data/patients.ts` are misleadingly named: they touch `unique_id`, not `patient_code`.

The only callsite that actually selects or writes `patients.patient_code` is the broken `my-code/handler.ts` already identified in Phase F. Once that handler and its three TypeScript-types declarations are removed, the column can be dropped without further code change.

Two small additional cleanup notes:

* `verification_method: 'patient_code'` strings (in `data/patients.ts:384, 1063`) are **enum values**, not column refs. They satisfy the `patient_consent_grants.verification_method` text column (which on staging has `DEFAULT 'patient_code'`). These are data, not column references. Leaving as-is is fine; renaming would require a data migration.
* `unique_id` is read in 81+ callsites across patients, doctors, clinics, and front_desk_staff tables. ALL exist on staging (verified). None of these are `patient_code` cleanup targets. Documenting them here only because the task asked us to distinguish them.

## Confirmed: column not on staging

`patients.patient_code` is **NOT** on staging (verified against `staging-schema-2026-05-03.json`). The `patients` table has these columns: `id, age, clinic_id, converted_at, created_at, created_by_doctor_id, duplicate_of_patient_id, email, full_name, global_patient_id, guardian_id, is_canonical, is_dependent, last_activity_at, national_id_hash, national_id_last4, normalized_phone, parent_phone, phone, phone_verified, phone_verified_at, registered, sex, unique_id, account_status` — no `patient_code`. Migration 023's `ADD COLUMN patient_code` was authored in the repo but never applied to staging.

The `unique_id` column IS on staging for `patients`, `doctors`, `clinics`, `front_desk_staff`. None of those are cleanup targets.

## Per-callsite detail

### A — Real `patient_code` column reads/writes (the cleanup targets)

#### A1. `packages/shared/lib/api/handlers/patient/my-code/handler.ts`

**Operation: READ + WRITE.** This is the single broken handler.

```
 13:    const admin = createAdminClient('patient-code')
 14:
 15:    const { data: patient, error } = await admin
 16:      .from('patients')
 17:      .select('patient_code, unique_id')
 18:      .eq('id', user.id)
...
 25:    // Return patient_code if exists, fallback to unique_id
 26:    return NextResponse.json({
 27:      success: true,
 28:      code: patient.patient_code || patient.unique_id,
 29:    })
...
 41:    const admin = createAdminClient('patient-code')
 42:    // Generate new 6-char code
 43:    const newCode = ...
 49:    const { data, error } = await admin
 50:      .from('patients')
 51:      .update({ patient_code: newCode })
 52:      .select('patient_code')
 53:      .single()
...
 60:    return NextResponse.json({
 61:      code: data.patient_code,
```

**Status: 500 on staging today** for both GET (the SELECT names the missing column) and POST (the UPDATE writes it).

**Reachability:** `apps/patient/app/(patient)/patient/more/page.tsx:359, 394` calls `fetch('/api/patient/my-code')` and `POST /api/patient/my-code`. The route is wired at `apps/patient/app/api/patient/my-code/route.ts:4`.

This is the `/patient/more` legacy page already surfaced in Build 05 follow-up (memory: "Prompt 6.5 sub-task").

#### A2. `packages/shared/lib/supabase/types.ts:1799, 1822, 1845`

**Operation: TYPE DEFINITION** (auto-generated `Row`, `Insert`, `Update` for `patients`).

```
1799:          patient_code: string | null   // Row
1822:          patient_code?: string | null  // Insert
1845:          patient_code?: string | null  // Update
```

**Status: stale.** The types file was generated against a snapshot that assumed mig 023 was applied. Will become correct on next regeneration once `patients.patient_code` is removed from the schema. No runtime impact.

#### A3. `packages/shared/lib/data/patients.ts:34`

**Operation: TYPE DEFINITION** (TypeScript interface).

```
 32:  // V3 fields - clinic-centric
 33:  patient_code?: string | null
 34:  clinic_id?: string | null
```

**Status: dead field.** Never read on this shape after `verifyPatientCode()` was reworked to compare against `unique_id`. Safe to delete.

### B — `verification_method: 'patient_code'` enum-value strings (NOT column refs)

#### B1. `packages/shared/lib/data/patients.ts:384`
#### B2. `packages/shared/lib/data/patients.ts:1063`

```
1058:    .insert({
1059:      doctor_id: doctorId,
1060:      patient_id: patientId,
1061:      consent_type: 'messaging',
1062:      consent_state: 'granted',
1063:      verification_method: 'patient_code',
```

These are values written into `patient_consent_grants.verification_method` (a `text` column with DEFAULT `'patient_code'` on staging — verified). Not affected by the column drop. **Status: keep as-is.**

### C — `patientCode` (camelCase variable) usages — verifying against `unique_id`, not the column

The `patientCode` parameter and variable name are everywhere, but the underlying database touch is to `patients.unique_id`. Catalog:

#### C1. `packages/shared/lib/data/patients.ts:137-167` — `verifyPatientCode()` function

```
137: export async function verifyPatientCode(
138:   phone: string,
139:   code: string
...
151:   const { data: patient } = await adminSupabase
152:     .from('patients')
153:     .select('id, unique_id, full_name, age, sex, registered')
154:     .eq('phone', normalized)
...
162:   if (!timingSafeEqualString(patient.unique_id, code.toUpperCase().trim())) {
```

**Status: works on staging.** Reads `unique_id`. The function name is misleading; mechanically it's "verify unique_id."

#### C2. `packages/shared/lib/data/patients.ts:985-1008` (approx) — analogous flow inside another handler

```
1002:  if (!timingSafeEqualString(patient.unique_id, patientCode.toUpperCase().trim())) {
```

Same pattern — variable named `patientCode`, column read is `unique_id`.

#### C3. `packages/shared/components/clinical/SessionForm.tsx:224, 647, 654, 836, 1527, 1538`

Client-side React state holding the user-entered code. Sent to the verify-code endpoint over fetch. Not a DB touch.

#### C4. `packages/shared/lib/api/handlers/patients/onboard/handler.ts:39, 160`
#### C5. `packages/shared/lib/api/handlers/patients/verify-code/handler.ts:3, 53`
#### C6. `packages/shared/lib/data/patients.ts:199, 293, 294, 387`

Handlers that propagate the `patientCode` string into `verifyPatientCode()`. All ultimately read `unique_id`.

#### C7. `apps/clinic/app/api/patients/upgrade-relationship/route.ts:18, 49, 69`

Upgrade-relationship route comments and reads `unique_id`.

```
 49:      .select('id, unique_id, full_name, registered')
...
 69:    const uniqueId = (patient.unique_id as string || '').toUpperCase()
```

**Status across C1–C7: all read `unique_id`. Not cleanup targets for the `patient_code` retirement.**

### D — `patient-code` (route segment / admin-client tag)

#### D1. `packages/shared/lib/api/handlers/patient/my-code/handler.ts:13, 41`

```
13: const admin = createAdminClient('patient-code')
41: const admin = createAdminClient('patient-code')
```

The `'patient-code'` string is a tag passed to `createAdminClient()` for triage-tracking (per memory: "createAdminClient triage stays in Phase A"). Has no DB impact. **Status: removed when handler is removed.**

## Reachability map

| Path | Reachable from UI? | Status on staging |
|---|---|---|
| `GET /api/patient/my-code` | Yes — `/patient/more` page (`apps/patient/app/(patient)/patient/more/page.tsx:359`) | 500 (`patient_code` column missing) |
| `POST /api/patient/my-code` | Yes — same `/patient/more` page (`:394`) | 500 (UPDATE on missing column) |
| `verifyPatientCode()` | Yes — onboard, verify-code, upgrade-relationship paths | OK (reads `unique_id`) |
| `patient_consent_grants.verification_method='patient_code'` writes | Yes — onboard, upgrade-relationship | OK (text column accepts the value) |

## Cleanup callsite count

If Mo's "patient_code retirement" means removing the column AND every code path that names it:

* **3 file-level deletions:** `packages/shared/lib/api/handlers/patient/my-code/handler.ts`, `apps/patient/app/api/patient/my-code/route.ts`, the `/patient/more` page UI section that calls these.
* **3 type-definition lines** in `packages/shared/lib/supabase/types.ts` (auto-regenerates).
* **1 interface-field line** in `packages/shared/lib/data/patients.ts:34`.
* **0 other column reads.**
* **0 column writes** outside the my-code handler.

The `verifyPatientCode()` function and the entire `patientCode` variable web are **not** cleanup targets — they touch `unique_id`. Renaming the function/variable to `verifyUniqueId()` is a polish-pass, not a retirement-pass.

## Recommendation for Session C

1. **Confirm Mo's intent.** The task brief says retirement is confirmed; this audit's findings support a clean retirement.
2. **Atomic cleanup PR (Phase F or Phase G):** delete the 3 files in §"3 file-level deletions" above and remove the `patient_code` field from the local interface (`patients.ts:34`). Regenerate types.
3. **No migration needed for the column drop today** — staging never had it. Mig 099 (drafted in repo, untracked) does not apply either; mig 098 created the privacy-codes infrastructure under a different name. Session C may want to mark mig 023 as "abandoned, do not apply" or remove it from the repo.
4. **`verifyPatientCode()` rename** is a separate, optional task. Ranks low.
