-- ============================================================================
-- Validation script for migrations 071 + 072 + 073 (global patient identity).
-- Run on staging immediately after applying all three migrations. Every
-- query has an expected output noted inline. If any query produces a
-- different shape, halt the rollout — Mo and the BUILD prompt author
-- review before proceeding.
--
-- Usage:
--   psql "$DATABASE_URL" -f scripts/validate-mig-071-072-073.sql
--
-- Renamed by Build 02 follow-up Fix 1 — was previously
-- validate-mig-071-072.sql; the migration set is now 071 + 072 + 073.
-- ============================================================================

\echo '═══════════════════════════════════════════════════════════════'
\echo '  Mig 071 — phone normalization validation (patients + users)'
\echo '═══════════════════════════════════════════════════════════════'

\echo '--- 1a. Every non-null patient phone normalized OR quarantined ---'
SELECT COUNT(*) AS unnormalized_unquarantined_patients
  FROM public.patients p
 WHERE p.phone IS NOT NULL
   AND p.normalized_phone IS NULL
   AND NOT EXISTS (
     SELECT 1 FROM public._phone_normalize_quarantine q
      WHERE q.table_name = 'patients' AND q.row_id = p.id
   );
-- Expect: 0

\echo '--- 1b. Every non-null user phone normalized OR quarantined ---'
SELECT COUNT(*) AS unnormalized_unquarantined_users
  FROM public.users u
 WHERE u.phone IS NOT NULL
   AND u.normalized_phone IS NULL
   AND NOT EXISTS (
     SELECT 1 FROM public._phone_normalize_quarantine q
      WHERE q.table_name = 'users' AND q.row_id = u.id
   );
-- Expect: 0

\echo '--- 2. Every normalized form matches E.164 regex (patients + users) ---'
SELECT
  (SELECT COUNT(*) FROM public.patients
    WHERE normalized_phone IS NOT NULL
      AND normalized_phone !~ '^\+[1-9][0-9]{6,14}$') AS bad_format_patients,
  (SELECT COUNT(*) FROM public.users
    WHERE normalized_phone IS NOT NULL
      AND normalized_phone !~ '^\+[1-9][0-9]{6,14}$') AS bad_format_users;
-- Expect: 0, 0

\echo '--- 3. Function output stable for known inputs ---'
SELECT
  public.normalize_phone_e164('01012345678')   = '+201012345678' AS local_canonical,
  public.normalize_phone_e164('+201012345678') = '+201012345678' AS e164_canonical,
  public.normalize_phone_e164('00201012345678')= '+201012345678' AS intl_canonical,
  public.normalize_phone_e164('010 1234 5678') = '+201012345678' AS spaces_canonical,
  public.normalize_phone_e164('+966512345678') IS NULL           AS rejects_saudi,
  public.normalize_phone_e164('01312345678')   IS NULL           AS rejects_prefix_013,
  public.normalize_phone_e164(NULL)            IS NULL           AS handles_null;
-- Expect: every column TRUE.

\echo '--- 4. Quarantine count by table (non-blocking; record only) ---'
SELECT table_name, COUNT(*) AS quarantine_count
  FROM public._phone_normalize_quarantine
 GROUP BY table_name
 ORDER BY table_name;

\echo ''
\echo '═══════════════════════════════════════════════════════════════'
\echo '  Mig 072 — dedup detection + _patient_dedup_plan validation'
\echo '═══════════════════════════════════════════════════════════════'

\echo '--- 5. Every duplicate cluster has a row in _patient_dedup_plan ---'
SELECT COUNT(*) AS missing_plan_rows
  FROM public._patient_phone_duplicates d
  LEFT JOIN public._patient_dedup_plan p ON p.normalized_phone = d.normalized_phone
 WHERE p.normalized_phone IS NULL;
-- Expect: 0

\echo '--- 6. Auto-resolved clusters have decided_at IS NOT NULL ---'
SELECT COUNT(*) AS auto_unsigned
  FROM public._patient_dedup_plan
 WHERE resolution = 'auto_oldest_wins' AND decided_at IS NULL;
-- Expect: 0

\echo '--- 7. Manual_review clusters needing Mo review (count must reach 0 before mig 073) ---'
SELECT COUNT(*) AS unresolved_manual_review
  FROM public._patient_dedup_plan
 WHERE resolution = 'manual_review' AND decided_at IS NULL;
-- Expect: 0 IF mig 073 is to proceed; >0 means mig 073 will refuse to run.

\echo '--- 8. winner_patient_id belongs to its cluster ---'
SELECT COUNT(*) AS winner_outside_cluster
  FROM public._patient_dedup_plan p
  JOIN public._patient_phone_duplicates d ON d.normalized_phone = p.normalized_phone
 WHERE NOT (p.winner_patient_id = ANY(d.patient_ids));
-- Expect: 0

\echo '--- 9. _user_phone_duplicates view is queryable ---'
SELECT COUNT(*) AS user_dup_clusters FROM public._user_phone_duplicates;
-- Recorded for reference; consumed by Prompt 3.

\echo ''
\echo '═══════════════════════════════════════════════════════════════'
\echo '  Mig 073 — global_patients + dedup-flag consumption validation'
\echo '═══════════════════════════════════════════════════════════════'

\echo '--- 10. Every cluster winner has is_canonical = TRUE ---'
SELECT COUNT(*) AS winners_not_canonical
  FROM public._patient_dedup_plan p
  LEFT JOIN public.patients pt ON pt.id = p.winner_patient_id
 WHERE pt.is_canonical IS DISTINCT FROM TRUE;
-- Expect: 0

\echo '--- 11. Every cluster loser has is_canonical = FALSE + points to winner ---'
SELECT COUNT(*) AS losers_misflagged
  FROM public._patient_dedup_plan p
  JOIN unnest(p.loser_patient_ids) WITH ORDINALITY l(loser_id, n) ON TRUE
  LEFT JOIN public.patients pt ON pt.id = l.loser_id
 WHERE pt.is_canonical IS DISTINCT FROM FALSE
    OR pt.duplicate_of_patient_id IS DISTINCT FROM p.winner_patient_id;
-- Expect: 0

\echo '--- 12. Every cluster has exactly one canonical winner ---'
SELECT COUNT(*) AS bad_clusters FROM (
  SELECT normalized_phone, COUNT(*) FILTER (WHERE is_canonical = TRUE) AS winners
    FROM public.patients
   WHERE normalized_phone IS NOT NULL
   GROUP BY normalized_phone
  HAVING COUNT(*) FILTER (WHERE is_canonical = TRUE) <> 1
) bad;
-- Expect: 0

\echo '--- 13. Every loser points to a real canonical winner with same phone ---'
SELECT COUNT(*) AS broken_pointers
  FROM public.patients p
  LEFT JOIN public.patients w ON w.id = p.duplicate_of_patient_id
 WHERE p.duplicate_of_patient_id IS NOT NULL
   AND (w.id IS NULL
        OR w.is_canonical IS NOT TRUE
        OR w.normalized_phone IS DISTINCT FROM p.normalized_phone);
-- Expect: 0

\echo '--- 14. global_patients count = canonical unique normalized_phones ---'
SELECT
  (SELECT COUNT(DISTINCT normalized_phone)
     FROM public.patients
    WHERE normalized_phone IS NOT NULL AND is_canonical = TRUE) AS canonical_unique_phones,
  (SELECT COUNT(*) FROM public.global_patients) AS global_patients_count,
  (SELECT COUNT(DISTINCT normalized_phone)
     FROM public.patients
    WHERE normalized_phone IS NOT NULL AND is_canonical = TRUE)
  = (SELECT COUNT(*) FROM public.global_patients) AS counts_match;
-- Expect: counts_match = TRUE

\echo '--- 15. Every backfilled global_patients row is unclaimed ---'
SELECT COUNT(*) AS leaked_claim
  FROM public.global_patients
 WHERE claimed = TRUE OR claimed_at IS NOT NULL OR claimed_user_id IS NOT NULL;
-- Expect: 0

\echo '--- 16. Every patients row with normalized_phone is linked ---'
SELECT COUNT(*) AS unlinked_patients
  FROM public.patients
 WHERE normalized_phone IS NOT NULL
   AND global_patient_id IS NULL;
-- Expect: 0

\echo '--- 17. Every linked global_patient_id resolves ---'
SELECT COUNT(*) AS dangling_pointers
  FROM public.patients p
  LEFT JOIN public.global_patients gp ON gp.id = p.global_patient_id
 WHERE p.global_patient_id IS NOT NULL
   AND gp.id IS NULL;
-- Expect: 0

\echo '--- 18. UNIQUE on global_patients.normalized_phone holds ---'
SELECT normalized_phone, COUNT(*) AS dup
  FROM public.global_patients
 GROUP BY 1
HAVING COUNT(*) > 1;
-- Expect: 0 rows

\echo '--- 19. patient_account_status ENUM exists with the spec values ---'
SELECT
  array_agg(enumlabel ORDER BY enumsortorder) AS enum_values
  FROM pg_enum e
  JOIN pg_type t ON t.oid = e.enumtypid
 WHERE t.typname = 'patient_account_status';
-- Expect: {active,suspended,locked,deceased,merged}

\echo '--- 20. global_patients.account_status uses the ENUM type ---'
SELECT a.attname AS column_name, pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public'
   AND c.relname = 'global_patients'
   AND a.attname = 'account_status';
-- Expect: account_status | patient_account_status

\echo '--- 21. RLS placeholder is in place (DENY-ALL to authenticated) ---'
SELECT polname, polcmd, pg_get_expr(polqual, polrelid) AS using_clause
  FROM pg_policy
 WHERE polrelid = 'public.global_patients'::regclass;
-- Expect: one row, polname='global_patients_deny_all', using_clause = 'false'

\echo '--- 22. Audit logs: PATIENT_DEDUP_FLAGGED fired for every loser ---'
SELECT
  (SELECT COUNT(*) FROM public.patients
    WHERE duplicate_of_patient_id IS NOT NULL) AS losers_count,
  (SELECT COUNT(*) FROM public.audit_events
    WHERE action = 'PATIENT_DEDUP_FLAGGED'
      AND metadata->>'source' = 'migration_073') AS audit_count;
-- Expect: losers_count = audit_count.

\echo '--- 23. Audit logs: GLOBAL_PATIENT_CREATED fired for every backfill ---'
SELECT
  (SELECT COUNT(*) FROM public.global_patients) AS gp_count,
  (SELECT COUNT(*) FROM public.audit_events
    WHERE action = 'GLOBAL_PATIENT_CREATED'
      AND metadata->>'source' = 'migration_073_backfill') AS audit_count;
-- Expect: gp_count = audit_count

\echo ''
\echo '═══════════════════════════════════════════════════════════════'
\echo '  Spot-check: 5 random patients (compare phone before/after)'
\echo '═══════════════════════════════════════════════════════════════'
SELECT
  p.id AS patient_id,
  p.phone AS raw_phone,
  p.normalized_phone,
  p.is_canonical,
  p.global_patient_id,
  gp.normalized_phone AS gp_phone,
  gp.account_status   AS gp_status
FROM public.patients p
LEFT JOIN public.global_patients gp ON gp.id = p.global_patient_id
ORDER BY random()
LIMIT 5;

\echo ''
\echo 'Validation complete. If every "Expect" matched, mig 071+072+073 are healthy.'
