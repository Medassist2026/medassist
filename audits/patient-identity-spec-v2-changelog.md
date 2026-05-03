# Schema Spec & Migration Plan — v2 Changelog

> Reflects the senior reviewer pushbacks 2026-04-28 against v1 of
> `audits/patient-identity-schema-spec.md` and
> `audits/patient-identity-migration-plan.md`. Two launch-blockers,
> three serious issues, three gaps, and two corrections to prior
> locked decisions. All accepted by Mo before this v2.

## Applied changes from prompt-1-v2-delta.md

### Change 1 — Cryptographic randomness (LAUNCH-BLOCKER)

- **Files:** schema spec § 16 (function inventory comment); migration
  plan Step 6 (`regenerate_privacy_code` body + pre-conditions).
- **Before:** the body sketch generated each character via
  `substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1)`
  — `random()` is a deterministic PRNG, predictable given a few
  outputs. Unacceptable for a secret that gates medical records.
- **After:** `gen_random_bytes(6)` from pgcrypto sources six
  cryptographically secure bytes, and each byte is reduced via
  `byte % length(v_alphabet)` against the 32-char base32 alphabet.
  Modulo-bias note added: 256 / 32 = 8 exactly, so zero bias; if the
  alphabet size ever changes to a non-divisor of 256, switch to
  rejection sampling.
- **Pre-condition added:** Step 6 now verifies pgcrypto is installed
  (`SELECT extname FROM pg_extension WHERE extname = 'pgcrypto'`) and
  prepends `CREATE EXTENSION IF NOT EXISTS pgcrypto;` to mig 076 if
  not.
- **Test addition:** Step 6 "what to test" gains a distribution sanity
  test — generate 10,000 codes, assert each character position's
  symbol frequency is within ±5% of uniform (`10000 / 32 ≈ 312.5`).
  Catches accidental regression to a biased generator.

### Change 2 — Per-clinic rate limit explicit in `verify_privacy_code` (LAUNCH-BLOCKER)

- **Files:** schema spec § 5 (two-mechanism table), § 6 (index
  comment), § 16 (`verify_privacy_code` body specification);
  migration plan Step 6 (verify body sketch + pre-conditions + test
  list).
- **Before:** spec implemented per-CODE lockout via
  `patient_privacy_codes.attempts_count` / `locked_until`. Per-CLINIC
  rate limit was a locked decision but missing from the spec.
- **After:** `verify_privacy_code` runs Step 0 per-clinic rate-limit
  check before per-code lockout. 5 attempts/hour/(global_patient,
  clinic), 1-hour lockout. Counts attempts in
  `privacy_code_attempts` filtered by `attempted_by_clinic_id`.
- **Two-mechanism table added** to schema spec § 5: per-code (24h, ANY
  clinic, fires SMS) vs per-clinic (1h, same clinic, no SMS).
- **Index `privacy_code_attempts_clinic_time_idx`** comment added — it
  backs the per-clinic rate-limit query.
- **Test additions:** simulate 5 failures from clinic A against
  patient P, assert clinic A is locked for 1h while clinic B can
  still attempt; and assert per-code 24h lockout still fires SMS.

### Change 3 — Uniform timing for `check_phone_uniform` (SERIOUS)

- **Files:** schema spec § 16 (function inventory comment); migration
  plan Step 1 ("what to test" + body sketch).
- **Before:** function returned identical SHAPE regardless of phone
  existence, but the lookup itself ran at hit/miss latency, leaking
  existence via timing.
- **After:** TIMING INVARIANT added — function MUST take
  ≥ MIN_RESPONSE_MS (default 50ms) wall-clock. Body sketch in
  migration plan uses `clock_timestamp()` to measure actual lookup
  time and `pg_sleep` to pad to minimum. Function declared `STABLE`
  not `VOLATILE` (deterministic shape, lookup result discarded).
- **Test addition:** 100 calls with existing phones, 100 with
  non-existing; assert p95 latency difference < 5ms (or whatever
  threshold Mo signs off on).

### Change 4 — `claimed = FALSE` default in Step 3 backfill (SERIOUS)

- **Files:** migration plan Step 3 (forward SQL + new "Claim
  Migration" subsection + test list).
- **Before:** backfill inferred `claimed = TRUE` whenever a `users`
  row existed with the same id as the `patients` row. Audit
  Section A:50-53 documented that walk-in flow can mint `users` rows
  without a claim, so this falsely marks walk-in-only patients as
  claimed.
- **After:** every `global_patients` row backfills with
  `claimed = FALSE`, `claimed_at = NULL`, `claimed_user_id = NULL`.
  Patients claim through the patient app's first-login flow:
  `claim_or_create_global_patient` SECURITY DEFINER function
  verifies OTP ownership and writes `GLOBAL_PATIENT_CLAIMED` audit.
- **Behavior change:** on Day 0 post-mig 073 nobody can access the
  patient app's records view without re-claiming. Tracked as Orphan
  Ledger item ORPH-V2-01, closed by Prompt 10 (Patient App v1).

### Change 5 — Messaging consent re-consent flow with 90-day grace (SERIOUS)

- **Files:** migration plan Step 4 (forward SQL backfill); new Step
  4.5 inserted between Steps 4 and 5; "what this plan deliberately
  does NOT do" untouched (still says we don't rewrite
  `patient_consent_grants`); orphan ledger.
- **Before:** Step 4 collapsed legacy per-doctor
  `patient_consent_grants` into per-clinic
  `patient_clinic_records.consent_to_messaging` via `EXISTS (... AND
  revoked_at IS NULL)`. This expands consent: if Doctor A has
  consent and Doctor B doesn't, Doctor B suddenly gains messaging
  access. Privacy regression.
- **After:** Step 4 backfills `consent_to_messaging = FALSE` for
  every row. New Step 4.5 introduces an
  `effective_messaging_consent` SQL view that unions the new column
  (priority) with the legacy table (90-day grace window). Messaging
  code paths read the view for 90 days; after 90 days the view is
  dropped and legacy consent silently lapses unless re-confirmed.
- **New audit action:** `MESSAGING_CONSENT_RECONFIRMED` (added in
  Change 8).
- **Orphan ledger items:** ORPH-V2-02 (re-consent UI, closed by
  Prompt 10), ORPH-V2-04 (messaging code reads through view, closed
  by Prompt 4/8), ORPH-V2-05 (drop view 90 days post-cutover, closed
  by post-Prompt-11 cleanup mig).

### Change 6 — Privacy code length 6 not 8

- **Files:** schema spec § 17 #2 (resolved → 6 chars); schema spec
  § 5 (column comment); migration plan Step 6 (`FOR v_i IN 1..6
  LOOP`, `gen_random_bytes(6)`, test alphabet check).
- **Before:** spec § 17 #2 listed 8 chars as a recommendation; Step 6
  body sketch had `FOR v_i IN 1..8 LOOP`.
- **After:** confirmed 6 chars from base32 alphabet
  `'23456789ABCDEFGHJKLMNPQRSTUVWXYZ'` (32 chars, ambiguous 0/1/I/O
  removed). ~30 bits of entropy with the rate limits in place.
- **Rationale:** 8 chars adds entropy we don't need at the cost of
  UX (longer to read aloud, harder to type).

### Change 7 — AI training consent default FALSE (opt-in)

- **Files:** schema spec § 17 #6 (resolved → FALSE, Egyptian PDP Law
  151/2020 Art. 12 cited); migration plan "deliberately does NOT do"
  list.
- **Before:** schema § 2 already had `DEFAULT FALSE`; § 17 #6 listed
  it as an open question.
- **After:** schema unchanged; § 17 #6 marked CONFIRMED 2026-04-28
  with the legal basis. Migration plan explicitly states it does not
  auto-set `consent_to_anonymous_research = TRUE` for any existing
  patient. Opt-in flow tracked as ORPH-V2-03 in the orphan ledger.

### Change 8 — Add `SHARE_AUTO_RENEWED` and `MESSAGING_CONSENT_RECONFIRMED` audit actions

- **Files:** schema spec § 1 (TS-only audit enum list + spec for when
  each fires); schema spec § 13 (privacy_audit_events view); migration
  plan Step 7 (trigger function `tg_encounter_auto_renew_share` +
  trigger attachment + reverse SQL + test list).
- **Before:** locked decision said 90-day default share auto-renew on
  visit, but no audit action existed for it. Auto-renewals would be
  silent. The new `MESSAGING_CONSENT_RECONFIRMED` from Change 5 also
  needed enum coverage.
- **After:** both actions added to the TS-only `AuditAction` enum
  and to the `privacy_audit_events` view. Trigger
  `encounters_auto_renew_share` fires AFTER INSERT on `encounters`,
  finds matching active `patient_data_shares` rows, extends
  `expires_at` to `MAX(current, NOW + 90 days)`, and writes the
  `SHARE_AUTO_RENEWED` audit row in the same transaction.
- **Test additions:** auto-renew bumps near-expiry shares, doesn't
  shorten long-expiry shares, no-ops when no active share exists,
  rolls back on audit-events failure.

### Change 9 — Document transactional invariants for SECURITY DEFINER functions

- **Files:** new schema spec § 16.1 (table + implementation note +
  test requirement); migration plan Step 6 / 7 / 8 / 9
  pre-conditions reference § 16.1.
- **Before:** schema spec § 16 listed the function signatures but
  did not state that multi-write operations must be atomic.
  Reviewer flagged: if `grant_patient_data_share` writes the share
  but the audit_events INSERT fails, the share exists without an
  audit trail.
- **After:** § 16.1 lists every multi-write SECURITY DEFINER
  function and its atomicity requirement. Implementation note
  forbids autonomous transactions and dblink. Each function's test
  suite must include a forced audit-events failure case and assert
  rollback.
- **Implementation note:** in `grant_patient_data_share`,
  `audit_events` is INSERTED first so its ID can populate
  `patient_data_shares.audit_event_id`.

### Change 10 — Document `users.phone` UNIQUE collision handling (GAP)

- **Files:** migration plan Step 1 (new step 1.5 detection table +
  reverse SQL update + post-condition); migration plan
  "deliberately does NOT do" list.
- **Before:** today `users.phone` is UNIQUE (mig 001:13). Audit
  Section A:50-53 noted that walk-in flow can fail with 23505 when
  the same phone has visited a different clinic; failure mode is
  unclear. Migration plan didn't address it.
- **After:** Step 1.5 creates `_phone_orphan_walkins` and populates it
  with one row per `(patients, users)` mismatch tagged
  `no_user_row` / `user_id_mismatch` / `user_phone_mismatch`. Each
  cluster needs a resolution decision (documented in
  `audits/dedup-resolution.md`) before Step 3 backfill runs.
- **`users.phone` UNIQUE preserved:** "deliberately does NOT do" now
  explicitly states the constraint stays for the duration of the
  migration and beyond as defense-in-depth, with a future trigger
  to sync to `global_patients.normalized_phone` left out of scope.

## Open questions resolved in v2

- Schema spec § 17 #2 (privacy code length): **RESOLVED → 6 chars,
  base32 alphabet** (Change 6).
- Schema spec § 17 #3 (lockout window): **RESOLVED → 5/hr per code
  (24h lockout) AND 5/hr per clinic (1h lockout)** (Change 2).
- Schema spec § 17 #6 (anonymous-observations consent default):
  **RESOLVED → FALSE (opt-in), Egypt PDP Law 151/2020 Art. 12**
  (Change 7).
- Schema spec § 17 #7 (drop `users.phone` UNIQUE): **RESOLVED →
  KEEP** as defense-in-depth; future cleanup mig may add a trigger
  to sync (Change 10).

## Open questions still pending

- Schema spec § 17 #1 (bcrypt cost factor): still pending Mo's
  confirmation; default cost = 12. Affects `verify_privacy_code`
  latency.
- Schema spec § 17 #4 (SMS-consent token TTL): still pending Mo's
  confirmation; default 5 min.
- Schema spec § 17 #5 (default share expiry on referral): still
  pending Mo's confirmation; default 90 days.

These don't block sequencing — defaults are reasonable — but Mo
should sign off before mig 076 (privacy_codes) and mig 077 (data
shares) ship.

## New / changed orphan-ledger entries

- ORPH-V2-01 — patient app first-login claim flow → Prompt 10
- ORPH-V2-02 — re-consent prompt blocking patient home → Prompt 10
- ORPH-V2-03 — anonymous-research opt-in screen → Prompt 10 / Prompt 8
- ORPH-V2-04 — messaging code reads `effective_messaging_consent` → Prompt 4 / Prompt 8
- ORPH-V2-05 — drop `effective_messaging_consent` view 90d post-cutover → post-Prompt-11 cleanup mig

## Reviewer pushback log

This v2 reflects pushbacks from the war-room thread 2026-04-28. Two
were launch-blockers (Changes 1 and 2). Three were serious issues
(3, 4, 5). Three were gaps (8, 9, 10). Two were corrections to prior
locked decisions (6, 7). All accepted by Mo before this v2.

## What is NOT changed in v2

- Core architecture: phone-as-identity, per-clinic relationship row,
  directional cross-clinic data shares, privacy-code redemption,
  caregiver linkage, AI training one-way pipeline. All preserved.
- Migration step order: Steps 1–12 sequence is unchanged.
  Step 4.5 is bundled with mig 074 (no new mig number consumed).
- Mig number assignments: 071 → 082 unchanged.
- RLS cut-over posture: PERMISSIVE-mode 24h soak before Phase B,
  unchanged.
- Forward-compatibility shims (`is_pharmacy_member`, `is_lab_member`):
  unchanged.
- Cutover checklist: unchanged.

## Files touched

- `audits/patient-identity-schema-spec.md` — preamble, § 1, § 5, § 6,
  § 13, § 16, new § 16.1, § 17 (#2, #6, #7).
- `audits/patient-identity-migration-plan.md` — Step 1 (new 1.5 +
  reverse + post-conditions + body sketch), Step 3 (backfill SQL +
  Claim Migration subsection + test list), Step 4 (backfill SQL +
  test list), new Step 4.5, Step 6 (pre-conditions + body
  rewrite + verify spec + test list), Step 7 (pre-conditions +
  trigger spec + reverse + test list), Step 8 (pre-conditions),
  Step 9 (pre-conditions), "deliberately does NOT do" list.
- `audits/orphan-ledger.md` — five new Open Items.
- `audits/patient-identity-spec-v2-changelog.md` — this file (new).
