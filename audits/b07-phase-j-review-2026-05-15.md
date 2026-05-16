# B07 Phase J — Review + Phase K/L scoping

**Date:** 2026-05-15
**Reviewers:** Mo, Claude (cowork)
**Source materials:** `audits/b07-phase-i-execution-2026-05-12.md` (Phase I.A + I.B + cowork extension, 800+ lines, 19 findings)
**Pre-work verification:**
- HEAD on origin/main: `0970749` (Phase H.1) ✓
- CI green for HEAD: confirmed by Mo (gh run list: 3 ✓ recent runs) ✓
- Phase I doc complete: §1-§7 + findings + §8 closure + §9 decision log ✓ (cowork session 2026-05-15 added I-16..I-19 + A1 narration extension + D-PI-3)
- All 19 findings classified by severity: ✓ (ratified by Mo this session)
- Evidence for each finding: ✓ (queries, API responses, screenshots interleaved in the Phase I doc)
- `audits/phase-i-screenshots/` directory: EXISTS but empty — screenshots from cowork session are referenced by Chrome MCP IDs (ss_*) in the Phase I doc rather than saved to disk. Acceptable for Phase J review purposes; should be addressed for Phase M (real production walkthrough should capture and persist screenshots).

---

## Section 1 — Findings rollcall

**Per-finding Mo-ratification 2026-05-15 (handoff session).** 4 explicit overrides recorded below; remaining findings default to cowork's draft classification. Severity + workstream classification for all 19 findings:

| # | Title (abbreviated) | Source phase | Severity | Workstream |
|---|---|---|---|---|
| I-1 | Duplicate minor gp from v2 onboard (backend) | I.A | **blocking-MVP** | K-1a |
| I-2 | Prescription storage layer ambiguous | I.A | nice-to-have-pre-launch | Documentation only |
| I-3 | RLS impersonation test-tooling gotcha | I.A | future | Methodology / EXECUTION_PROMPTS |
| I-4 | A2-9 messages-conversation deferred | I.A | future | Phase J targeted investigation |
| I-5 | Patient app has no Vercel deployment | I.A | **blocking-production** | L-1 |
| I-6 | `DEV_BYPASS_OTP=true` in staging Vercel | I.A | launch-checklist | L-2 |
| I-7 | `/` → `/intro` 404 (patient app) | I.B Mo | **blocking-production** | K-3a |
| I-8 | `(auth)/login/` empty directory | I.B Mo | nice-to-have | K-4 |
| I-9 | `/auth` defaults role=doctor | I.B Mo | **blocking-production** | K-3b |
| I-10 | `/otp` 4 input boxes vs 6-digit hint | I.B Mo | TBD pending code-read | K-4 |
| I-11 | (gap) reserved | — | — | — |
| I-12 | `/choose-role` 404 | I.B Mo | nice-to-have | K-3c (rides with K-3a) |
| I-13 | (gap) reserved | — | — | — |
| I-14 | clinic-app reg `is_canonical` NOT NULL violation | I.B Mo | **blocking-production, critical** | K-2a |
| I-15 | raw pg error leaked to UI | I.B Mo | **blocking-production** (sec/UX) | K-2b (rides with K-2a) |
| I-16 | `createPatientAccount` missing `clinic_id` + `global_patient_id` (architectural) | I.B cowork | **blocking-production, critical** | K-2c (extends K-2a) |
| I-17 | Phone storage format inconsistency (`auth.users` no `+`) | I.B cowork | **blocking-MVP** | K-2d (rides with K-2a) |
| I-18 | Patient-app dependents list no UI dedup (**CORE I-1 UI EVIDENCE**) | I.B cowork | **blocking-MVP** | K-1b |
| I-19 | `EG_PHONE_RE` regex malformed | I.B cowork | future / launch-checklist | L-3 (rides with L-2) |

**Tally:**
- Blocking-MVP / blocking-production: **10 findings** (I-1, I-5, I-7, I-9, I-14, I-15, I-16, I-17, I-18, plus I-6 at launch)
- Nice-to-have / launch-checklist / TBD: **5 findings** (I-2, I-8, I-10, I-12, I-19)
- Methodology / future / docs only: **2 findings** (I-3, I-4)
- Phase K-grade: **9 findings** in 4 sub-workstreams (K-1, K-2, K-3, K-4)
- Phase L-grade: **3 findings** in 3 sub-workstreams (L-1, L-2, L-3) plus several non-finding launch items (monitoring, domain, legal, dependabot)
- Phase M-grade (re-verification): all blocking-* findings must be re-verified post-fix

### Mo's overrides 2026-05-15 (handoff session)

The following 4 findings have explicit Mo rulings that override or refine cowork's draft Section 1 classification. All other findings (I-1, I-2, I-3, I-4, I-5, I-6, I-10, I-12, I-14, I-15, I-16, I-17, I-18, I-19) retain the draft classifications above; Mo's prior "ratify en masse" call stands for those. I-6 severity label "launch-checklist" semantically confirmed by Mo this session.

| # | Mo's ruling | Workstream impact |
|---|---|---|
| I-7 | **Option (a)** — build a real `/intro` splash page (NOT redirect-only). | K-3a expands: real `apps/patient/app/(auth)/intro/page.tsx` patient-app onboarding splash with MedAssist branding + brief value prop + "Sign in" CTA → `/auth?role=patient` (post-K-3b becomes just `/auth` in patient app). Arabic-first, mobile-first. Time estimate: 4–8 hours including copy + Arabic review. |
| I-8 | Create `/login` as an **alias** for `/auth?role=patient` (post-K-3b: just `/auth`). NOT delete the directory. | K-4 sub-scope: `apps/patient/app/(auth)/login/page.tsx` re-exports the patient-only auth page OR server-side `redirect('/auth')` — pick whichever is more idiomatic in the existing routing pattern. Rationale: defensive against deep-link bookmarks, password manager autofills, browser history. |
| I-9 | **Option (2)** — split auth surfaces. Patient app gets a patient-only `/auth`. Doctor + frontdesk auth lives ONLY in clinic app. | K-3b expands: (1) read current `apps/patient/app/(auth)/auth/page.tsx`; (2) build patient-only replacement exposing only patient login + register tabs (remove all `role=doctor`/`role=frontdesk` branches); (3) audit nav/redirect/share references — anything pointing at `/auth?role=...` must update; (4) confirm clinic app's multi-role auth page remains intact as canonical doctor/frontdesk auth surface. Time estimate: 1 day cowork. |
| I-13 | **Option (A)** — password-only by product spec. Login-flow refactor is OUT OF SCOPE for B07. | DROP from Phase K. Converted to DECISIONS_LOG entry (see Section 6 — D-082 below). K-2 scope unchanged: I-14 + I-15 + I-16 + I-17 + I-4 (I-13 was never added to K-2 — this confirms it stays out). |

---

## Section 2 — Phase K scope (code fixes)

Phase K resolves the 9 K-grade findings via 4 sub-workstreams. Sequencing matters: **K-2 must land first** (registration must work or no other K work is end-to-end testable). K-1 and K-3 can run in parallel after K-2. K-4 is hygiene that can land anytime.

### K-1 — I-1 + I-18 (duplicate-minor dedup, backend + UI)

**Findings:** I-1, I-18.
**Scope:**
- **K-1a (backend, write-time dedup):** Modify the v2 frontdesk dependent-onboard path (Phase G code in `packages/shared/lib/data/dependents.ts` or wherever `establishMinorClinicPresence` is wired into the onboard handler). Before calling `createMinorGlobalPatient`, lookup `findExistingMinor(guardianGpId, displayName, dateOfBirth?, sex?)`. If found, skip creation and reuse the existing minor gp's id when calling `establishMinorClinicPresence`. Alternative: accept an explicit `minorGlobalPatientId` body parameter for the v2 onboard endpoint; UI form can populate it from a "select existing dependent" picker if one matches. Edge-case design open question: sibling-name collision (twins with same name), accidental re-onboarding mid-session, deliberate re-onboard after merge — these need a small design huddle before code.
- **K-1b (UI, read-time dedup):** Modify the patient-app `/patient/settings/family` list query (likely in `apps/patient/app/(patient)/patient/settings/family/page.tsx` or its data fetcher). Dedup by `(display_name, date_of_birth, sex, guardian)` tuple in the API layer before returning. As defense-in-depth even when K-1a is shipped. Alternatively: render distinguishing metadata (created date, source clinic, internal gp_id) so the mother CAN distinguish; or add a "merge these" affordance. Recommendation: do BOTH dedup AND show distinguishing metadata, in case the duplicate is intentional (twins).

**Estimated cowork time:** K-1a = 4-6 hours including design huddle. K-1b = 2-3 hours.

**Dependencies:** None (independent of K-2). Can start when Phase K opens.

**Sequencing:** K-1a then K-1b (a clean dedup at write-time reduces the data scenarios K-1b needs to handle).

### K-2 — Registration refactor (I-14 + I-15 + I-16 + I-17)

**Findings:** I-14, I-15, I-16, I-17. (I-13 explicitly NOT in this bundle per Mo's 2026-05-15 override — login-flow refactor out of B07 scope; password-only by product spec; see D-082.)
**Scope:** End-to-end refactor of `createPatientAccount` (and likely `createDoctorAccount` + `createFrontDeskAccount` in `packages/shared/lib/data/users.ts`):
- **K-2a (I-14, surgical):** Add `is_canonical: true` to the `users.insert` payload at line 195-200 of users.ts. One-line patch.
- **K-2b (I-15, surgical):** Wrap data-layer DB-error catches in `packages/shared/lib/api/handlers/auth/register/handler.ts` with a generic message ("Failed to create account, please try again"); log raw error server-side via `console.error`; return sanitized message to client. Same pattern as `toApiErrorResponse` in `packages/shared/lib/auth/session.ts`.
- **K-2c (I-16, architectural):** Drop the `patients.insert` call from `createPatientAccount` at line 209-217 entirely. Patient self-registration creates `users` + `global_patients` only (with `claimed=true`, `claimed_user_id=userId`, `normalized_phone=params.phone`, `display_name=params.fullName`). Clinic-presence rows (`patients` table + PCR + DPR) are the frontdesk's responsibility on first clinic visit. Audit all read paths in patient-app (dashboard, settings/family, prescriptions, appointments, etc.) to confirm they query `global_patients` via `claimed_user_id`, not `patients` table. Update tests.
- **K-2d (I-17, cleanup):** Normalize phone storage. Pick canonical form: recommend `+201500099999` (E.164 with `+`) for all application tables, while accepting that `auth.users.phone` will continue to store without `+` per Supabase Auth convention. Document this clearly in `packages/shared/lib/utils/phone-validation.ts`. Add a shared helper `normalizePhone(input)` and require all cross-schema queries to go through it. Optional: add a CHECK constraint on `users.phone` and `global_patients.normalized_phone` enforcing the `+` prefix.

**Estimated cowork time:** K-2 total = 1-2 days. K-2a + K-2b are minutes. K-2c is the big one (refactor + tests). K-2d is half a day if we add the helper + grep call sites.

**Dependencies:** None upstream. **K-2 unblocks K-1 verification** (need real registration to verify K-1 fixes don't regress) and **K-3 verification** (need real patient sign-in to verify routing fixes).

**Sequencing:** K-2a + K-2b together (single commit, smallest unblock). K-2c in a separate commit (refactor + tests). K-2d optional in same commit or follow-up.

### K-3 — Patient-app routing fixes (I-7 + I-9 + I-12)

**Findings:** I-7, I-9, I-12.
**Scope:**
- **K-3a (I-7) — Mo override 2026-05-15 = option (a):** Build a real `/intro` splash page. Create `apps/patient/app/(auth)/intro/page.tsx` as the patient-app onboarding splash — MedAssist branding, brief value prop, "Sign in" CTA → `/auth?role=patient` (post-K-3b becomes just `/auth` in the patient app). Arabic-first, mobile-first. The `apps/patient/app/page.tsx` `redirect('/intro')` already points here — implementation creates the destination page rather than redirecting through to `/auth`. **Estimated time: 4–8 hours including copy + Arabic review.**
- **K-3b (I-9) — Mo override 2026-05-15 = option (2):** Split auth surfaces. Patient app gets a patient-only `/auth`; doctor + frontdesk auth lives ONLY in clinic app. Scope: (1) read current `apps/patient/app/(auth)/auth/page.tsx` (multi-role); (2) build a patient-only replacement that exposes only patient login + register tabs and removes all `role=doctor`/`role=frontdesk` branches from the patient app's auth surface; (3) audit nav/redirect/share references — any pointer at `/auth?role=...` in the patient app must update; (4) confirm clinic app's multi-role auth page remains intact as the canonical doctor/frontdesk auth surface. Architectural rationale captured in D-085. **Estimated time: 1 day cowork.**
- **K-3c (I-12, cosmetic):** Collapses into K-3a for the patient app — the `(auth)/auth/page.tsx` "← اختر دورك" back link points at the post-K-3a `/intro` splash (the canonical first-time landing post-fix). Clinic-app `/choose-role` 404 remains as a separate deferred item; the patient app no longer surfaces this back link once the patient-only auth surface ships per K-3b.

**Estimated cowork time:** K-3 total = ~1.5 days cowork (K-3a 4–8h + K-3b 1 day + K-3c collapsed into K-3a/K-3b).

**Dependencies:** None. Can run in parallel with K-2 (the routing fix doesn't depend on the registration fix).

**Sequencing:** K-3a, K-3b, K-3c in a single bundled commit. They naturally cluster.

### K-4 — Auth flow hygiene (I-8 + I-10)

**Findings:** I-8, I-10.
**Scope:**
- **K-4a (I-8) — Mo override 2026-05-15:** Create `/login` as an alias for `/auth?role=patient` (post-K-3b: just `/auth` in the patient app). NOT delete the directory. Implementation: `apps/patient/app/(auth)/login/page.tsx` re-exports the patient-only auth page OR server-side `redirect('/auth')` — pick whichever is more idiomatic in the existing routing pattern. Rationale: defensive against deep-link bookmarks, password manager autofills, browser history.
- **K-4b (I-10):** Read `apps/patient/app/(auth)/otp/page.tsx` and the verify handler to determine actual digit count expected. Reconcile: 6 boxes in UI OR 4 in docs/bypass. Update whichever is wrong. Run a unit test on the verify handler with the actual digit count.

**Estimated cowork time:** K-4 total = 1-2 hours.

**Dependencies:** None.

**Sequencing:** K-4 can land anytime; lowest priority of all K work.

### Phase K total estimate

- **Time:** 3-4 days of cowork (revised from 2-3 days per Mo's 2026-05-15 K-3 scope expansion: K-3a real splash page + K-3b split auth surfaces). K-2 remains the longest single workstream (1-2 days); K-3 is now ~1.5 days; K-1 ~6-9 hours; K-4 ~1-2 hours.
- **Suggested ordering:** K-2a + K-2b (single commit, unblocks everything) → parallel (K-1 + K-2c + K-3) → K-4 last.
- **Commit strategy:** ~5-6 commits total. Each finding-bundle one PR or one commit. K-2c is potentially two commits (refactor + tests). K-3a + K-3b may bundle as one commit (entry-layer overhaul) or split (splash page + auth-surface split).

---

## Section 3 — Phase L scope (deployment + config)

Phase L is the production-deployment workstream. Some items Mo handles (legal, regulatory, domain procurement); some cowork handles (Vercel project provisioning, env config). Mix of cowork + Mo work over 2-4 days, depending on legal/regulatory pace.

### L-1 — Patient-app Vercel project provisioning (I-5)

**Finding:** I-5.
**Scope:** Create `medassist-patient` Vercel project linked to `apps/patient/` directory in the monorepo. Configure env vars: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL` (production domain), any patient-app-specific keys. Mirror `apps/clinic/vercel.json` to `apps/patient/vercel.json` (with patient-app-specific cron jobs if any). Add `apps/patient/.vercel/project.json` to gitignore. Test build + deploy via Vercel preview before linking to production domain.

**Owner:** Cowork (with Mo for env-var values that aren't already shared with clinic-app).

**Estimated time:** 2-4 hours including first successful production-build verification.

### L-2 — `DEV_BYPASS_OTP` removal + per-environment env config (I-6)

**Finding:** I-6.
**Scope:** Set up per-environment Vercel env var split:
- **Production** (real customer-facing deployment): `DEV_BYPASS_OTP=false` (or remove). Real SMS gateway must be provisioned (Twilio Egypt or Vonage; Mo to procure).
- **Preview / Staging** (Vercel preview deployments): `DEV_BYPASS_OTP=true` retained for testing convenience.
- **Local development**: `DEV_BYPASS_OTP=true` in `.env.local` (no change).

Apply same split to both clinic-app and patient-app Vercel projects.

**Owner:** Cowork sets up the Vercel-side per-env config; Mo procures the real SMS gateway and provides the credentials.

**Estimated time:** Vercel config = 1 hour. SMS gateway procurement = days of Mo wall-time depending on vendor.

### L-3 — `EG_PHONE_RE` regex fix (I-19)

**Finding:** I-19.
**Scope:** Replace `EG_PHONE_RE = /^\+2001[0125][0-9]{8}$/` with `/^\+20(10|11|12|15)[0-9]{8}$/` in BOTH `packages/shared/lib/api/handlers/auth/login/handler.ts:28` AND `packages/shared/lib/api/handlers/auth/register/handler.ts:28`. Update `packages/shared/lib/utils/phone-validation.ts` consistently. Add unit tests covering: standard `+20 + 10 carrier prefix + 8 digits` format passes; old buggy `+200 + 11 digits` format fails; obvious invalids (`+201XXXXXXXX` short, `+201abcXXXXXX` non-numeric, missing `+`) fail.

**Owner:** Cowork. Rides along with L-2's `DEV_BYPASS_OTP` removal commit.

**Estimated time:** 1 hour including tests.

### L-4 — Monitoring, observability, error tracking

**Not a finding** — production-readiness item.
**Scope:** Sentry (or Vercel built-in) error tracking for both apps. Datadog or Grafana for application metrics (request latency, error rate, DB query timing). Logflare or equivalent for structured log aggregation from Supabase. Synthetic uptime monitoring (Better Uptime, UptimeRobot, or Vercel native) for the production domains.

**Owner:** Cowork. Mo to confirm vendor preferences (Sentry vs alternatives; Datadog free tier vs Grafana self-host).

**Estimated time:** 4-8 hours including dashboards. May trade off against monitoring breadth.

### L-5 — Domain, SSL, CDN

**Not a finding** — production-readiness item.
**Scope:** Procure production domains (e.g., `medassist.eg`, `clinic.medassist.eg`, `app.medassist.eg`) per Mo's branding decisions. Wire to Vercel projects via DNS. Vercel auto-handles SSL via Let's Encrypt. CDN is included.

**Owner:** Mo (domain procurement + DNS); cowork can wire Vercel-side once DNS resolves.

**Estimated time:** Domain procurement = 1-2 days wall time. Wiring = 30 min.

### L-6 — Launch checklist (legal, regulatory, compliance)

**Not a finding** — pre-launch legal/regulatory.
**Scope:**
- Terms of Service (Egyptian-jurisdiction; doctor + patient versions).
- Privacy Policy (Egyptian Data Protection Law compliance; PHI handling clauses).
- GDPR-equivalent considerations (Egyptian PDPL): consent flows, data-subject access, data-deletion endpoint, breach-notification SOP.
- Regulatory: Egyptian Ministry of Health licensing for healthcare apps (Mo to investigate); Egyptian Drug Authority for any medication-related features.
- Cookie consent banner if any tracking is added beyond strictly-necessary.
- Patient-data residency: confirm Supabase project region matches data-residency requirements for Egyptian health data.

**Owner:** Mo (legal counsel engagement); cowork can implement consent UI flows once policies are drafted.

**Estimated time:** Days to weeks of wall time depending on legal pace. Soft-launch can proceed with placeholder policies if Mo accepts the risk.

### L-7 + L-8 — Dependabot deferrals (security workstream from 2026-05-11)

**Not findings from Phase I** — pre-existing security debt that becomes production-blocking.
**Scope per `audits/dependabot-deferrals.md` (or equivalent doc Mo maintains):**
- **Deferral A:** Next.js 14 → 15 bump. Major version. Test breadth required.
- **Deferral B:** `next-pwa` migration to whatever the Next 15 PWA story is.
- **Deferral C:** ✓ already done (eslint-config-next 14 → 15, 2026-05-12 commit `5dfc68c`).

**Owner:** Cowork with Mo's approval at each major step (Next 14 → 15 has breaking changes).

**Estimated time:** Deferral A + B together = 1-2 days. Best done after Phase K + before going live (Next 15's improvements help, and the migration is easier on a smaller codebase).

### Phase L total estimate

- **Time:** 5-10 days wall time, mostly Mo-blocked (legal, domain, SMS gateway). Cowork's hands-on portion (Vercel config, monitoring setup, regex fix, dependabot) = 2-3 days.
- **Owner split:** Cowork = L-1 / L-3 / L-4 (technical setup) / L-7 + L-8 (dependabot, with Mo approval). Mo = L-2 (SMS gateway procurement) / L-5 (domain) / L-6 (legal).
- **Sequencing:** L-1 first (Vercel project must exist for everything else). L-2 + L-3 in parallel. L-4 + L-5 in parallel with L-1. L-6 wall-time-blocked, can run in parallel with everything. L-7 + L-8 ideally after K lands so we're not stacking Next 15 migration risk on top of K's registration refactor.

---

## Section 4 — Phase M scope (post-fix verification)

After Phase K + Phase L land, Phase M re-runs Phase I.B against the **actual production deployment** (not staging) to verify all fixes resolved their findings.

### Phase M scope

- **M-1:** Re-run A1 walkthrough end-to-end against production patient-app + production clinic-app. Real registration flow (no SQL stitch). Verify K-2 fix: real patient self-registration via patient-app form works end-to-end (`auth.users` + `users` + `global_patients` all created, no orphans, no NOT NULL errors). Verify K-3 fix: bare `/` lands on a real onboarding page (not 404).
- **M-2:** Continue A1 to the I-1 / I-18 verification. After K-1a lands, the v2 frontdesk dependent-onboard path should auto-detect a matching minor gp under the guardian and reuse it rather than creating a second. After K-1b lands, even if K-1a misses an edge case, the patient-app dependents list should dedup at read time. Empirically verify: after a "duplicate" attempt, mother's `/patient/settings/family` shows ONE Aya, not two. (Per cowork extension finding I-18, the staging baseline was 2 Ayas.)
- **M-3:** Run A2 walkthrough end-to-end against production. This is NEW work (cowork deferred A2 to focus on I-1 UI evidence per Mo's directive). A2 covers delegation grant/accept/use/revoke + clinic-side care-network view + son-on-behalf-of-father booking.
- **M-4:** Verify Phase L deployment items: real SMS arrives on registration (L-2 SMS gateway working). Production domain resolves with SSL (L-5). Sentry/monitoring captures a test error (L-4). Real Egyptian phone format works through the form (L-3 regex fix verified in production-mode, not bypass-mode).
- **M-5:** Audit-trail review: confirm production-side audit emissions match the patterns Phase I.A and Phase I.B validated. No `audit_events` rows skipped (the SQL-shortcut path in cowork session was silent re: audit emissions, but real-flow K-2-fixed registration MUST emit the expected audit events).
- **M-6:** Final smoke: full mother + father + son + frontdesk walkthrough by Mo (UI-driven, not cowork-driven) against production. Capture screenshots persistently (address the cowork extension's `audits/phase-i-screenshots/` empty-directory note). Persist screenshots in the repo as Phase M artifacts.

### Phase M estimated time

- **2-3 hours of cowork** to drive the verification scripts + DB queries.
- **1-2 hours of Mo wall-time** for the final M-6 smoke (Mo-driven UI walkthrough capturing screenshots).
- **Total: half a day** if everything fixes cleanly. If new findings surface (likely; production-deployment-specific bugs that staging didn't expose), expect a re-loop into Phase K (call it K') for surgical fixes + Phase M' re-verification.

---

## Section 5 — B07 closure recommendation

**Recommendation: Option (M-gated close).**

> **B07 closes after Phase M lands clean against the production deployment that Phase L provisions.**

### Rationale

1. **Phase K alone doesn't close B07.** Phase K resolves the code bugs but doesn't prove they're fixed in production. The whole point of Phase I.B's reframe ("production-for-release") was to require empirical end-to-end coverage. Phase M is that coverage.
2. **Phase L alone doesn't close B07.** Phase L gives us a deployed patient app but on top of known-broken code (the current pre-K registration flow). Deploying first would mean shipping a known-broken patient registration to real users.
3. **The K + L + M sequence is the smallest workflow that produces a closeable B07.** Skipping any of the three leaves a known gap.

### Critical-path dependencies

- **K-2 must land first** (registration must work or Phase M can't run real flows).
- **L-1 (patient-app Vercel project) can run in parallel with K** (project provisioning doesn't depend on the code fix; we just won't enable the production domain until K is in main).
- **L-4 / L-5 / L-6 can run wall-time-in-parallel with everything** (Mo-blocked workstreams that don't gate K or M).
- **Phase M waits for both K complete + L-1 + L-2 + L-3 complete.** L-4 / L-5 / L-6 nice-to-have but not strict blockers for M.

### Estimated total time to production-ready state

| Workstream | Cowork time | Mo wall-time | Calendar (best case) |
|---|---|---|---|
| Phase K | 3-4 days (revised 2026-05-15 per K-3 expansion) | 2-3 hours review | 4 days |
| Phase L (technical: L-1/L-2-wire/L-3/L-4/L-7/L-8) | 2-3 days | 1 day approvals | 3 days (parallel with K) |
| Phase L (wall-time: L-2-SMS, L-5-domain, L-6-legal) | 0 | days-to-weeks | 1-3 weeks |
| Phase M | 0.5 day | 2 hours | half a day |
| **Total to "K + L technical + M done, awaiting L wall-time"** | **6-7 days** | **2 days** | **~1.5 weeks** |
| **Total to full closure (L wall-time resolved)** | same | weeks | **2-4 weeks** |

### Risk factors

- **I-13 / I-16's implication**: patient self-registration has been architecturally non-functional since 2026-04-25 (TD-005). No real user has signed up via the patient app in 3 weeks. There may be additional bugs downstream of registration that nobody has hit. Phase M against production should catch most, but plan a soft-launch / closed-beta window before broad release.
- **I-1's design open questions**: K-1a may need a design huddle before code (sibling-name collision, twins, deliberate re-onboarding). Build a half-day buffer into K-1 estimate.
- **Next 15 migration (L-7 + L-8)**: high blast radius; could surface unrelated issues. Consider running it AFTER initial production launch as a follow-on, rather than gating B07 closure on it.
- **L-6 (legal)**: hard to estimate; Egyptian PDPL compliance is non-trivial. If legal review surfaces requirements not yet implemented (right-to-be-forgotten endpoint, data-export, etc.), they become net-new K-class work.
- **Production-only bugs**: the staging environment shares schema with production but has different volume, different access patterns, different real-world inputs. Phase M may surface findings that warrant a Phase K' loop. Plan one re-loop into the schedule.

---

## Section 6 — Doc updates

This section enumerates the doc updates that should accompany Phase J's conclusions. All listed updates happen at session end (after Mo ratifies Sections 1-5 and confirms whether Section 7 prompts are wanted).

### Phase J doc (this file)

- `audits/b07-phase-j-review-2026-05-15.md` — **NEW (this doc).** Full review log. Created during this Phase J session.

### Phase I doc

- `audits/b07-phase-i-execution-2026-05-12.md` — **already updated during cowork extension 2026-05-15** (Findings I-16/I-17/I-18/I-19, A1 narration cowork subsection, persona mapping fill, console observations, §8 closure-framework amendments, D-PI-3). No further updates needed from Phase J unless Section 1 ratification surfaces overrides.

### State-of-work / program-state docs

- `audits/STATE_OF_WORK.md` — **✅ DONE 2026-05-15 (handoff session):** Phase I.B Completed (cowork extension noted); Phase J Completed with Mo-ratified per-finding note + 4 explicit overrides (I-7, I-8, I-9, I-13); Phase K queued (4 bundles, 3-4 days revised); Phase L queued (8 bundles, cowork + Mo wall-time split); Phase M queued (post-K+L re-verification). Time-rollup updated to reflect K's 3-4 day revised estimate.
- `audits/PROGRAM_STATE.md` — **✅ DONE 2026-05-15 (handoff session):** 2026-05-15 entry added to B07 chronology ("Phase J Mo-ratification complete (per-finding, handoff session); 4 explicit overrides (I-7a, I-8 alias, I-9 option 2, I-13 A); Phase K queued with 4 bundles + K-3 scope expansion; D-082 through D-085 added to DECISIONS_LOG"); B07 status header updated to "B07 Phase J Mo-ratified; K+L+M sequence locked; Phase K next." Production-launch readiness top-level workstream entry added pointing at Phase L's L-1..L-8 split.

### DECISIONS_LOG.md

- **D-NNN entries added** (this commit, 2026-05-15 handoff session) — load-bearing decisions surfaced from Phase J's per-finding ratification:
  - **D-082**: "Existing-user sign-in is password-only by product spec." Captures Mo's I-13 ruling (option A) — OTP is reserved for new-account phone-verification at registration and future password-reset recovery channel (Prompt 10 territory). I-13 dropped from Phase K. Rationale: Egyptian clinic context — doctors sign in multiple times daily from clinic workstations; password is the natural primary factor.
  - **D-083**: "B07 closure gated on Phase M against production deployment (not staging)." Captures the K→L→M sequence from Section 5 of Phase J. Rationale: Phase I.B's production-for-release reframe; staging-only verification is insufficient for closure.
  - **D-084**: "Patient self-registration refactored to drop `patients.insert` (K-2c)." Captures the architectural decision that self-registered patients have no `patients` row until first clinic visit. Implements the multi-tenant + phone-first identity model end-to-end (TD-005 / D-041 + D-057 close-out).
  - **D-085**: "Patient app gets a patient-only auth surface (K-3b architectural)." Captures Mo's I-9 ruling (option 2) — patient app's `/auth` is patient-only; doctor + frontdesk auth lives only in clinic app. K-3b expanded from <1 hour flag-flip to ~1 day cowork.

  - **L-3 / EG_PHONE_RE regex fix:** No D-entry added this session — deferred to Phase L per the original Section 6 leaner-log preference. Will be authored when L-3 ships if Mo wants a D-entry; otherwise lives in the L-3 execution log.

---

## Section 7 — Action items + (optional) K + L prompts

**For Mo:**
- Review this Phase J doc; flag any disagreements with Section 1 ratification, Section 2-3 scope, or Section 5 closure recommendation.
- Decide whether Section 7 K + L prompts should be drafted now (in this Phase J session) or deferred to a follow-up.
- Schedule the K-1a design huddle (15-30 min sync to settle the sibling-name / twin / re-onboarding edge cases before K-1a code).
- Kick off legal review for L-6 (longest wall-time item).
- Begin SMS gateway procurement for L-2 (second-longest wall-time item).

**For cowork (next session, conditional on Mo's directives):**
- If Section 7 is requested: draft `b07-phase-k-prompt.md` and `b07-phase-l-prompt.md` in this session.
- Otherwise: write the STATE_OF_WORK.md + PROGRAM_STATE.md updates (Phase J Section 6 TODOs above), commit Phase J doc + Phase I doc updates as one bundled commit.
- Independently: clean up cowork extension's test data on staging (mother `16cd356b-...` + Aya gps `16953624-...` + `e45e67b8-...`) per Mo's earlier directive — recommend AFTER Phase J commits to keep the evidence trail.

### Optional: drafted Phase K prompt (if Mo wants)

> *(To be drafted in next session if Mo requests in Section 7 follow-up.)*

### Optional: drafted Phase L prompt (if Mo wants)

> *(To be drafted in next session if Mo requests in Section 7 follow-up.)*
