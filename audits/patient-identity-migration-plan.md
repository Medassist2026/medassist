# Patient Identity Migration Plan — Network Model

> Migration sequence that takes MedAssist from the clinic-scoped patient
> model (HEAD `778467a`, mig 070 latest applied) to the network-first
> identity model specified in
> `audits/patient-identity-schema-spec.md`. PLAN ONLY — no SQL is
> applied here. Each step's forward and reverse SQL is illustrative;
> the actual migration files (mig 071+) are written in subsequent
> BUILD prompts and tracked through the orphan ledger.
>
> Production state at planning time:
> - 35 `patients` rows total (23 in Naser's clinic).
> - 288 `users` rows, 170 with local-form phone (`01XXXXXXXXX`),
>   118 already E.164 (`+201XXXXXXXX`).
> - 32 active `patient_visibility` grants, all to clinic OWNERs
>   (production is effectively solo today — see memory record
>   `project_rls_rewrite_status.md`).
> - mig 070 is the latest applied; this plan starts at mig 071.

---

## 0. Risk and rollout posture

| Theme | Decision |
|---|---|
| Application downtime | None planned. Every step is online or has a sub-1-min lock window. |
| RLS posture during cut-over | Old policies coexist with new ones in PERMISSIVE mode for ≥24h before switch (Step 11). |
| Rollback scope | Steps 1–10 are individually reversible. Step 11 is reversible by re-enabling old policies. Step 12 (legacy column drop) is irreversible — manual approval gate. |
| Compatibility shim | Application code keeps reading `patients.id`-keyed rows during Steps 3–10; Step 11 cuts over after dual-write soak. |
| Pre-flight measurements | Each high-risk step lists concrete SQL queries to validate post-conditions. |
| Dedup detection | Step 2 uses `find_duplicate_patient_phones()` (mig 013:272-284) before destructive merges. |
| Service-window | Egypt clinics are quietest 02:00-04:00 Cairo time. Steps 3, 4, 11, 12 should land in that window. |

Mig number assignments (proposed):

| Step | Mig | Description |
|---|---|---|
| 1 | 071 | Phone normalization columns |
| 2 | 072 | Dedup detection + audits/dedup-resolution.md gate |
| 3 | 073 | Create global_patients + backfill |
| 4 | 074 | Create patient_clinic_records + backfill |
| 5 | 075 | Add global_patient_id to encounters/prescriptions/notes/etc. |
| 6 | 076 | Privacy codes infrastructure |
| 7 | 077 | patient_data_shares (empty) |
| 8 | 078 | privacy_code_attempts (empty) |
| 9 | 079 | dependent_account_links (empty) |
| 10 | 080 | anonymous_clinical_observations |
| 11 | 081 | RLS policy migration: PERMISSIVE → measure 24h → RESTRICTIVE |
| 12 | 082 | Drop legacy patient_id usage (irreversible) |

Each step also lists the BUILD prompt that implements it. The orphan
ledger is updated by every BUILD prompt.

---

## Step 1 — Phone normalization (mig 071)

### Pre-conditions
- mig 070 applied; `users.phone` and `patients.phone` exist.
- Audit Section B confirmed mixed E.164 / local form coexists.
- `packages/shared/lib/utils/phone-validation.ts` exports a deterministic
  E.164 normalizer (already used server-side; per ARCHITECTURE.md:442).

### Forward SQL

```sql
-- 1.1 Add normalized_phone columns, nullable initially.
ALTER TABLE public.patients
  ADD COLUMN normalized_phone TEXT;
ALTER TABLE public.users
  ADD COLUMN normalized_phone TEXT;

-- 1.2 Helper function: pure SQL E.164 normalizer for Egyptian phones.
CREATE OR REPLACE FUNCTION public.normalize_phone_e164(p_phone TEXT)
RETURNS TEXT AS $$
DECLARE
  v_digits TEXT;
BEGIN
  IF p_phone IS NULL THEN RETURN NULL; END IF;
  v_digits := regexp_replace(p_phone, '[^0-9]', '', 'g');
  -- 11-digit local form (01X XXXX XXXX) -> +20 1X XXXX XXXX
  IF v_digits ~ '^01[0-9]{9}$' THEN
    RETURN '+20' || substring(v_digits FROM 2);
  END IF;
  -- Already with country code as digits (201X XXXX XXXX) -> +201X XXXX XXXX
  IF v_digits ~ '^201[0-9]{9}$' THEN
    RETURN '+' || v_digits;
  END IF;
  -- Already E.164: validate length 8-15 and starting +
  IF p_phone ~ '^\+[1-9][0-9]{6,14}$' THEN
    RETURN p_phone;
  END IF;
  -- Unknown shape — leave NULL, caller resolves.
  RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 1.3 Backfill.
UPDATE public.patients
   SET normalized_phone = public.normalize_phone_e164(phone)
 WHERE normalized_phone IS NULL;

UPDATE public.users
   SET normalized_phone = public.normalize_phone_e164(phone)
 WHERE normalized_phone IS NULL;

-- 1.4 Quarantine: any row that didn't normalize is logged and listed.
-- These need manual review — DO NOT auto-fix.
CREATE TABLE IF NOT EXISTS public._phone_normalize_quarantine (
  table_name TEXT NOT NULL,
  row_id UUID NOT NULL,
  raw_phone TEXT NOT NULL,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (table_name, row_id)
);

INSERT INTO public._phone_normalize_quarantine (table_name, row_id, raw_phone)
SELECT 'patients', id, phone FROM public.patients
WHERE normalized_phone IS NULL AND phone IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public._phone_normalize_quarantine (table_name, row_id, raw_phone)
SELECT 'users', id, phone FROM public.users
WHERE normalized_phone IS NULL AND phone IS NOT NULL
ON CONFLICT DO NOTHING;

-- 1.5 Detect phones present in patients but not in users (orphaned
-- walk-ins: walk-in flow tried but users INSERT failed — unclear
-- failure mode). Today users.phone is UNIQUE (mig 001:13). When the
-- walk-in flow tries to create a users row for a phone already
-- present in users (e.g., the same phone visited a different clinic
-- before), the INSERT fails with 23505 — and the audit Section A:50-53
-- flagged that the failure handling is unclear. These rows need
-- human review before Step 3's claim/identity backfill runs.
CREATE TABLE IF NOT EXISTS public._phone_orphan_walkins (
  patient_id UUID NOT NULL,
  patient_clinic_id UUID,
  patient_phone TEXT NOT NULL,
  patient_created_at TIMESTAMPTZ NOT NULL,
  user_match_status TEXT NOT NULL CHECK (user_match_status IN (
    'no_user_row',           -- patient exists, no users row at all
    'user_id_mismatch',      -- users row exists but with different id
    'user_phone_mismatch'    -- users.phone differs from patients.phone
  )),
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (patient_id)
);

INSERT INTO public._phone_orphan_walkins (
  patient_id, patient_clinic_id, patient_phone,
  patient_created_at, user_match_status
)
SELECT
  p.id, p.clinic_id, p.phone, p.created_at,
  CASE
    WHEN u.id IS NULL THEN 'no_user_row'
    WHEN u.id <> p.id THEN 'user_id_mismatch'
    WHEN u.phone <> p.phone THEN 'user_phone_mismatch'
  END
FROM public.patients p
LEFT JOIN public.users u ON u.id = p.id
WHERE u.id IS NULL OR u.id <> p.id OR u.phone <> p.phone
ON CONFLICT (patient_id) DO NOTHING;
```

### Reverse SQL

```sql
DROP TABLE IF EXISTS public._phone_orphan_walkins;
DROP TABLE IF EXISTS public._phone_normalize_quarantine;
ALTER TABLE public.users    DROP COLUMN IF EXISTS normalized_phone;
ALTER TABLE public.patients DROP COLUMN IF EXISTS normalized_phone;
DROP FUNCTION IF EXISTS public.normalize_phone_e164(TEXT);
```

### Post-conditions (validation queries)

```sql
-- All non-null phones normalized:
SELECT COUNT(*) AS unnormalized_users
FROM public.users
WHERE phone IS NOT NULL AND normalized_phone IS NULL;
-- Expect: 0 (or every offender appears in _phone_normalize_quarantine)

SELECT COUNT(*) AS unnormalized_patients
FROM public.patients
WHERE phone IS NOT NULL AND normalized_phone IS NULL;
-- Expect: 0

-- Sanity: normalized form matches the regex.
SELECT COUNT(*) FROM public.patients
WHERE normalized_phone IS NOT NULL
  AND normalized_phone !~ '^\+[1-9][0-9]{6,14}$';
-- Expect: 0

-- Review orphan walk-ins before Step 3.
SELECT user_match_status, COUNT(*)
FROM public._phone_orphan_walkins
GROUP BY user_match_status;
-- Document counts in audits/dedup-resolution.md.
-- Each cluster needs a resolution decision before Step 3 backfill.
```

### Estimated wall-clock / downtime / risk
- Wall-clock: <30 seconds at current row counts.
- Downtime: 0 (additive column, no FK, no NOT NULL).
- Risk: **LOW.**

### What to test after applying
1. `normalize_phone_e164` round-trips for the 3 canonical formats.
2. Spot-check Naser's clinic's 23 patient rows have valid `normalized_phone`.
3. `_phone_normalize_quarantine` is empty (or every row is human-reviewed).
4. The offline-write hook (`useOfflineMutation`, mig 069) still writes
   patients without errors (read on `patients.phone`, not the new column).
5. `_phone_orphan_walkins` is reviewed and resolved (or empty) before
   Step 3 runs.
6. **Timing parity for `check_phone_uniform`** (the function shipped
   later in mig 076 — but the test methodology is fixed here):
   - 100 calls with existing phones, 100 calls with non-existing phones
   - Compute p50, p95, p99 latency for each set
   - Assert p95 difference < 5ms between sets (or whatever threshold
     Mo signs off on). Without this, an identical return SHAPE alone
     leaks "phone exists" via latency.

### Implemented by
**Prompt 2** (Phone Normalization Backfill).

### `check_phone_uniform` body sketch (forward reference — function ships in mig 076)

The function spec lives in schema spec § 16. The body is sketched
here so reviewers can audit the timing-pad approach in one place:

```sql
CREATE OR REPLACE FUNCTION public.check_phone_uniform(p_phone TEXT)
RETURNS JSONB AS $$
DECLARE
  v_start_time TIMESTAMPTZ := clock_timestamp();
  v_actual_ms NUMERIC;
  v_min_ms NUMERIC := 50.0;  -- TODO Mo: confirm threshold
  v_dummy_lookup BOOLEAN;
BEGIN
  -- Always do the lookup (intentionally — keeps timing similar between
  -- hits and misses regardless of caller's intent).
  v_dummy_lookup := EXISTS (
    SELECT 1 FROM public.global_patients
    WHERE normalized_phone = public.normalize_phone_e164(p_phone)
  );
  -- Compute wall-clock delta.
  v_actual_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_start_time)) * 1000;
  -- Pad to minimum.
  IF v_actual_ms < v_min_ms THEN
    PERFORM pg_sleep((v_min_ms - v_actual_ms) / 1000.0);
  END IF;
  -- Always return the same shape.
  RETURN jsonb_build_object('exists', false, 'requires_code', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
```

`STABLE` (not `VOLATILE`): the function returns a deterministic shape;
the lookup result and timing are side-effects we discard. The Postgres
planner can cache the call within a statement, which is fine because
the result is constant by design.

---

## Step 2 — Identify and resolve duplicate phones (mig 072)

### Pre-conditions
- Step 1 complete; every row has `normalized_phone` or is quarantined.

### Forward SQL (read-only detection + manual approval gate)

```sql
-- 2.1 Detection: report duplicate normalized_phones in patients.
CREATE OR REPLACE VIEW public._patient_phone_duplicates AS
SELECT
  normalized_phone,
  COUNT(*)             AS dup_count,
  array_agg(id ORDER BY created_at) AS patient_ids,
  array_agg(clinic_id ORDER BY created_at) AS clinic_ids,
  MIN(created_at)      AS earliest_created,
  MAX(created_at)      AS latest_created
FROM public.patients
WHERE normalized_phone IS NOT NULL
GROUP BY normalized_phone
HAVING COUNT(*) > 1;

-- 2.2 Detection: same in users.
CREATE OR REPLACE VIEW public._user_phone_duplicates AS
SELECT
  normalized_phone,
  COUNT(*) AS dup_count,
  array_agg(id ORDER BY created_at) AS user_ids
FROM public.users
WHERE normalized_phone IS NOT NULL
GROUP BY normalized_phone
HAVING COUNT(*) > 1;

-- 2.3 Resolution-plan persistence (read by Step 3 to decide which
-- patients.id collapses into which global_patient row).
CREATE TABLE IF NOT EXISTS public._patient_dedup_plan (
  normalized_phone TEXT PRIMARY KEY,
  winner_patient_id UUID NOT NULL,
  loser_patient_ids UUID[] NOT NULL,
  resolution TEXT NOT NULL CHECK (resolution IN ('auto_oldest_wins','manual_review')),
  decided_by UUID,
  decided_at TIMESTAMPTZ,
  notes TEXT
);
```

### Resolution rule (documented in `audits/dedup-resolution.md`, written
in **Prompt 2**)

- **Cluster size 2** → auto-resolve: oldest `patients.id` wins; the
  loser's `clinical_notes`, `appointments`, `prescriptions`,
  `payments`, `patient_phone_history`, `patient_visibility`,
  `doctor_patient_relationships`, `medication_intake_log` rows are
  re-pointed to the winner in Step 3 (atomic transaction).
- **Cluster size 3+** → manual review queue. Surfaced in
  `audits/dedup-resolution.md` with one section per cluster. Mo
  signs off before Step 3 runs against that cluster.
- **Cross-clinic clusters are EXPECTED.** A phone appearing once
  per clinic is the desired pattern (one global row, one
  clinic_record per clinic). The dedup plan must NOT collapse
  cross-clinic clusters into a single `patients.id` — instead it
  records the winner that becomes the seed for the global_patients
  row in Step 3, and the losers become input to the
  patient_clinic_records creation in Step 4.
- **Quarantined phones** (normalized_phone IS NULL) are skipped
  entirely until a human resolves them.

### Reverse SQL

```sql
DROP TABLE IF EXISTS public._patient_dedup_plan;
DROP VIEW IF EXISTS public._user_phone_duplicates;
DROP VIEW IF EXISTS public._patient_phone_duplicates;
```

### Post-conditions

```sql
-- Every duplicate cluster has a row in _patient_dedup_plan with a
-- non-null decided_by and decided_at.
SELECT COUNT(*) FROM public._patient_phone_duplicates d
LEFT JOIN public._patient_dedup_plan p
       ON p.normalized_phone = d.normalized_phone
WHERE p.decided_at IS NULL;
-- Expect: 0
```

### Estimated wall-clock / downtime / risk
- Wall-clock: views are instant; the manual-review gate dominates
  (hours to days).
- Downtime: 0.
- Risk: **MEDIUM.** Detection itself is read-only and risk-free, but
  resolution decisions feed Step 3, where mistakes propagate.

### What to test
1. The view returns the same set as `find_duplicate_patient_phones()`
   (mig 013:272-284) for sanity.
2. `_patient_dedup_plan` is fully populated (no NULL `decided_at`)
   before Step 3 runs.

### Implemented by
**Prompt 2** (Dedup Detection + Resolution).

---

## Step 3 — Create `global_patients`; INSERT one row per unique phone (mig 073)

### Pre-conditions
- Step 2 complete; `_patient_dedup_plan` fully resolved.

### Forward SQL

```sql
-- 3.1 Create the table per schema-spec section 2.
CREATE TABLE public.global_patients (
  -- ... full DDL from schema-spec.md §2 ...
);
-- (full DDL omitted here for brevity; ships byte-identical with §2)

-- 3.2 Backfill: one row per unique normalized_phone.
WITH ranked AS (
  SELECT
    p.normalized_phone,
    p.full_name,
    p.date_of_birth,
    p.sex,
    p.id AS legacy_patient_id,
    p.created_at,
    ROW_NUMBER() OVER (
      PARTITION BY p.normalized_phone
      ORDER BY p.registered DESC NULLS LAST, p.created_at ASC
    ) AS rn
  FROM public.patients p
  WHERE p.normalized_phone IS NOT NULL
)
INSERT INTO public.global_patients (
  id,
  normalized_phone,
  display_name,
  date_of_birth,
  sex,
  claimed,
  claimed_at,
  claimed_user_id,
  account_status,
  created_at,
  updated_at
)
SELECT
  r.legacy_patient_id,                             -- preserve UUID for FK ease
  r.normalized_phone,
  r.full_name,
  r.date_of_birth,
  r.sex,
  FALSE,                                           -- claimed: default FALSE on migration (see Claim Migration below)
  NULL,                                            -- claimed_at
  NULL,                                            -- claimed_user_id
  'active',
  r.created_at,
  NOW()
FROM ranked r
WHERE r.rn = 1;

-- 3.3 Audit-log every creation.
INSERT INTO public.audit_events (
  clinic_id, actor_user_id, action, entity_type, entity_id, metadata
)
SELECT
  NULL,                            -- system-level event
  NULL,
  'GLOBAL_PATIENT_CREATED',
  'global_patients',
  gp.id,
  jsonb_build_object('source','migration_073_backfill')
FROM public.global_patients gp;
```

### Reverse SQL

```sql
-- Reversible: drop table.
DELETE FROM public.audit_events
 WHERE action = 'GLOBAL_PATIENT_CREATED'
   AND metadata->>'source' = 'migration_073_backfill';
DROP TABLE public.global_patients CASCADE;   -- CASCADE drops view dependencies
```

### Post-conditions

```sql
-- Same number of global_patients as unique normalized_phones in patients.
SELECT
  (SELECT COUNT(DISTINCT normalized_phone) FROM public.patients WHERE normalized_phone IS NOT NULL) AS unique_phones,
  (SELECT COUNT(*) FROM public.global_patients) AS global_patients_count;
-- Expect: equal.

-- Every claimed_user_id resolves to an auth user.
SELECT COUNT(*) FROM public.global_patients gp
LEFT JOIN auth.users au ON au.id = gp.claimed_user_id
WHERE gp.claimed_user_id IS NOT NULL AND au.id IS NULL;
-- Expect: 0.
```

### Estimated wall-clock / downtime / risk
- Wall-clock: <1 minute at 35 patient rows; ~5 min at projected 10k.
- Downtime: 0 (additive table). Brief catalog lock during CREATE TABLE.
- Risk: **MEDIUM.** Backfill correctness is load-bearing; the
  ROW_NUMBER tie-breaker (registered desc, created_at asc) is a
  product decision that Mo should sign off on.

### What to test
1. Spot-check 3 known patients (one registered, one walk-in, one
   dependent) round-trip through the backfill.
2. UNIQUE constraint holds: an INSERT that duplicates
   `normalized_phone` raises 23505.
3. The `audit_events` row count for `GLOBAL_PATIENT_CREATED` equals
   `COUNT(*) FROM global_patients`.
4. Every backfilled `global_patients` row has `claimed = FALSE`,
   `claimed_at IS NULL`, `claimed_user_id IS NULL`.

### Claim Migration (rationale for `claimed = FALSE` default)

The audit (Section A:50-53) noted that `users` rows can be minted by
`createWalkInPatient` as part of the walk-in flow, NOT as a claim.
Inferring `claimed = TRUE` from "users row exists with same id as
patient row" therefore falsely marks walk-in-only patients as
"claimed." We are conservative: every `global_patients` row starts
unclaimed. Patients claim through the patient app's first-login flow:

1. Patient opens app, enters phone + OTP.
2. App finds matching `global_patients` row (by `normalized_phone`).
3. App calls `claim_or_create_global_patient` SECURITY DEFINER function.
4. Function verifies `auth.uid()` owns the OTP, sets:
     `claimed = TRUE`
     `claimed_at = NOW()`
     `claimed_user_id = auth.uid()`
5. Audit row written: `GLOBAL_PATIENT_CLAIMED`.

This means: on Day 0 post-migration, NO patient can access the
patient app's records view without re-claiming. This is intentional —
proving phone ownership via OTP is the only safe migration of "claim
status." The patient app's first-login flow MUST handle the "you
have records, please verify your phone to claim them" path; this is
tracked as an Orphan Ledger item closed by Prompt 10 (Patient App v1).

### Implemented by
**Prompt 3** (Global Patient Creation + Backfill).

---

## Step 4 — Create `patient_clinic_records`; INSERT one per (patient, clinic) (mig 074)

### Pre-conditions
- Step 3 complete; every `patients.id` row maps to a `global_patients`
  row by `normalized_phone`.

### Forward SQL

```sql
-- 4.1 Create per schema-spec §3.
CREATE TABLE public.patient_clinic_records ( ... );  -- full DDL from §3

-- 4.2 Backfill: one row per (global_patient_id, clinic_id).
INSERT INTO public.patient_clinic_records (
  global_patient_id, clinic_id, relationship_type, status,
  first_seen_at, last_seen_at,
  doctor_entered_first_name, doctor_entered_last_name,
  consent_to_messaging, consent_to_messaging_granted_at,
  created_by_user_id, created_via,
  created_at, updated_at
)
SELECT
  gp.id,
  p.clinic_id,
  CASE WHEN p.registered THEN 'registered'::patient_clinic_relationship
       ELSE 'walk_in'::patient_clinic_relationship END,
  CASE WHEN p.account_status = 'active' THEN 'active'::patient_clinic_status
       ELSE 'archived'::patient_clinic_status END,
  p.created_at,
  COALESCE(p.last_activity_at, p.created_at),
  p.first_name,
  p.last_name,
  -- Messaging consent: default FALSE; patient re-consents per clinic
  -- via the patient-app re-consent prompt during the 90-day grace
  -- window. See Step 4.5. Auto-converting legacy per-doctor consent
  -- into per-clinic consent here would expand consent scope (a
  -- patient who consented to Doctor A would suddenly also consent to
  -- Doctor B in the same clinic). That is a privacy regression we
  -- refuse to ship.
  FALSE,                  -- consent_to_messaging
  NULL,                   -- consent_to_messaging_granted_at
  p.created_by_doctor_id,
  'migration_backfill',
  p.created_at,
  NOW()
FROM public.patients p
JOIN public.global_patients gp ON gp.normalized_phone = p.normalized_phone
WHERE p.clinic_id IS NOT NULL
ON CONFLICT (global_patient_id, clinic_id) DO NOTHING;
```

### Reverse SQL

```sql
DROP TABLE public.patient_clinic_records CASCADE;
```

### Post-conditions

```sql
-- Every clinic_id-bearing patient row is represented.
SELECT
  (SELECT COUNT(*) FROM public.patients WHERE clinic_id IS NOT NULL) AS legacy_count,
  (SELECT COUNT(*) FROM public.patient_clinic_records) AS new_count;
-- Expect: new_count >= legacy_count (could be lower if dedup collapsed);
-- Equal iff every legacy row had a unique (phone, clinic).

-- No duplicate (global_patient_id, clinic_id):
SELECT COUNT(*) FROM (
  SELECT global_patient_id, clinic_id, COUNT(*) c
  FROM public.patient_clinic_records
  GROUP BY 1,2 HAVING COUNT(*) > 1
) x;
-- Expect: 0.
```

### Estimated wall-clock / downtime / risk
- Wall-clock: <30 seconds at current scale.
- Downtime: 0.
- Risk: **MEDIUM.** Misjudging `consent_to_messaging` corrupts
  per-clinic consent state; recoverable by re-running with corrected
  source query.

### What to test
1. Naser's clinic — 23 `patients` rows produce 23
   `patient_clinic_records` rows, all `relationship_type='walk_in'`
   except the 1 known registered patient.
2. Every backfilled row has `consent_to_messaging = FALSE` and
   `consent_to_messaging_granted_at IS NULL`. The grace-period view
   (Step 4.5) is the ONLY path that returns "effectively consented"
   today.

### Implemented by
**Prompt 4** (Patient Clinic Records Backfill).

---

## Step 4.5 — Messaging consent grace-period view (bundled with mig 074)

### Pre-conditions
- Step 4 complete; `patient_clinic_records` rows backfilled with
  `consent_to_messaging = FALSE`.
- Legacy `patient_consent_grants` table still in place (see
  "deliberately does NOT do" — we don't rewrite it during this plan).

### Why this step exists

Step 4's backfill collapses per-doctor `patient_consent_grants` into
per-clinic `patient_clinic_records.consent_to_messaging`. If we
auto-converted (Doctor A has consent, Doctor B doesn't → "Clinic has
consent" → Doctor B suddenly gets messaging access), we would expand
consent. That is a privacy regression. Instead we default everyone
to FALSE and bridge the legacy state via a 90-day grace-period view
that legacy and current messaging code paths both query. The patient
re-consents per-clinic via the patient-app first-login flow; once
they answer, the new column wins.

### Forward SQL

```sql
-- 4.5.1 Grace-period view: union the legacy per-doctor consent table
-- with the new per-clinic consent column. Used by messaging code paths
-- for 90 days post-cutover.

CREATE OR REPLACE VIEW public.effective_messaging_consent AS
SELECT
  pcr.global_patient_id,
  pcr.clinic_id,
  -- New consent (post-re-consent) takes priority
  CASE
    WHEN pcr.consent_to_messaging = TRUE THEN TRUE
    -- Fallback to legacy per-doctor consent during grace window
    WHEN EXISTS (
      SELECT 1 FROM public.patient_consent_grants pcg
      JOIN public.patients p ON p.id = pcg.patient_id
      JOIN public.global_patients gp ON gp.normalized_phone = p.normalized_phone
      WHERE gp.id = pcr.global_patient_id
        AND p.clinic_id = pcr.clinic_id
        AND pcg.consent_type = 'messaging'
        AND pcg.revoked_at IS NULL
        AND pcg.granted_at > NOW() - INTERVAL '90 days'  -- grace window
    ) THEN TRUE
    ELSE FALSE
  END AS effective_consent
FROM public.patient_clinic_records pcr;

COMMENT ON VIEW public.effective_messaging_consent IS
  'Grace-period bridge between legacy per-doctor consent and new per-clinic consent. Active for 90 days post mig 074. Drop in cleanup mig.';
```

### Reverse SQL

```sql
DROP VIEW IF EXISTS public.effective_messaging_consent;
```

### Post-conditions

```sql
-- View exists and returns one row per (global_patient_id, clinic_id):
SELECT COUNT(*)
FROM public.effective_messaging_consent ec
GROUP BY ec.global_patient_id, ec.clinic_id
HAVING COUNT(*) > 1;
-- Expect: 0.

-- Any patient_clinic_records row with explicit consent_to_messaging
-- = TRUE produces effective_consent = TRUE in the view.
SELECT COUNT(*) FROM public.patient_clinic_records pcr
JOIN public.effective_messaging_consent ec
  ON ec.global_patient_id = pcr.global_patient_id
 AND ec.clinic_id = pcr.clinic_id
WHERE pcr.consent_to_messaging = TRUE
  AND ec.effective_consent <> TRUE;
-- Expect: 0.
```

### Estimated wall-clock / downtime / risk
- Wall-clock: <5 seconds (view creation only).
- Downtime: 0.
- Risk: **MEDIUM.** Messaging code paths must switch to the view,
  not read `patient_clinic_records.consent_to_messaging` directly,
  for the 90-day grace window. Tracked as an Orphan Ledger item
  closed by the messaging code refactor.

### Cleanup (later than Step 12)

After 90 days post-cutover, drop `effective_messaging_consent` view
and remove fallback logic from messaging code paths. Beyond 90 days,
unreconfirmed legacy consent is treated as silent revocation. The
re-consent prompt in the patient-app first-login flow drives
explicit conversion during the window.

### Re-consent flow (orphan-ledger item)

Triggered on first login post-mig 074. Patient sees one prompt per
clinic with active legacy consent: "Clinic X used to message you.
Want to keep that?" Each answer writes
`patient_clinic_records.consent_to_messaging` and an audit-log row
`MESSAGING_CONSENT_RECONFIRMED`. Tracked in `audits/orphan-ledger.md`
under the re-consent UI item, closed by Prompt 10 (Patient App v1).

### Implemented by
**Prompt 4** (bundled with `patient_clinic_records` backfill — same
mig 074).

---

## Step 5 — Add `global_patient_id` columns to clinical tables (mig 075)

Affected tables: `clinical_notes`, `prescriptions`, `prescription_items`,
`appointments`, `lab_orders` (currently empty/dormant), `lab_results`,
`imaging_orders`, `vital_signs`, `medication_intake_log`,
`patient_consent_grants`, `patient_phone_history`,
`doctor_patient_relationships`, `patient_visibility`, `audit_events`.

(`encounters` is created fresh in Step 5 with `global_patient_id` from
day one; no backfill there.)

### Pre-conditions
- Step 4 complete.

### Forward SQL (representative; one ALTER per affected table)

```sql
-- 5.1 ALTER each table to add nullable global_patient_id.
ALTER TABLE public.clinical_notes
  ADD COLUMN global_patient_id UUID
  REFERENCES public.global_patients(id) ON DELETE RESTRICT;
-- ... repeat for every clinical table ...

-- 5.2 Backfill: derive global_patient_id from legacy patient_id ->
-- patients.normalized_phone -> global_patients.id.
UPDATE public.clinical_notes cn
   SET global_patient_id = gp.id
  FROM public.patients p
  JOIN public.global_patients gp ON gp.normalized_phone = p.normalized_phone
 WHERE cn.patient_id = p.id
   AND cn.global_patient_id IS NULL;
-- ... repeat for every clinical table ...

-- 5.3 Create `encounters` per schema-spec §12 (no backfill — empty start).
CREATE TABLE public.encounters ( ... );

-- 5.4 Indexes.
CREATE INDEX clinical_notes_global_patient_idx
  ON public.clinical_notes (global_patient_id, created_at DESC);
-- ... repeat ...
```

### Reverse SQL

```sql
ALTER TABLE public.clinical_notes DROP COLUMN IF EXISTS global_patient_id;
-- ... repeat ...
DROP TABLE IF EXISTS public.encounters;
```

### Post-conditions

```sql
-- Every existing clinical row has global_patient_id populated.
SELECT COUNT(*) FROM public.clinical_notes WHERE global_patient_id IS NULL;
-- Expect: 0.
-- Repeat for prescriptions, appointments, payments, etc.

-- Each global_patient_id resolves.
SELECT COUNT(*) FROM public.clinical_notes cn
LEFT JOIN public.global_patients gp ON gp.id = cn.global_patient_id
WHERE cn.global_patient_id IS NOT NULL AND gp.id IS NULL;
-- Expect: 0.
```

### Estimated wall-clock / downtime / risk
- Wall-clock: ~2-3 minutes for ~14 ALTERs + UPDATEs at current scale.
  At 10k clinical_notes rows, count on ~5 minutes.
- Downtime: 0 (ADD COLUMN is non-blocking on Postgres 11+ for nullable
  no-default columns).
- Risk: **MEDIUM.** Adding nullable columns is safe; the load-bearing
  step is the UPDATE backfill, which must complete before NOT NULL is
  enforced (deferred to Step 12).

### What to test
1. Read paths in `packages/shared/lib/data/patients.ts:867-915`
   (`searchMyPatients`) still return rows — code reads via `patient_id`
   today; the new column is silently populated.
2. The orphan ledger gets `ORPH-005-DATA_LAYER` (READ via
   global_patient_id not yet wired), `ORPH-005-API` (no
   global-keyed endpoint yet), etc.
3. Spot-check: pick 5 patient_id rows from `clinical_notes`, verify
   their `global_patient_id` matches via the phone join.

### Implemented by
**Prompt 5** (Clinical-table global_patient_id Backfill + encounters
table).

---

## Step 6 — Privacy code generation (mig 076)

### Pre-conditions
- Step 3 complete (`global_patients` exists and is populated).
- pgcrypto extension installed:
  ```sql
  SELECT extname FROM pg_extension WHERE extname = 'pgcrypto';
  -- Expect: 1 row.
  ```
  If not installed, mig 076 starts with
  `CREATE EXTENSION IF NOT EXISTS pgcrypto;` as its first statement.
  pgcrypto provides both `gen_random_bytes()` (cryptographically
  secure RNG, used by `regenerate_privacy_code`) and the bcrypt
  helpers used to hash the plaintext.
- Schema spec § 16.1 transactional invariants apply:
  `regenerate_privacy_code` writes `patient_privacy_codes` (UPDATE
  old + INSERT new) and `audit_events` atomically; `verify_privacy_code`
  writes `privacy_code_attempts` and (conditionally)
  `patient_privacy_codes` atomically. Function bodies must satisfy
  these invariants — no autonomous transactions, no dblink.

### Forward SQL

```sql
-- 6.1 Create patient_privacy_codes per schema-spec §5.
CREATE TABLE public.patient_privacy_codes ( ... );

-- 6.2 Generation function (returns plaintext ONCE).
CREATE OR REPLACE FUNCTION public.regenerate_privacy_code(
  p_global_patient_id UUID
) RETURNS TEXT AS $$
DECLARE
  v_alphabet TEXT := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; -- exclude 0,1,I,O
  v_plaintext TEXT := '';
  v_i INTEGER;
  v_hash TEXT;
  v_caller_is_patient BOOLEAN;
  v_random_bytes BYTEA;
  v_byte_idx INTEGER;
BEGIN
  -- Authorize: caller must be the claimed patient (or service role).
  SELECT (claimed_user_id = auth.uid())
    INTO v_caller_is_patient
    FROM public.global_patients
   WHERE id = p_global_patient_id;
  IF NOT COALESCE(v_caller_is_patient, FALSE) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  -- 6 chars from the alphabet, sourced from a CSPRNG.
  --
  -- We MUST NOT use random() here — it is a deterministic PRNG and
  -- is predictable given a few outputs. Unacceptable for a secret
  -- that gates medical records. gen_random_bytes() (pgcrypto) is
  -- backed by /dev/urandom (or platform equivalent).
  --
  -- Modulo-bias note: `byte % length(v_alphabet)` is unbiased only
  -- when 256 mod alphabet_size = 0. With a 32-char alphabet, 256/32
  -- = 8 exactly, so there is zero bias. If the alphabet size ever
  -- changes to a non-divisor of 256, switch to rejection sampling.
  v_random_bytes := gen_random_bytes(6);  -- 6 bytes for 6 chars
  FOR v_i IN 1..6 LOOP
    v_byte_idx := get_byte(v_random_bytes, v_i - 1);
    v_plaintext := v_plaintext ||
      substr(v_alphabet, 1 + (v_byte_idx % length(v_alphabet)), 1);
  END LOOP;
  v_hash := public.bcrypt_hash(v_plaintext, 12);   -- pgcrypto wrapper

  -- Revoke existing active code.
  UPDATE public.patient_privacy_codes
     SET revoked_at = NOW(), revoked_reason = 'regenerated'
   WHERE global_patient_id = p_global_patient_id
     AND revoked_at IS NULL;

  -- Insert new active code.
  INSERT INTO public.patient_privacy_codes (
    global_patient_id, code_hash, regenerated_count
  )
  VALUES (
    p_global_patient_id, v_hash,
    COALESCE((SELECT MAX(regenerated_count) + 1
                FROM public.patient_privacy_codes
               WHERE global_patient_id = p_global_patient_id), 0)
  );

  -- Audit.
  INSERT INTO public.audit_events (
    clinic_id, actor_user_id, action, entity_type, entity_id, metadata
  ) VALUES (
    NULL, auth.uid(), 'PRIVACY_CODE_REGENERATED',
    'global_patients', p_global_patient_id,
    jsonb_build_object('regenerated_count',
      (SELECT regenerated_count FROM public.patient_privacy_codes
        WHERE global_patient_id = p_global_patient_id AND revoked_at IS NULL))
  );

  RETURN v_plaintext;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER VOLATILE;

-- 6.3 Verify function (with per-clinic rate limit + per-code lockout).
--
-- Body specification — implemented inline in mig 076. Two distinct
-- lockout mechanisms run in this order:
--
--   Step 0: per-clinic rate limit (NEW — Change 2 from prompt-1-v2-delta).
--     COUNT attempts in privacy_code_attempts WHERE
--       global_patient_id = p_global_patient_id
--       AND attempted_by_clinic_id = p_attempted_by_clinic_id
--       AND created_at > NOW() - INTERVAL '1 hour'
--       AND result IN ('failure','locked_out','rate_limited')
--     IF count >= 5:
--       INSERT into privacy_code_attempts with result='rate_limited'
--       RETURN FALSE
--     -- This clinic cannot retry against THIS patient for the next
--     -- hour. They CAN attempt against OTHER patients (those have
--     -- their own per-(patient, clinic) windows). NO SMS to patient
--     -- (per-clinic rate limit alone is too noisy to alert on).
--
--   Step 1: per-code lockout check. Reads patient_privacy_codes.
--     If locked_until > NOW(): record 'locked_out', RETURN FALSE.
--
--   Step 2: hash compare against active patient_privacy_codes.code_hash.
--     On match: record 'success', clear attempts_count, RETURN TRUE.
--     On miss : record 'failure', increment attempts_count.
--               If attempts_count >= 5: set locked_until = NOW + 24h,
--               record 'locked_out', fire SMS to patient (only this
--               24h per-code lockout triggers SMS), RETURN FALSE.
--
-- See schema spec § 5 for the two-mechanism table and § 16 for the
-- full function inventory.
CREATE OR REPLACE FUNCTION public.verify_privacy_code( ... )
RETURNS BOOLEAN AS $$ ... $$;

-- 6.4 Backfill: do NOT auto-generate codes. Codes are minted lazily
-- when the patient first opens the patient app or first asks a clinic
-- staffer to share. This avoids leaking 35 plaintext codes via the
-- migration log.
```

### Reverse SQL

```sql
DROP FUNCTION IF EXISTS public.regenerate_privacy_code(UUID);
DROP FUNCTION IF EXISTS public.verify_privacy_code(UUID, TEXT, UUID, UUID, INET, TEXT);
DROP TABLE public.patient_privacy_codes;
```

### Post-conditions

```sql
-- Table exists, RLS enabled, all 4 deny policies present.
SELECT polname FROM pg_policy
 WHERE polrelid = 'public.patient_privacy_codes'::regclass
 ORDER BY polname;
-- Expect: 4 deny rows (no select / no insert / no update / no delete).
```

### Estimated wall-clock / downtime / risk
- Wall-clock: <30 seconds (table creation only; no backfill).
- Downtime: 0.
- Risk: **MEDIUM-HIGH.** The hash algorithm and lockout policy are
  load-bearing for the rest of the system. Mo's open questions
  (schema-spec §17 items 1-3) must be resolved before applying.

### What to test
1. `regenerate_privacy_code()` succeeds for the patient's own
   global_patient_id, fails (`unauthorized`) for any other.
2. The plaintext returned matches the alphabet rules (6 chars, no
   ambiguous symbols `0/1/I/O`).
3. Re-calling `regenerate_privacy_code()` revokes the previous active
   row and increments `regenerated_count`.
4. Direct SELECT against `patient_privacy_codes` returns 0 rows for
   any authenticated client (RLS deny).
5. Distribution sanity: generate 10,000 codes; assert each character
   position's frequency for each alphabet symbol is within ±5% of
   uniform (`10000 / 32 ≈ 312.5`). Catches any accidental regression
   to a biased generator.
6. Per-clinic rate limit: simulate 5 failures from clinic A against
   patient P in 1 hour. Assert the 6th attempt from clinic A returns
   FALSE with `result='rate_limited'` recorded in
   `privacy_code_attempts`. Assert clinic B can still attempt against
   patient P (independent window).
7. Per-code 24h lockout: simulate 5 failures across multiple clinics
   against patient P. Assert the per-code state locks for 24h and
   an SMS notification fires (per-clinic rate limit does NOT trigger
   SMS).
8. Atomicity: force `audit_events` INSERT to RAISE (deny-list
   trigger). Assert `regenerate_privacy_code` rolls back — no new
   `patient_privacy_codes` row, old row not revoked.

### Implemented by
**Prompt 6** (Privacy Code Infrastructure).

---

## Step 7 — `patient_data_shares` (empty) (mig 077)

### Pre-conditions
- Step 3 + Step 6 complete (FK targets exist).
- Schema spec § 16.1 transactional invariants apply.
  `grant_patient_data_share`, `revoke_patient_data_share`, and
  `extend_patient_data_share` each write
  `patient_data_shares` and `audit_events` atomically. The
  `audit_events` row must be INSERTED first so its ID can be set on
  `patient_data_shares.audit_event_id`.

### Forward SQL

```sql
CREATE TABLE public.patient_data_shares ( ... );  -- per schema-spec §4

-- Helper: directional consent predicate.
CREATE OR REPLACE FUNCTION public.can_view_patient_data_at_clinic( ... )
RETURNS BOOLEAN AS $$ ... $$;   -- per schema-spec §4

-- Trigger to enforce "UPDATE only writes revoked_*".
CREATE OR REPLACE FUNCTION public.tg_patient_data_shares_update_guard()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.global_patient_id <> OLD.global_patient_id
     OR NEW.grantor_clinic_id <> OLD.grantor_clinic_id
     OR NEW.grantee_clinic_id <> OLD.grantee_clinic_id
     OR NEW.granted_at <> OLD.granted_at
     OR NEW.granted_by_user_id IS DISTINCT FROM OLD.granted_by_user_id
     OR NEW.granted_via <> OLD.granted_via
  THEN
    RAISE EXCEPTION 'patient_data_shares: only revoked_* fields are mutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER patient_data_shares_update_guard
BEFORE UPDATE ON public.patient_data_shares
FOR EACH ROW EXECUTE FUNCTION public.tg_patient_data_shares_update_guard();

-- Forward-compatible shims (Step 10 will reference these in clinical RLS).
CREATE OR REPLACE FUNCTION public.is_pharmacy_member(UUID, UUID)
RETURNS BOOLEAN AS $$ SELECT FALSE; $$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION public.is_lab_member(UUID, UUID)
RETURNS BOOLEAN AS $$ SELECT FALSE; $$ LANGUAGE sql IMMUTABLE;

-- Auto-renew on visit: when a new encounter inserts for
-- (global_patient_id, clinic_id), if there is an active
-- patient_data_shares row TO that clinic, extend its expires_at to
-- MAX(current_expires_at, NOW + 90 days) and write SHARE_AUTO_RENEWED
-- audit. Without this trigger + audit action, auto-renewals would be
-- silent — the patient app cannot show "Clinic X first got access
-- Apr 1; auto-renewed Jun 15 because you visited."
--
-- Note: the trigger lives on `encounters` because that is the table
-- that fires on visits. The SHARE_AUTO_RENEWED audit action is added
-- to the TS-only AuditAction enum (schema spec § 1) and to the
-- privacy_audit_events view (schema spec § 13).
CREATE OR REPLACE FUNCTION public.tg_encounter_auto_renew_share()
RETURNS TRIGGER AS $$
DECLARE
  v_share RECORD;
  v_new_expires TIMESTAMPTZ;
BEGIN
  FOR v_share IN
    SELECT id, expires_at
      FROM public.patient_data_shares
     WHERE global_patient_id = NEW.global_patient_id
       AND grantee_clinic_id = NEW.clinic_id
       AND revoked_at IS NULL
  LOOP
    v_new_expires := GREATEST(
      COALESCE(v_share.expires_at, NOW()),
      NOW() + INTERVAL '90 days'
    );
    IF v_share.expires_at IS DISTINCT FROM v_new_expires THEN
      UPDATE public.patient_data_shares
         SET expires_at = v_new_expires,
             updated_at = NOW()
       WHERE id = v_share.id;

      INSERT INTO public.audit_events (
        clinic_id, actor_user_id, action, entity_type, entity_id, metadata
      ) VALUES (
        NEW.clinic_id, NEW.doctor_id, 'SHARE_AUTO_RENEWED',
        'patient_data_shares', v_share.id,
        jsonb_build_object(
          'previous_expires_at', v_share.expires_at,
          'new_expires_at', v_new_expires,
          'triggering_encounter_id', NEW.id
        )
      );
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- The trigger ships with the encounters table. If encounters is
-- created in Step 5 before this trigger function exists, attach the
-- trigger here in Step 7 (mig 077) — Postgres allows attaching a
-- trigger to an existing table at any time.
CREATE TRIGGER encounters_auto_renew_share
AFTER INSERT ON public.encounters
FOR EACH ROW EXECUTE FUNCTION public.tg_encounter_auto_renew_share();
```

### Reverse SQL

```sql
DROP TRIGGER IF EXISTS encounters_auto_renew_share ON public.encounters;
DROP FUNCTION IF EXISTS public.tg_encounter_auto_renew_share();
DROP FUNCTION IF EXISTS public.is_lab_member(UUID, UUID);
DROP FUNCTION IF EXISTS public.is_pharmacy_member(UUID, UUID);
DROP TRIGGER IF EXISTS patient_data_shares_update_guard ON public.patient_data_shares;
DROP FUNCTION IF EXISTS public.tg_patient_data_shares_update_guard();
DROP FUNCTION IF EXISTS public.can_view_patient_data_at_clinic(UUID, UUID, UUID);
DROP TABLE public.patient_data_shares;
```

### Post-conditions

```sql
SELECT relrowsecurity FROM pg_class
 WHERE oid = 'public.patient_data_shares'::regclass;
-- Expect: TRUE.

-- Self-test:
--   Pick any clinic. is_clinic_member(c, auth.uid()) for that clinic's
--   OWNER returns TRUE. can_view_patient_data_at_clinic(any_gpid, c, owner_uid)
--   returns TRUE for OWNER (auto-share with self) regardless of any
--   patient_data_shares row.
```

### Estimated wall-clock / downtime / risk
- Wall-clock: <10 seconds.
- Downtime: 0.
- Risk: **LOW.** Empty table; predicate is read-only.

### What to test
1. INSERT into `patient_data_shares` from any client fails (deny policy).
2. The SECURITY DEFINER `grant_patient_data_share()` function (added in
   Step 11 alongside RLS switch) is the only path that succeeds.
3. **Auto-renew trigger.** Insert an encounter for
   `(global_patient, clinic)` where an active share exists with
   `expires_at = NOW() + 30 days`. Assert `expires_at` is bumped to
   `NOW() + 90 days` and a `SHARE_AUTO_RENEWED` row appears in
   `audit_events`. If `expires_at` was already > NOW() + 90 days (a
   long manual grant), assert it is NOT shortened.
4. **Auto-renew is no-op when no active share exists.** Insert an
   encounter for `(global_patient, clinic_with_no_share)`. Assert
   no `audit_events` row written, no error raised.
5. **Atomicity.** Force `audit_events` INSERT to fail. Assert
   `grant_patient_data_share` rolls back — no orphan share row.

### Implemented by
**Prompt 7** (Data-Share Table + Predicate + Auto-Renew Trigger).

---

## Step 8 — `privacy_code_attempts` (empty) (mig 078)

### Pre-conditions
- Step 6 (privacy_codes table) + Step 7 done.
- Schema spec § 16.1 transactional invariants apply.
  `record_privacy_code_attempt` runs as a single INSERT inside the
  caller's transaction; it must NOT use autonomous transactions.

### Forward SQL

```sql
CREATE TABLE public.privacy_code_attempts ( ... );  -- per schema-spec §6

CREATE OR REPLACE FUNCTION public.record_privacy_code_attempt(
  p_global_patient_id UUID,
  p_privacy_code_id UUID,
  p_user_id UUID,
  p_clinic_id UUID,
  p_result privacy_code_attempt_result,
  p_ip INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
) RETURNS VOID AS $$
  INSERT INTO public.privacy_code_attempts (
    global_patient_id, privacy_code_id, attempted_by_user_id,
    attempted_by_clinic_id, result, ip_address, user_agent
  ) VALUES (
    p_global_patient_id, p_privacy_code_id, p_user_id,
    p_clinic_id, p_result, p_ip, p_user_agent
  );
$$ LANGUAGE sql SECURITY DEFINER VOLATILE;
```

### Reverse SQL

```sql
DROP FUNCTION IF EXISTS public.record_privacy_code_attempt(...);
DROP TABLE public.privacy_code_attempts;
```

### Post-conditions, risk, test
Same shape as Step 7. **LOW** risk; empty table.

### Implemented by
**Prompt 7** (bundled with data-shares — same prompt).

---

## Step 9 — `dependent_account_links` (empty) (mig 079)

### Pre-conditions
- Step 3 complete (global_patients exists for both ends of the link).
- Schema spec § 16.1 transactional invariants apply. The caregiver-
  link CRUD helpers (created alongside the table) must write
  `dependent_account_links` and `audit_events` atomically.

### Forward SQL

```sql
CREATE TABLE public.dependent_account_links ( ... );  -- per schema-spec §8

-- Optional: backfill from legacy patients.guardian_id.
INSERT INTO public.dependent_account_links (
  caregiver_global_patient_id, dependent_global_patient_id,
  relationship, granted_at, granted_via, created_at
)
SELECT
  cg.id,                    -- caregiver global_patients row
  dep.id,                   -- dependent global_patients row
  'parent'::caregiver_relationship,
  p_dep.created_at,
  'walk_in_form',
  p_dep.created_at
FROM public.patients p_dep
JOIN public.patients p_cg ON p_cg.id = p_dep.guardian_id
JOIN public.global_patients dep ON dep.normalized_phone = p_dep.normalized_phone
JOIN public.global_patients cg  ON cg.normalized_phone  = p_cg.normalized_phone
WHERE p_dep.guardian_id IS NOT NULL
ON CONFLICT (caregiver_global_patient_id, dependent_global_patient_id)
  WHERE revoked_at IS NULL DO NOTHING;
```

### Reverse SQL

```sql
DROP TABLE public.dependent_account_links;
```

### Post-conditions

```sql
-- Every legacy guardian_id link has a corresponding active
-- dependent_account_links row.
SELECT COUNT(*) FROM public.patients p
LEFT JOIN public.dependent_account_links dal
       ON dal.dependent_global_patient_id =
          (SELECT id FROM public.global_patients WHERE normalized_phone = p.normalized_phone)
WHERE p.guardian_id IS NOT NULL
  AND dal.id IS NULL;
-- Expect: 0.
```

### Estimated wall-clock / downtime / risk
- Wall-clock: <5 seconds.
- Downtime: 0.
- Risk: **LOW.**

### What to test
- Caregiver's `dependent_account_links_select` policy returns the
  expected dependent row when simulating the caregiver's auth.uid().

### Implemented by
**Prompt 8** (Dependent Account Links).

---

## Step 10 — `anonymous_clinical_observations` (mig 080)

### Pre-conditions
- Step 5 complete (`encounters`/`prescriptions`/`lab_orders`
  carry `global_patient_id`).

### Forward SQL

```sql
CREATE TABLE public.anonymous_clinical_observations ( ... );  -- §9

-- ETL function — invoked by a scheduled job (pg_cron or external),
-- never directly by clients. Selects only patients with
-- consent_to_anonymous_research = TRUE.
CREATE OR REPLACE FUNCTION public.refresh_anonymous_observations(
  p_since TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '7 days')
) RETURNS INTEGER AS $$ ... $$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Reverse SQL

```sql
DROP FUNCTION IF EXISTS public.refresh_anonymous_observations(TIMESTAMPTZ);
DROP TABLE public.anonymous_clinical_observations;
```

### Post-conditions

```sql
-- No row carries identifying information.
-- (Schema enforces this — these queries should always be empty.)
SELECT * FROM public.anonymous_clinical_observations LIMIT 0;
-- (no global_patient_id column → query returns 0 cols error if attempted)
```

### Estimated wall-clock / downtime / risk
- Wall-clock: <30 seconds for table; ETL run is configurable.
- Downtime: 0.
- Risk: **LOW** at schema level; **MEDIUM** at policy level if the ETL
  bypasses consent. Prompt 9 ships with explicit consent-check
  unit tests.

### What to test
1. ETL run against test data: every contributing patient has
   `global_patients.consent_to_anonymous_research = TRUE`.
2. No row in the output carries `global_patient_id`, exact birthdate,
   exact phone, or full address.

### Implemented by
**Prompt 9** (Anonymous Observations).

---

## Step 11 — RLS policy migration (HIGHEST RISK) (mig 081)

This is the cut-over. New policies coexist with old in PERMISSIVE
mode for ≥24 hours. Then a follow-up migration drops the old
policies and switches the new ones to enforced mode.

### Pre-conditions
- Steps 1-10 complete and stable in production for ≥24 hours.
- All clinical-table backfills (Step 5) are 100% complete (no NULL
  `global_patient_id` rows).
- Application code (`packages/shared/lib/data/`) has been updated to
  prefer reads via `global_patient_id`. This is a code-side
  prerequisite tracked in the orphan ledger (DATA_LAYER and API
  orphans created in Steps 5-10).

### Forward SQL — phase A (24-hour soak in PERMISSIVE mode)

```sql
-- Add the new policy ALONGSIDE the existing one. Postgres ORs
-- multiple PERMISSIVE policies — caller passes if EITHER policy
-- allows. We can therefore safely add the new policy without
-- breaking existing access.

CREATE POLICY encounters_select_v2_permissive
  ON public.encounters
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    public.can_view_patient_data_at_clinic(global_patient_id, clinic_id, auth.uid())
  );

CREATE POLICY prescriptions_select_v2_permissive
  ON public.prescriptions
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    public.can_view_patient_data_at_clinic(global_patient_id, prescribing_clinic_id, auth.uid())
    OR (fulfilled_by_pharmacy_id IS NOT NULL
        AND public.is_pharmacy_member(fulfilled_by_pharmacy_id, auth.uid()))
  );

-- ... repeat for lab_orders, clinical_notes, etc.
```

### Soak period (24h)

- **Metric collection.** Add a temporary trigger that logs every read
  matched only by the v2 policy (i.e. would have failed under v1) to
  a `_rls_v2_diff_log` table. Inspect after 24h.
- **Alert.** Pager fires if v2-only-pass count > 0 unexpectedly.
- **Decision gate.** If diff count is 0 (or matches expected
  patient-self-view + patient_data_shares grants), proceed. If
  unexpected, halt and root-cause.

### Forward SQL — phase B (cut-over)

```sql
-- Drop legacy policies one table at a time.
DROP POLICY IF EXISTS "Doctors view own prescriptions" ON public.prescription_items;
-- ... and so on; full list in Prompt 10's migration body.

-- Rename v2 PERMISSIVE -> the canonical policy name.
ALTER POLICY prescriptions_select_v2_permissive
  ON public.prescriptions
  RENAME TO prescriptions_select;
```

### Reverse SQL

```sql
-- Phase B reversal:
ALTER POLICY prescriptions_select
  ON public.prescriptions
  RENAME TO prescriptions_select_v2_permissive;

-- Re-create dropped legacy policies (reuse the original CREATE POLICY
-- bodies preserved in mig 067/068).

-- Phase A reversal:
DROP POLICY IF EXISTS encounters_select_v2_permissive ON public.encounters;
DROP POLICY IF EXISTS prescriptions_select_v2_permissive ON public.prescriptions;
-- ... and so on.
```

### Post-conditions (per phase)

Phase A:
```sql
-- Both policies exist on every affected table.
SELECT relname, polname FROM pg_policy p
JOIN pg_class c ON c.oid = p.polrelid
WHERE c.relname IN ('encounters','prescriptions','lab_orders','clinical_notes')
ORDER BY relname, polname;
-- Expect: legacy + _v2_permissive present.
```

Phase B:
```sql
-- Only v2 policies remain; legacy policies dropped.
-- Expect: no policy name containing 'doctor_patient_relationships'
-- in the WHERE clause; no '"Doctors view own prescriptions"' policy.
```

### Estimated wall-clock / downtime / risk
- Phase A wall-clock: <1 minute (CREATE POLICY only).
- Phase A downtime: 0 (additive).
- Phase B wall-clock: ~2-3 minutes.
- Phase B downtime: 0 (DROP POLICY is metadata-only; brief shared
  lock per pg_class entry).
- Risk: **HIGH.** Even in PERMISSIVE coexistence, a misconfigured
  predicate can leak data. The 24h soak with diff-logging is
  load-bearing.

### What to test
1. Cross-clinic read attempts WITHOUT a `patient_data_shares` row
   return 0 rows (the canonical leak test).
2. Cross-clinic read attempts WITH an active `patient_data_shares`
   row return the expected rows.
3. Patient self-view via `claimed_user_id = auth.uid()` returns ALL
   their rows across every clinic they've visited.
4. Caregiver view via `dependent_account_links` returns the
   dependent's rows.
5. Auto-share with self: a clinic OWNER reading their own clinic's
   data returns the same row counts as before.
6. Pharmacy/lab branches return 0 rows today (shim returns FALSE);
   they will activate when partner tables ship.

### Implemented by
**Prompt 10** (RLS Cut-Over). This prompt creates the diff-log
infrastructure, runs the soak, and ships Phase B as a separate
migration once the soak passes.

---

## Step 12 — Drop legacy `patient_id` usage (mig 082) — IRREVERSIBLE

### Pre-conditions
- Step 11 Phase B applied and stable for ≥7 days.
- Application code refactor complete: zero remaining reads or
  writes via the legacy `patients.id`-based path. This is the
  "no orphan" gate enforced by the final E2E test (Prompt 11).
- Mo's manual approval gate (this step is irreversible).

### Forward SQL

```sql
-- 12.1 Enforce NOT NULL on global_patient_id everywhere we backfilled.
ALTER TABLE public.clinical_notes
  ALTER COLUMN global_patient_id SET NOT NULL;
-- ... repeat ...

-- 12.2 Drop the legacy patient_id columns where they're no longer needed.
-- Keep them on patients itself (it IS the legacy table) but drop on
-- joined tables.
ALTER TABLE public.clinical_notes DROP COLUMN patient_id;
ALTER TABLE public.prescriptions DROP COLUMN patient_id;
-- ... repeat ...

-- 12.3 Retire the patients table.
-- Option A (recommended): rename and freeze it.
ALTER TABLE public.patients RENAME TO _legacy_patients_pre_080;
-- Option B (irreversible): DROP TABLE. Reject this option unless
-- backups are confirmed and Mo signs off explicitly.

-- 12.4 Retire dead tables identified in audit Section A.
DROP TABLE IF EXISTS public.anonymous_visits;
DROP TABLE IF EXISTS public.opt_out_statistics;
DROP TABLE IF EXISTS public.patient_recovery_codes;
DROP TABLE IF EXISTS public.audit_log;     -- TD-013

-- 12.5 Retire the legacy can_access_patient (mig 054) once nothing
-- references it.
DROP FUNCTION IF EXISTS public.can_access_patient(UUID, UUID, UUID, TEXT);

-- 12.6 Drop the legacy_phone column on global_patients.
ALTER TABLE public.global_patients DROP COLUMN IF EXISTS legacy_phone;
```

### Reverse SQL

```sql
-- IRREVERSIBLE for sub-steps 12.2, 12.4, 12.6.
--
-- 12.1 (NOT NULL) is reversible: ALTER COLUMN ... DROP NOT NULL.
-- 12.3 (rename) is reversible: ALTER TABLE _legacy_patients_pre_080
--      RENAME TO patients.
-- 12.5 (function drop) is reversible by re-creating from mig 054.
--
-- Sub-steps 12.2/12.4/12.6 require a restore from backup.
```

### Post-conditions

```sql
-- No NULL global_patient_id anywhere.
SELECT (SELECT COUNT(*) FROM public.clinical_notes WHERE global_patient_id IS NULL)
     + (SELECT COUNT(*) FROM public.prescriptions WHERE global_patient_id IS NULL)
     -- ... repeat for every table ...
     AS total_nulls;
-- Expect: 0.

-- patients table is renamed.
SELECT relname FROM pg_class WHERE relname IN ('patients','_legacy_patients_pre_080');
-- Expect: only _legacy_patients_pre_080.

-- No code reference to 'public.patients' in pg_views, pg_proc, etc.
SELECT proname FROM pg_proc WHERE prosrc ILIKE '%public.patients%';
-- Expect: 0.
```

### Estimated wall-clock / downtime / risk
- Wall-clock: ~5-10 minutes (each ALTER takes seconds; cumulative).
- Downtime: 0 if application code is fully cut over. Brief catalog
  lock during DROP COLUMN.
- Risk: **HIGH (irreversible).** Manual approval required.

### What to test
1. Full E2E suite passes (prompt 11's exit criterion).
2. The orphan ledger has zero open items.
3. Spot-check production: every API route used in the last 7 days
   still returns expected payloads.

### Implemented by
**Prompt 11** (Final cut-over and orphan-ledger drain).

---

## Forward-compatibility check (per migration plan)

| Future feature | Already supported by | Migration needed |
|---|---|---|
| Pharmacy fulfillment | `prescriptions.fulfillment_*` (Step 5) + `is_pharmacy_member()` shim (Step 7) | Add `pharmacies` + `pharmacy_memberships` tables; replace shim body. |
| Lab fulfillment | `lab_orders.status` + results columns (Step 5) + `is_lab_member()` shim (Step 7) | Add `labs` + `lab_memberships` tables; replace shim body. |
| Cross-clinic referrals | `encounters.referral_to_clinic_id` (Step 5) + `patient_data_shares` (Step 7) | None. The referring clinic creates a `patient_data_shares` grant via existing `grant_patient_data_share()`. |
| Patient-initiated clinic switching | `patient_data_shares` soft-revoke + new `patient_clinic_records` | None. Patient app calls existing functions; product UX wraps the flow. |

**Conclusion: no future feature on the prompt's list requires schema
or RLS changes beyond introducing partner-tenant tables.**

---

## Cutover checklist

Before running Step 11 Phase B, every item must be GREEN:

- [ ] All legacy patient-side reads in `packages/shared/lib/data/` re-pointed to global_patient_id.
- [ ] `searchMyPatients`, `checkPhoneExists`, `verifyPatientCode`, `onboardPatient`, `createWalkInPatient` rewritten or shimmed.
- [ ] `useOfflineMutation` hook updated to enqueue against the new endpoints.
- [ ] All API handlers updated; OpenAPI types regenerated.
- [ ] Vitest suites green: privacy-code rate-limit + lockout, check-phone parity, search-timing, RLS deny tests.
- [ ] 24h PERMISSIVE-mode soak completed with `_rls_v2_diff_log` containing only expected entries.
- [ ] Mo's manual approval recorded in `audits/cutover-approval.md`.

---

## Rollback ladder

If any step fails, the safe rollback is:
1. Steps 1, 5, 6, 7, 8, 9, 10 — execute the documented Reverse SQL.
2. Step 2 — drop the views and plan table; no data side-effects.
3. Step 3 — DROP TABLE `global_patients` (but only if Step 4 hasn't fanned out FKs yet).
4. Step 4 — DROP TABLE `patient_clinic_records` (cascades through later FKs if also rolled back).
5. Step 11 Phase A — DROP the v2 PERMISSIVE policies; legacy policies remain enforcing.
6. Step 11 Phase B — recreate the dropped legacy policies from mig 067/068; rename v2 back.
7. Step 12 — restore from backup (irreversible by design; do not enter Step 12 without confirmed backup).

The whole plan is reversible up to the start of Step 12.

---

## What this plan deliberately does NOT do

- It does **not** mint privacy codes for the existing 35 patients in
  the migration itself. Codes are minted lazily on first access — see
  Step 6 and the open question on lockout/length defaults
  (schema-spec §17).
- It does **not** auto-create cross-clinic shares for any existing
  patient. Each share is patient-initiated. The migration creates
  the table and the predicate; the data fills in via product flows.
- It does **not** mass-anonymize existing clinical data into
  `anonymous_clinical_observations`. The ETL runs only against
  patients whose `consent_to_anonymous_research = TRUE`, which is
  zero today (default FALSE).
- It does **not** auto-set `consent_to_anonymous_research = TRUE` for
  any existing patient. Default FALSE for all (CONFIRMED 2026-04-28
  per Egypt Personal Data Protection Law 151/2020 Art. 12). Opt-in
  flow lives in the patient app's onboarding (closed by Prompt 10 /
  Prompt 8 settings).
- It does **not** drop `users.phone` UNIQUE. The constraint stays for
  the duration of the migration and beyond. `global_patients.
  normalized_phone` becomes the new source of truth, but
  `users.phone` uniqueness is preserved as a defense-in-depth
  invariant. Future cleanup migration may sync `users.phone` to
  `global_patients.normalized_phone` via trigger (out of scope here).
- It does **not** rewrite `patient_consent_grants` (the messaging
  consent table). Its data is consumed in Step 4's backfill of
  `patient_clinic_records.consent_to_messaging`; the legacy table
  itself is left in place for historical query and dropped in a
  later cleanup migration outside the scope of this plan.

---

## Done-when

- All 12 steps applied or explicitly skipped with documented rationale.
- Orphan ledger has zero open items (Prompt 11's exit gate).
- E2E test suite green against the new schema.
- `audits/cutover-approval.md` signed.

The next prompts (1 through 11) are scoped against this plan: Prompt 2
implements Steps 1+2, Prompt 3 implements Step 3, and so on through
Prompt 11's final cut-over and orphan-ledger drain.
