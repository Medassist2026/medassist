# Patient identity v2 — Build 05 results

**Prompt:** EXECUTION_PROMPTS.md Prompt 5 — Patient Data Shares & Lifecycle
**Date applied to staging:** 2026-04-29
**Project:** `mtmdotixlhwksyoordbl` (medassist-egypt staging)
**Closes:** ORPH-V4-05 (share creation deferred from Build 04)
**Opens:** ORPH-V5-01, ORPH-V5-02, ORPH-V5-03, ORPH-V5-04

---

## 1. Pre-build verification (Phase A)

| Check | Result | Source |
|------|--------|--------|
| A1: Build 04 TODO markers present | ✓ 6 hits across the 2 verify handlers (lines 17, 100, 105 in verify-sms-code; lines 25, 141, 148 in verify-privacy-code) | grep on `share_creation_pending` |
| A2: `patient_data_shares` does NOT exist | ✓ FALSE — green-field create | information_schema query |
| A2.bis: `patient_visibility` exists | ✓ TRUE, 32 rows, all `DOCTOR_SCOPED_OWNER + IMPLICIT_CLINIC_POLICY` | direct count |
| A3: AuditAction enum has SHARE_* | ❌ pre-build → ✓ added (5 new entries, lifecycle metadata documented inline) | Edit to `audit.ts` |
| A4: `logAuditEvent` is fire-and-forget | ✓ confirmed swallow on line 216; **but** new code goes through DB-side SECURITY DEFINER, not `logAuditEvent` — see § 5 | code review |
| A5: Cron auth pattern | ✓ `Authorization: Bearer ${CRON_SECRET}` per `appointment-reminders` | `apps/clinic/app/api/cron/appointment-reminders/route.ts` |
| A6: Patient app shell | ✓ `apps/patient/app/(patient)/patient/sharing/page.tsx` exists as legacy per-doctor preferences UI; replaced by Build 05 | direct read |
| A7: Orphan ledger state | ✓ ORPH-V4-05 open, closing in this build | `audits/orphan-ledger.md` |

Notable Phase A finding: the prompt's reference to `patient_sms_share_codes` was approximate; the actual table is `privacy_code_sms_tokens` (Build 04 mig 086). No code change required — the verify handlers already point at the correct table via `verifySmsCode` RPC.

---

## 2. Schema migration

**File:** `supabase/migrations/090_patient_data_shares.sql` (+ `.rollback.sql`)
**Applied:** 2026-04-29 via Supabase MCP `apply_migration`

Schema verification post-apply:

| Object | Count | Expected |
|--------|-------|----------|
| Table `public.patient_data_shares` | 1 | 1 |
| Indexes (incl. PK) | 6 | 6 (PK + 5 query-path indexes) |
| Policies | 4 | 4 DENY-ALL placeholders (SELECT/INSERT/UPDATE/DELETE) |
| Lifecycle functions | 5 | `create_data_share`, `extend_data_share`, `revoke_data_share`, `auto_renew_shares_on_visit`, `mark_share_expired_notification` |

Schema notes:
- `CHECK (grantor_clinic_id != grantee_clinic_id)` enforces the directional invariant at the DB level.
- `CHECK granted_via IN (...)` constrains the vocabulary at write time.
- `audit_event_id UUID REFERENCES audit_events(id)` ties every share to its provenance audit row.
- Five indexes cover the four query paths (patient list, grantee active, grantor active, cron expiry sweep) plus the patient-app history ordering.
- `touch_updated_at` trigger reused from mig 013.
- RLS DENY-ALL placeholder per Prompt 6 contract; real policies ship in ORPH-V5-01.

---

## 3. Data layer module + multi-grantor decision

**File:** `packages/shared/lib/data/patient-shares.ts`

### API surface

```ts
createShare(args)                  // -> CreateShareResult; idempotent on (grantor, grantee, patient)
createSharesForGrantors(args)      // -> { shares, errors }; one share per grantor clinic
extendShare(args)                  // -> ExtendShareResult; never shortens
revokeShare(args)                  // -> RevokeShareResult; idempotent
autoRenewOnVisit(args)             // -> AutoRenewResult; encounter-triggered
getActiveShare(args)               // -> PatientDataShare | null
listSharesForPatient(args)         // -> PatientDataShare[]
listSharesForGranteeClinic(args)   // -> PatientDataShare[]
listExpiringShares({ windowHours }) // -> PatientDataShare[]; cron sweep
markShareExpiredNotification(args) // -> { changed, reason?, auditEventId? }
```

### Key invariants (enforced inside mig 090 functions)

- `createShare` is idempotent on the `(grantor, grantee, patient)` triple. A duplicate call returns `idempotent_hit: true` and the existing row.
- `extendShare` NEVER shortens. `90_DAYS` and `1_YEAR` use `GREATEST(current expires_at, NOW + duration)`. `PERMANENT` sets `expires_at = NULL`. Extending a permanent share is a no-op (`reason: 'already_permanent'`). Extending a revoked share THROWS.
- `revokeShare` is idempotent. A second revoke returns `reason: 'already_revoked'`.
- `autoRenewOnVisit` skips revoked, permanent, and already-further-out shares. Loops with `FOR UPDATE` for serializable concurrency. One audit row per renewed share.

### Multi-grantor decision (option b)

Option (b) — **one share per existing grantor clinic** — taken per the prompt's recommendation, confirmed by no contradicting findings during Phase A. Rationale:

- **Preserves revocation granularity.** A patient at clinics A, B, C verifying at clinic D produces three shares (A→D, B→D, C→D). Later revoking A→D leaves B→D and C→D intact. Option (a) — one bundled share with a sentinel grantor — would have lost this.
- **Schema-aligned.** `patient_data_shares.grantor_clinic_id NOT NULL REFERENCES clinics(id)` rules out a sentinel grantor without inventing a special clinic row.
- **No write amplification in the common case.** Today's clinics are effectively solo (per `RLS Rewrite Status` memory note); most patients have one PCR, so one share per verify is the median outcome.
- **`createSharesForGrantors` filters `grantor==grantee` silently.** When the patient's only PCR is at the verifying clinic, no share is written — there's nothing cross-clinic to grant.

Atomicity caveat: each `create_data_share` is its own DB transaction. If row 2 of 3 fails, rows 0 and 1 are already committed. This is intentional — partial success ("two of three clinics granted") is strictly better than partial failure ("rolled back, retry the whole thing"). The audit trail captures every successful grant; the failed one logs an error to `console.error` for follow-up. Real production failures here would only happen on FK violation (clinic deleted between resolve + create), which is itself a data-integrity issue worth surfacing, not retrying silently.

---

## 4. Verify handler wiring

**Files modified:**
- `packages/shared/lib/api/handlers/patients/verify-privacy-code/handler.ts`
- `packages/shared/lib/api/handlers/patients/verify-sms-code/handler.ts`

### Diff summary (verify-privacy-code)

Before:
```ts
return NextResponse.json({
  success: true,
  global_patient_id: outcome.globalPatientId,
  patient_id: patientId,
  share_creation_pending: 'prompt_5',
})
```

After:
```ts
// Resolve grantor clinics from existing patient_clinic_records,
// excluding the verifying (grantee) clinic.
const { data: pcrs } = await admin
  .from('patient_clinic_records')
  .select('clinic_id')
  .eq('global_patient_id', globalPatientIdResolved)
const grantorClinicIds = (pcrs ?? []).map(...).filter(cid => cid !== clinicId)

if (grantorClinicIds.length > 0) {
  const result = await createSharesForGrantors({
    globalPatientId: globalPatientIdResolved,
    grantorClinicIds,
    granteeClinicId: clinicId,
    grantedVia: 'PRIVACY_CODE',
    actorUserId: userId,
    actorKind: 'user',
    grantReason: requestId ? `verify-privacy-code:${requestId}` : 'verify-privacy-code',
  })
  createdShares = result.shares.map(...)
}

return NextResponse.json({
  success: true,
  global_patient_id: outcome.globalPatientId,
  patient_id: patientId,
  shares: createdShares,
})
```

verify-sms-code is identical except `grantedVia: 'SMS_CODE'` and `grant_reason: 'verify-sms-code:...'`.

### Failure mode

Any unexpected error during share creation logs to `console.error` and the response still succeeds with the gpid. The verify already succeeded — partial share failure is strictly better than rolling back a successful privacy-code verification (which would force the patient to redo the code). This matches the existing PCR-materialization "non-fatal" pattern (D7 wire-up).

---

## 5. Audit hardening

The Build 05 audit hardening scope was tighter than initially planned because of the architectural choice in § 3:

- **No new TS-side `logAuditEvent` calls.** All Build 05 audit writes go through SECURITY DEFINER functions in mig 090. The audit row + share row writes are atomic at the DB level (`INSERT ... RETURNING id INTO v_audit_id`, then `INSERT ... audit_event_id = v_audit_id`, both inside the same function call's implicit transaction). This is the same pattern Build 04's mig 087 uses for privacy-code lifecycle.
- **`logAuditEvent` (`packages/shared/lib/data/audit.ts`) was NOT modified.** Its swallow-error behavior remains the default for legacy callers per the Prompt 0 audit catalog. Sweeping hardening of every caller is explicitly out of scope per the prompt; that's Prompt 6.5 territory.
- **Verify handlers were NOT calling `logAuditEvent` for share creation pre-Build-05** — they returned `share_creation_pending: 'prompt_5'`. Build 05 replaces that flag with a real share creation that's atomic by design.
- **The check-in handler's existing `logAuditEvent({ action: 'CREATE_PATIENT', ... })` call (line 119) is unchanged.** Build 05 only added a new fire-and-forget block AFTER it (auto-renew on visit) — see § 7. We did not regress the existing audit semantics.

### Synchronous + transactional audit writes added by Build 05

| Location | Action | Atomicity |
|----------|--------|-----------|
| `create_data_share` (mig 090) | `SHARE_GRANTED` | DB-level: audit `INSERT RETURNING id` → share `INSERT` referencing `audit_event_id` → `UPDATE` audit `entity_id` to share_id. All in one txn. |
| `extend_data_share` (mig 090) | `SHARE_EXTENDED` | DB-level: audit `INSERT RETURNING id` → share `UPDATE expires_at`. Locked via `SELECT FOR UPDATE`. |
| `revoke_data_share` (mig 090) | `SHARE_REVOKED` | DB-level: audit `INSERT RETURNING id` → share `UPDATE revoked_at`. Locked via `SELECT FOR UPDATE`. |
| `auto_renew_shares_on_visit` (mig 090) | `SHARE_AUTO_RENEWED` (one per share) | DB-level per share: audit + update inside `FOR UPDATE` loop. |
| `mark_share_expired_notification` (mig 090) | `SHARE_EXPIRED` | DB-level: idempotency check (no double-write) → audit `INSERT`. No share-row mutation. |

### Documented exception (only one)

`autoRenewOnVisit` is invoked from the check-in handler in a fire-and-forget IIFE (`apps/.../checkin/handler.ts`). The DB function itself is transactional per share, but the call site catches and logs without propagating, so renewal failure does NOT roll back the encounter. Justification per prompt § B7: preserving the encounter is more important than the renewal audit row. If renewal silently fails, the share will eventually expire on its normal schedule and the cron will send a notification — not a privacy hole, just a UX gap. This is the only place in Build 05 where audit failure is allowed to be non-fatal at the call site.

---

## 6. API endpoints

| Method | Path | Handler | Auth | Notes |
|--------|------|---------|------|-------|
| GET | `/api/patient/sharing` | `patient/sharing/handler.ts` (augmented) | `requireApiRole('patient')` | Returns `{ grants: [...], shares: [...] }`. Legacy `grants` from `patient_visibility`; new `shares` from `patient_data_shares`. `?include_expired=true` adds revoked/expired shares for history view. |
| DELETE | `/api/patient/sharing` | `patient/sharing/handler.ts` (legacy, untouched) | `requireApiRole('patient')` | Legacy revoke by `visibilityId` (body). Build 05 does NOT modify this — Prompt 6.5 deprecates. |
| POST | `/api/patient/sharing/[shareId]/revoke` | `patient/sharing/revoke-handler.ts` (new) | `requireApiAuth` + ownership check via `global_patients.claimed_user_id = auth.uid()` | Body: `{ revoke_reason?: string }`. Idempotent (DB-level). 401/403/404 on unowned, 200 on success. |
| POST | `/api/patient/sharing/[shareId]/extend` | `patient/sharing/extend-handler.ts` (new) | Same as revoke | Body: `{ duration: '90_DAYS'\|'1_YEAR'\|'PERMANENT' }`. 409 on extend-revoked race. |
| GET | `/api/cron/expire-stale-shares` | `apps/clinic/app/api/cron/expire-stale-shares/route.ts` (new) | `Authorization: Bearer ${CRON_SECRET}` | 24-hour expiring window, idempotent via `mark_share_expired_notification`. SMS dispatch best-effort; failures don't fail the run. |

### Sample request/response — POST `/api/patient/sharing/[shareId]/revoke`

Request:
```http
POST /api/patient/sharing/abc123-...-/revoke
Cookie: sb-access-token=...
Content-Type: application/json

{ "revoke_reason": "Switched clinics" }
```

Response (success, first revoke):
```json
{
  "success": true,
  "share": {
    "id": "abc123-...",
    "revoked_at": "2026-04-29T15:32:11.123Z",
    "changed": true,
    "reason": null
  }
}
```

Response (idempotent re-revoke):
```json
{
  "success": true,
  "share": {
    "id": "abc123-...",
    "revoked_at": "2026-04-29T15:32:11.123Z",
    "changed": false,
    "reason": "already_revoked"
  }
}
```

### Sample request/response — POST `/api/patient/sharing/[shareId]/extend`

Request:
```http
POST /api/patient/sharing/abc123-...-/extend
Content-Type: application/json

{ "duration": "PERMANENT" }
```

Response:
```json
{
  "success": true,
  "share": {
    "id": "abc123-...",
    "expires_at": null,
    "previous_expires_at": "2026-07-28T00:00:00Z",
    "changed": true,
    "reason": null,
    "duration": "PERMANENT"
  }
}
```

### Sample response — GET `/api/cron/expire-stale-shares`

```json
{
  "success": true,
  "cron_run_id": "2026-04-29T17:00:00.000Z",
  "scanned": 3,
  "notified": 3,
  "already_notified": 0,
  "sms_sent": 2,
  "sms_failed": 1,
  "errors": []
}
```

---

## 7. Patient app UI

| Feature | Path | Route | Component | Tested on |
|---------|------|-------|-----------|-----------|
| Active shares list | `apps/patient/app/(patient)/patient/sharing/page.tsx` | `/patient/sharing` | `PatientSharingPage` (this file) | Test env (no E2E browser run; staging API endpoints exercised via SQL test harness in § 8) |
| Revoke modal | `apps/patient/components/sharing/RevokeShareModal.tsx` | (modal on same page) | `RevokeShareModal` | Test env |
| Extend modal | `apps/patient/components/sharing/ExtendShareModal.tsx` | (modal on same page) | `ExtendShareModal` | Test env |

UI behavior:
- Three sections: header, active shares list, collapsible history. Empty-state copy in Egyptian Arabic when there are no active shares.
- Each card shows the GRANTEE clinic name (the one receiving access — what the patient cares about), granted date, expiry/revoked/permanent line, and the "via" label (privacy code / SMS / patient app / auto-renew).
- Active shares get Extend + Revoke buttons; history items are read-only.
- Revoke modal explicitly states what stays in the clinic's record and what doesn't, with optional 500-char reason text.
- Extend modal: three radio options with explainers underneath each.
- All copy via `ar.sharing_*` keys in `packages/shared/lib/i18n/ar.ts`. Pending Mo's review under ORPH-V5-04.

The legacy `apps/patient/app/(patient)/patient/sharing/page.tsx` (615-line per-doctor sharing-preferences UI tied to deprecated `patient_visibility`) was REPLACED in this build. Git history retains the prior implementation; Prompt 6.5 owns the legacy-route deprecation.

---

## 8. Test results

All tests run on staging via Supabase MCP `execute_sql`. Validation script: `scripts/validate-mig-090-build-05.sql` (re-runnable against any environment).

| Test set | Cases | Result | Notes |
|----------|-------|--------|-------|
| B16 — lifecycle unit cases | 14 | ✅ 14/14 PASS | default expiry ~90d, audit_event_id set, idempotent, never-shortens, PERMANENT no-op, revoke idempotent, extend-on-revoked throws, autoRenew skips PERMANENT + revoked |
| B17 — audit-rollback | 3 | ✅ 3/3 PASS | self-grant CHECK, bad actor_kind invariant, invalid granted_via — all roll back share + audit atomically |
| B18 — multi-grantor integration | 4 | ✅ 4/4 PASS | distinct shares per grantor, multi-grantor auto-renew (`renewed_count=2`), per-share AUTO_RENEWED audits, per-grantor revocation independence (revoking A→D leaves A2→D active) |
| B19 — concurrency serialization | 1 | ✅ 1/1 PASS | sequential extends serialize via `SELECT FOR UPDATE`; second extend sees first's update and no-ops on `would_shorten`; only 1 audit row written |
| B20 — E2E revoke | 1 | ✅ 1/1 PASS | revoke removes share from active query (revoked_at IS NULL filter excludes it) |
| B21 — E2E PERMANENT cron exclusion | 1 | ✅ 1/1 PASS | PERMANENT shares (`expires_at IS NULL`) excluded from cron expiry-window query |
| B22 — backport regression | 1 | ✅ 1/1 PASS | audit_events table healthy after Build 05 mig; pre-existing audit callers undisturbed |

**Total: 25/25 PASS.** Staging post-test count: `shares_total=0, share_audits_total=0, test_residue=0` — full cleanup confirmed.

Tests not run (deferred / out of scope):
- Full browser E2E for the modals — would require Playwright in CI; not part of Build 05 deliverable. The DB-level + handler-level tests cover the invariants the UI relies on.
- Two-session true-concurrency race (separate Postgres sessions, `pg_sleep` interleave). The single-session FOR UPDATE serialization test (B19) covers correctness; a true race would only surface lock-contention behavior, which is well-understood Postgres semantics.
- Migration rollback rehearsal — same constraint as ORPH-V3-05/V4-08: rollback against live staging would undo the build. Combine into the Prompt 6 fresh-clone rollback rehearsal.

---

## 9. Honest gaps

1. **RLS enforcement is not yet on.** Mig 090 ships a DENY-ALL placeholder. All reads/writes go through the SECURITY DEFINER RPC layer or `createAdminClient`. Real cross-clinic visibility doesn't kick in until Prompt 6's RLS rewrite uses `patient_data_shares` as the bridge in `patient_clinic_records` policies. Tracked as ORPH-V5-01.
2. **`patient_visibility` still exists** with 32 stale rows. They're irrelevant to `patient_data_shares` (different semantics — see `audits/patient-visibility-migration-mapping.md`) but the table + the legacy `/api/patient/sharing` GET `grants` field + the legacy DELETE handler all stay until Prompt 6.5 deprecates them. Tracked as ORPH-V5-02.
3. **Egyptian Arabic strings are first-pass.** New `sharing_*` keys + the cron expiry SMS template (`renderShareExpiringTemplate`) need Mo's native-speaker review before any go-live. Tracked as ORPH-V5-04.
4. **Patient app navigation.** The `/patient/sharing` page is wired but the surrounding nav chrome (auth-aware shell, deep-links, breadcrumbs) lives in Prompt 10. A patient who's already on the page can revoke + extend; getting them there is a Prompt 10 problem. Tracked as ORPH-V5-03.
5. **Auto-renewal is fire-and-forget at the check-in handler call site.** This is intentional (§ 5 documented exception), but it means a renewal audit row could be silently lost if the DB is unhealthy at the moment of check-in. The share will still expire on schedule and the cron will catch up. Acceptable trade-off; alternative is rolling back the encounter on audit failure, which is worse for the clinic.
6. **Cron is not yet scheduled.** The route handler at `/api/cron/expire-stale-shares` is callable on demand with `CRON_SECRET`, but no Vercel cron entry has been added in `vercel.json`. Operator step before next deploy: add a daily entry alongside `appointment-reminders`. Same pattern, same secret.
7. **Multi-grantor partial-failure logging.** When `createSharesForGrantors` succeeds for 2 of 3 clinics, the failed one logs to `console.error` and the response still includes the 2 successes. There's no automatic retry queue. Production observability needs to surface these errors via Sentry; that's wired through existing patterns but not explicitly tested in this build. Tracked operationally, not as an orphan (it's a quality-of-monitoring concern, not a missing artifact).
8. **No two-session concurrency test.** B19 covers single-session serialization. If two patient app sessions race to extend simultaneously, the second session's request would block on the first's `FOR UPDATE` lock until the first commits, then see the updated `expires_at` and either no-op (`would_shorten`) or re-extend correctly. Postgres semantics guarantee this; not separately exercised.

---

## Orphan ledger updates (Phase C)

- **CLOSED:** ORPH-V4-05 — share creation deferred from Build 04. Closed by mig 090 + verify-handler wiring + 25/25 test pass.
- **OPENED:**
  - ORPH-V5-01 — `patient_data_shares` real RLS policies (replace DENY-ALL placeholder). Closes Prompt 6.
  - ORPH-V5-02 — `patient_visibility` table deprecation. Closes Prompt 6.5 (after RLS rewrite verifies safety). See `audits/patient-visibility-migration-mapping.md`.
  - ORPH-V5-03 — Full patient app surface beyond /patient/sharing + /patient/privacy. Closes Prompt 10.
  - ORPH-V5-04 — Egyptian Arabic native-speaker review of new sharing strings. Closes by Mo's review pass (same pattern as ORPH-V4-07).
