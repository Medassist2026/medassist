# Admin Scope Reconciliation — 2026-05-08

**Phase F Task 16 status:** TRIAGED — RECOMMENDED OPTION SURFACED
**Code surface inventoried:** `packages/shared/lib`, `apps/clinic/app`, `apps/patient/app` (production code paths only — excludes scripts/, tests, archived migrations, audit artifacts, build tooling)
**Method:** read-only `grep` + `sort -u` + `comm` per the task prompt's §1–§3. Intermediate working files (`/tmp/callsite-scopes.txt`, `/tmp/allowlist-scopes.txt`, `/tmp/missing-from-allowlist.txt`, `/tmp/unused-allowlist.txt`, `/tmp/missing-with-files.tsv`) are NOT committed — codebase state is git-versioned, so a future reader reproduces the inventory by re-running the documented commands in §8. (Differs from `audits/dependabot-alerts-2026-05-08.json` which IS committed because alert state is GitHub-API-versioned and only correlates against a point-in-time snapshot.)
**Authority:** D-008 (admin-client audit-trail decision); ARCH §12 ("scope-tracking pattern has known drift"); STATE_OF_WORK Pending workstream "Phase F Task 16 (planned, P1)"

---

## 1. Inventory

| Quantity | Count | Source command |
|---|---|---|
| Total `createAdminClient(...)` invocations | **210** | `grep -rEn "createAdminClient\(" packages/shared/lib apps/clinic/app apps/patient/app --include='*.ts' --include='*.tsx'` |
| Invocations with explicit string arg | 207 | (subset above) |
| Invocations with no arg (implicit default `'api-route'`) | 3 | `grep -rEn "createAdminClient\(\)"` |
| Unique scope strings at callsites | **135** | `... \| grep -oE "createAdminClient\(['\"]([^'\"]+)['\"]" \| sed -E "s/.../\1/" \| sort -u \| wc -l` |
| `ALLOWED_ADMIN_SCOPES` entries | **35** | `sed -n '/^const ALLOWED_ADMIN_SCOPES = new Set(\[/,/^\])/p' packages/shared/lib/supabase/admin.ts \| sed 's\|//.*$\|\|' \| grep -oE "^[[:space:]]*'[a-zA-Z][^']*'" \| sort -u \| wc -l` |
| Missing from allow-list (callsite − allow-list) | **105** | `comm -23 callsites.txt allowlist.txt \| wc -l` |
| Unused in allow-list (allow-list − callsite) | **5** | `comm -13 callsites.txt allowlist.txt \| wc -l` |
| Intersection (in both) | 30 | `comm -12 callsites.txt allowlist.txt \| wc -l` |

**Sanity:** 30 + 105 = 135 ✓ (callsite total). 30 + 5 = 35 ✓ (allow-list total).

> **Count-shorthand drift caught (REVIEW_CRITERIA §4.3).** ARCH §12 currently says "covers ~36 scopes" after Phase F Task 10. Empirical count is **35**. Off-by-one shorthand drift; should be corrected to "35" (or kept as "~35" if the approximation is intentional). Surface as out-of-scope §6.1 below for the lockstep doc updates that ride with this batch.

---

## 2. Naming-convention scan

```text
$ grep -E '_'      /tmp/callsite-scopes.txt | head    → 0 hits (no snake_case)
$ grep -E '[A-Z]'  /tmp/callsite-scopes.txt | head    → 0 hits (no camelCase / capitals)
$ grep -E '[^a-z0-9-]' /tmp/callsite-scopes.txt | head → 0 hits (no anomalies)
```

**All 135 callsite scopes are clean kebab-case.** No style drift to clean up. This means Option B (tighten validation to throw) wouldn't trigger any *naming* failures — only the unregistered-scope rejection.

---

## 3. Missing scopes — categorized

All 105 missing scopes are in **production code paths** (server route handlers, data-layer libs, auth helpers, app-level routes, server-component pages). **Zero are in build/test tooling.** This collapses the prompt's expected categories — there is no "deferrable build-tooling class" — every missing scope is real-blocking from a production-runtime perspective.

### 3.1 By location

| Surface | Missing count | Examples |
|---|---|---|
| `packages/shared/lib/data/*` (data layer) | **39** | `patient-shares-*` (×9), `messaging-consent-*` (×4), `patient-clinic-records-*` (×4), `frontdesk.ts` family (×6), `privacy-codes.ts` family (×3) |
| `packages/shared/lib/api/handlers/*` (route handlers) | **34** | `clinic-invite`, `clinic-staff`, `patient-sharing*` (×3), `patients/verify-*-lookup` (×4), `clinical/notes-*`, `frontdesk/checkin/first-visit-sms-invitation` |
| `apps/{clinic,patient}/app/api/*/route.ts` (per-app routes) | **19** | `doctor-profile-{get,update}`, `frontdesk-{invite,profile,profile-update,invite-action}`, `cron-expire-stale-shares`, `queue-reorder`, `urgent-booking`, `patient-summary` |
| `packages/shared/lib/auth/*` | **3** | `auth-assignments`, `auth-clinic-role`, `auth-memberships` (all `session.ts`) |
| `packages/shared/lib/{analytics,notifications,sms,security,utils,jobs}/*` | **7** | `doctor-stats-{events,notes}`, `doctor-income-stats`, `notifications-{create,bulk}`, `prescription-sms`, `invite-code-gen` |
| `apps/{clinic,patient}/app/(...)/page.tsx` (server components) | **3** | `frontdesk-layout`, `notifications-count` (clinic dashboard), `patient-privacy-page-server` |
| Build/test/scripts (defer class) | **0** | (none — entire surface is production code) |

### 3.2 By feature/domain (top prefixes)

```text
$ awk -F'-' '{print $1}' /tmp/missing-from-allowlist.txt | sort | uniq -c | sort -rn | head -20
     29 patient        ← largest cluster (sharing/codes/PCR/messaging/onboarding all surface here)
      8 doctor         ← profile, settings, stats, conversations, public-fee, etc.
      6 clinic         ← invite-{code,action}, staff, settings, leave, membership-revoke, context
      5 frontdesk      ← invite, invite-action, profile, profile-update, layout
      4 verify         ← verify-privacy-code-{grantor,patient}-lookup, verify-sms-code-{grantor,patient}-lookup
      4 notifications  ← create, bulk, count, plain "notifications"
      3 prescription   ← fetch, sms, sms-lookup (also prescriptions-list under apps/)
      3 invite         ← invite-code-{gen,get,regen}
      3 auth           ← assignments, clinic-role, memberships
      2 visibility     ← visibility, visibility-names
      2 session        ← appointment-completion, queue-completion
      2 queue          ← reorder, with-patient-names
      2 messaging      ← consent-check, reconsent-decision
      2 identity       ← resolution-{create,legacy}
      2 fee            ← lookup, update
      2 effective      ← messaging-consent-{list,read}
      2 audit          ← logging, read
```

The single largest cluster is the **Build 05 patient-sharing lifecycle** (D-068):

```text
patient-shares-auto-renew
patient-shares-create
patient-shares-cron-expiring
patient-shares-extend
patient-shares-list-grantee
patient-shares-list-patient
patient-shares-mark-notified
patient-shares-read
patient-shares-revoke
patient-sharing                    ← handler
patient-sharing-extend-authz       ← handler
patient-sharing-revoke-authz       ← handler
create-shares-for-grantors         ← data layer (mig 091 atomic helper)
cron-expire-stale-shares           ← cron handler
verify-sms-code-grantor-lookup     ← grantor share path
verify-sms-code-patient-lookup     ← patient share path
verify-privacy-code-grantor-lookup ← grantor privacy-code path
verify-privacy-code-patient-lookup ← patient privacy-code path
```

That's **18 patient-sharing-related scopes** absent from the allow-list. Confirms the broader observation: when a feature shipped (Build 05), its admin scopes were authored at the callsite per the discipline pattern but never registered in `ALLOWED_ADMIN_SCOPES`. The Phase F Task 10 closure of `auto-renew-on-visit-gpid-lookup` was a single-scope spot-fix; the systematic fix is Task 16.

### 3.3 Near-duplicates / style-drift class

Pairs where the missing scope shares a prefix with an allow-list entry but represents a different logical scope (i.e., not a typo — different surface):

| Allow-listed | Near-miss(es) at callsites | Verdict |
|---|---|---|
| `audit-log` | `audit-logging`, `audit-read` | NOT typos — write vs read distinction. Could merge to `audit-log-write` / `audit-log-read` for consistency. |
| `auth-login-lookup` | `auth-assignments`, `auth-clinic-role`, `auth-memberships` | NOT typos — different auth surfaces. All in `session.ts`. Add as-is. |
| `clinic-join`, `clinic-registration` | `clinic-context`, `clinic-invite`, `clinic-leave`, `clinic-membership-revoke`, `clinic-settings-patch`, `clinic-staff` | NOT typos — sibling clinic operations. Add as-is. |
| `doctor-appointments` | `doctor-conversation-create`, `doctor-income-stats`, `doctor-profile-{get,update}`, `doctor-settings`, `doctor-stats`, `doctor-stats-{events,notes}` | NOT typos — different doctor surfaces. Add as-is. |
| `otp-create`, `otp-verify` | `otp-verify-token` | NOT a typo — `otp-verify-token` is the token-checking path inside the verify-otp handler, distinct from the higher-level `otp-verify` scope. Add as-is. |
| `prescription-sync` | `prescription-fetch`, `prescription-sms`, `prescription-sms-lookup`, `prescriptions-list` | NOT typos — different prescription surfaces. Note the singular/plural inconsistency between `prescription-*` and `prescriptions-list`; mild style drift but kept as-authored. |
| `patient-{appointments,dedup,details,onboarding,privacy-checks,visits}` | `patient-clinic-records-{find,list-clinic,list-global,upsert}`, `patient-conversations-with-doctors`, `patient-create-clinic`, `patient-messaging-{conversation,eligibility}`, `patient-prescriptions`, `patient-privacy-code-{get,regenerate}`, `patient-privacy-page-server`, `patient-reconsent-{list,record}`, `patient-search-access`, `patient-shares-*` (9), `patient-sharing*` (3), `patient-summary` | NOT typos — distinct patient surfaces. The `patient-` prefix is the largest cluster (29 scopes). Add as-is. |

**Verdict:** Zero true typos / near-miss-of-existing-scope cases. All 105 missing scopes represent legitimate distinct logical surfaces. Style drift is limited to (a) singular/plural like `prescription-*` vs `prescriptions-list` and (b) the optional `audit-{log,logging,read}` rename, both cosmetic.

### 3.4 Production-vs-deferrable summary

```text
Production server route handlers   34
Production data-layer libs         39
Production auth helpers             3
Production other (analytics/sms/notifications/etc.)  7
Production app-level routes        19
Production server-component pages   3
                                  ----
                                  105
Build/test/scripts                  0
```

**100% of missing scopes are production-code-path. Categorization "block class" applies to all 105.**

---

## 4. Unused allow-list entries (5)

```text
$ comm -13 /tmp/callsite-scopes.txt /tmp/allowlist-scopes.txt
api-route                    ← DEFAULT scope; "used" by 3 no-arg callsites (createAdminClient())
api-versioning               ← truly unused; no callsite
input-validation             ← truly unused; no callsite
phone-change-rollback        ← in phone-change v2 cluster but no callsite uses this exact scope (the rollback is invoked via SQL `change_phone_rollback`, not via a JS scope name)
privacy-migration-backfill   ← truly unused; aspirational from migration-era code
```

- `api-route` is the DEFAULT for `createAdminClient(scope = 'api-route')` — used implicitly by 3 callsites with no string arg. Keep.
- 4 truly-unused entries (`api-versioning`, `input-validation`, `phone-change-rollback`, `privacy-migration-backfill`) are candidates for removal in any of the remediation options below. Their presence costs nothing at runtime; the only argument for removal is doc-hygiene (a 35-entry list with 4 inert entries is misleading).

---

## 5. Remediation options

### Option A — Expand allow-list

**What:** Add all 105 missing scopes to `ALLOWED_ADMIN_SCOPES` in `admin.ts`. Remove the 4 truly-unused entries (`api-versioning`, `input-validation`, `phone-change-rollback`, `privacy-migration-backfill`) in the same pass — surveying the allow-list end-to-end is the natural moment to clean them up; doing it separately would fragment the work.

**Pros:**
- Smallest disruption: single-file edit to `packages/shared/lib/supabase/admin.ts`; no callsite changes.
- Eliminates all `console.warn` runtime spam from this surface in one go.
- Allow-list size becomes 132 (35 − 4 unused + 105 missing − 4 truly unused = 132). *[Corrected to 136 in §9.1; arithmetic above double-counted the 4 unused entries.]*

**Cons (apply only WITHOUT the eslint rule below):**
- Without enforcement, the allow-list becomes a rubber stamp — every legitimate scope is on it, so the "unregistered" warning loses signal. Future scope additions still slip in silently because warn-only is non-blocking.
- Doesn't address the underlying question: what is the allow-list FOR? D-008 says "audit trail," but a 132-entry *[corrected to 136 in §9.1]* rubber-stamp Set is no more auditable than an empty Set with a `console.log(scope)` instead of `console.warn(...)`.
- Same drift mechanism that produced today's gap (developer adds scope at callsite, forgets to register) will reappear next quarter unless we change the discipline.

**MANDATORY companion: pre-commit / eslint scope-discipline rule.** Plain Option A is cosmetic. The phase MUST ship with a custom eslint rule (or git pre-commit hook) that:

1. Scans every `createAdminClient(...)` callsite added or modified in the diff.
2. For static-string args, asserts the literal IS in `ALLOWED_ADMIN_SCOPES` — fails the commit if not.
3. For dynamic args (template literals, variables, expressions) — fails the commit unconditionally; static-literal-only is the discipline. This is the precondition for Phase 3's Option C.1 typescript literal-union refactor and locks it forward.

Without the rule, Phase 2 has no gating value beyond eliminating today's `console.warn` spam — same drift recurs next quarter. With the rule, Phase 2 IS the enforcement upgrade Option B was supposed to deliver, but at the right layer (commit-time, not runtime).

**Effort:** s for the mechanical allow-list expansion (~15–30 min). m total when the eslint rule + tests are included (~half-day to author + verify the rule fails on a known-bad commit).

### Option B — Tighten validation to throw

**What:** Change `console.warn(...)` → `throw new Error(...)` in `createAdminClient`. New unregistered scope at runtime → 500 in production, immediate test failure in CI.

**Pros:**
- Real gating. Drift becomes IMPOSSIBLE silently — the next forgotten scope-registration breaks at runtime.
- Strongest discipline signal.

**Cons:**
- Cannot ship until Option A's 105-scope expansion is done — otherwise every active feature path crashes on day one.
- Risk of throwing in a code path nobody tested (rare scope used only in error-recovery branches). Mitigation: integration tests that exercise every `createAdminClient` callsite. Effort to author and maintain those tests is non-trivial.
- Fights against the shape of the JS ecosystem — most allow-list patterns evolve to Option A's rubber-stamp before being abandoned.

**Effort:** l. Sequencing: Option A first (expand) → Option B (flip warn→throw) + smoke-probe tests for every active scope + test coverage for the throw path itself. Estimated 4–8 hours plus a CI gate.

### Option C — Rethink scope tracking

Three sub-options. C.1 is the strongest in our context.

#### C.1 — TypeScript literal-union type

```typescript
export type AdminScope =
  | 'auth-login-lookup' | 'otp-create' | 'otp-verify'
  | 'patient-onboarding' | ... // all 135
  | 'api-route'

export function createAdminClient(scope: AdminScope = 'api-route') { ... }
```

**Pros:**
- Compile-time enforcement. tsc + `next build` (Lesson #17) catch unregistered scopes pre-deploy.
- Single source of truth (the type definition). No separate allow-list to maintain.
- No runtime overhead (the `Set.has()` check disappears).
- Plays well with codegen: a build-time script can scan callsites and regenerate the union.

**Cons:**
- Doesn't help if a scope string is built dynamically (e.g., `createAdminClient(\`patient-shares-\${operation}\`)`). Mitigation: prohibit dynamic scopes in the eslint config; verified from the inventory that all 135 callsites use static literals already.
- Loses the audit "heads up" channel — `console.warn` at runtime is a forensic signal for security review (someone *just* started using a privileged scope at runtime). Compile-time check moves that signal to PR review, which may be where it belongs anyway.
- Refactor touches the `createAdminClient` signature and forces every callsite through tsc — but this is exactly the same blast radius as Option A's expansion.

**Effort:** m. ~1–2 days: define the union, drop the runtime Set, ensure all 135 callsites pass static literals, regenerate `packages/shared/lib/supabase/types.ts` if needed. D-008 amendment to record the architectural shift.

#### C.2 — Generated allow-list

Build-time script greps `createAdminClient(...)` and writes `ALLOWED_ADMIN_SCOPES`. Self-maintaining. Runtime warning still fires for non-static scopes.

**Pros:** Allow-list never drifts; no manual maintenance.
**Cons:** Adds a build step + CI gate to detect drift. Solution to a problem that C.1 solves more elegantly via the type system.

#### C.3 — Drop the allow-list entirely

`createAdminClient(scope: string)` with `console.log` for audit, no gating. Audit value moves to logs/monitoring.

**Pros:** Honest: if we won't gate, don't pretend to.
**Cons:** Forfeits the typo-catcher value. Loses the affordance to convert to gating later.

### Option D — Hybrid (recommended)

Sequence the options to capture incremental value without the all-at-once risk of B or C:

1. **This batch (Phase 1):** ship the inventory + recommendation only. No code change. (Current state of D3.)
2. **Next cowork session — Phase 2 (m):** apply Option A — expand allow-list to 132 entries (35 + 105 missing − 4 truly unused − 4 unused-but-kept-as-default-includes). *[Corrected to 136 in §9.1; arithmetic above double-counted the 4 unused entries. Phase 2 shipped 2026-05-09 with 136 entries.]* Group by feature with comment dividers. **PLUS the mandatory eslint / pre-commit rule** described in Option A above (without it, Phase 2 is cosmetic). The rule blocks any new-scope drift at commit time. Eliminates `console.warn` spam AND closes the drift mechanism.
3. **Workstream after that — Phase 3 (m):** apply Option C.1 — replace the runtime Set with a TypeScript literal union; drop the `Set.has()` check. The Phase 2 allow-list becomes the seed for the union type. Compile-time enforcement (tsc + Lesson #17 `next build`) replaces runtime warning. D-008 amendment records the architectural shift. The Phase 2 eslint rule's static-literal-only check carries forward unchanged — Phase 3 builds on top of it.
4. **Phase G or post-launch:** consider whether Option B (runtime throw) adds value on top of compile-time enforcement + commit-time enforcement; likely NO. Skip B entirely or apply only as a defense-in-depth runtime guard.

**Recommended path:** D, with the explicit understanding that:
- Phase 2 is **only** valuable WITH the eslint rule. Plain Option A (allow-list expansion only) ships cosmetic value and the same drift recurs.
- Option B is likely DROPPED from the sequence once Phase 3 (C.1) lands. Compile-time check + commit-time eslint check + Lesson #17's `next build` gate together make runtime throw redundant for the static-literal majority.

---

## 6. Out-of-scope findings

### 6.1 ARCH §12 count drift (REVIEW_CRITERIA §4.3 catch)

ARCH §12 currently says:

> "current `ALLOWED_ADMIN_SCOPES` covers ~36 scopes"

Empirical count is **35** (verified by `sed | grep | sort -u | wc -l`). The "~36" was set by Phase F Task 10's closure note (`~35 → ~36`); both numbers were approximations. The actual count after Task 10 is 35. Recommend bumping ARCH §12 to "35 scopes" (precise) or "~35 scopes" (approximate but consistent with the inventory). Belongs in the lockstep doc updates that ride with this batch's commit.

### 6.2 4 truly-unused allow-list entries

`api-versioning`, `input-validation`, `phone-change-rollback`, `privacy-migration-backfill` have zero callsites. Cleanest outcome: removed during Option A's expansion. Until Option A ships, they sit inert (no runtime cost; only doc-clarity cost). Surface here as a known-quiescent finding rather than auto-removing in this batch (would be code change beyond D3's read-only scope).

### 6.3 207 callsites use static literal scopes; 0 use dynamic scopes

`grep -E "createAdminClient\(\`" packages/shared/lib apps/clinic/app apps/patient/app --include='*.ts' --include='*.tsx'` returns no template-literal callsites. All 207 explicit-arg invocations pass plain string literals. This is a **load-bearing precondition for Option C.1** (TypeScript literal-union check) — if a single callsite ever uses a template literal or runtime-built string, C.1's compile-time check is bypassed because TypeScript can't narrow a `string`-typed value to a literal-union member.

**Phase 2 must include an eslint rule that enforces this forward** — not as a separate workstream, but as part of what makes Option A valuable instead of cosmetic. Specifically the rule (or pre-commit hook) MUST:

1. Reject `createAdminClient(\`...\`)` (template literals) — even ones that LOOK static (`` `auto-renew-${suffix}` ``) — because the typechecker can't narrow them to allow-list members.
2. Reject `createAdminClient(variable)` / `createAdminClient(expression)` — same reasoning.
3. Reject `createAdminClient('xyz')` where `'xyz'` is not in the allow-list (today's gap).

(1) and (2) lock today's empirical "0 dynamic scopes" snapshot forward; (3) is the drift gate. Together they make Phase 3 (Option C.1 typescript literal union) a clean drop-in: replace the runtime allow-list with the type, and the eslint rule continues to enforce static-literal-only at commit time.

Surfaced here as part of §5 Option D Phase 2 requirements, not as a separate item. Mentioning here for cross-reference when the Phase 2 workstream picks up.

### 6.4 Phase F Task 19 (root next removal) is decoupled

Per Mo's earlier ruling, the "root `next` is an orphan" question is queued as Phase F Task 19 (P3), not bundled into this reconciliation. Mentioned here only to confirm the decoupling — D3's recommendation is independent of whether Task 19 runs.

---

## 7. Recommended next workstream

**Phase 2 of Option D — Option A expansion + mandatory eslint rule.**

- **Scope (allow-list expansion):** edit `packages/shared/lib/supabase/admin.ts` only. Add 105 missing scopes (grouped by feature with comment dividers matching the existing Build-prefixed style). Remove the 4 truly-unused entries (`api-versioning`, `input-validation`, `phone-change-rollback`, `privacy-migration-backfill`) in the same pass — single end-to-end allow-list survey, not fragmented.
- **Scope (eslint rule — MANDATORY companion):** add a custom eslint rule (or git pre-commit hook if eslint authoring is too heavy) that fails the commit when:
  1. A `createAdminClient('xyz')` callsite passes a static literal NOT in `ALLOWED_ADMIN_SCOPES`.
  2. A `createAdminClient(...)` callsite passes anything that isn't a static string literal — template literals, variables, expressions all rejected unconditionally. Locks the "0 dynamic scopes" precondition (§6.3) forward.
- **Result:** allow-list grows from 35 → 132 (35 + 105 missing − 4 truly unused = 136, then − 4 unused = 132). *[Corrected to 136 in §9.1; the "then − 4 unused = 132" step in the parenthetical is the double-counting error. Phase 2 shipped 2026-05-09 with 136 entries.]* All 207 explicit-arg callsites become "registered." New-scope drift is impossible: any future callsite must add its scope to the allow-list in the same commit, enforced at commit time.
- **Verification:**
  1. `comm -23 callsites.txt allowlist.txt` returns empty.
  2. Three tsc gates clean.
  3. Spot-run a known-active callsite (e.g., a frontdesk check-in) in dev mode and confirm no `console.warn` fires.
  4. **eslint rule self-test:** add a known-bad commit (e.g., `createAdminClient('does-not-exist')` on a feature branch); verify the rule rejects it. Add a known-bad-with-template (e.g., `` createAdminClient(`${prefix}-foo`) ``); verify rejection. Revert.
- **Effort:** s for the allow-list expansion (~15–30 min). m total when the eslint rule + tests are included (~half-day).
- **Lockstep doc updates required (Lesson #13):**
  - ARCH §12 count: 35 → 132.
  - D-008: amendment recording the inventory + Option A application + the eslint enforcement layer + the next-step Option C.1 plan.
  - PROGRAM_STATE.md Phase F Task 16: TRIAGED → IN PROGRESS → DONE (after apply).
  - STATE_OF_WORK.md: Pending workstream "Phase F Task 16 (planned, P1)" → Active → Completed.
  - Possibly a new Empirical Lesson if the eslint-rule authoring surfaces a non-obvious empirical insight (e.g., "eslint can't statically check Set membership without type-narrowing helper" or similar).

**Phase 3 of Option D — Option C.1 typescript literal-union refactor.**

- **Scope:** define `AdminScope` literal union in `admin.ts`; update `createAdminClient` signature; drop the runtime `Set.has()` check; ensure all 207 callsites pass static literals (already guaranteed by Phase 2's eslint rule). The Phase 2 eslint rule continues to enforce static-literal-only — Phase 3 only swaps the runtime gating for compile-time gating.
- **Effort:** m (1–2 days authoring + tsc + integration smoke). Lower risk than originally estimated because Phase 2's eslint rule already guarantees no dynamic callsites exist.
- **Trigger:** Phase 2 lands and is observed for ≥1 cowork session (look for any drift from new feature work; verify the eslint rule is actually firing on contrived bad commits in CI).
- **Lockstep doc updates:** D-008 amendment recording the architectural shift to compile-time check; ARCH §12 paragraph rewritten; Lesson #18+ potentially codified.

---

## 8. Verification log

```text
$ grep -rEn "createAdminClient\(['\"]" packages/shared/lib apps/clinic/app apps/patient/app \
    --include='*.ts' --include='*.tsx' \
  | grep -oE "createAdminClient\(['\"]([^'\"]+)['\"]" \
  | sed -E "s/createAdminClient\(['\"]([^'\"]+)['\"]/\1/" \
  | sort -u > /tmp/callsite-scopes.txt
$ wc -l /tmp/callsite-scopes.txt
135 /tmp/callsite-scopes.txt

$ sed -n '/^const ALLOWED_ADMIN_SCOPES = new Set(\[/,/^\])/p' \
    packages/shared/lib/supabase/admin.ts \
  | sed 's|//.*$||' \
  | grep -oE "^[[:space:]]*'[a-zA-Z][^']*'" \
  | sed "s/^[[:space:]]*'//; s/'$//" \
  | sort -u > /tmp/allowlist-scopes.txt
$ wc -l /tmp/allowlist-scopes.txt
35  /tmp/allowlist-scopes.txt

$ comm -23 /tmp/callsite-scopes.txt /tmp/allowlist-scopes.txt > /tmp/missing-from-allowlist.txt
$ wc -l /tmp/missing-from-allowlist.txt
105 /tmp/missing-from-allowlist.txt

$ comm -13 /tmp/callsite-scopes.txt /tmp/allowlist-scopes.txt > /tmp/unused-allowlist.txt
$ wc -l /tmp/unused-allowlist.txt
5   /tmp/unused-allowlist.txt

$ comm -12 /tmp/callsite-scopes.txt /tmp/allowlist-scopes.txt | wc -l
30   ← intersection: 30 + 105 = 135 ✓; 30 + 5 = 35 ✓
```

All cited counts and sample scopes in §1–§4 trace back to these queries. Where §3.1 cites a file path, it traces from `grep -rln "createAdminClient(['\"]<scope>['\"]) ..."` against the per-scope mapping in `/tmp/missing-with-files.tsv` (built during this session).

---

## 9. Phase 2 shipped (2026-05-09)

> Phase 2 of the §5 Option D sequenced hybrid plan landed the day after this doc was authored. Section preserved as historical record; this addendum records what shipped, including a math correction.

### 9.1 Math correction — "132 → 136"

§5 / §7 / §8 of this doc said "expand allow-list to 132 entries: 35 + 105 missing − 4 truly unused − 4 unused-but-kept-as-default-includes." That arithmetic is wrong: the correct expansion is **35 + 105 − 4 = 136**. The "−4 unused-but-kept-as-default-includes" was a double-counting error (the `api-route` default is already inside the 35 base, not a separate term). The Phase 2 commit ships **136 entries**, not 132. ARCH §12 and DECISIONS_LOG D-008 Amendment 2026-05-09 cite the corrected count.

### 9.2 What shipped

**Allow-list expansion (`packages/shared/lib/supabase/admin.ts`).** The 105 missing scopes added; 4 truly-unused removed; result is 136 entries grouped into 16 feature blocks with comment dividers matching the existing Build-prefixed style. Largest groups by entry count: Patient sharing lifecycle (19), Frontdesk operations (16), Patient data + PCR layer (15), Doctor surfaces (12), Clinic operations (12), Phone-change v2 (9). Smallest: Audit (2), Appointments (2), Prescriptions (3), Clinical sessions (3).

**Custom eslint rule (`eslint-rules/no-unregistered-admin-scope.js`).** Three error classes:

```text
unregisteredScope:  static literal scope not in ALLOWED_ADMIN_SCOPES
templateLiteral:    template-literal arg (backticks) — rejected unconditionally
nonLiteral:         variable / function call / expression — rejected unconditionally
```

The rule reads `ALLOWED_ADMIN_SCOPES` directly from `admin.ts` source via regex extraction (cached for the lint run). No separately-maintained allow-list file; the source IS the truth.

**Plugin packaging.** Standard ESLint plugin convention:
- `eslint-rules/index.js` exports `{ rules: { 'no-unregistered-admin-scope': require('./no-unregistered-admin-scope.js') } }`
- `eslint-rules/package.json` declares `"name": "eslint-plugin-medassist-local"` (the plugin-name convention ESLint requires)
- Root `package.json` devDependencies adds `"eslint-plugin-medassist-local": "file:./eslint-rules"` — npm symlinks the local directory into `node_modules/eslint-plugin-medassist-local` on `npm install`
- `.eslintrc.json` references via `plugins: ["medassist-local"]` + `rules: { "medassist-local/no-unregistered-admin-scope": "error" }`

**`lint:scopes` script.** Added to root `package.json`:

```json
"lint:scopes": "eslint --no-eslintrc --no-inline-config --parser @typescript-eslint/parser --rulesdir eslint-rules --rule '{\"no-unregistered-admin-scope\": \"error\"}' --ext .ts,.tsx packages/shared/lib apps/clinic/app apps/patient/app"
```

Why a separate script (not just `next lint`): `next lint` per-app only scans the app's own `app/**` files; the shared package callsites in `packages/shared/lib/**` are out of scope. The minimal-config `lint:scopes` script scans both surfaces with just our rule + the TS parser, bypassing the next/core-web-vitals plugin's "rule not found" errors that fire on inline `eslint-disable` directives in shared files.

### 9.3 Smoke tests against the rule (all passed)

```text
Smoke #1 — bad scope:           createAdminClient('this-scope-does-not-exist')
                                → unregisteredScope error ✓
Smoke #2 — template literal:    createAdminClient(`scope-${x}`)
                                → templateLiteral error ✓
Smoke #3 — variable arg:        const SCOPE = 'audit-log'; createAdminClient(SCOPE)
                                → nonLiteral error ✓
Smoke #4 — registered scope:    createAdminClient('audit-log')
                                → no error (clean) ✓
Smoke #5 — no-arg call:         createAdminClient()
                                → no error (uses default 'api-route') ✓
```

### 9.4 Five verification gates (all passed)

```text
Gate 1: npm run lint:scopes                          → exit 0 (clean)
Gate 2: npm run lint -w @medassist/clinic            → only pre-existing warnings
Gate 3: npm run lint -w @medassist/patient           → only pre-existing warnings
Gate 4: npm run type-check (root tsc --noEmit)       → exit 0
Gate 5: npm run type-check -w @medassist/clinic       → exit 0
Gate 6: npm run type-check -w @medassist/patient      → exit 0

(Plus the local `next build` gates run on Mo's Mac per Lesson #17 — those are
 the canonical build-time signal; tsc alone doesn't enforce Next's route-handler
 type contracts.)
```

### 9.5 Roadmap forward

Phase 3 (Option C.1 TypeScript literal-union refactor) remains queued. The Phase 2 eslint rule's static-literal-only check carries forward unchanged into Phase 3 — what changes is the runtime check: `Set.has(scope)` is replaced by the TypeScript compiler's narrowing of `scope: AdminScope` against the literal union. The runtime `console.warn` in `admin.ts` will be removed at that point. Option B (runtime throw) is likely **DROPPED** — once Phase 2's commit-time check + Phase 3's compile-time check land, runtime throw is redundant for the static-literal majority (which is 100% of our callsites today and locked forward by the Phase 2 eslint rule).

### 9.6 Observed empirical insight — Lesson #18 surfaced

The "predicted 7 closures, actual 5" misread that triggered §0.5 of the dependabot triage doc surfaced a generalizable methodology rule: filter by event timestamp, not by net delta, when measuring closures. Codified as Empirical Lesson #18 in `audits/EXECUTION_PROMPTS.md` in the same commit as this Phase 2. The Phase 2 work isn't a direct application of Lesson #18 — but the discipline pattern (lock today's empirical precondition forward via a gate) is the same shape: "0 dynamic scopes today" became the static-literal-only eslint rule, in the same way "filter by timestamp" became the verification-query embedding.
