# Patient Identity Schema Specification — Network Model (v2)

> Target schema for the network-first patient identity rewrite. Reflects the
> findings of `audits/patient-identity-state-audit.md` (HEAD `778467a`,
> 2026-04-26). PLAN ONLY — every CREATE/ALTER below is illustrative DDL,
> not yet applied. Migration sequencing lives in
> `audits/patient-identity-migration-plan.md`.
>
> Audience: senior database / RLS reviewer. Every column is justified.
> Every RLS policy is verbatim-compilable Supabase Postgres.
>
> **v2 reflects reviewer pushbacks 2026-04-28.** Two launch-blockers
> (cryptographic randomness for privacy codes, per-clinic rate limit on
> verify_privacy_code) are addressed; three serious issues (uniform
> timing for `check_phone_uniform`, claim-status migration, messaging
> consent re-consent flow) are tightened; three gaps (audit-action
> coverage for auto-renewed shares, transactional invariants for
> SECURITY DEFINER functions, `users.phone` collision detection) are
> filled; two locked decisions (privacy code length, anonymous-research
> consent default) are confirmed and recorded as resolved. See
> `audits/patient-identity-spec-v2-changelog.md` for the full delta.

---

## 0. Design principles (load-bearing)

1. **Phone is global identity.** One `global_patients` row per real human,
   keyed by an E.164 `normalized_phone` UNIQUE. No clinic owns a patient.
2. **Per-clinic relationship is a separate fact.** `patient_clinic_records`
   captures `(global_patient_id, clinic_id)` — first/last seen at this
   clinic, local MRN, walk-in vs registered, doctor-entered fallback name.
3. **Directional cross-clinic consent.** `patient_data_shares` is a
   directed grant: clinic A → clinic B can see clinic B's data on
   patient P. Soft-revoke (`revoked_at`) so audit history survives.
4. **Auto-share with self.** A clinic can always see its OWN data on a
   patient — encoded in RLS as `viewer_clinic_id = data_clinic_id`, no
   row required.
5. **Privacy code is a live secret.** Bcrypt-hashed, rate-limited,
   regeneratable, lockout-aware, separate audit table for every attempt.
6. **Search-privacy parity.** Phone existence checks return identical
   shape across all three states; truth only after code redemption.
7. **Caregiver linkage is audited separately.** `dependent_account_links`
   is its own ledger with its own audit actions.
8. **Anonymous AI training is one-way.** `anonymous_clinical_observations`
   carries NO `global_patient_id` — re-identification resistant by
   design.
9. **Forward-compatible fulfillment.** `prescriptions`,
   `lab_orders` carry fulfillment status fields so future pharmacy /
   lab partners can write back without further migrations.

---

## 1. Enums and helper types

```sql
-- ----------------------------------------------------------------------------
-- New enums (additive — coexists with existing 053 enums).
-- ----------------------------------------------------------------------------

CREATE TYPE patient_account_status AS ENUM (
  'active',     -- normal
  'suspended',  -- abuse / fraud hold
  'locked',     -- post-attempt lockout (transient)
  'deceased',   -- terminal, immutable
  'merged'      -- merged into another global_patient (see merged_into)
);

CREATE TYPE patient_clinic_relationship AS ENUM (
  'walk_in',     -- doctor-entered, not yet claimed
  'registered',  -- patient self-claimed
  'referral'     -- arrived via cross-clinic referral
);

CREATE TYPE patient_clinic_status AS ENUM (
  'active',      -- currently sees this clinic
  'dormant',     -- inactive >12mo
  'archived'     -- soft-archived by clinic
);

CREATE TYPE share_grant_method AS ENUM (
  'privacy_code',  -- patient gave code at the new clinic
  'sms_consent',   -- 5-min ephemeral SMS code
  'patient_app',   -- self-service from patient app
  'referral'       -- doctor-initiated cross-clinic referral
);

CREATE TYPE privacy_code_attempt_result AS ENUM (
  'success',
  'failure',       -- wrong code, attempt counted
  'locked_out',    -- attempted while in lockout window
  'code_revoked',  -- attempted against a regenerated/revoked code
  'rate_limited'   -- IP/user-level rate limit (separate from per-code lockout)
);

CREATE TYPE caregiver_relationship AS ENUM (
  'parent',
  'legal_guardian',
  'spouse',
  'adult_child_of_elder',
  'sibling',
  'other'
);

CREATE TYPE encounter_type AS ENUM (
  'walk_in',
  'scheduled',
  'telemedicine',
  'referral',
  'followup'
);

CREATE TYPE encounter_status AS ENUM (
  'open',
  'closed',
  'cancelled',
  'superseded'
);

CREATE TYPE prescription_fulfillment_status AS ENUM (
  'pending',              -- written, no pharmacy contact yet
  'sent_to_pharmacy',     -- electronically routed
  'partially_dispensed',  -- pharmacy gave some
  'dispensed',            -- fully dispensed
  'cancelled',            -- withdrawn by prescriber or patient
  'expired'               -- duration elapsed without dispense
);

CREATE TYPE lab_order_status AS ENUM (
  'ordered',
  'collected',
  'in_progress',
  'results_ready',
  'results_delivered',
  'cancelled'
);
```

Plus `AuditAction` (TS-only enum at `packages/shared/lib/data/audit.ts`)
gains: `PRIVACY_CODE_REGENERATED`, `PRIVACY_CODE_ATTEMPT_SUCCESS`,
`PRIVACY_CODE_ATTEMPT_FAILURE`, `PRIVACY_CODE_LOCKED`, `SHARE_GRANTED`,
`SHARE_EXTENDED`, `SHARE_REVOKED_SOFT`, `SHARE_AUTO_RENEWED`,
`DEPENDENT_LINK_CREATED`, `DEPENDENT_LINK_REVOKED`,
`GLOBAL_PATIENT_CREATED`, `GLOBAL_PATIENT_MERGED`,
`GLOBAL_PATIENT_DECEASED`, `SMS_CONSENT_SENT`,
`MESSAGING_CONSENT_RECONFIRMED`, `PHONE_LOOKUP_PARITY` (logged only on
the rare "registered patient exists" branch so we can detect timing
leaks in production).

`SHARE_AUTO_RENEWED` fires when a new `encounters` row inserts for
`(global_patient_id, clinic_id)` and there is an active
`patient_data_shares` row to that clinic: a trigger extends the
share's `expires_at` to `MAX(current_expires_at, NOW + 90 days)` and
writes the audit event. The trigger lives on `encounters` and is
shipped by Prompt 7 (data shares) — see migration plan Step 7. Without
this audit action, auto-renewals are silent, and the patient app
cannot show "Clinic X first got access Apr 1; auto-renewed Jun 15
because you visited."

`MESSAGING_CONSENT_RECONFIRMED` is written when a patient answers the
re-consent prompt in the patient app's first-login flow (one prompt
per clinic with active legacy `patient_consent_grants` messaging
consent). See § 3 and migration plan Step 4.5 for the grace-period
view that bridges legacy and new consent during the 90-day window.

---

## 2. `global_patients` — global identity row

One row per real human. Source of truth for identity.

```sql
CREATE TABLE public.global_patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity (load-bearing UNIQUE)
  normalized_phone TEXT NOT NULL,
  legacy_phone TEXT,             -- pre-E.164 form during the cut-over

  -- Public-facing demographics (may be reset on regeneration)
  display_name TEXT,             -- canonical full name
  date_of_birth DATE,
  sex TEXT CHECK (sex IN ('male','female','other','prefer_not_to_say')),
  preferred_language TEXT NOT NULL DEFAULT 'ar',

  -- Auth claim
  claimed BOOLEAN NOT NULL DEFAULT FALSE,
  claimed_at TIMESTAMPTZ,
  claimed_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Lifecycle
  account_status patient_account_status NOT NULL DEFAULT 'active',
  merged_into UUID REFERENCES public.global_patients(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  deceased_at TIMESTAMPTZ,

  -- Anonymous research opt-in (powers anonymous_clinical_observations)
  consent_to_anonymous_research BOOLEAN NOT NULL DEFAULT FALSE,
  consent_to_anonymous_research_at TIMESTAMPTZ,

  -- Bookkeeping
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Invariants
  CONSTRAINT global_patients_phone_e164_chk
    CHECK (normalized_phone ~ '^\+[1-9][0-9]{6,14}$'),
  CONSTRAINT global_patients_claim_consistency_chk
    CHECK (
      (claimed = FALSE AND claimed_user_id IS NULL AND claimed_at IS NULL)
      OR (claimed = TRUE AND claimed_user_id IS NOT NULL AND claimed_at IS NOT NULL)
    ),
  CONSTRAINT global_patients_merge_consistency_chk
    CHECK (
      (account_status = 'merged' AND merged_into IS NOT NULL)
      OR (account_status <> 'merged' AND merged_into IS NULL)
    ),
  CONSTRAINT global_patients_deceased_consistency_chk
    CHECK (
      (account_status = 'deceased' AND deceased_at IS NOT NULL)
      OR (account_status <> 'deceased')
    )
);

-- Load-bearing UNIQUE: one global row per phone.
CREATE UNIQUE INDEX global_patients_normalized_phone_uniq
  ON public.global_patients (normalized_phone);

-- One auth user maps to at most one global patient.
CREATE UNIQUE INDEX global_patients_claimed_user_id_uniq
  ON public.global_patients (claimed_user_id)
  WHERE claimed_user_id IS NOT NULL;

-- Common access path: the patient themselves opening the app.
CREATE INDEX global_patients_claimed_user_id_idx
  ON public.global_patients (claimed_user_id)
  WHERE account_status = 'active';

COMMENT ON TABLE public.global_patients IS
  'Source of truth for patient identity. One row per real human, keyed by E.164 normalized_phone. Replaces the per-clinic patients.id model post mig 084.';
COMMENT ON COLUMN public.global_patients.normalized_phone IS
  'E.164 phone, validated by regex. The only globally unique identity key.';
COMMENT ON COLUMN public.global_patients.legacy_phone IS
  'Original non-normalized form preserved during cut-over. Drop column after mig 077 has stabilized for 30 days.';
COMMENT ON COLUMN public.global_patients.merged_into IS
  'When a duplicate is collapsed, the loser row points to the winner. RESTRICT on delete so audit chain survives.';
COMMENT ON COLUMN public.global_patients.consent_to_anonymous_research IS
  'Patient-level opt-in for anonymous_clinical_observations. Default FALSE — explicit consent required.';
```

### RLS policies

```sql
ALTER TABLE public.global_patients ENABLE ROW LEVEL SECURITY;

-- SELECT: patient self-view, plus clinic members reading their own
-- patients via the patient_clinic_records bridge. Note: there is NO
-- "every clinic can see every global_patient" policy — directional.
CREATE POLICY global_patients_self_select ON public.global_patients
FOR SELECT TO authenticated
USING (
  -- (a) Patient viewing own row
  claimed_user_id = auth.uid()
  -- (b) Clinic member viewing a patient who has a clinic_record at their clinic
  OR EXISTS (
    SELECT 1
    FROM public.patient_clinic_records pcr
    WHERE pcr.global_patient_id = global_patients.id
      AND public.is_clinic_member(pcr.clinic_id, auth.uid())
  )
  -- (c) Caregiver viewing a dependent's row
  OR EXISTS (
    SELECT 1
    FROM public.dependent_account_links dal
    JOIN public.global_patients caregiver
      ON caregiver.id = dal.caregiver_global_patient_id
    WHERE dal.dependent_global_patient_id = global_patients.id
      AND caregiver.claimed_user_id = auth.uid()
      AND dal.revoked_at IS NULL
  )
);

-- INSERT: only via SECURITY DEFINER function `claim_or_create_global_patient`.
-- Direct INSERT is forbidden — the function handles dedup against
-- normalized_phone, audits the create, and returns the row.
CREATE POLICY global_patients_no_direct_insert ON public.global_patients
FOR INSERT TO authenticated
WITH CHECK (FALSE);

-- UPDATE: patient updating their own demographics; clinic OWNER
-- updating doctor-entered fallback fields ONLY (not normalized_phone).
CREATE POLICY global_patients_self_update ON public.global_patients
FOR UPDATE TO authenticated
USING (claimed_user_id = auth.uid())
WITH CHECK (
  claimed_user_id = auth.uid()
  -- Patient cannot change their own normalized_phone via this path —
  -- phone changes go through phone_change_requests (mig 070 flow).
  AND normalized_phone = (
    SELECT normalized_phone FROM public.global_patients WHERE id = global_patients.id
  )
);

-- DELETE: forbidden. Use account_status = 'deceased' or 'merged'.
CREATE POLICY global_patients_no_delete ON public.global_patients
FOR DELETE TO authenticated
USING (FALSE);
```

---

## 3. `patient_clinic_records` — per-clinic relationship row

Replaces `doctor_patient_relationships` for the new model. The
`(global_patient_id, clinic_id)` UNIQUE is the load-bearing dedup
guarantee.

```sql
CREATE TABLE public.patient_clinic_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  global_patient_id UUID NOT NULL
    REFERENCES public.global_patients(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  clinic_id UUID NOT NULL
    REFERENCES public.clinics(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,

  -- Relationship metadata
  relationship_type patient_clinic_relationship NOT NULL DEFAULT 'walk_in',
  status patient_clinic_status NOT NULL DEFAULT 'active',
  local_mrn TEXT,                              -- clinic's own MRN
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Doctor-entered fallback (only when patient hasn't claimed yet)
  doctor_entered_first_name TEXT,
  doctor_entered_last_name TEXT,

  -- Messaging consent is per-clinic, not global
  consent_to_messaging BOOLEAN NOT NULL DEFAULT FALSE,
  consent_to_messaging_granted_at TIMESTAMPTZ,
  consent_to_messaging_revoked_at TIMESTAMPTZ,

  -- Provenance
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_via TEXT NOT NULL DEFAULT 'walk_in_form'
    CHECK (created_via IN (
      'walk_in_form','self_register','referral','privacy_code_share','migration_backfill'
    )),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT patient_clinic_records_pcr_uniq UNIQUE (global_patient_id, clinic_id),
  CONSTRAINT patient_clinic_records_messaging_consistency_chk
    CHECK (
      (consent_to_messaging = TRUE AND consent_to_messaging_granted_at IS NOT NULL)
      OR consent_to_messaging = FALSE
    )
);

CREATE INDEX patient_clinic_records_clinic_idx
  ON public.patient_clinic_records (clinic_id, status, last_seen_at DESC);
CREATE INDEX patient_clinic_records_patient_idx
  ON public.patient_clinic_records (global_patient_id);
CREATE INDEX patient_clinic_records_local_mrn_idx
  ON public.patient_clinic_records (clinic_id, local_mrn)
  WHERE local_mrn IS NOT NULL;

COMMENT ON TABLE public.patient_clinic_records IS
  'Per-clinic relationship row. UNIQUE(global_patient_id, clinic_id). Replaces doctor_patient_relationships for clinic-level scoping; per-doctor scoping moves to patient_visibility/visibility_v2.';
COMMENT ON COLUMN public.patient_clinic_records.consent_to_messaging IS
  'Per-clinic messaging consent (SMS, WhatsApp). Distinct from data-share consent.';
COMMENT ON COLUMN public.patient_clinic_records.local_mrn IS
  'Optional clinic-internal medical record number, for paper-system reconciliation.';
```

### RLS policies

```sql
ALTER TABLE public.patient_clinic_records ENABLE ROW LEVEL SECURITY;

-- SELECT: clinic members of THIS row's clinic; the patient themselves;
-- and the caregiver of the patient.
CREATE POLICY patient_clinic_records_select ON public.patient_clinic_records
FOR SELECT TO authenticated
USING (
  -- (a) Clinic member of the clinic this record belongs to
  public.is_clinic_member(clinic_id, auth.uid())
  -- (b) Patient self-view
  OR EXISTS (
    SELECT 1 FROM public.global_patients gp
    WHERE gp.id = patient_clinic_records.global_patient_id
      AND gp.claimed_user_id = auth.uid()
  )
  -- (c) Caregiver
  OR EXISTS (
    SELECT 1
    FROM public.dependent_account_links dal
    JOIN public.global_patients caregiver
      ON caregiver.id = dal.caregiver_global_patient_id
    WHERE dal.dependent_global_patient_id = patient_clinic_records.global_patient_id
      AND caregiver.claimed_user_id = auth.uid()
      AND dal.revoked_at IS NULL
  )
);

-- INSERT: clinic members of the target clinic only (creating a record
-- in someone else's clinic is forbidden).
CREATE POLICY patient_clinic_records_insert ON public.patient_clinic_records
FOR INSERT TO authenticated
WITH CHECK (
  public.is_clinic_member(clinic_id, auth.uid())
);

-- UPDATE: clinic OWNER/DOCTOR/FRONT_DESK of THIS row's clinic.
CREATE POLICY patient_clinic_records_update ON public.patient_clinic_records
FOR UPDATE TO authenticated
USING (
  public.is_clinic_member(clinic_id, auth.uid())
)
WITH CHECK (
  public.is_clinic_member(clinic_id, auth.uid())
);

-- DELETE: forbidden. Use status='archived'.
CREATE POLICY patient_clinic_records_no_delete ON public.patient_clinic_records
FOR DELETE TO authenticated
USING (FALSE);
```

---

## 4. `patient_data_shares` — directional cross-clinic consent

The new sharing primitive. **Directional**: a row says clinic A
authorizes clinic B to read clinic A's data on patient P.
**Soft-revoke** so audit history survives.

```sql
CREATE TABLE public.patient_data_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  global_patient_id UUID NOT NULL
    REFERENCES public.global_patients(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,

  -- Directional: grantor's data becomes visible TO grantee.
  grantor_clinic_id UUID NOT NULL
    REFERENCES public.clinics(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  grantee_clinic_id UUID NOT NULL
    REFERENCES public.clinics(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,

  -- Provenance
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  granted_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_via share_grant_method NOT NULL,

  -- Lifecycle
  expires_at TIMESTAMPTZ,                          -- NULL = permanent
  revoked_at TIMESTAMPTZ,                          -- soft revoke
  revoked_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  revocation_reason TEXT,

  -- Auditability — link to the audit_events row that recorded this grant.
  audit_event_id UUID REFERENCES public.audit_events(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT patient_data_shares_distinct_clinics_chk
    CHECK (grantor_clinic_id <> grantee_clinic_id),
  CONSTRAINT patient_data_shares_revoke_consistency_chk
    CHECK (
      (revoked_at IS NULL AND revoked_by_user_id IS NULL)
      OR (revoked_at IS NOT NULL)
    ),
  CONSTRAINT patient_data_shares_expiry_chk
    CHECK (expires_at IS NULL OR expires_at > granted_at)
);

-- Only one ACTIVE grant per (patient, grantor, grantee). Re-granting
-- creates a new row.
CREATE UNIQUE INDEX patient_data_shares_active_uniq
  ON public.patient_data_shares (global_patient_id, grantor_clinic_id, grantee_clinic_id)
  WHERE revoked_at IS NULL;

CREATE INDEX patient_data_shares_grantee_idx
  ON public.patient_data_shares (grantee_clinic_id, global_patient_id)
  WHERE revoked_at IS NULL;
CREATE INDEX patient_data_shares_grantor_idx
  ON public.patient_data_shares (grantor_clinic_id, global_patient_id)
  WHERE revoked_at IS NULL;
CREATE INDEX patient_data_shares_expiry_idx
  ON public.patient_data_shares (expires_at)
  WHERE expires_at IS NOT NULL AND revoked_at IS NULL;

COMMENT ON TABLE public.patient_data_shares IS
  'Directional cross-clinic data-visibility grant. Soft-revoke via revoked_at. Auto-share with self is implicit (no row needed when grantor = grantee).';
COMMENT ON COLUMN public.patient_data_shares.granted_via IS
  'How the grant was obtained — privacy_code, sms_consent, patient_app, referral. Used for forensic and UX explanations.';
```

### RLS policies

```sql
ALTER TABLE public.patient_data_shares ENABLE ROW LEVEL SECURITY;

-- SELECT: visible to (a) members of grantor clinic (their own grant
-- log), (b) members of grantee clinic (so they see what they have
-- access to), and (c) the patient themselves (sharing UI).
CREATE POLICY patient_data_shares_select ON public.patient_data_shares
FOR SELECT TO authenticated
USING (
  public.is_clinic_member(grantor_clinic_id, auth.uid())
  OR public.is_clinic_member(grantee_clinic_id, auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.global_patients gp
    WHERE gp.id = patient_data_shares.global_patient_id
      AND gp.claimed_user_id = auth.uid()
  )
);

-- INSERT: only via SECURITY DEFINER `grant_patient_data_share()` which
-- enforces (a) caller is a member of grantor_clinic, (b) caller has
-- a verified privacy_code OR an SMS consent token OR is the patient,
-- and (c) writes the audit_events row in the same transaction.
CREATE POLICY patient_data_shares_no_direct_insert ON public.patient_data_shares
FOR INSERT TO authenticated
WITH CHECK (FALSE);

-- UPDATE: only revocation (revoked_at, revoked_by_user_id,
-- revocation_reason). Enforced by trigger that rejects any other
-- column change.
CREATE POLICY patient_data_shares_revoke_update ON public.patient_data_shares
FOR UPDATE TO authenticated
USING (
  public.is_clinic_member(grantor_clinic_id, auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.global_patients gp
    WHERE gp.id = patient_data_shares.global_patient_id
      AND gp.claimed_user_id = auth.uid()
  )
)
WITH CHECK (revoked_at IS NOT NULL);

-- DELETE: forbidden — soft revoke only.
CREATE POLICY patient_data_shares_no_delete ON public.patient_data_shares
FOR DELETE TO authenticated
USING (FALSE);
```

The directional consent rule, encoded once in a helper function used by
every clinical-data RLS policy:

```sql
CREATE OR REPLACE FUNCTION public.can_view_patient_data_at_clinic(
  p_global_patient_id UUID,
  p_data_clinic_id UUID,                -- the clinic that owns the data row
  p_viewer_user_id UUID DEFAULT auth.uid()
) RETURNS BOOLEAN AS $$
  SELECT
    -- (a) Patient self
    EXISTS (
      SELECT 1 FROM public.global_patients gp
      WHERE gp.id = p_global_patient_id
        AND gp.claimed_user_id = p_viewer_user_id
    )
    -- (b) Caregiver of the patient
    OR EXISTS (
      SELECT 1
      FROM public.dependent_account_links dal
      JOIN public.global_patients cg
        ON cg.id = dal.caregiver_global_patient_id
      WHERE dal.dependent_global_patient_id = p_global_patient_id
        AND cg.claimed_user_id = p_viewer_user_id
        AND dal.revoked_at IS NULL
    )
    -- (c) Auto-share with self: viewer is a member of the data clinic
    OR public.is_clinic_member(p_data_clinic_id, p_viewer_user_id)
    -- (d) Directional consent: an active patient_data_shares row from
    --     p_data_clinic_id (grantor) to a clinic the viewer belongs to.
    OR EXISTS (
      SELECT 1
      FROM public.patient_data_shares pds
      JOIN public.clinic_memberships cm
        ON cm.clinic_id = pds.grantee_clinic_id
       AND cm.user_id = p_viewer_user_id
       AND cm.status = 'ACTIVE'
      WHERE pds.global_patient_id = p_global_patient_id
        AND pds.grantor_clinic_id = p_data_clinic_id
        AND pds.revoked_at IS NULL
        AND (pds.expires_at IS NULL OR pds.expires_at > NOW())
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION public.can_view_patient_data_at_clinic IS
  'Central directional-consent predicate. Used by RLS on encounters, prescriptions, lab_orders, clinical_notes. Replaces can_access_patient for cross-clinic reads.';
```

---

## 5. `patient_privacy_codes` — rate-limited, regeneratable codes

**Decision: separate table, not a column on `global_patients`.**

Justification:
- Regeneration is append-only-then-revoke (we keep the old `code_hash`
  for forensic comparison after rotation; `revoked_at IS NOT NULL`).
- Per-code lockout state (`locked_until`, `attempts_count`) has a
  different lifecycle than identity columns and would dirty
  `global_patients` rows on every attempt.
- A partial UNIQUE index (`WHERE revoked_at IS NULL`) gives us "exactly
  one active code per patient" without complicating `global_patients`
  invariants.
- Future: per-clinic-scoped codes (so a patient could issue
  clinic-specific tokens) is a column-add on this table, not a
  re-architecting of `global_patients`.

```sql
CREATE TABLE public.patient_privacy_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  global_patient_id UUID NOT NULL
    REFERENCES public.global_patients(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,

  -- Storage: bcrypt by default; algorithm column for forward compat.
  code_hash TEXT NOT NULL,                 -- never the plaintext code
  algorithm TEXT NOT NULL DEFAULT 'bcrypt',

  -- Rate-limiting & lockout state (per-code)
  attempts_count INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  locked_until TIMESTAMPTZ,

  -- Lifecycle
  regenerated_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,                  -- replaced by a new row
  revoked_reason TEXT
    CHECK (revoked_reason IS NULL OR revoked_reason IN (
      'regenerated','admin_reset','phone_change','merged','deceased'
    )),

  CONSTRAINT patient_privacy_codes_attempts_nonneg_chk
    CHECK (attempts_count >= 0),
  CONSTRAINT patient_privacy_codes_regen_nonneg_chk
    CHECK (regenerated_count >= 0),
  CONSTRAINT patient_privacy_codes_revoke_consistency_chk
    CHECK (
      (revoked_at IS NULL AND revoked_reason IS NULL)
      OR (revoked_at IS NOT NULL AND revoked_reason IS NOT NULL)
    )
);

-- Exactly one active code per patient.
CREATE UNIQUE INDEX patient_privacy_codes_active_uniq
  ON public.patient_privacy_codes (global_patient_id)
  WHERE revoked_at IS NULL;

CREATE INDEX patient_privacy_codes_locked_until_idx
  ON public.patient_privacy_codes (locked_until)
  WHERE locked_until IS NOT NULL AND revoked_at IS NULL;

COMMENT ON TABLE public.patient_privacy_codes IS
  'Hashed, rate-limited privacy codes used to prove patient identity to a new clinic. One ACTIVE row per patient; regeneration appends a new row and marks the old revoked.';
COMMENT ON COLUMN public.patient_privacy_codes.code_hash IS
  'Bcrypt-hashed 6-character privacy code from base32 alphabet (excl. 0,1,I,O). Generated via gen_random_bytes (cryptographically secure).';
```

### RLS policies

```sql
ALTER TABLE public.patient_privacy_codes ENABLE ROW LEVEL SECURITY;

-- Hard rule: NO direct SELECT of code_hash from any client. All access
-- goes through SECURITY DEFINER functions:
--   verify_privacy_code(global_patient_id, plaintext_code) -> boolean
--   regenerate_privacy_code(global_patient_id) -> plaintext (returned ONCE)
-- Even the patient cannot SELECT their own code_hash row from the client.

CREATE POLICY patient_privacy_codes_no_select ON public.patient_privacy_codes
FOR SELECT TO authenticated
USING (FALSE);

CREATE POLICY patient_privacy_codes_no_direct_insert ON public.patient_privacy_codes
FOR INSERT TO authenticated
WITH CHECK (FALSE);

CREATE POLICY patient_privacy_codes_no_direct_update ON public.patient_privacy_codes
FOR UPDATE TO authenticated
USING (FALSE);

CREATE POLICY patient_privacy_codes_no_delete ON public.patient_privacy_codes
FOR DELETE TO authenticated
USING (FALSE);
```

The associated SECURITY DEFINER functions live in their own
migration; they enforce per-code lockout (5 attempts → 24 h) AND a
per-clinic rate limit (5 attempts/hour/clinic, 1-hour lockout per
`(global_patient, requesting_clinic)` window after 5 failures), write
the `privacy_code_attempts` audit row, and `audit_events` on
regeneration.

**Two distinct lockout mechanisms** — both run in `verify_privacy_code`
and they protect against different attacks:

| Mechanism | Scope | Duration | Trigger | SMS to patient? |
|---|---|---|---|---|
| Per-code attempts_count (`patient_privacy_codes` row) | global_patient | 24h | 5 failures against ANY clinic | YES |
| Per-clinic rate limit | (global_patient, clinic) | 1h | 5 failures from same clinic in 1h | NO (too noisy) |

The per-code mechanism stops brute-force against one patient. The
per-clinic rate limit stops a malicious clinic from enumerating phone
numbers across patients (each per-(patient, clinic) pair has its own
1-hour window, so one clinic burning attempts on patient A cannot
slow down its attempts on patient B). The 24h lockout still applies
to the per-code state when the patient regenerates the code mid-attack.

---

## 6. `privacy_code_attempts` — every attempt, success or fail

```sql
CREATE TABLE public.privacy_code_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  global_patient_id UUID NOT NULL
    REFERENCES public.global_patients(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  privacy_code_id UUID
    REFERENCES public.patient_privacy_codes(id)
    ON DELETE SET NULL
    ON UPDATE CASCADE,

  -- Who tried
  attempted_by_user_id UUID NOT NULL
    REFERENCES auth.users(id) ON DELETE RESTRICT,
  attempted_by_clinic_id UUID NOT NULL
    REFERENCES public.clinics(id) ON DELETE RESTRICT,

  -- Result
  result privacy_code_attempt_result NOT NULL,

  -- Forensics
  ip_address INET,
  user_agent TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX privacy_code_attempts_patient_time_idx
  ON public.privacy_code_attempts (global_patient_id, created_at DESC);
CREATE INDEX privacy_code_attempts_user_time_idx
  ON public.privacy_code_attempts (attempted_by_user_id, created_at DESC);
CREATE INDEX privacy_code_attempts_clinic_time_idx
  ON public.privacy_code_attempts (attempted_by_clinic_id, created_at DESC);
-- Used by per-IP rate limiter:
CREATE INDEX privacy_code_attempts_ip_time_idx
  ON public.privacy_code_attempts (ip_address, created_at DESC)
  WHERE ip_address IS NOT NULL;

COMMENT ON TABLE public.privacy_code_attempts IS
  'Append-only audit + rate-limit feed for privacy-code attempts. Every attempt — success, failure, lockout, expired — gets a row.';
COMMENT ON INDEX public.privacy_code_attempts_clinic_time_idx IS
  'Backs the per-clinic rate limit in verify_privacy_code: 5 attempts/hour/(global_patient, clinic) before this clinic is locked out from this patient for the next hour.';
```

### RLS policies

```sql
ALTER TABLE public.privacy_code_attempts ENABLE ROW LEVEL SECURITY;

-- SELECT: patient sees their own attempt log; clinic OWNER sees
-- attempts originating in their clinic.
CREATE POLICY privacy_code_attempts_select ON public.privacy_code_attempts
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.global_patients gp
    WHERE gp.id = privacy_code_attempts.global_patient_id
      AND gp.claimed_user_id = auth.uid()
  )
  OR public.get_clinic_role(attempted_by_clinic_id, auth.uid()) = 'OWNER'
);

-- INSERT: only via SECURITY DEFINER `record_privacy_code_attempt()`.
CREATE POLICY privacy_code_attempts_no_direct_insert ON public.privacy_code_attempts
FOR INSERT TO authenticated
WITH CHECK (FALSE);

CREATE POLICY privacy_code_attempts_no_update ON public.privacy_code_attempts
FOR UPDATE TO authenticated
USING (FALSE);

CREATE POLICY privacy_code_attempts_no_delete ON public.privacy_code_attempts
FOR DELETE TO authenticated
USING (FALSE);
```

---

## 7. `patient_phone_history` — append-only, now global

Existing table from mig 013/070. Specification ALTERs it to point at
`global_patients` instead of (or in addition to) the legacy
`patients.id`.

```sql
ALTER TABLE public.patient_phone_history
  ADD COLUMN global_patient_id UUID
    REFERENCES public.global_patients(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE;

CREATE INDEX patient_phone_history_global_patient_idx
  ON public.patient_phone_history (global_patient_id, changed_at DESC);

-- Backfill from patients.global_patient_id (mig 075) before enforcing NOT NULL.
ALTER TABLE public.patient_phone_history
  ALTER COLUMN global_patient_id SET NOT NULL;  -- enforced after backfill

-- Patient_id stays nullable for legacy rows during cut-over; dropped
-- in mig 084.
COMMENT ON COLUMN public.patient_phone_history.global_patient_id IS
  'New canonical FK. patient_id is preserved during cut-over and dropped in mig 084.';
```

RLS already exists; updated to also allow patient self-view via
`global_patients.claimed_user_id`:

```sql
DROP POLICY IF EXISTS patient_phone_history_select ON public.patient_phone_history;
CREATE POLICY patient_phone_history_select ON public.patient_phone_history
FOR SELECT TO authenticated
USING (
  -- Patient self via global identity
  EXISTS (
    SELECT 1 FROM public.global_patients gp
    WHERE gp.id = patient_phone_history.global_patient_id
      AND gp.claimed_user_id = auth.uid()
  )
  -- Clinic member who can access the patient at any of their clinics
  OR EXISTS (
    SELECT 1 FROM public.patient_clinic_records pcr
    WHERE pcr.global_patient_id = patient_phone_history.global_patient_id
      AND public.is_clinic_member(pcr.clinic_id, auth.uid())
  )
);
```

---

## 8. `dependent_account_links` — caregiver ↔ dependent

```sql
CREATE TABLE public.dependent_account_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  caregiver_global_patient_id UUID NOT NULL
    REFERENCES public.global_patients(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  dependent_global_patient_id UUID NOT NULL
    REFERENCES public.global_patients(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,

  relationship caregiver_relationship NOT NULL,

  -- Provenance
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  granted_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_via TEXT NOT NULL CHECK (granted_via IN (
    'walk_in_form','self_register','sms_consent','patient_app','admin_override'
  )),

  -- Lifecycle
  revoked_at TIMESTAMPTZ,
  revoked_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  audit_event_id UUID REFERENCES public.audit_events(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT dependent_account_links_distinct_chk
    CHECK (caregiver_global_patient_id <> dependent_global_patient_id)
);

CREATE UNIQUE INDEX dependent_account_links_active_uniq
  ON public.dependent_account_links
    (caregiver_global_patient_id, dependent_global_patient_id)
  WHERE revoked_at IS NULL;

CREATE INDEX dependent_account_links_caregiver_idx
  ON public.dependent_account_links (caregiver_global_patient_id)
  WHERE revoked_at IS NULL;
CREATE INDEX dependent_account_links_dependent_idx
  ON public.dependent_account_links (dependent_global_patient_id)
  WHERE revoked_at IS NULL;

COMMENT ON TABLE public.dependent_account_links IS
  'Audited caregiver↔dependent linkage. Soft-revoke. The caregiver can read/write the dependent''s rows via RLS in encounters / prescriptions / etc.';
```

### RLS policies

```sql
ALTER TABLE public.dependent_account_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY dependent_account_links_select ON public.dependent_account_links
FOR SELECT TO authenticated
USING (
  -- Caregiver self-view
  EXISTS (
    SELECT 1 FROM public.global_patients gp
    WHERE gp.id = dependent_account_links.caregiver_global_patient_id
      AND gp.claimed_user_id = auth.uid()
  )
  -- Dependent self-view (an adult dependent should be able to see
  -- who has access)
  OR EXISTS (
    SELECT 1 FROM public.global_patients gp
    WHERE gp.id = dependent_account_links.dependent_global_patient_id
      AND gp.claimed_user_id = auth.uid()
  )
  -- Clinic member who can access either side
  OR EXISTS (
    SELECT 1 FROM public.patient_clinic_records pcr
    WHERE pcr.global_patient_id IN (
      dependent_account_links.caregiver_global_patient_id,
      dependent_account_links.dependent_global_patient_id
    )
      AND public.is_clinic_member(pcr.clinic_id, auth.uid())
  )
);

-- INSERT/UPDATE/DELETE only via SECURITY DEFINER helpers.
CREATE POLICY dependent_account_links_no_direct_insert ON public.dependent_account_links
FOR INSERT TO authenticated
WITH CHECK (FALSE);
CREATE POLICY dependent_account_links_revoke_update ON public.dependent_account_links
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.global_patients gp
    WHERE gp.id = dependent_account_links.caregiver_global_patient_id
      AND gp.claimed_user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.global_patients gp
    WHERE gp.id = dependent_account_links.dependent_global_patient_id
      AND gp.claimed_user_id = auth.uid()
  )
)
WITH CHECK (revoked_at IS NOT NULL);
CREATE POLICY dependent_account_links_no_delete ON public.dependent_account_links
FOR DELETE TO authenticated
USING (FALSE);
```

---

## 9. `anonymous_clinical_observations` — AI training pipeline

Deliberately re-identification-resistant. **No** `global_patient_id`,
**no** clinic_record FK that would re-link.

```sql
CREATE TABLE public.anonymous_clinical_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Time, coarsened
  recorded_year SMALLINT NOT NULL CHECK (recorded_year BETWEEN 1900 AND 2200),
  recorded_month SMALLINT NOT NULL CHECK (recorded_month BETWEEN 1 AND 12),

  -- Patient demographic, banded
  patient_age_band TEXT NOT NULL CHECK (patient_age_band IN (
    '0-1','2-5','6-12','13-17','18-29','30-44','45-59','60-74','75+'
  )),
  patient_sex TEXT CHECK (patient_sex IN ('male','female','other','prefer_not_to_say')),
  patient_governorate TEXT,            -- Egyptian governorate (region only)

  -- Clinical, normalized
  chief_complaint_normalized TEXT,
  diagnosis_icd10 TEXT[],
  prescriptions JSONB,                 -- [{generic_name, atc_code, dose, duration}]
  vitals JSONB,                        -- {bp_systolic, bp_diastolic, hr, temp_c, ...}
  lab_results JSONB,                   -- normalized panels

  -- Provenance — clinic-level only, no patient link
  source_clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL,
  consent_basis TEXT NOT NULL CHECK (consent_basis IN (
    'global_patient_opt_in',
    'aggregate_only_no_consent_required'
  )),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

  -- INTENTIONALLY NO: global_patient_id, encounter_id, clinical_note_id,
  -- exact birthdate, exact phone, exact address, free-text patient name.
);

CREATE INDEX anonymous_clinical_observations_year_idx
  ON public.anonymous_clinical_observations (recorded_year, recorded_month);
CREATE INDEX anonymous_clinical_observations_diagnosis_gin
  ON public.anonymous_clinical_observations USING GIN (diagnosis_icd10);
CREATE INDEX anonymous_clinical_observations_prescriptions_gin
  ON public.anonymous_clinical_observations USING GIN (prescriptions);

COMMENT ON TABLE public.anonymous_clinical_observations IS
  'AI/analytics training pool. Re-identification-resistant by design — no global_patient_id, age banded, location at governorate, time at month. Populated by a SECURITY DEFINER ETL that respects global_patients.consent_to_anonymous_research.';
```

### RLS policies

```sql
ALTER TABLE public.anonymous_clinical_observations ENABLE ROW LEVEL SECURITY;

-- SELECT: only Anthropic-side service role and clinic OWNERs of the
-- source clinic (for "what did MY clinic contribute" transparency).
CREATE POLICY anonymous_clinical_observations_select
  ON public.anonymous_clinical_observations
FOR SELECT TO authenticated
USING (
  source_clinic_id IS NOT NULL
  AND public.get_clinic_role(source_clinic_id, auth.uid()) = 'OWNER'
);

-- INSERT/UPDATE/DELETE: forbidden at RLS layer; only the ETL job
-- (service role, bypasses RLS) writes here.
CREATE POLICY anonymous_clinical_observations_no_insert
  ON public.anonymous_clinical_observations
FOR INSERT TO authenticated WITH CHECK (FALSE);
CREATE POLICY anonymous_clinical_observations_no_update
  ON public.anonymous_clinical_observations
FOR UPDATE TO authenticated USING (FALSE);
CREATE POLICY anonymous_clinical_observations_no_delete
  ON public.anonymous_clinical_observations
FOR DELETE TO authenticated USING (FALSE);
```

---

## 10. `prescriptions` — revised, fulfillment-aware

```sql
CREATE TABLE public.prescriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity (NEW: global_patient_id replaces local patient_id)
  global_patient_id UUID NOT NULL
    REFERENCES public.global_patients(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,

  -- Tenant + clinical context
  prescribing_clinic_id UUID NOT NULL
    REFERENCES public.clinics(id) ON DELETE RESTRICT,
  prescribing_doctor_id UUID NOT NULL
    REFERENCES auth.users(id) ON DELETE RESTRICT,
  encounter_id UUID
    REFERENCES public.encounters(id) ON DELETE SET NULL,

  -- Drug
  drug_name TEXT NOT NULL,
  drug_brand_name TEXT,
  drug_brand_name_ar TEXT,
  generic_name TEXT,
  atc_code TEXT,
  drug_id TEXT,                            -- references egyptian-drugs.ts

  -- Dose
  strength TEXT,
  form TEXT,
  frequency TEXT NOT NULL,
  duration TEXT NOT NULL,
  quantity INTEGER,
  instructions TEXT,
  instructions_ar TEXT,

  -- Lifecycle
  prescribed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,                  -- prescription validity expiry

  -- Fulfillment (forward compat for pharmacy partners)
  fulfillment_status prescription_fulfillment_status NOT NULL DEFAULT 'pending',
  fulfilled_by_pharmacy_id UUID,           -- FK added when pharmacies table lands
  fulfilled_at TIMESTAMPTZ,
  fulfilled_quantity INTEGER,
  pharmacy_notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX prescriptions_patient_idx
  ON public.prescriptions (global_patient_id, prescribed_at DESC);
CREATE INDEX prescriptions_clinic_idx
  ON public.prescriptions (prescribing_clinic_id, prescribed_at DESC);
CREATE INDEX prescriptions_doctor_idx
  ON public.prescriptions (prescribing_doctor_id, prescribed_at DESC);
CREATE INDEX prescriptions_fulfillment_idx
  ON public.prescriptions (fulfillment_status)
  WHERE fulfillment_status IN ('pending','sent_to_pharmacy','partially_dispensed');
CREATE INDEX prescriptions_pharmacy_idx
  ON public.prescriptions (fulfilled_by_pharmacy_id)
  WHERE fulfilled_by_pharmacy_id IS NOT NULL;

COMMENT ON TABLE public.prescriptions IS
  'Prescriptions keyed by global_patient_id, with fulfillment fields ready for future pharmacy integration. Replaces prescription_items (which kept the legacy patient_id).';
```

### RLS policies (directional consent + fulfillment write-back)

```sql
ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;

-- SELECT: routes through can_view_patient_data_at_clinic, where the
-- "data clinic" is the prescribing clinic.
--
-- A clinic's user can SELECT a prescription row when:
--   (a) the prescription was written at THEIR clinic (auto-share with self), OR
--   (b) the patient has granted active consent from prescribing_clinic_id
--       to one of the user's clinics, OR
--   (c) the user IS the patient (or the patient's caregiver), OR
--   (d) (future) the user is the assigned pharmacy fulfilling this rx.
CREATE POLICY prescriptions_select ON public.prescriptions
FOR SELECT TO authenticated
USING (
  public.can_view_patient_data_at_clinic(
    global_patient_id,
    prescribing_clinic_id,
    auth.uid()
  )
  -- Pharmacy write-back access (forward compat). Active when the rx
  -- has been routed to a pharmacy and the caller is a member of that
  -- pharmacy's user group. Until pharmacies table exists, this branch
  -- evaluates false.
  OR (
    fulfilled_by_pharmacy_id IS NOT NULL
    AND public.is_pharmacy_member(fulfilled_by_pharmacy_id, auth.uid())
  )
);

-- INSERT: the prescribing doctor at the prescribing clinic.
CREATE POLICY prescriptions_insert ON public.prescriptions
FOR INSERT TO authenticated
WITH CHECK (
  prescribing_doctor_id = auth.uid()
  AND public.is_clinic_member(prescribing_clinic_id, auth.uid())
  AND public.get_clinic_role(prescribing_clinic_id, auth.uid()) IN ('OWNER','DOCTOR')
);

-- UPDATE: prescribing doctor for clinical fields; pharmacy for
-- fulfillment_* fields only (enforced by trigger).
CREATE POLICY prescriptions_update ON public.prescriptions
FOR UPDATE TO authenticated
USING (
  -- Prescribing doctor / clinic owner can edit their own prescriptions
  (
    public.is_clinic_member(prescribing_clinic_id, auth.uid())
    AND public.get_clinic_role(prescribing_clinic_id, auth.uid()) IN ('OWNER','DOCTOR')
  )
  -- Pharmacy can update fulfillment fields only (trigger-enforced).
  OR (
    fulfilled_by_pharmacy_id IS NOT NULL
    AND public.is_pharmacy_member(fulfilled_by_pharmacy_id, auth.uid())
  )
);

-- DELETE: forbidden. Use fulfillment_status='cancelled'.
CREATE POLICY prescriptions_no_delete ON public.prescriptions
FOR DELETE TO authenticated
USING (FALSE);
```

`is_pharmacy_member()` is forward-compatible: defined as
`SELECT FALSE` in this rewrite, replaced when the `pharmacies` table
is introduced. RLS does not break in the meantime.

---

## 11. `lab_orders` — revised, fulfillment-aware

```sql
CREATE TABLE public.lab_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  global_patient_id UUID NOT NULL
    REFERENCES public.global_patients(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  ordering_clinic_id UUID NOT NULL
    REFERENCES public.clinics(id) ON DELETE RESTRICT,
  ordering_doctor_id UUID NOT NULL
    REFERENCES auth.users(id) ON DELETE RESTRICT,
  encounter_id UUID
    REFERENCES public.encounters(id) ON DELETE SET NULL,

  -- Order details
  panel_code TEXT NOT NULL,                -- e.g. CBC, LFT
  panel_name TEXT NOT NULL,
  panel_name_ar TEXT,
  instructions TEXT,
  instructions_ar TEXT,
  fasting_required BOOLEAN NOT NULL DEFAULT FALSE,

  ordered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Fulfillment (forward compat for lab partners)
  status lab_order_status NOT NULL DEFAULT 'ordered',
  fulfilled_by_lab_id UUID,                -- FK added when labs table lands
  collected_at TIMESTAMPTZ,
  results_received_at TIMESTAMPTZ,
  results_summary TEXT,
  results_payload JSONB,
  results_attachment_url TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX lab_orders_patient_idx
  ON public.lab_orders (global_patient_id, ordered_at DESC);
CREATE INDEX lab_orders_clinic_idx
  ON public.lab_orders (ordering_clinic_id, ordered_at DESC);
CREATE INDEX lab_orders_status_idx
  ON public.lab_orders (status)
  WHERE status IN ('ordered','collected','in_progress');
CREATE INDEX lab_orders_lab_idx
  ON public.lab_orders (fulfilled_by_lab_id)
  WHERE fulfilled_by_lab_id IS NOT NULL;

COMMENT ON TABLE public.lab_orders IS
  'Lab orders keyed by global_patient_id, with fulfillment fields ready for future lab integration. Read-shared cross-clinic via patient_data_shares.';
```

RLS policies are structurally identical to `prescriptions` —
`can_view_patient_data_at_clinic(global_patient_id,
ordering_clinic_id, auth.uid())` for SELECT, plus a future
`is_lab_member(fulfilled_by_lab_id, auth.uid())` branch.

---

## 12. `encounters` — revised

```sql
CREATE TABLE public.encounters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  global_patient_id UUID NOT NULL
    REFERENCES public.global_patients(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  clinic_id UUID NOT NULL
    REFERENCES public.clinics(id) ON DELETE RESTRICT,
  doctor_id UUID NOT NULL
    REFERENCES auth.users(id) ON DELETE RESTRICT,

  encounter_type encounter_type NOT NULL DEFAULT 'walk_in',
  status encounter_status NOT NULL DEFAULT 'open',

  -- SOAP
  chief_complaint TEXT,
  subjective TEXT,
  objective TEXT,
  assessment TEXT,
  plan TEXT,

  -- Structured clinical
  vitals JSONB,
  icd10_codes TEXT[],

  -- Cross-clinic referral
  referral_to_clinic_id UUID
    REFERENCES public.clinics(id) ON DELETE SET NULL,
  referral_reason TEXT,

  -- Lifecycle
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  superseded_by UUID REFERENCES public.encounters(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT encounters_close_consistency_chk CHECK (
    (status IN ('closed','cancelled','superseded') AND closed_at IS NOT NULL)
    OR (status = 'open' AND closed_at IS NULL)
  )
);

CREATE INDEX encounters_patient_idx
  ON public.encounters (global_patient_id, started_at DESC);
CREATE INDEX encounters_clinic_idx
  ON public.encounters (clinic_id, started_at DESC);
CREATE INDEX encounters_doctor_idx
  ON public.encounters (doctor_id, started_at DESC);
CREATE INDEX encounters_referral_idx
  ON public.encounters (referral_to_clinic_id)
  WHERE referral_to_clinic_id IS NOT NULL;
CREATE INDEX encounters_icd10_gin
  ON public.encounters USING GIN (icd10_codes);

COMMENT ON TABLE public.encounters IS
  'Visit-level clinical record. Successor to clinical_notes for the network model — keyed by global_patient_id, supports cross-clinic referral chain.';
```

RLS policies for `encounters` mirror `prescriptions`:
`can_view_patient_data_at_clinic(global_patient_id, clinic_id,
auth.uid())` for SELECT; INSERT/UPDATE restricted to clinic
DOCTOR/OWNER; DELETE forbidden. The referral target clinic gets read
access automatically the moment a `patient_data_shares` row
exists from `clinic_id` to `referral_to_clinic_id` for this patient
(see migration plan Step 11).

---

## 13. `audit_events` — revised

No DDL change to columns; the action enum is TS-only at
`packages/shared/lib/data/audit.ts` (per audit Section F).

What does change at the schema layer:
- A new helper view `public.privacy_audit_events` that filters
  `audit_events` to the new privacy actions for the patient app's
  sharing UI:

```sql
CREATE OR REPLACE VIEW public.privacy_audit_events AS
SELECT *
FROM public.audit_events
WHERE action IN (
  'PRIVACY_CODE_REGENERATED',
  'PRIVACY_CODE_ATTEMPT_SUCCESS',
  'PRIVACY_CODE_ATTEMPT_FAILURE',
  'PRIVACY_CODE_LOCKED',
  'SHARE_GRANTED',
  'SHARE_EXTENDED',
  'SHARE_REVOKED_SOFT',
  'SHARE_AUTO_RENEWED',
  'DEPENDENT_LINK_CREATED',
  'DEPENDENT_LINK_REVOKED',
  'GLOBAL_PATIENT_CREATED',
  'GLOBAL_PATIENT_MERGED',
  'GLOBAL_PATIENT_DECEASED',
  'SMS_CONSENT_SENT',
  'MESSAGING_CONSENT_RECONFIRMED'
);

COMMENT ON VIEW public.privacy_audit_events IS
  'Subset of audit_events relevant to patient-facing privacy timeline. Inherits audit_events RLS via security_invoker.';
```

The view uses `security_invoker = true` so existing RLS on
`audit_events` (mig 020:193-207) is enforced against the calling user.

---

## 14. Forward compatibility — by feature

### a. Pharmacy fulfillment (write-back to prescriptions) — SUPPORTED

`prescriptions` already carries `fulfillment_status`,
`fulfilled_by_pharmacy_id`, `fulfilled_at`, `fulfilled_quantity`,
`pharmacy_notes`. The RLS policy includes a forward-compatible
`is_pharmacy_member()` branch — defined as `SELECT FALSE` today,
trivially replaced when the `pharmacies` + `pharmacy_memberships`
tables land. **No further migration is required to enable pharmacy
write-back beyond introducing those two tables and pointing
`fulfilled_by_pharmacy_id` at them.**

### b. Lab fulfillment (write-back to lab_orders) — SUPPORTED

Symmetric to (a): `lab_orders.status`, `fulfilled_by_lab_id`,
`collected_at`, `results_received_at`, `results_summary`,
`results_payload`, `results_attachment_url` exist from day one.
Forward compatible via `is_lab_member()`.

### c. Cross-clinic referrals — SUPPORTED

Two surfaces:
- `encounters.referral_to_clinic_id` records the referral on the
  source encounter.
- `patient_data_shares` with `granted_via='referral'` records the
  data-share grant the source clinic creates on referral, so the
  target clinic can read the relevant history. The grant is
  directional (source → target), expires on a clinic-configurable
  default (e.g. 90 days), and is soft-revocable.

No further migrations required.

### d. Patient-initiated clinic switching — SUPPORTED

A patient who wants to switch primary clinic does NOT require any
schema change:
- They keep their `global_patients` row.
- They self-create or trigger creation of a
  `patient_clinic_records` row at the new clinic via the privacy
  code flow (a regular `patient_data_shares` grant, granted_via=
  `privacy_code` or `patient_app`).
- They can soft-revoke the old clinic's share grant from the
  patient app (`patient_data_shares.revoked_at`).
- Old clinical data stays put at the old clinic; the new clinic
  reads it via the active share until/unless the patient revokes.

The schema therefore supports clinic switching with no further
migration. The product layer chooses how aggressive the "primary
clinic" UX hint is, but data-layer support is complete.

### Feasibility summary

| Feature | Supported | Why |
|---|---|---|
| Pharmacy fulfillment | ✅ | `prescriptions.fulfillment_*` + `is_pharmacy_member()` shim |
| Lab fulfillment | ✅ | `lab_orders.status` + results columns + `is_lab_member()` shim |
| Cross-clinic referrals | ✅ | `encounters.referral_to_clinic_id` + `patient_data_shares` grant |
| Patient-initiated clinic switching | ✅ | `patient_data_shares` soft-revoke + new `patient_clinic_records` row |

No future feature on the prompt list requires further migrations
beyond the addition of partner-tenant tables (pharmacies, labs).

---

## 15. Index summary (production-readiness check)

| Table | Index | Purpose |
|---|---|---|
| global_patients | UNIQUE (normalized_phone) | Identity uniqueness |
| global_patients | UNIQUE (claimed_user_id) WHERE NOT NULL | One auth user → one patient |
| global_patients | (claimed_user_id) WHERE active | Patient-app self-view fast path |
| patient_clinic_records | UNIQUE (global_patient_id, clinic_id) | One row per (patient, clinic) |
| patient_clinic_records | (clinic_id, status, last_seen_at DESC) | Clinic patient list |
| patient_data_shares | UNIQUE (gpid, grantor, grantee) WHERE active | One active grant per pair |
| patient_data_shares | (grantee_clinic_id, gpid) WHERE active | Reverse lookup for RLS |
| patient_data_shares | (expires_at) WHERE active+nonnull | Expiry sweeper job |
| patient_privacy_codes | UNIQUE (gpid) WHERE active | One active code per patient |
| privacy_code_attempts | (gpid, created_at DESC) | Per-patient attempt window |
| privacy_code_attempts | (ip_address, created_at DESC) | IP rate limit |
| dependent_account_links | UNIQUE (cg, dep) WHERE active | One active link per pair |
| anonymous_clinical_observations | (recorded_year, recorded_month) | Time-series queries |
| prescriptions | (global_patient_id, prescribed_at DESC) | Patient med history |
| prescriptions | (fulfillment_status) WHERE active | Pharmacy queue |
| lab_orders | (global_patient_id, ordered_at DESC) | Patient lab history |
| encounters | (global_patient_id, started_at DESC) | Patient timeline |
| encounters | GIN (icd10_codes) | Diagnosis search |

Every UNIQUE on a partial-active predicate prevents duplicate active
state without blocking historical rows.

---

## 16. Function inventory (forward-defined here, body in mig plan)

Each function gets its own migration in the plan; signatures and intent
are fixed here so callers can compile against them.

```sql
-- Identity
public.normalize_phone_e164(phone TEXT) RETURNS TEXT;
public.claim_or_create_global_patient(p_phone TEXT, p_user_id UUID, p_display_name TEXT)
  RETURNS UUID;
public.merge_global_patients(p_winner UUID, p_loser UUID, p_actor UUID)
  RETURNS VOID;

-- Privacy code
public.regenerate_privacy_code(p_global_patient_id UUID)
  RETURNS TEXT;                          -- plaintext returned ONCE
  -- Uses `gen_random_bytes()` from pgcrypto. Never `random()`
  -- (deterministic PRNG, predictable given a few outputs — unacceptable
  -- for a secret that gates medical records). With a 32-char base32
  -- alphabet, `byte % 32` introduces zero modulo bias because 256 is
  -- evenly divisible by 32. If the alphabet size ever changes to a
  -- non-divisor of 256, the implementation must switch to rejection
  -- sampling. Pre-condition: pgcrypto extension installed.
public.verify_privacy_code(
  p_global_patient_id UUID,
  p_plaintext TEXT,
  p_attempted_by_user_id UUID,
  p_attempted_by_clinic_id UUID,
  p_ip INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
) RETURNS BOOLEAN;
  -- verify_privacy_code logic (specification — body in mig 076)
  --
  -- Step 0: per-clinic rate limit check
  --   COUNT attempts in privacy_code_attempts WHERE
  --     global_patient_id = p_global_patient_id
  --     AND attempted_by_clinic_id = p_attempted_by_clinic_id
  --     AND created_at > NOW() - INTERVAL '1 hour'
  --     AND result IN ('failure', 'locked_out', 'rate_limited')
  --   IF count >= 5:
  --     INSERT into privacy_code_attempts with result='rate_limited'
  --     RETURN FALSE
  --     -- Per-clinic lockout: this clinic cannot retry for the next
  --     -- hour against THIS patient. They CAN attempt against OTHER
  --     -- patients (those have their own per-(patient, clinic)
  --     -- windows). Without this, a malicious clinic can enumerate
  --     -- phone numbers — the per-code lockout slows attack on one
  --     -- patient but does not stop enumeration across patients.
  -- Step 1: per-code lockout check (existing)
  --   ...
  -- Step 2: hash compare (existing)
  --   ...
  --
  -- SMS notification on lockout: when the per-CODE 24-hour lockout
  -- triggers (5 failures across any clinics), an SMS fires to the
  -- patient. Per-clinic rate limit does NOT trigger SMS — too noisy.
public.record_privacy_code_attempt(...) RETURNS VOID;   -- internal

-- Sharing
public.grant_patient_data_share(
  p_global_patient_id UUID,
  p_grantor_clinic_id UUID,
  p_grantee_clinic_id UUID,
  p_granted_via share_grant_method,
  p_expires_at TIMESTAMPTZ,
  p_proof TEXT                           -- privacy_code or sms token
) RETURNS UUID;
public.revoke_patient_data_share(p_share_id UUID, p_reason TEXT) RETURNS VOID;
public.extend_patient_data_share(p_share_id UUID, p_new_expires TIMESTAMPTZ) RETURNS VOID;

-- Access predicate (rebuilds, replaces v1)
public.can_view_patient_data_at_clinic(
  p_global_patient_id UUID,
  p_data_clinic_id UUID,
  p_viewer_user_id UUID DEFAULT auth.uid()
) RETURNS BOOLEAN;

-- Forward-compatible shims
public.is_pharmacy_member(p_pharmacy_id UUID, p_user_id UUID) RETURNS BOOLEAN;  -- SELECT FALSE today
public.is_lab_member(p_lab_id UUID, p_user_id UUID) RETURNS BOOLEAN;            -- SELECT FALSE today

-- Search-privacy parity
public.check_phone_uniform(p_phone TEXT) RETURNS JSONB;
  -- Returns { exists: false, requires_code: true } regardless of input.
  --
  -- TIMING INVARIANT: function MUST take >= MIN_RESPONSE_MS (default
  -- 50ms) wall-clock. Implementation: pg_sleep for the difference
  -- between actual lookup time and MIN_RESPONSE_MS. This prevents
  -- timing attacks that distinguish "phone exists" from "phone absent."
  -- An identical SHAPE alone is insufficient — without timing padding,
  -- the latency difference between hits and misses is detectable at
  -- scale, defeating the purpose of the uniform return.
  --
  -- Real existence check happens only after privacy-code redemption.
```

`can_access_patient` (mig 054) stays in place during the transition;
mig 081 retires it once every clinical-table policy has been switched
to `can_view_patient_data_at_clinic`.

---

## 16.1 Transactional invariants for SECURITY DEFINER functions

Every SECURITY DEFINER function that writes to multiple tables MUST be
atomic. plpgsql functions run in an implicit transaction; this is
preserved when called from the application layer (each function call
is its own transaction unless wrapped). Do NOT use autonomous
transactions, dblink, or any mechanism that splits writes across
transactions.

The motivating failure mode: if `grant_patient_data_share` writes the
share row but the `audit_events` INSERT fails, the share exists
without an audit trail — a privacy/legal violation. Postgres gives us
atomicity for free if we don't fight it; this section is a hard
contract that we don't.

Specifically:

| Function | Writes to | Atomicity requirement |
|---|---|---|
| `claim_or_create_global_patient` | global_patients + audit_events | Both or neither |
| `regenerate_privacy_code` | patient_privacy_codes (UPDATE old + INSERT new) + audit_events | All three or none |
| `verify_privacy_code` | privacy_code_attempts + (conditional) patient_privacy_codes UPDATE | Both or neither |
| `grant_patient_data_share` | patient_data_shares + audit_events | Both or neither |
| `revoke_patient_data_share` | patient_data_shares (UPDATE) + audit_events | Both or neither |
| `extend_patient_data_share` | patient_data_shares (UPDATE) + audit_events | Both or neither |
| `merge_global_patients` | global_patients UPDATE + cascading FK updates + audit_events | All or none |

Test requirement: each function's test suite (Prompts 6, 7) must
include a "force audit_events INSERT failure" case (e.g., trigger that
RAISES if the calling user is in a deny-list). Verify the parent
operation rolls back.

Implementation note for `grant_patient_data_share`: the `audit_events`
row must be INSERTED before the `patient_data_shares` row, so the
`patient_data_shares.audit_event_id` FK can be set. If the
`audit_events` insert fails, the function aborts before
`patient_data_shares` is touched.

Migration plan Steps 6, 7, 8, and 9 each reference this section — the
function bodies they ship MUST satisfy these invariants.

---

## 17. Open questions to confirm before applying

1. **Bcrypt cost factor for privacy codes.** Recommend cost=12.
   Confirm — slower hashes affect verify_privacy_code latency.
2. **Privacy code length / alphabet.** CONFIRMED 2026-04-28: 6 chars,
   base32 alphabet `'23456789ABCDEFGHJKLMNPQRSTUVWXYZ'` (32 chars,
   ambiguous 0/1/I/O removed). ~30 bits of entropy. With per-clinic
   rate limit (5/hr/clinic) and per-code 24h lockout after 5 fails,
   brute-force is infeasible. 8 chars adds entropy we don't need at
   the cost of UX (longer to read aloud over phone, harder to type
   without error).
3. **Lockout window.** Spec assumes 5 attempts → 24h lockout. Confirm.
4. **SMS-consent token TTL.** Spec assumes 5 min. Confirm.
5. **Default share expiry on referral.** Spec assumes 90 days.
   Confirm — alternative is no default and force the doctor to pick.
6. **Anonymous-observations consent default = FALSE (opt-in).**
   CONFIRMED 2026-04-28 per Egypt Personal Data Protection Law
   151/2020 Art. 12 (explicit consent required for secondary
   processing purpose). Patient app onboarding includes a
   clearly-presented opt-in screen with reciprocal benefit (priority
   booking, free annual summary, or similar — product TBD). Migration
   sets all existing global_patients to FALSE; ETL pipeline (Step 10)
   only includes patients with TRUE.
7. **Should `users.phone` UNIQUE be retained or dropped?** Currently
   load-bearing (mig 001:13) but redundant once `global_patients.
   normalized_phone` is the source of truth. Recommend keep but
   sync via trigger; revisit in a future cleanup migration.

These don't block sequencing — defaults are reasonable — but Mo
should sign off before mig 077 (privacy_codes) and 081 (RLS switch)
ship.
