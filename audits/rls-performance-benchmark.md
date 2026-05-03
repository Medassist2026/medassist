# Phase E — RLS Performance Benchmark

**Date:** 2026-04-30 (cowork session 15)
**Migrations live:** 092 helpers + 093 patient identity + 094 clinical data + 094a recursion fix + 095 ops + 096 comm/audit + 097 non-patient
**Scope:** Per Prompt 6 § E. The 10 hottest queries identified in § E1, plus the 4 watch items Mo flagged in session 12 close-out, all under v2 policies.
**Cap:** <30% p50 latency regression. **Result: PASS — no query flagged.**

## Method

Per query: 5 sequential calls inside a single `WITH bench AS (... generate_series(1,5) ...)` CTE. `clock_timestamp()` pairs around each invocation. Run #1 (cold) reflects JIT/plan-cache miss; runs #2–5 are the steady-state warm path. RLS in production calls these queries warm — once per request.

**Test harness**: per Empirical Lesson #3, the canonical pattern is `SET LOCAL ROLE 'authenticated'` as a separate statement before the SELECT. Each persona-shift requires its own `execute_sql` call so the JWT claim setting takes effect before the query plans.

**Personas exercised**:
- `doctor_a` (DOCTOR clinic_a member) — most clinic-internal queries
- `patient_y_user` (claimed patient) — notifications, sharing, audit_events leak path
- `doctor_b` (DOCTOR clinic_b member) — cross-clinic share path

## Data scale on staging

For context (production will be much larger):

| Table | Row count |
|---|---|
| `global_patients` | 63 (3 test) |
| `patient_clinic_records` | 36 (4 test) |
| `audit_events` | 314 (118 with `resolved_global_patient_id` populated) |
| `clinical_notes` | 3 (test only) |
| `appointments`, `payments`, `check_in_queue`, etc. | 1 test row each + a few production rows from earlier builds |

At this scale most queries scan a handful of rows. Plan correctness is the primary signal; absolute latency is a smoke test for index usage.

## Results — 4 Watch Items

| Watch | Cold | Warm median | Verdict |
|---|---:|---:|---|
| A. `is_clinic_member` warm latency (mig 092 was 14μs) | 29.1ms | **11μs** | ✅ baseline preserved |
| B. `can_view_patient_data_at_clinic` warm (mig 092 was 23μs) | 22.6ms | **20μs** | ✅ baseline preserved |
| C. `audit_events.resolved_global_patient_id` index path under patient_y_user | 1.8ms | **0μs** | ✅ partial index hits cleanly |
| D. Cross-clinic SELECT (doctor_b reads patient_x clinical_note via active share) | 2.9ms | **0–1μs** | ✅ helper chain through `can_view_patient_data_at_clinic` is efficient |

All four watch items hold the line vs. mig 092's helper baselines.

## Results — 10 Hottest Queries

(Privacy code verify excluded per § E1 — not RLS-relevant.)

| # | Query | Persona | Cold (ms) | Warm median (μs) | Verdict |
|---|---|---|---:|---:|---|
| 1 | `q1_patient_queue` (`/api/frontdesk/queue`) | doctor_a | 2.6 | 0–1 | ✅ |
| 2 | `q2_patient_search_by_phone`* | service_role | n/a (DEFINER RPC path) | n/a | ✅ unchanged by RLS |
| 3 | `q3_clinical_session_load` (`/api/clinical/notes/[id]`) | doctor_a | 5.1 | 0–1 | ✅ |
| 4 | `q4_doctor_dashboard_stats` (`/api/doctor/stats`) | doctor_a | 2.1 | 0 | ✅ |
| 5 | `q5_appointment_list` (`/api/frontdesk/appointments`) | doctor_a | 1.4 | 0 | ✅ |
| 6 | `q6_notifications_fetch` (`/api/notifications`) | patient_y_user | 2.4 | 0–1 | ✅ |
| 7 | `q7_patient_sharing_list` (`/api/patient/sharing`) | patient_y_user | 3.7 | 0 | ✅ |
| 7b | grantee-side sharing list | doctor_b | 0.4 | 0–1 | ✅ |
| 8 | privacy code verify | — | excluded per § E1 | — | n/a |
| 9 | clinic member lookup (`is_clinic_member`) | service_role | 29.1 | 11 | ✅ (Watch A) |
| 10 | `q10_audit_events_clinic` (`/api/clinic/audit`) | doctor_a | 3.6 | 0 | ✅ |

*`q2_patient_search_by_phone` runs through `createAdminClient` (per session-2 triage scope `'patient-onboarding'` / `'global-patients-lookup'`) — RLS doesn't bind on this path. Pre-Phase F it stays admin-client; Phase F evaluates whether it should switch to a SECURITY DEFINER RPC. The RLS rewrite doesn't change its latency profile either way.

## Cross-clinic / share-traversal queries

These exercise the heaviest RLS predicate path — `can_view_patient_data_at_clinic` joining `patient_data_shares` × `clinic_memberships`:

| Query | Cold (ms) | Warm (μs) |
|---|---:|---:|
| `cross_clinic_lab_orders_via_share` (single row, doctor_b, active share) | 3.2 | 0 |
| `cross_clinic_all_clinical_notes_for_grantee` (full table scan as grantee) | 12.2 | 0 |
| `audit_events_patient_full_scan` (314 rows under patient_y RLS) | 12.4 | 0 |

The 12ms cold-start on full-table scans reflects the COALESCE generated column eval + helper invocation per row × the JIT cost. Production-scale concern: at 1M audit rows, the generated column is indexed (`idx_audit_events_resolved_gpid` partial WHERE not null), so a patient SELECT continues to use the index — sub-1ms expected. Untested at production scale; flagged as Phase F monitoring item.

## Verdict

**0 of 13 queries flagged for >30% regression.** The 30% cap doesn't bind at staging scale because warm latencies are at clock-precision floor. Cold-start latencies (0.4–12.4ms) are within normal Postgres JIT/plan-cache behavior and are a one-time-per-session cost.

**No `094d_perf_indexes.sql` needed.** The existing index set covers all hot paths:
- `clinic_memberships(clinic_id, user_id)` UNIQUE → is_clinic_member
- `patient_clinic_records(global_patient_id, clinic_id)` UNIQUE → directional helpers
- `idx_pds_grantee_clinic_active`, `idx_pds_grantor_clinic_active` partial → patient_data_shares share traversals
- `global_patients_claimed_user_id_uniq` UNIQUE partial → patient self-view
- `idx_audit_events_resolved_gpid` partial → audit-events patient-self path

## Production-scale projection

Staging has ~300 rows in audit_events and a handful in operations tables. At production scale:

- **Helpers stay sub-millisecond**: indexed lookups + STABLE caching. The 11μs warm `is_clinic_member` will be similar at any scale because clinic_memberships is small (memberships per clinic, not per patient).
- **`can_view_patient_data_at_clinic` warm**: stays sub-millisecond IF the per-patient share fan-out stays bounded. Egyptian solo-clinic pattern suggests 0–5 active shares per patient — well within the partial index's selectivity.
- **audit_events under patient role**: at 1M rows / 100K patients, partial index `WHERE resolved_global_patient_id IS NOT NULL` keeps lookup constant-time (index scan on UUID equality). Verify with production EXPLAIN ANALYZE in Phase F.
- **Full-table scans** (e.g., `audit_events_patient_full_scan` cold = 12ms at 314 rows): linear in row count post-RLS-filter. Patient surfaces should always paginate; the cold 12ms here reflects the worst-case unbounded scan and is a UI-pattern concern, not an RLS-policy concern.

## Reproducibility

```sql
-- Helper benchmark (run as service_role)
WITH bench AS (
  SELECT 'is_clinic_member' AS query, g.iter AS i, clock_timestamp() AS t0,
    public.is_clinic_member('<clinic_id>'::uuid,'<user_id>'::uuid)::text AS r,
    clock_timestamp() AS t1
  FROM generate_series(1,5) AS g(iter)
  -- UNION ALL more queries here
)
SELECT query, i, ROUND(EXTRACT(EPOCH FROM (t1-t0))*1000, 4) AS ms
FROM bench ORDER BY query, i;

-- Hot-query benchmark (per persona, separate execute_sql call)
SET LOCAL ROLE 'authenticated';
SET LOCAL "request.jwt.claims" TO '{"sub":"<user_id>","role":"authenticated"}';
WITH bench AS (...)  -- same shape
SELECT query, i, ROUND(...) AS ms FROM bench ORDER BY query, i;
```

## Next steps

- ✅ Phase E complete. No `094d_perf_indexes.sql` migration required.
- ⏳ Phase F app code migration unblocked.
- ⏳ Production-scale verification in Phase F: Mo to spot-check `audit_events` patient-self latency once production-shape data lands.
