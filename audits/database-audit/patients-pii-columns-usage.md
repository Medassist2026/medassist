# Audit Session B — `patients` PII Columns Usage Check

**Captured:** 2026-05-03
**Scope:** the four "PII-adjacent" columns on `patients` flagged by Session A as EXTRA_ON_STAGING (created via dashboard SQL, no migration file): `patients.email`, `patients.national_id_hash`, `patients.national_id_last4`, `patients.phone_verified_at`. Plus the related `patients.phone_verified` (also EXTRA but boolean, not PII per se) for completeness.
**Method:** `grep -rn` for each column name in `apps/` and `packages/`, plus context-aware extraction of `.from('patients')` callsite windows.

## Verdict matrix

| Column | DB row state | App code state | Verdict |
|---|---|---|---|
| `patients.email` | exists, nullable, no DEFAULT | **READ** in `doctor/patients/[id]/handler.ts:176` (via `select('*')`); never written | **DEAD on the write side, EXPOSED on the read side.** Always NULL today. |
| `patients.national_id_hash` | exists, nullable | only in auto-generated types | **NO REFERENCES** |
| `patients.national_id_last4` | exists, nullable | only in auto-generated types | **NO REFERENCES** |
| `patients.phone_verified_at` | exists, nullable | only in auto-generated types | **NO REFERENCES** |
| `patients.phone_verified` (related) | exists, nullable | INSERT with `false` (walk-in create) + SELECT in phone-correction guard | **ACTIVE** |

**Net: 1 column actively used (`phone_verified`), 1 partially exposed but never written (`email`), 3 entirely dead (`national_id_hash`, `national_id_last4`, `phone_verified_at`).**

The DB write code path that would populate `national_id_hash` / `national_id_last4` does not exist — the doctor's "Add Patient" form (`apps/clinic/app/(doctor)/doctor/patients/page.tsx`) collects `national_id` from the user but the receiving handler (`packages/shared/lib/api/handlers/doctor/patients/create/handler.ts`) does not propagate it to the patient row. The form field is dead UI.

---

## Per-column detail

### 1. `patients.email`

**Schema state:** `text`, nullable, no DEFAULT. On staging.

**Reads (1 callsite, behind `select('*')`):**

#### `packages/shared/lib/api/handlers/doctor/patients/[id]/handler.ts:35-37, 167-184`

```
 35:    const { data: patient, error: patientError } = await admin
 36:      .from('patients')
 37:      .select('*')
 38:      .eq('id', patientId)
...
167:    return NextResponse.json({
168:      patient: {
169:        id: patient.id,
170:        name: patient.full_name,
...
172:        phone: patient.phone || '',
173:        email: patient.email || '',
174:        date_of_birth: patient.date_of_birth || '',
...
176:        national_id: patient.national_id || '',
177:        blood_type: patient.blood_type || '',
```

The handler returns `patient.email` to the doctor role. **`email` IS exposed to non-patient users via this endpoint.** Today, since no write path populates it, the value is always `null` and the response contains `''`. But if a column-level data backfill ever happened (or if the dashboard-applied schema gets a write path), this endpoint would silently leak email addresses to any doctor with `can_access_patient(patientId)` clearance.

**Note on related missing columns:** `date_of_birth`, `blood_type`, and `national_id` (without _hash/_last4 suffix) are accessed on the `patient` response but **none of those three columns exist on staging**. The `select('*')` returns whatever the schema has; missing columns surface as `undefined`, then `|| ''` pins them to empty strings. So the API consistently returns empty strings for those three fields. Not a runtime error, but a documentation/expectation gap.

**Writes:** zero. The closest write context (`packages/shared/lib/data/patients.ts:577`) is `email: dummyEmail` passed to `auth.admin.createUser()` — it goes into `auth.users.email`, not `public.patients.email`.

**Verdict: DEAD on write side. Read exposure is currently moot but architecturally questionable.** If `patients.email` is meant to be a real surface, it needs a write path and access scoping. If it's not, drop the column.

### 2. `patients.national_id_hash`

**Schema state:** `text`, nullable. On staging.

**Reads:** zero in app code.
**Writes:** zero in app code.
**Type definitions:** present in `packages/shared/lib/supabase/types.ts:1796, 1819, 1842` (auto-generated Row/Insert/Update).

**Verdict: NO REFERENCES.** Created on staging (provenance: dashboard SQL applied during a build pass), never wired to anything in app code. Drop or wire.

### 3. `patients.national_id_last4`

**Schema state:** `text`, nullable. On staging.

**Reads:** zero.
**Writes:** zero.
**Type definitions:** auto-generated only.

**Verdict: NO REFERENCES.** Same as `national_id_hash` — paired addition for hashed-PII storage scheme that was never implemented in code.

### 4. `patients.phone_verified_at`

**Schema state:** `timestamptz`, nullable. On staging.

**Reads:** zero.
**Writes:** zero.
**Type definitions:** present in `packages/shared/lib/supabase/types.ts:1802, 1825, 1848` (and `2180, 2189, 2198` — likely a second view/derived type).

The phone-change flow uses **different columns on `phone_change_requests`** (`new_phone_verified_at`, `old_phone_verified_at`) — those are real and written at `packages/shared/lib/data/phone-changes.ts:536, 568, 579`. They are not the `patients.phone_verified_at` column.

**Verdict: NO REFERENCES.** Likely intended to record when `patients.phone_verified` flipped from false→true, but the code path that does the flip never updates this column.

### 5. `patients.phone_verified` (boolean — related)

**Schema state:** `boolean`, nullable. On staging.

**Reads (1 callsite):**

#### `packages/shared/lib/data/phone-changes.ts:1287-1289` (inside `correctPatientPhone()`)

```
1286:  const { data: patient } = await admin
1287:    .from('patients')
1288:    .select('id, phone, clinic_id, phone_verified')
1289:    .eq('id', input.patientId)
```

Used as a guard: if a patient is `phone_verified=true` AND has an `auth.users` row, the frontdesk correction flow is rejected (must use the OTP change flow instead).

**Writes (1 callsite):**

#### `packages/shared/lib/data/patients.ts:628` (inside walk-in patient create)

```
622:  const { data: patient, error: patientError } = await adminSupabase
623:    .from('patients')
624:    .insert({
625:      id: userId,
...
628:      phone_verified: false,
```

Set to `false` at walk-in creation. No code path elsewhere flips it to `true` (the actual phone-verification flow uses different tables — `auth.users.phone_confirmed_at` per memory notes).

**Verdict: ACTIVE — partially.** Read in the correction-flow guard. Written once (always `false` at create). Never flipped to `true`. Functionally a constant.

---

## Cross-column observations

### The PII storage scheme is half-built

`national_id_hash` + `national_id_last4` look like the start of a hashed-PII pattern (store the SHA hash for verification, store last-4 for display). Neither column has a code path. The doctor "Add Patient" form collects `national_id` plain-text but discards it before insert. **Either ship the hashing flow or drop both columns.**

### `email` exposure-without-write is an architectural question

The doctor endpoint exposes `patient.email` in its JSON response. Today the value is always null, so this is a no-op. Architecturally it's a future leak — if any future code path writes to `patients.email`, it becomes readable by any doctor with `can_access_patient` clearance. Session C may want to scope this read or remove the field from the response.

### `phone_verified_at` is structurally redundant given `audit_events`

The audit_events system already records phone-verification events with timestamps. A separate `phone_verified_at` column duplicates that. Either drop it or wire it as a denormalized cache (with a backfill migration to populate from `audit_events`).

### Auto-generated types include all four PII columns

`packages/shared/lib/supabase/types.ts` has `patient_code` (the retiring column, not on staging) AND all four PII columns (on staging). This means the types file was regenerated at a point when the schema state included the dashboard-applied PII columns. Regenerating today (post-`patient_code` removal) would correct only `patient_code`. The PII columns would remain in the types until the columns themselves are dropped.

## Recommendation for Session C

1. **Drop `national_id_hash`, `national_id_last4`, `phone_verified_at`** unless Mo recalls product intent. Zero references, zero writes — pure schema dead weight. Each comes with a `text`/`timestamptz` column overhead and contributes to the EXTRA_ON_STAGING count.
2. **Drop `patients.email`** OR wire a write path with proper scoping (and update the doctor endpoint to gate the response field by clinic membership / share grant). Today it's a half-built feature that exposes an empty string but could exposure-leak in the future.
3. **Keep `phone_verified`.** Active read + write. If Session C wants to tighten it: only `false` is ever written, so the column is effectively a constant — could be replaced with "patient has a `phone_verified_at` row in `audit_events`" lookup, but that's a refactor, not a fix.
4. **None of the above changes app behavior on staging.** All four PII columns are functionally dead on the write side; dropping them is safe. The `patient.email` read in the doctor endpoint will degrade to `''` (already does, since the value is always null).
