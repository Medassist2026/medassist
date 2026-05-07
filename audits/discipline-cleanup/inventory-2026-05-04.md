# Discipline Cleanup — Working Tree Inventory

**Date:** 2026-05-04 (Session 1, audit detour Day 2)
**HEAD:** `52aa44a` (`docs: update ARCHITECTURE.md and DECISIONS_LOG.md to current state`)
**Branch:** `main`, 7 commits ahead of `origin/main` (push held)
**Tracked file count:** 764
**Modified-tracked:** 11 files (prompt said 13 — 2-file drift, almost certainly absorbed by recent commits during audit Day 1)
**Untracked:** ~50 paths (some are directories with multiple files inside)

---

## Scope key

| Code | Scope | Commit destination |
|------|-------|--------------------|
| **A** | check-in feature surface (Build 04 D7 unlock UI, auto-renew on visit) | A-side hunks → B04, B-side hunks → B05 |
| **B** | privacy-code + identity infrastructure (Build 02-04 lineage) | **B04** commit |
| **B'** | sharing lifecycle (Build 05) | **B05** commit |
| **C** | admin/service-role endpoints (global-patients-lookup, patient-clinic-records) | folds into **B04** (identity-infra dependency) |
| **D** | scratch / build artifacts | discard / .gitignore |
| **E** | unclear, requires Mo ruling | per-item ruling |

> **Why C folds into B04:** the two admin endpoints are used by ops/verification tooling for the new identity layer (global_patients, patient_clinic_records). They share `requireServiceRole()` (`session.ts` mod) and the `'global-patients-lookup'` admin scope (`admin.ts` mod). Splitting C from B04 would leave B04 referring to symbols that don't exist yet.

---

## Modified-tracked files (11)

### 1. `apps/clinic/app/(frontdesk)/frontdesk/checkin/page.tsx` — **Scope A → B04**
**Delta:** +186 / -9. Adds privacy-code unlock surface to the front-desk check-in page:
- New imports: `Lock` icon, `normalizeEgyptianPhone` (Scope B), `ar` strings, `PrivacyCodeEntryModal` (Scope B).
- New state: `clinicId`, `unlockModalOpen`, `unlockPhone`, `unlocked`. New `loadClinicId()` fetches `/api/frontdesk/profile` to get the active clinic.
- "patient not found" branch: now renders **two** CTAs when input is phone-shaped — "Request access" (opens privacy-code modal) AND existing "Register new patient". When input is name-shaped, unchanged.
- Modal mounted unconditionally (visibility via `open` prop); on unlock success → navigates to `/frontdesk/patients/register?phone=...&unlocked=1` (the register page does NOT yet read `?phone=` — flagged as follow-up in source comment).
- Privacy-invariant comment explicit: this branch must render identically for "patient at another clinic" vs "patient at no clinic" — no leaky API call.

**Coupling:** imports from untracked `phone-normalize.ts` and `apps/clinic/components/frontdesk/PrivacyCodeEntryModal.tsx`. Cannot commit standalone; both must land in B04.

### 2. `apps/clinic/vercel.json` — **Scope B' → B05**
**Delta:** +4. Adds Vercel Cron entry for `/api/cron/expire-stale-shares` daily at 02:00 UTC.

**Coupling:** the route file `apps/clinic/app/api/cron/expire-stale-shares/route.ts` is untracked (Scope B'). Must land together in B05.

### 3. `apps/patient/app/(patient)/patient/sharing/page.tsx` — **Scope B' → B05**
**Delta:** +332 / -576 (full rewrite). Replaces the legacy per-doctor `patient_visibility` UI (medication / condition / lab toggles) with the new `patient_data_shares` lifecycle UI:
- Three sections: Active shares, History (collapsed by default), Empty state.
- Data source: `GET /api/patient/sharing → { shares: [...] }`. Ignores the legacy `grants` field (per the handler diff, the API now returns BOTH).
- New imports: `RevokeShareModal`, `ExtendShareModal` from `@/components/sharing/*` (untracked).

**Coupling:** imports two untracked modal components. Must land together in B05.

### 4. `packages/shared/lib/api/handlers/frontdesk/checkin/handler.ts` — **Scope A → B05**
**Delta:** +41. Adds Build 05 § B7 auto-renew-on-visit logic: after the encounter row inserts, fires `autoRenewOnVisit({ globalPatientId, granteeClinicId, encounterId })` in a fire-and-forget async block. Resolves `gpid` via `admin.from('patients').select('global_patient_id')`.

**Latent issue (per uncommitted-changes audit, NOT to be fixed in this session):** uses `createAdminClient('auto-renew-on-visit-gpid-lookup')`, which is **NOT** in the `ALLOWED_ADMIN_SCOPES` set in `admin.ts`. Result is a `console.warn` only (admin.ts validation is non-blocking) — runtime works. Phase F follow-up territory.

**Coupling:** imports `autoRenewOnVisit` from untracked `patient-shares.ts`. Must land in B05.

### 5. `packages/shared/lib/api/handlers/patient/sharing/handler.ts` — **Scope B' → B05**
**Delta:** +81 / -3. Extends `GET /api/patient/sharing` to return both legacy `grants` AND new `shares` (Build 05 § B10 hybrid response). New shares enrichment loop: resolves `gpid` via `global_patients.claimed_user_id = user.id`, calls `listSharesForPatient`, joins clinic names, computes `is_active` and `is_permanent`. Supports `?include_expired=true` for history view. Wrapped in try/catch — enrichment failure is non-fatal.

**Coupling:** imports `listSharesForPatient` from untracked `patient-shares.ts`. Must land in B05.

### 6. `packages/shared/lib/auth/session.ts` — **Scope C → B04**
**Delta:** +48. Adds `requireServiceRole(request)` — bearer-token check against `process.env.SUPABASE_SERVICE_ROLE_KEY`, timing-safe compare via `node:crypto`. Throws `ApiAuthError(401)` for missing header / wrong token / missing env var (deliberately 401 not 500 to avoid leaking config state).

**Used by:** untracked `admin/global-patients-lookup/handler.ts` and `admin/patient-clinic-records/handler.ts`. Lands with B04 because those handlers are part of the identity infrastructure the privacy code feature depends on.

### 7. `packages/shared/lib/data/audit.ts` — **Scope shared → B04**
**Delta:** +210 / -1. Adds ~25 new entries to the `AuditAction` union for Build 02-05 audit actions:
- Build 02 (mig 071-073): `PATIENT_DEDUP_FLAGGED`, `GLOBAL_PATIENT_CREATED`
- Build 03 (mig 073.5-077): `PATIENT_CLINIC_RECORD_CREATED`, `QUARANTINE_RESOLVED_PATH_A/B`, `USER_DEDUP_FLAGGED`, `USER_DEDUP_CROSS_SIDE_MISMATCH`, `USER_DEDUP_LARGE_CLUSTER_AUTO_RESOLVED`, `DATA_LAYER_CUTOVER_COMPLETE`
- Build 04 (mig 082-087): `QUARANTINE_RECOVERED`, `RECOVERY_FAILED`, `RECOVERY_COLLIDED`, `PRIVACY_CODE_REGENERATED`, `PRIVACY_CODE_ATTEMPT_SUCCESS/FAILURE`, `PRIVACY_CODE_LOCKED`, `MESSAGING_RECONSENT_*`, more.

Some actions belong to B05 (sharing-lifecycle audits like `SHARE_GRANTED`, `SHARE_REVOKED`, `SHARE_EXPIRED`, `SHARE_AUTO_RENEWED`). Splitting hunks of this file would be artificial — assigning the whole file to **B04** so B04 typechecks cleanly; B05 inherits the additions transparently.

### 8. `packages/shared/lib/data/messaging-consent.ts` — **Scope B → B04**
**Delta:** +163. Adds:
- `EffectiveMessagingConsent` interface
- `readEffectiveMessagingConsent({ globalPatientId, clinicId })` — reads `effective_messaging_consent` view (created by mig 083, the grace-period bridge)
- `listClinicsNeedingReconsent(globalPatientId)` — drives the per-clinic re-consent loop UI

Used by untracked `patient/messaging-reconsent/handler.ts` (Build 04 § B17).

### 9. `packages/shared/lib/i18n/ar.ts` — **Scope shared → B04**
**Delta:** +101. Adds Egyptian-Arabic strings for: privacy code modal (front-desk), patient privacy page, re-consent prompt. Marked "NATIVE EGYPTIAN ARABIC SPEAKER REVIEW PENDING — ORPH-V4-07" in source comment.

**Note:** also adds B05 sharing strings (per uncommitted-changes audit `en.ts missing Build 05 strings`). Same single-file constraint as audit.ts — assign to B04.

### 10. `packages/shared/lib/i18n/en.ts` — **Scope shared → B04**
**Delta:** +38. Adds the EN counterparts of the same key set. Per uncommitted-changes audit, **EN file appears under-populated for Build 05 sharing strings** — Mo to confirm whether this is intentional (Arabic-first) or a gap.

### 11. `packages/shared/lib/supabase/admin.ts` — **Scope C → B04**
**Delta:** +2. Adds `'global-patients-lookup'` to `ALLOWED_ADMIN_SCOPES`. Single scope addition. The other ~95 unregistered scopes the codebase uses are out-of-scope for this commit (each is just a console.warn).

---

## Untracked files / dirs (~50 paths)

### Scope B (privacy code feature → B04)

**Data layer (5 files):**
- `packages/shared/lib/data/privacy-codes.ts` — 19,165 bytes. The full privacy-code data layer: `hasActivePrivacyCode`, `regeneratePrivacyCode`, `verifyPrivacyCode`, `initiateSmsShare`, `verifySmsCode`, `checkPhoneUniform`. Imports `createAdminClient` and `createClient`.
- `packages/shared/lib/data/global-patients.ts` — 3,788 bytes. `findGlobalPatientByPhone`, etc. Imports `normalizeEgyptianPhone`.
- `packages/shared/lib/data/identity-resolution.ts` — 7,175 bytes. `resolveIdentityForClinic` (called by verify-privacy-code and verify-sms-code handlers).
- `packages/shared/lib/data/patient-clinic-records.ts` — 6,759 bytes. CRUD on the new `patient_clinic_records` table.
- `packages/shared/lib/utils/phone-normalize.ts` — 4,777 bytes. `normalizeEgyptianPhone` (TS implementation that mirrors mig 071's `normalize_egyptian_phone` SQL function).

**Tests (2 files):**
- `packages/shared/lib/utils/__tests__/phone-normalize.test.ts`
- `packages/shared/lib/utils/__tests__/phone-normalize-sql-parity.test.ts`

**Patient-facing handlers (8):**
- `packages/shared/lib/api/handlers/patients/check-phone-uniform/handler.ts`
- `packages/shared/lib/api/handlers/patients/initiate-sms-share/handler.ts`
- `packages/shared/lib/api/handlers/patients/verify-privacy-code/handler.ts`
- `packages/shared/lib/api/handlers/patients/verify-sms-code/handler.ts`
- `packages/shared/lib/api/handlers/patient/privacy-code/handler.ts`
- `packages/shared/lib/api/handlers/patient/privacy-code-regenerate/handler.ts`
- `packages/shared/lib/api/handlers/patient/messaging-reconsent/handler.ts`

**Admin handlers (Scope C, fold into B04):**
- `packages/shared/lib/api/handlers/admin/global-patients-lookup/handler.ts` + `__tests__/handler.test.ts`
- `packages/shared/lib/api/handlers/admin/patient-clinic-records/handler.ts`

**App route shims (re-exports, all `export { GET/POST } from '@shared/...'`):**
- `apps/clinic/app/api/patients/check-phone-uniform/route.ts`
- `apps/clinic/app/api/patients/initiate-sms-share/route.ts`
- `apps/clinic/app/api/patients/verify-privacy-code/route.ts`
- `apps/clinic/app/api/patients/verify-sms-code/route.ts`
- `apps/clinic/app/api/admin/global-patients/lookup/route.ts`
- `apps/clinic/app/api/admin/patient-clinic-records/route.ts`
- `apps/patient/app/api/patient/privacy-code/route.ts`
- `apps/patient/app/api/patient/privacy-code/regenerate/route.ts`
- `apps/patient/app/api/patient/messaging-reconsent/route.ts`

**UI components and pages:**
- `apps/clinic/components/frontdesk/PrivacyCodeEntryModal.tsx` — the modal mounted by `checkin/page.tsx`.
- `apps/patient/app/(patient)/patient/privacy/page.tsx` — patient-app "Privacy Code" page (server component; calls `hasActivePrivacyCode` and `createAdminClient('patient-privacy-page-server')`).
- `apps/patient/components/patient/PrivacyCodeCard.tsx` — client component used by patient/privacy page.
- `apps/patient/components/patient/MessagingReConsentPrompt.tsx` — drives the per-clinic re-consent loop.

### Scope B' (sharing lifecycle → B05)

**Data layer (1 file):**
- `packages/shared/lib/data/patient-shares.ts` — 19,609 bytes. Full sharing data layer: `listSharesForPatient`, `listExpiringShares`, `markShareExpiredNotification`, `revokeShare`, `extendShare`, `autoRenewOnVisit`, `createSharesForGrantors`, type `ExtendDuration`.

**Handlers (2):**
- `packages/shared/lib/api/handlers/patient/sharing/extend-handler.ts`
- `packages/shared/lib/api/handlers/patient/sharing/revoke-handler.ts`

**App routes:**
- `apps/clinic/app/api/cron/expire-stale-shares/route.ts` — full implementation (NOT a re-export shim). Includes the Egyptian-Arabic SMS template.
- `apps/patient/app/api/patient/sharing/[shareId]/extend/route.ts` (re-export)
- `apps/patient/app/api/patient/sharing/[shareId]/revoke/route.ts` (re-export)

**UI components:**
- `apps/patient/components/sharing/RevokeShareModal.tsx`
- `apps/patient/components/sharing/ExtendShareModal.tsx`

### Scope D (discard per Ruling 3)

| Path | Reason |
|------|--------|
| `.commit-msg-audit.txt` | scratch — commit message draft |
| `.commit-msg-clinic-id-fix.txt` | scratch |
| `.commit-msg-session-17-stage-1.txt` | scratch |
| `.commit-msg-session-17-step-2.txt` | scratch |
| `.commit-msg-session-17-step-3.txt` | scratch |
| `apps/clinic/public/fallback-m46CJ9b2p1ahsHpk0VpUN.js` | next-pwa build artifact (per uncommitted-changes audit). Add `fallback-*.js` to `.gitignore`. |

### Scope E (unclear — Mo ruling needed)

> Detailed surfacing in Phase 2; brief here.

| Path | Best guess | Question |
|------|------------|----------|
| `analytics-bug-report.md` (23 KB) | Bug report doc, Mo-authored. Belongs in `audits/` or `notes/`? | Commit / move / discard? |
| `analytics-windows-bug-report.md` (34 KB) | Same as above | Commit / move / discard? |
| `package-lock.json` (401 KB) | Per uncommitted-changes audit: deleted 2026-03-17 then regenerated. **Should always be tracked.** | Confirm: commit as a standalone `chore: restore package-lock.json` commit? |
| `project links .rtf` (1.2 KB) | Mo's personal scratch (RTF format, root) | Discard? Move to `~/Notes`? |
| `audits/forensic-audit/staging-vs-mig-reconciliation.md` (17 KB) + `staging-tables.txt` (1.2 KB) | Session A audit corpus output | Commit (these are audit artifacts the program references); confirm. |
| `scripts/validate-mig-071-072-073.sql` (11 KB) | Build 02 staging validation script (referenced in Mo's project memory) | Commit alongside its peers in `scripts/`? |
| `scripts/validate-mig-090-build-05.sql` (20 KB) | Build 05 staging validation script | Commit alongside? |
| `supabase/migrations/099_patient_code_rpcs.sql` (18 KB) + `.rollback.sql` (1.5 KB) | **PROGRAM_STATE.md Phase F follow-up #7 says: "drafted but not applied. With patient_code column gone (R7 retirement), the RPCs are dead. Delete from repo."** | Confirm: delete both files now in this session, or defer to Phase F? |
| `supabase/migrations_list.txt` (4.6 KB) | Plain-text migration index — likely stale auto-generated artifact | Discard? |

---

## Coupling graph (for ordering commit staging)

### Imports of untracked → untracked / modified files

```
checkin/page.tsx (modified)           → phone-normalize.ts (untracked B04)
checkin/page.tsx (modified)           → PrivacyCodeEntryModal.tsx (untracked B04)
checkin/handler.ts (modified)         → patient-shares.ts (untracked B05)  [autoRenewOnVisit]
patient/sharing/handler.ts (modified) → patient-shares.ts (untracked B05)  [listSharesForPatient]
patient/sharing/page.tsx (modified)   → RevokeShareModal.tsx (untracked B05)
patient/sharing/page.tsx (modified)   → ExtendShareModal.tsx (untracked B05)

patient/privacy/page.tsx (untracked B04) → privacy-codes.ts (untracked B04)
patient/privacy/page.tsx (untracked B04) → PrivacyCodeCard.tsx (untracked B04)

cron/expire-stale-shares/route.ts (untracked B05) → patient-shares.ts (untracked B05)

verify-privacy-code/handler.ts (untracked B04) → privacy-codes.ts (untracked B04)
verify-privacy-code/handler.ts (untracked B04) → identity-resolution.ts (untracked B04)
verify-privacy-code/handler.ts (untracked B04) → patient-shares.ts (untracked B05)  ⚠ cross-build edge
verify-sms-code/handler.ts (untracked B04)     → patient-shares.ts (untracked B05)  ⚠ cross-build edge

admin/global-patients-lookup/handler.ts (untracked C/B04) → session.ts requireServiceRole (modified C/B04)
admin/global-patients-lookup/handler.ts (untracked C/B04) → global-patients.ts (untracked B04)
admin/patient-clinic-records/handler.ts (untracked C/B04) → session.ts requireServiceRole (modified C/B04)
admin/patient-clinic-records/handler.ts (untracked C/B04) → patient-clinic-records.ts (untracked B04)

privacy-codes.ts (untracked B04) → admin.ts ALLOWED_ADMIN_SCOPES (modified, only adds 1 scope)
global-patients.ts (untracked B04) → phone-normalize.ts (untracked B04)
identity-resolution.ts (untracked B04) → phone-normalize.ts (untracked B04)
```

### ⚠ Cross-build edge

The privacy-code verify handlers (`verify-privacy-code/handler.ts` and `verify-sms-code/handler.ts`) import `createSharesForGrantors` from `patient-shares.ts` (Scope B'). This means **B04 cannot fully typecheck without `patient-shares.ts` already being on disk.**

**Recommendation:** stage and commit `patient-shares.ts` (and only the data-layer file, not the sharing handlers / UI) as part of B04, then commit the rest of B' as B05. **OR** commit B04 first (with the verify handlers' imports broken) → tsc fails → surface to Mo.

The cleaner approach is the former: include `patient-shares.ts` in B04. But that crosses the "feat(b04)" naming. **Surfacing this to Mo as part of Phase 2.**

---

## Classification summary

| Scope | Modified-tracked count | Untracked count | Total |
|-------|------------------------|-----------------|-------|
| A (check-in feature) | 2 (page.tsx + handler.ts) | 0 (modal lives in B) | 2 |
| B (privacy-code + identity infra) | 7 (audit.ts, en.ts, ar.ts, messaging-consent.ts, session.ts, admin.ts, patient/sharing/handler.ts*) | ~22 | ~29 |
| B' (sharing lifecycle) | 2 (vercel.json, sharing/page.tsx) | ~8 | ~10 |
| C (admin endpoints) | 2 (session.ts overlaps with B; admin.ts overlaps with B) | 4 (2 handlers + 2 routes) | 4 |
| D (scratch / artifacts) | 0 | 6 | 6 |
| E (unclear) | 0 | ~10 | ~10 |

\* `patient/sharing/handler.ts` is technically B' (sharing) but also has the legacy `grants` field for B04's per-doctor grants. It lands in B05 (its primary purpose is the new shares response).

**Total commits planned this session:**
1. `chore(gitignore): exclude next-pwa fallback chunks and commit-msg scratch files` (Phase 3)
2. `feat(b04): privacy code generation, regeneration, and verification` (Phase 4)
3. `feat(b05): patient sharing lifecycle (initiate, revoke, extend, expire)` (Phase 4)
4. `docs: deep audit + bring core docs current with audit corpus` (Phase 5)
5. Possible: a `chore: restore package-lock.json` commit if Mo confirms (Phase 2 ruling)
6. Possible: a `chore: track audit + scripts artifacts` commit if Mo confirms (Phase 2 rulings)

---

## Phase 2 rulings (received from Mo, 2026-05-04)

| # | Question | Mo's ruling |
|---|----------|-------------|
| **Q1** | Cross-build edge for `patient-shares.ts` | **Include in B04** (data layer only — not handlers/UI/routes/cron). B04 commit message updated to acknowledge: "includes patient-shares.ts because verify-* handlers call createSharesForGrantors. Sharing handlers, UI, routes, cron follow in B05." |
| **Q2** | `package-lock.json` placement | **Standalone commit, FIRST** — before .gitignore, before B04, before B05. Message: `chore: restore package-lock.json (was deleted 2026-03-17, regenerated since)`. |
| **Q3** | Two `analytics-*.md` bug reports at root | **Move to `audits/bug-reports/` and commit standalone.** Message: `chore: relocate analytics bug reports to audits/bug-reports/`. |
| **Q4** | `project links .rtf` | **Discard.** `rm` it before commit 1. Never tracked → no commit needed. |
| **Q5** | `audits/forensic-audit/` | **Commit standalone.** Message: `chore: track Session A audit corpus artifacts`. |
| **Q6** | `scripts/validate-mig-*.sql` | **Commit standalone.** Message: `chore: track Build 02 and Build 05 staging validation scripts` (cites Empirical Lesson #12 — "test scaffolding must be persisted as durable executable code"). |
| **Q7** | `mig 099` | **DELETE NOW.** Per PROGRAM_STATE.md Phase F Task 7 + the patient_code column being retired (R7), the RPCs reference a column that doesn't exist — fresh-DB-reset trap. Standalone commit: `chore: delete mig 099 (patient_code RPCs) — retired per R7`. Update PROGRAM_STATE.md Phase F task list to mark Task 7 closed in Phase 5 doc audit. |
| **Q8** | `supabase/migrations_list.txt` | **Discard + add to .gitignore** (alongside `fallback-*.js` and `.commit-msg-*.txt`). Stale auto-generated artifact; the migration tree is the source of truth. |
| **Q9** | en.ts under-populated for Build 05 strings | **DEFER (Option 3)** — content authoring, not discipline cleanup. Per D-003 Arabic-first. Pre-defer verification required: confirm components don't import en.ts directly. Add Phase F Task 17 (P3) in Phase 5 doc audit. |

### Q9 surfacing — en.ts vs ar.ts share/sharing/extend/revoke parity

```
diff <(grep -E "share|sharing|extend|revoke" packages/shared/lib/i18n/ar.ts) \
     <(grep -E "share|sharing|extend|revoke" packages/shared/lib/i18n/en.ts)
```

**Result:**

`ar.ts` matches: **52 lines** (7 legacy + 45 new Build 05 keys)
`en.ts` matches: **7 lines** (7 legacy ONLY — the 45 Build 05 keys are entirely absent)

**ar.ts has — en.ts is missing:**

```
sharing_title, sharing_subtitle
sharing_activeHeader, sharing_historyHeader
sharing_emptyActive, sharing_emptyHistory
sharing_grantedAt, sharing_expiresAt, sharing_expiresPermanent
sharing_expiredOn, sharing_revokedOn
sharing_grantedViaLabel
sharing_via_PRIVACY_CODE, sharing_via_SMS_CODE
sharing_via_PATIENT_APP, sharing_via_AUTO_RENEW
sharing_actionRevoke, sharing_actionExtend
sharing_status_active, sharing_status_expired, sharing_status_revoked, sharing_status_permanent
sharing_revokeModalTitle, sharing_revokeModalBody
sharing_revokeModalReasonLabel, sharing_revokeModalReasonPlaceholder
sharing_revokeModalConfirm, sharing_revokeModalCancel
sharing_extendModalTitle, sharing_extendModalBody
sharing_extendOption_90, sharing_extendOption_90_help
sharing_extendOption_year, sharing_extendOption_year_help
sharing_extendOption_permanent, sharing_extendOption_permanent_help
sharing_extendModalConfirm, sharing_extendModalCancel
sharing_toast_revoked, sharing_toast_extended
sharing_toast_alreadyRevoked, sharing_toast_alreadyPermanent
sharing_toast_genericError
```

**Pattern observation (Claude's read):** The 7 *legacy* sharing strings (`sharing`, `sharingSettings`, `sharedWith`, `revokeAccess`, `shareWith`, `shareLink`, `sharingAdmin`) DO exist in both files. Only the *new B05* key set (`sharing_*` prefix) is AR-only. This looks like an oversight in the B05 diff (the diff was authored against ar.ts but never mirrored to en.ts), not a deliberate AR-only architectural choice — because if it were architectural, the legacy `sharing`/`sharingSettings` keys would have been removed from en.ts too.

**Tsc impact:** unknown until B05 stages. If the new sharing UI components reference `en.sharing_*` keys directly, tsc will fail on B05. If they reference via a `t()` function that falls back to AR, tsc passes silently with English users seeing Arabic text.

**Awaiting Mo's Q9 ruling before proceeding to Phase 3.**

---

## Pushback acceptances (Mo, 2026-05-04)

### Pushback 1 — `audit.ts` framing in B04 commit message

**Accepted.** B04 commit message will include a dedicated `Audit actions added (25):` subsection enumerating each action grouped by Build origin (02 / 03 / 04 / 05-staged-in-B04-for-tsc). Verbatim format from Mo's pushback adopted; final list will be re-derived from the actual diff at commit time to avoid drift.

### Pushback 2 — 95 unregistered admin scopes is a P1, not background noise

**Accepted.** Add to Phase F follow-ups as Task 16 (P1):

> **Task 16 (P1):** Audit createAdminClient call sites and reconcile against ALLOWED_ADMIN_SCOPES. ~95 unregistered scopes use console.warn only. Decide: tighten validation to throw, expand allow-list, or revisit the scope-tracking pattern entirely. The admin client audit trail (D-008) is mostly aspirational at current state.

This will be added in **Phase 5** when PROGRAM_STATE.md is updated, and surfaced in DECISIONS_LOG.md as a recognized P1 follow-up. If the deep doc audit reveals D-008 needs amendment (because the admin-client audit trail concept is broken at current state), that amendment lands in the same Phase 5 doc commit.

---

## Adjusted commit ordering (final)

1. `chore: restore package-lock.json (was deleted 2026-03-17, regenerated since)` — Q2
2. `chore: relocate analytics bug reports to audits/bug-reports/` — Q3
3. `chore: track Session A audit corpus artifacts` — Q5
4. `chore: track Build 02 and Build 05 staging validation scripts` — Q6
5. `chore: delete mig 099 (patient_code RPCs) — retired per R7` — Q7
6. `chore(gitignore): exclude next-pwa fallback chunks, commit-msg scratch files, supabase migrations_list.txt` — Phase 3 + Q8
7. `feat(b04): privacy code feature + sharing data layer (foundation for B05)` — Phase 4 (audit-actions enum'd per Pushback 1)
8. `feat(b05): patient sharing lifecycle (initiate, revoke, extend, expire)` — Phase 4 (Q9 ruling determines whether en.ts mirroring lands here)
9. `docs: deep audit + bring core docs current with audit corpus` — Phase 5 (includes Empirical Lesson #13, Phase F Task 16, mig 099 closure, possible D-008 amendment)

`project links .rtf` deleted before commit 1 (no commit needed).

---

## Important caveats noted but NOT to be fixed in this session

- **`auto-renew-on-visit-gpid-lookup` admin scope mismatch** in `checkin/handler.ts`. console.warn only at runtime; absorbed by Phase F Task 16 (P1).
- **~95 other unregistered admin scopes** — same. Phase F Task 16 (P1).
- **`patient/sharing/handler.ts` mixed B04/B05 ownership** — accepted; lands in B05.
- **Single-file shared infra** (`audit.ts`, `ar.ts`, `en.ts`) span B04+B05 hunks; assign whole-file to B04 to keep tsc clean — accepted (with Pushback 1 disclosure in commit message).
