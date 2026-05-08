# MedAssist — Architecture Document

> Last updated: 26 April 2026 | Version 0.6.0

---

## 1. What Is MedAssist?

MedAssist's current product surface is a multi-role clinic management system for Egyptian healthcare — Arabic-first, mobile-first, serving doctors, frontdesk staff, and patients across a multi-clinic architecture where a single doctor can belong to multiple clinics and a single frontdesk staff member manages one clinic's daily operations.

**The strategic thesis is broader.** The end-state goal is a connected health management network for Egypt — clinics, doctors, patients, labs, pharmacies, and (eventually) insurance and government reporting all linked through one system. Today's clinic management surface is Phase 1 (Layer 1 in the digitalization stack); each subsequent phase adds another layer of the connected network:

- **Layer 1 (NOW):** Clinic adoption — get doctors using a digital tool consistently
- **Layer 2 (6-12mo):** Patient records — phone-keyed global identity, cross-clinic record sharing
- **Layer 3 (1-2y):** Patient engagement — patient app, follow-up booking, records access
- **Layer 4 (3-5y):** Service network — lab orders/results, pharmacy prescriptions, referrals
- **Layer 5 (5-10y):** Ecosystem integration — insurance claims, government reporting

See PRODUCT_SPEC.md "The Egyptian Healthcare Digitalization Stack" for the full thesis and rationale. Architectural decisions in this document are made in service of this trajectory: the global identity layer (§5.4), privacy code mechanism (§5.5), and directional consent model (§5.6) are the load-bearing pieces that unlock Layer 2 and beyond.

The system runs as a Next.js 14 web app backed by Supabase (PostgreSQL 17.6 + Auth + Realtime + Storage), with an offline-capable PWA shell. Two front-end apps share `@medassist/shared` and `@medassist/ui-clinic`: `apps/clinic/` (doctor + frontdesk) and `apps/patient/` (patient-facing). Mobile distribution will use a **Capacitor PWA shell** wrapping the same Next.js app for iOS and Android (D-043), reusing every line of the shared packages.

---

## 2. Monorepo Structure

```
medassist/
├── apps/
│   ├── clinic/                    # Doctor + frontdesk web app (Next.js 14.2, App Router)
│   │   ├── app/
│   │   │   ├── (auth)/            # Auth route group (public)
│   │   │   ├── (doctor)/          # Doctor route group (role-gated)
│   │   │   ├── (doctor-print)/    # Print-only layout (no nav chrome)
│   │   │   ├── (frontdesk)/       # Frontdesk route group (role-gated)
│   │   │   └── api/               # ~110 API route handlers (incl. B04/B05 surfaces)
│   │   ├── public/                # Static assets, PWA manifest
│   │   └── tailwind.config.ts     # Design tokens, custom theme
│   │
│   └── patient/                   # Patient-facing web app (Next.js 14.2, App Router)
│       ├── app/
│       │   ├── (auth)/            # Patient auth route group (public)
│       │   ├── (patient)/         # Patient role-gated route group
│       │   │   └── patient/       # Patient routes nested under role group
│       │   │                      # (appointments, dashboard, diary, health,
│       │   │                      #  messages, more, prescriptions, privacy, sharing)
│       │   └── api/               # Patient-facing API handlers
│       ├── public/                # PWA manifest, static assets
│       └── tailwind.config.ts     # Design tokens (independent of clinic config)
│
├── packages/
│   ├── shared/                    # @medassist/shared
│   │   └── lib/
│   │       ├── auth/              # Session management, OTP, requireServiceRole
│   │       ├── data/              # Data access layer (~30 modules incl. global-patients,
│   │       │                      # patient-clinic-records, patient-shares, privacy-codes,
│   │       │                      # identity-resolution, phone-normalize)
│   │       ├── date/              # Cairo timezone helpers (cairo-date.ts)
│   │       ├── i18n/              # Arabic + English string tables
│   │       ├── analytics/         # Doctor stats, event tracking (31 tests)
│   │       ├── api/handlers/      # Shared API handler logic (per-feature subdirs;
│   │       │                      # see §7 for full route inventory)
│   │       ├── audit/             # Audit trail logger
│   │       ├── notifications/     # Push notification creation
│   │       ├── hooks/              # Shared React hooks (useOfflineMutation — IDB-backed offline write queue)
│   │       ├── offline/           # IndexedDB cache + pending-writes queue (idb-cache.ts only)
│   │       ├── privacy/           # Schema health checks
│   │       ├── realtime/          # Supabase realtime subscriptions
│   │       ├── security/          # Rate limiting
│   │       ├── sms/               # Twilio client, SMS templates
│   │       ├── supabase/          # Client/server/admin Supabase factories
│   │       ├── utils/             # Phone validation, normalization, invite codes, etc.
│   │       └── validation/        # Zod schemas, input validators
│   │
│   └── ui-clinic/                 # @medassist/ui-clinic
│       └── components/
│           ├── clinic/            # Clinic-wide components (selector, badges)
│           ├── doctor/            # Doctor section UI (shell, header, cards)
│           ├── frontdesk/         # Frontdesk section UI (queue, forms)
│                                  # Note: PrivacyCodeEntryModal lives in apps/clinic/components/frontdesk/, not here
│           ├── patient/           # Patient section UI (shell, nav)
│           └── shared/            # Cross-role shared components
│
├── supabase/
│   └── migrations/                # 109 non-rollback migration files; highest base 106.
│                                  # See §8.6 for migration timeline + retirement notes.
│
├── .husky/
│   └── pre-push                   # Type-check gate (see D-042 + D-045)
├── package.json                   # npm workspaces root (prepare: husky)
├── tsconfig.json                  # Root TypeScript config with per-app path aliases
└── turbo.json                     # Turborepo pipeline config
```

**Workspace wiring**: npm workspaces link `@medassist/shared` and `@medassist/ui-clinic` into both `apps/clinic` and `apps/patient`. TypeScript path aliases are `@shared/*`, `@ui-clinic/*`, `@patient/*`, and `@clinic/*`.

**Path alias mechanics**: each per-app alias is declared at three levels with a per-app prefix that is unique across apps. (1) Root `tsconfig.json` `paths` block — read by the pre-push hook's `tsc --noEmit` gate (D-045). (2) Per-app `tsconfig.json` `paths` block — read by Next.js dev/build for TypeScript resolution. (3) Per-app `next.config.js` `config.resolve.alias` block — read by webpack at build time (Next 14.2.x's resolver does not always honor tsconfig path aliases for cross-segment imports inside an app, surfaced by CI run 25475031898). The previous shared `@/*` per-app convention was retired in commit `bb50305` after the same alias name resolved to different per-app directories; the third-level webpack-alias declarations landed in commit `9774252` as preventive discipline (alongside the build-log capture in `ci.yml` that this paragraph's diagnostic context depends on). Standing rule: declare at all three levels, prefix per-app, never share an alias name across apps. Codified as Empirical Lesson #14 in `audits/EXECUTION_PROMPTS.md`.

> **Correction 2026-05-07 (later)**: an earlier draft of the paragraph above attributed the operational CI fix for run 25475031898 to commit `9774252`'s webpack-alias additions. That attribution was empirically wrong — six consecutive CI failures (runs 115–120) bracket the `9774252` merge, with runs 118/119/120 all failing post-`9774252`. The actual operational fix was a route-handler type contract issue (one-character `?` removal at `packages/shared/lib/api/handlers/patient/sharing/handler.ts` line 27) shipped in commit `80ee270`; CI run 25539467112 against that commit is green. `9774252` contributed the build-log capture infrastructure (necessary for diagnosing the route-handler failure six runs later) and the third-level webpack aliases (defensible preventive discipline), but did not fix the active bug. The three-level path-alias rule still stands as correct discipline; only the cited empirical justification needed reframing. The route-handler-contract failure mode is captured separately as Empirical Lesson #17. See D-065 Amendment 2026-05-07 (later) for the matching decision-log correction.

---

## 3. Technology Stack

| Layer | Technology | Version | Notes |
|-------|-----------|---------|-------|
| Framework | Next.js (App Router) | 14.2.25 | Server components + client islands. Both `apps/clinic` and `apps/patient` pin this. The root `package.json` pins 14.1.0 (older, but unused — Next.js runs from the per-app workspace context). |
| Language | TypeScript | 5.x | Strict mode, 0 errors. Root `tsc --noEmit` + per-workspace `type-check` both gate CI per D-045. |
| Styling | Tailwind CSS | 3.4 | Custom design tokens, Cairo font, RTL-first. Each app has its own `tailwind.config.ts`. |
| Database | PostgreSQL (Supabase) | 17.6 | Staging on `medassist-egypt` (eu-central-1). RLS rewrite landed via mig 092-097 (incl. 094a) + forensic mig 106 + Phase D matrix prep mig 107 + Phase F Task 18 teardown fix mig 108; 111 non-rollback migration files on disk (highest base 108). See §8.6. |
| Auth | Supabase Auth | — | Email/phone + password, OTP verification. Phone-change v2 (mig 070) syncs `auth.users.phone` and `public.users.phone` atomically. |
| Realtime | Supabase Realtime | — | Queue subscriptions, live updates |
| Storage | Supabase Storage | — | Attachments bucket |
| SMS | Twilio | — | OTP, appointment reminders, prescription delivery, share-expiring notifications, privacy-code SMS share consent |
| PWA | next-pwa | 5.6 | Service worker, offline page, IDB cache + pending-writes queue (D-050). Clinic app only. |
| Error Tracking | Sentry | 10.38 | `@sentry/nextjs` integration |
| Package Manager | npm | 10.x | Workspaces for monorepo. Specific version varies by developer environment. |
| Build | Turborepo | — | Pipeline: lint → type-check → build. Config in `turbo.json`. |
| Git Hooks | Husky | 9.x | `pre-push`: runs root `npm run type-check` (monorepo-wide `tsc --noEmit`) + per-workspace `type-check -w @medassist/clinic`. Root gate catches phantom imports invisible to per-workspace tsconfig (D-045). Originally added after `b724eb1` incident (D-042). |

---

## 4. Authentication & Authorization

### 4.1 Auth Flow

```
User opens app
  → /role-select (choose: doctor / frontdesk / patient)
  → /login or /auth (tabbed login + register)
  → Supabase signInWithPassword (phone resolved to email internally)
  → API validates: users.role === selected role
  → Session cookie set (httpOnly, Supabase manages refresh)
  → Redirect to role-specific dashboard
  → OTP verification for registration + password reset
```

### 4.2 Role-Based Route Protection

Each route group has a layout that calls `requireRole()`:

```
(auth)/          → Public, no auth required
(doctor)/        → requireRole('doctor')   → redirect if wrong role
(frontdesk)/     → requireRole('frontdesk')→ redirect if wrong role
(doctor-print)/  → requireRole('doctor')   → minimal layout, no nav
```

API routes use `requireApiRole()` which returns 401/403 instead of redirecting.

### 4.3 Session Management

- **Middleware** (`middleware.ts`): Refreshes Supabase auth session on every request
- **`getCurrentUser()`**: Returns `{ id, email, role }` from `users` table
- **`requireAuth()`**: Server component guard, redirects to `/login`
- **`requireRole(role)`**: Server component guard, redirects to correct dashboard if role mismatch
- **Session verification**: Login uses exponential-backoff polling to confirm cookies are set before redirect
- **Rate limiting**: 8 attempts per 60 seconds on auth endpoints

---

## 5. Multi-Clinic Architecture

This section covers the **per-clinic** scope: clinic-membership RBAC, intra-clinic patient visibility, and clinic-context resolution. The cross-clinic patient identity model — global identity, privacy code, and directional consent for cross-clinic record sharing — is in §5.4 / §5.5 / §5.6.

### 5.1 Core Tables

```
clinics
├── id, name, phone, address, default_visibility
├── invite_code (short alphanumeric for staff onboarding)
└── appointment_window_enabled, gap_minutes

clinic_memberships (unified RBAC — Migration 018; authoritative since mig 051)
├── clinic_id → clinics.id
├── user_id → auth.users.id
├── role: 'OWNER' | 'DOCTOR' | 'ASSISTANT' | 'FRONT_DESK'
├── status: 'ACTIVE' | 'INVITED' | 'SUSPENDED'
└── created_by, timestamps
NOTE: clinic_memberships is the sole source of truth for clinic RBAC.
      Mig 052 dropped `clinic_doctors` AND `clinic_frontdesk` entirely
      and dropped the `clinic_id` column from `front_desk_staff`. The
      `front_desk_staff` table is retained as a metadata-only
      display-name table; its `clinic_id` is gone. The data-layer
      fallback paths through these legacy tables were removed in
      commit `2ba4a86`. Any new code that needs clinic membership
      must query `clinic_memberships` directly.

assistant_doctor_assignments (scope control)
├── assistant_user_id
├── doctor_user_id
└── scope: 'APPOINTMENTS_ONLY' | 'PATIENT_DEMOGRAPHICS' | 'FULL_DOCTOR_SUPPORT'
```

### 5.2 Clinic Context Resolution

```typescript
getClinicContext(userId, role) → {
  clinicId: string
  clinic: ClinicInfo
  allClinics: ClinicInfo[]
  hasMultipleClinics: boolean
  clinicDoctorIds: string[]
}
```

- **Doctors**: Can belong to multiple clinics. Active clinic stored in `active_clinic_id` cookie. Body/cookie hints are validated against `clinic_memberships` (status `ACTIVE`) before use, never trusted directly (D-041).
- **Frontdesk**: Single ACTIVE clinic assignment. Two helpers serve different needs: `getFrontdeskClinicId(supabase, user.id)` (in `frontdesk-scope.ts`) returns just the id and is the canonical tenant resolver for write handlers per D-041 + D-059; `getFrontdeskClinic(userId)` (in `clinic-context.ts`) returns the full `ClinicInfo` for read-side rendering. Several legacy handlers still use `getUserClinicId` instead of `getFrontdeskClinicId` — tracked in TD-016 for migration.
- **Data isolation**: All queries scoped to `clinic_id`. RLS enforces at the DB level as the primary security gate. Service-role admin client bypasses RLS for specific scoped operations (audited per D-008); the current scope-tracking pattern has known drift (Phase F follow-up tasks in `audits/PROGRAM_STATE.md`). See §12 for the hybrid INVOKER/DEFINER security model.

### 5.3 Patient Visibility Model (intra-clinic)

This subsection describes the **intra-clinic** visibility model — who within a single clinic can see which patients. The **cross-clinic** sharing model (when patient X visits clinic A and clinic B both want to see records) is governed by directional consent and lives in §5.6.

The `visibility_mode` enum (mig 053) has three values; only the first two are wired in the UI today:

- **`DOCTOR_SCOPED_OWNER`**: Each doctor sees only their own patients (default)
- **`CLINIC_WIDE`**: All doctors in the clinic see all patients
- **`SHARED_BY_CONSENT`**: Reserved for a future per-patient consent-driven mode; not surfaced in the UI yet

Frontdesk always sees all patients in their clinic.

The intra-clinic model is enforced by the legacy `patient_visibility` table (per-doctor grants seeded in mig 052). It coexists with the cross-clinic `patient_data_shares` table (mig 090) introduced in Build 05 — see §5.6. Legacy intra-clinic grants are slated for retirement once the cross-clinic model fully replaces them, in Prompt 6.5 (Legacy Cleanup) per `audits/EXECUTION_PROMPTS.md`.

### 5.4 Two-Layer Patient Identity Architecture (cross-clinic)

**What it is.** The system maintains two layers of patient identity. The **global layer** (`global_patients` table) holds one row per real human, keyed by phone. The **per-clinic layer** (`patient_clinic_records`, abbreviated PCR) holds one row per `(global_patient_id, clinic_id)` pair, carrying the clinic-specific notes (chief complaint, demographics-as-known-to-this-clinic, encounter history). The legacy `patients` table is retained — every row carries `global_patient_id` (NOT NULL since mig 077) plus a back-reference to its PCR — but its role has narrowed to a compatibility surface that the rest of the application reads from while the data layer migrates over to the global+PCR layer. This split is the structural prerequisite for Layer 2 of the network thesis (§1): a patient seen at clinic A is the same identity at clinic B without sharing the underlying data unless consent is granted (§5.6).

**Tables and key columns.**
- `global_patients` — id (uuid pk), normalized_phone (UNIQUE, NULL only for quarantined sentinels), claimed_user_id (nullable, FK auth.users), account_status enum (`patient_account_status`: `active | suspended | locked | deceased | merged`), is_canonical (B), legacy_phone (preserved for un-normalizables). **Sentinel rows** are not a separate enum value — they are encoded as `account_status='locked' AND normalized_phone IS NULL` (mig 076 quarantine path); the term "sentinel" describes the row, not the status value.
- `patient_clinic_records` — id (uuid pk), global_patient_id (FK), clinic_id (FK), consent_to_messaging (B), per-clinic notes columns. Unique on (global_patient_id, clinic_id).
- `patients` (legacy) — id, global_patient_id (NOT NULL since mig 077), patient_clinic_record_id (back-ref), clinic_id (still populated through Prompt 6; dropped in 6.5), all the original demographic columns. Coexists with the new layer via the compatibility shim triggers below.
- 11 clinical tables (`clinical_notes`, `prescription_items`, `appointments`, `lab_orders`, `lab_results`, `imaging_orders`, `vital_signs`, `patient_consent_grants`, `doctor_patient_relationships`, `patient_visibility`, `patient_phone_history`) carry both `global_patient_id` + `patient_clinic_record_id` as FKs (added by mig 080).

**Migrations.** Architectural cross-refs: **mig 071** (Egyptian phone normalization function `normalize_phone_e164` — produces E.164 `+201XXXXXXXXX` output; the TS counterpart is `normalizeEgyptianPhone` in `phone-normalize.ts`, parity-tested), **mig 073** (`global_patients` table + `is_canonical`/`duplicate_of_patient_id` flags on `patients`, with backfill from the `_patient_dedup_plan` staged in mig 072), **mig 075** (`patient_clinic_records` table), **mig 077** (flips `patients.global_patient_id` to NOT NULL after backfill is verified complete), **mig 080** (adds `global_patient_id` + `patient_clinic_record_id` FKs to the 11 clinical tables), **mig 081** (compatibility shim triggers — see security/access section below). Supporting/operational migrations: 072 (patient-side dedup detection — companion to 078-079 user-side dedup), 076 (quarantine resolution paths for un-normalizable phones; emits sentinel `global_patients` rows so 077 can enforce NOT NULL), 078-079 (user-side dedup, parallel concern), 082 (R1 phone recovery — Build 04 operational sweep on +200xxx leading-zero phones), 088 (PCR insert audit trigger), 089 (`auth.users.phone` hygiene — Build 04 D7 staff-side normalization).

**Security/access model.** RLS on `global_patients` and `patient_clinic_records` is enforced via the helper functions added in mig 092 + 094a + forensic mig 106 — `is_clinic_member` (DEFINER), `can_clinic_access_global_patient` (INVOKER), `can_patient_access_global_patient` (INVOKER), `can_view_patient_data_at_clinic` (DEFINER), `user_has_clinic_path_to_gp` (DEFINER post-094a). The hybrid INVOKER/DEFINER mix is the result of Mo's 2026-04-30 Phase 6 ruling — see §12. A clinic sees its own PCR rows by default (membership match); it sees other clinics' PCR rows only via a `patient_data_shares` grant (§5.6).

**Compatibility shim (mig 081).** Until the data-layer cutover to `global_patient_id` is 100% complete (Prompt 6.5), INSERTs into the 11 clinical tables can arrive in three shapes — legacy (`patient_id` only), new (`global_patient_id` + `patient_clinic_record_id` only), or both. A `BEFORE INSERT OR UPDATE` trigger on each affected table normalizes the shape: it derives the missing side from the present side, and on "both set" it verifies they agree (mismatch raises — silent overwrite would be the worst failure). The shim triggers retire when Prompt 6.5 drops the legacy `patient_id` columns.

### 5.5 Privacy Code Mechanism

**What it is.** A privacy code is a **6-character base32 alphanumeric** code (alphabet `23456789ABCDEFGHJKLMNPQRSTUVWXYZ` — 0/1/I/O removed for transcription clarity) that a patient gives to a frontdesk staffer at a new clinic to grant that clinic time-bounded access to records held at clinics where the patient already has a relationship. The code is the user-facing handle for the directional consent grant in §5.6. The code length, alphabet, and security parameters are all locked numerics — see `audits/EXECUTION_PROMPTS.md` "Locked numerics (2026-04-28)" for the canonical values.

**Tables and key columns.**
- `patient_privacy_codes` — id, global_patient_id (FK), code_hash (bcrypt cost 12), `algorithm` (default `'bcrypt'`), `attempts_count`, `last_attempt_at`, `locked_until`, `regenerated_count`, `created_at`, `revoked_at` (nullable), `revoked_reason`. One active code per global_patient (unique partial index where `revoked_at IS NULL`).
- `privacy_code_attempts` — global_patient_id, clinic_id, result enum (`privacy_code_attempt_result`), attempted_at. Used to enforce per-(patient, clinic) rate limit + per-code lockout.
- `privacy_code_sms_tokens` — id, global_patient_id, requesting_clinic_id, requesting_doctor_id, `sms_code_hash` (bcrypt-hashed 4-digit code), `algorithm`, `created_at`, `expires_at` (NOW + 5 min), `used_at` (nullable; NULL = unused, NOT NULL = consumed). Powers the alternative SMS-share flow when the patient doesn't remember the privacy code in person.

**Migrations.** **Mig 084** (`privacy_code_attempts` rate-limit table), **mig 085** (`patient_privacy_codes` table), **mig 086** (`privacy_code_sms_tokens`), **mig 087** (`verify_privacy_code` and `regenerate_privacy_code` SECURITY DEFINER RPCs — bcrypt-verify, audit, rate-limit/lockout enforcement, uniform timing pad).

**Security/access model.**
- **RNG:** `gen_random_bytes()` from pgcrypto. NEVER `random()` — that's a deterministic PRNG.
- **Storage:** bcrypt hashed at cost 12 (~400ms verify time on contemporary hardware; cost selected for offline-brute-force resistance). Plaintext codes are shown to the patient on regeneration ONCE, never stored.
- **Distribution:** unbiased — 256 ÷ 32 = 8 exactly, so simple modulo-32 sampling on each random byte produces uniform output without rejection-sampling overhead.
- **Per-clinic rate limit:** 5 attempts/hour per `(global_patient_id, clinic_id)` pair → 1-hour soft lockout, NO SMS notification.
- **Per-code lockout:** 5 failures across all clinics → 24-hour hard lockout + SMS notification fires to the patient (sender wrapped because the SECURITY DEFINER function does NOT itself initiate Twilio).
- **SMS-consent token TTL:** 5 minutes (accommodates Egyptian SMS delays + older patients).
- **Uniform timing:** the `check_phone_uniform` shim pads all verify-flow responses to a minimum of 50ms regardless of whether a patient exists. Defends against phone-existence enumeration via timing — without uniform timing, a fast 401 would mean "no such phone" and a slow 401 would mean "phone exists, code wrong." Latency parity test threshold: <5ms p95 difference.
- The privacy-invariant UI rule (frontdesk side): the "patient not found" branch renders identically for "patient at another clinic" and "patient at no clinic." Phone-shaped input gets a "Request access" CTA + "Register new patient"; name-shaped input gets "Register new patient" only. No leaky API call distinguishes the two cases.

### 5.6 Directional Consent — Patient Data Shares

**What it is.** When a clinic verifies a patient's privacy code (or a patient-app share-grant action), a **share** is created in `patient_data_shares` from each clinic where the patient already has a PCR ("grantor clinics") to the clinic that just verified ("grantee clinic"). The grant is **directional**: the grantee clinic can read the grantor clinic's records about this patient; the grantor clinic does NOT auto-see the grantee clinic's records back. Reciprocity, when it happens, requires a separate grant in the opposite direction. This is the cross-clinic complement to §5.3's intra-clinic visibility model.

**Tables and key columns.**
- `patient_data_shares` — id, global_patient_id (FK), grantor_clinic_id (FK), grantee_clinic_id (FK), granted_at, expires_at (nullable; NULL = permanent), revoked_at (nullable), `granted_via` (constrained TEXT column with a CHECK constraint accepting `'PRIVACY_CODE' | 'SMS_CODE' | 'PATIENT_APP' | 'AUTO_RENEW'` — implemented as TEXT+CHECK, not a Postgres enum type), grant_reason (text, optional). Active = `revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW())`. Permanent = `expires_at IS NULL AND revoked_at IS NULL`.
- Audit actions: `SHARE_GRANTED`, `SHARE_EXTENDED`, `SHARE_REVOKED`, `SHARE_AUTO_RENEWED`, `SHARE_EXPIRED` — all written to `audit_events` synchronously and transactionally per the 2026-04-28 ruling on privacy-sensitive audits.

**Migrations.** **Mig 090** (`patient_data_shares` table + lifecycle RPCs — revoke, extend, auto-renew-on-visit, mark-share-expired-notification). **Mig 091** (`create_shares_for_grantors` atomic helper RPC — given a `global_patient_id` and a grantee clinic, locates all grantor clinics and inserts one share row per grantor in a single transaction; called by the privacy-code and SMS-code verify handlers after consent is established).

**Lifecycle and security/access model.**
- **Default expiry:** 90 days from `granted_at`.
- **Auto-renew on visit:** when the patient checks in at the grantee clinic again, the existing share's `expires_at` advances forward to NOW + 90 days. Action audited as `SHARE_AUTO_RENEWED`. Implemented in `apps/clinic/.../checkin/handler.ts` via `autoRenewOnVisit()` (fire-and-forget; failure is non-fatal — the encounter takes precedence over the audit).
- **Patient-side extend:** patient can extend an active share to 90 days, 1 year, or permanent from the patient app's `/patient/sharing` page.
- **Revoke:** patient can revoke any share at any time. Revoke blocks future reads; past reads remain in the audit trail (the past is immutable).
- **Stale-share expiration:** runs as a daily Vercel cron (02:00 UTC) implemented in `apps/clinic/app/api/cron/expire-stale-shares/route.ts`; no DB-side scheduler. The cron sends Egyptian-Arabic SMS notifications via the existing Twilio infrastructure.
- **RLS:** the cross-clinic read path goes through `can_clinic_access_global_patient(p_global_patient_id, p_clinic_id)` (mig 092 helper #2, INVOKER per mig 106). The helper returns true if EITHER (a) this clinic has its own `patient_clinic_records` row for the patient — intra-clinic ownership — OR (b) the clinic is the grantee on an active, non-expired `patient_data_shares` row for the patient — cross-clinic grant. The helper itself does NOT check clinic membership; the RLS policy that calls it pairs the helper's "can this clinic see this patient?" with the policy-side "is the caller an active member of this clinic?" — together they enforce the cross-clinic read rule. INVOKER means the share lookup runs as the calling user (not a privileged subject), so the caller must independently have the right to see the share row under `patient_data_shares` RLS. See §12.
- **Locked exception to the audit-everything-sync rule:** the auto-renew-on-visit code path is the ONE allowed fire-and-forget audit per Build 05 § B7. Reasoning: preserving the encounter (already inserted at that point) takes precedence over guaranteeing the renewal audit. If renewal silently fails, the share will eventually expire on its normal schedule and a notification will fire — not a privacy hole, just a UX gap.

---

## 6. Data Layer

### 6.1 Supabase Client Hierarchy

```
createClient()          → Authenticated user context (respects RLS)
createAdminClient(scope) → Bypasses RLS (scope param for audit trail)
                           scope default: 'api-route'
                           Allowed scopes: 'api-route', 'clinical-notes', etc.
```

### 6.2 Key Data Modules (`packages/shared/lib/data/`)

| Module | Purpose |
|--------|---------|
| `patients.ts` | Patient CRUD, doctor-patient relationships, onboarding |
| `clinical-notes.ts` | Clinical session notes, save with Rx intelligence |
| `clinical.ts` | Prescription data, patient summaries |
| `frontdesk.ts` | Queue management, check-in, appointments, payments. `getAvailableSlots()` returns `AvailableSlotsResult` with `SlotReason` enum (`'ok' \| 'no_availability_configured' \| 'doctor_off_today'`) so the UI can render reason-specific Arabic messages instead of a silent empty list. See D-058. |
| `frontdesk-scope.ts` | Clinic scoping for frontdesk operations |
| `clinic-context.ts` | Clinic resolution, active clinic, doctor lists |
| `memberships.ts` | Clinic membership management |
| `appointments.ts` | Appointment CRUD, scheduling logic |
| `appointments-utils.ts` | Gap-aware scheduling, availability calculation |
| `medications.ts` | Medication tracking, intake logs |
| `drug-interactions.ts` | Drug-drug interaction checks |
| `egyptian-drugs.ts` | Egyptian drug database, local names |
| `templates.ts` | Prescription templates (doctor-owned) |
| `visibility.ts` | Patient visibility enforcement |
| `messaging-consent.ts` | Consent-based messaging rules |
| `lab-results.ts` | Lab result storage and retrieval |
| `patient-dedup.ts` | Duplicate patient detection |
| `global-patients.ts` | Global identity layer access (one row per real human, keyed by phone). Key exports: `findGlobalPatientByPhone(phone)`, `findGlobalPatientById(id)`. Used by the `admin/global-patients-lookup` service-role endpoint and the privacy-code verify path. See §5.4. |
| `patient-clinic-records.ts` | Per-(global_patient, clinic) CRUD on the `patient_clinic_records` table. Key exports: `findPatientClinicRecord(gpid, clinicId)`, `upsertPatientClinicRecord(...)`, `listClinicRecordsForGlobalPatient(gpid)`, `listGlobalPatientsForClinic(clinicId)`. Backs the `admin/patient-clinic-records` service-role endpoint and is the data layer behind the new clinical write path during the cutover. See §5.4. |
| `identity-resolution.ts` | Resolves the (global_patient_id, clinic_id) pair into a legacy `patients.id` for clinics that still drive their UI off the legacy table. Key export: `resolveIdentityForClinic(globalPatientId, clinicId, legacyHints?)`. Called by the `verify-privacy-code` and `verify-sms-code` handlers after consent is established to materialize the legacy row + DPR for the grantee clinic before the standard check-in path takes over. |
| `privacy-codes.ts` | Privacy-code RPC client and lifecycle. Key exports: `hasActivePrivacyCode(gpid)`, `regeneratePrivacyCode({ gpid, authMode: 'patient' \| 'service' })`, `verifyPrivacyCode({ phone, code, attemptedByUserId, attemptedByClinicId })`, `initiateSmsShare(...)`, `verifySmsCode(...)`, `checkPhoneUniform(phone)`. All call into the SECURITY DEFINER RPCs from mig 087; the TS layer applies the uniform-timing pad on every verify outcome (see §5.5). |
| `patient-shares.ts` | Patient data shares lifecycle (cross-clinic directional consent). Key exports: `listSharesForPatient({ globalPatientId, includeExpired? })`, `listExpiringShares({ windowHours })`, `markShareExpiredNotification({ shareId, cronRunId })`, `revokeShare({ shareId, reason? })`, `extendShare({ shareId, duration })` where `duration: '90d' \| '1y' \| 'permanent'`, `autoRenewOnVisit({ globalPatientId, granteeClinicId, encounterId })`, `createSharesForGrantors({ globalPatientId, granteeClinicId, granteeVia })`. Powers the patient-app `/patient/sharing` page, the daily expire-stale-shares cron, and the auto-renew-on-visit hook in the frontdesk check-in handler. See §5.6. |
| `payments.ts` | Payment status constants (`PAYMENT_STATUS`: `pending \| completed \| refunded \| cancelled`), `isCollectedPayment` predicate. Single source of truth for payment status checks — never hardcode status strings in queries. |
| `users.ts` | User account creation per role. `createDoctorAccount()` auto-seeds 5 default `doctor_availability` rows (Sun–Thu 09:00–17:00, 15-min slots) on doctor registration. Idempotent via `upsert` with `ignoreDuplicates`. Failure logs but does not fail registration. See D-058. |
| `phone-changes.ts` | Phone-change workflow engine (~1400 lines, 8 public functions). Covers the full lifecycle: `requestPhoneChange`, `verifyPhoneChangeStep`, `cancelPhoneChange`, `openPhoneChangeFallback`, `getPendingPhoneChangeRequests`, `approvePhoneChangeRequest`, `rejectPhoneChangeRequest`, `correctPatientPhone`. Orchestrates dual-OTP verification (old phone + new phone), auth-admin sync (`supabase.auth.admin.updateUserById`), cross-clinic patient propagation via `change_phone_commit` RPC, compensating rollback via `change_phone_rollback` RPC on auth-admin failure, and per-clinic audit fan-out. All endpoints gated behind `FEATURE_PHONE_CHANGE_V2` env flag. See D-051. |

**Related utility** — `packages/shared/lib/utils/phone-normalize.ts` (`normalizeEgyptianPhone`) is the TypeScript counterpart of mig 071's `normalize_phone_e164` SQL function. It produces the same E.164 output as the SQL function for any valid Egyptian local-format input. Used by the privacy-code verify flow (client-side phone shape check, server-side normalization), the global-patients lookup, and the identity-resolution path. SQL/TS parity is enforced by `phone-normalize-sql-parity.test.ts`.

**Analytics module** (`packages/shared/lib/analytics/`):

| Module | Purpose |
|--------|---------|
| `doctor-stats.ts` | Doctor dashboard analytics. Dual-source model: income from `payments` (via `isCollectedPayment`), visit counts from `clinical_notes`. Scoped by `doctor_id` + `clinic_id`. Calendar-scoped chart windows: day chart = current Cairo month through today (zero-filled), month chart = 12 calendar months ending in current (zero-filled). Key exports: `getDoctorStats(doctorId, period, clinicId)`, `computeIncomeStats(payments, notes, now?)`, `computeTrends()`, `computeWeeklyComparison()`. Exception: `analytics_events` has no `clinic_id` column — timing KPIs remain doctor-scoped. 31 regression tests. |

**Date helpers** (`packages/shared/lib/date/`):

| Module | Purpose |
|--------|---------|
| `cairo-date.ts` | Africa/Cairo timezone-aware date helpers (DST-safe via `Intl`). Boundary functions: `cairoMonthStart()`, `cairoNMonthsAgoStart(n)`, `cairoNDaysAgoStart(n)`. Iterators for zero-fill: `cairoEachDay(start, end)`, `cairoEachMonth(start, end)`. Key formatter: `cairoDateKey(date)` → `YYYY-MM-DD` in Cairo local time. Used by analytics, profile stats, and 6 frontdesk/appointment surfaces. |

### 6.3 Fire-and-Forget Pattern

Rx Intelligence logging (drug interactions, template suggestions) never blocks the clinical save flow. It runs as a detached promise after the main save succeeds.

---

## 7. API Routes (~160 endpoints across two apps)

The clinic app (`apps/clinic/`) carries ~110 endpoints; the patient app (`apps/patient/`) carries ~50. Both apps follow the same conventions (§7.2). Many endpoints are thin re-export shims around handlers in `packages/shared/lib/api/handlers/`, so the same handler can serve both apps where appropriate.

### 7.1 Route Organization

**Clinic app** (`apps/clinic/app/api/`):

```
/api/auth/*              → Authentication (login, register, OTP, reset, change-phone/*)
/api/doctor/*            → Doctor-specific (patients, appointments, stats, settings)
/api/frontdesk/*         → Frontdesk-specific (checkin, queue, slots, payments,
                           patients/:id/phone-correction)
/api/clinical/*          → Clinical data (notes, prescriptions, labs, templates)
/api/clinic/*            → Clinic management (create, join, invite, settings, staff,
                           phone-change-requests/*)
/api/patients/*          → Patient operations (create, search, onboard, verify-code,
                           check-phone, anonymous, my-patients, upgrade-relationship,
                           [id]/*, check-phone-uniform (B04), initiate-sms-share (B04),
                           verify-privacy-code (B04), verify-sms-code (B04))
/api/drugs/*             → Drug database (search, interactions, alternatives, recent)
/api/analytics/*         → Stats and event tracking
/api/admin/*             → Service-role admin operations (patient-dedup,
                           global-patients/lookup (B04), patient-clinic-records (B04));
                           gated by requireServiceRole
/api/cron/*              → Scheduled tasks (appointment-reminders, expire-stale-shares (B05))
/api/sms/*               → SMS sending
/api/push/*              → Push notification subscriptions
/api/icd10/*             → ICD-10 diagnosis code search
/api/medications/*       → Medication status updates
/api/templates/*         → Prescription template management
/api/doctors/*           → Public doctor listing
/api/setup/*             → Initial setup (create frontdesk)
/api/public/*            → Unauthenticated public endpoints (e.g. fee lookup)
/api/visits/*            → Visit-history queries
```

**Patient app** (`apps/patient/app/api/`):

```
/api/auth/*              → Patient authentication (login, register, OTP, reset)
/api/patient/*           → Patient-self-service surface; subgroups:
                           - Health: records, prescriptions, medications,
                             medication-intake, medication-reminders, conditions,
                             allergies, immunizations, lab-results, vitals
                           - Activity: diary, visits, appointments, notes,
                             health-summary, messages
                           - Identity & sharing: my-code, privacy-code (B04),
                             messaging-reconsent (B04),
                             sharing/[shareId]/{extend,revoke} (B05)
/api/patients/*          → Patient lookup operations (shared with clinic flows)
/api/clinic/*            → Clinic name/info lookup for patient-app rendering
/api/drugs/*             → Drug database (read-only)
/api/icd10/*             → ICD-10 lookup
/api/medications/*       → Medication metadata
/api/templates/*         → Read-only template lookup
/api/sms/*               → SMS dispatch (consent verification)
/api/visits/*            → Patient's own visit history
```

### 7.2 API Conventions

- All protected routes use `requireApiRole()` (role-gated end-user endpoints) or `requireApiAuth()` (any authenticated user).
- **Re-export shim pattern**: thin `app/api/.../route.ts` files in each app do `export { GET, POST } from '@shared/lib/api/handlers/...'`. Single source of truth for the handler implementation; both apps share it where applicable. This is why route counts in §7.1 don't equal unique handler count — many routes are shims pointing at shared handlers.
- Service-role admin endpoints (`/api/admin/*`) use `requireServiceRole(request)` — bearer-token timing-safe compare against `SUPABASE_SERVICE_ROLE_KEY`. Returns 401 for any failure mode (missing header, wrong token, missing env var) — deliberately not 500, to avoid leaking config state.
- Request/response: JSON, `Content-Type: application/json`.
- Error format: `{ error: string, details?: string }`.
- Success format: `{ success: true, ...data }`.
- Admin client uses explicit scope: `createAdminClient('clinical-notes')`. The current scope-tracking pattern (D-008) has known drift — see the Phase F follow-up task list in `audits/PROGRAM_STATE.md`.

---

## 8. Database Schema

### 8.1 Core Tables

```
users                     → Role assignment (doctor/patient/frontdesk), phone_verified + phone_verified_at (mig 070)
doctors                   → Doctor profiles (specialty, license, fees)
clinics                   → Clinic info, settings, invite codes
clinic_memberships        → Unified RBAC (replaces legacy tables; see §5.1)

# ── Patient identity layers (see §5.4 for the architecture) ──
global_patients           → Global identity: one row per real human, keyed by phone (UNIQUE normalized E.164;
                            NULL only for quarantined sentinels). Mig 073.
patient_clinic_records    → Per-(global_patient, clinic) layer: one row per (gpid, clinic) pair, carrying
                            the clinic-specific notes + consent_to_messaging. Unique on (gpid, clinic_id). Mig 075.
patients (legacy)         → Demographics + medical history. Now carries global_patient_id (NOT NULL since
                            mig 077) + patient_clinic_record_id back-reference. Coexists with the global+PCR
                            layer via mig 081 compatibility shim triggers; legacy patient_id columns drop in
                            Prompt 6.5.
```

### 8.2 Clinical Tables

```
clinical_notes            → Session data, diagnosis, vitals, prescriptions
prescriptions             → Standalone prescription records (legacy; per-row prescription unit is
                            prescription_items, which is one of the 11 tables carrying global FKs)
prescription_templates    → Doctor's reusable medication templates
medications               → Patient medication tracking
medication_intake_log     → Patient medication compliance
vital_signs               → Per-encounter vital sign rows
lab_orders                → Lab test orders (parent of lab_results)
lab_results               → Lab test results (child of lab_orders)
imaging_orders            → Radiology/imaging orders
```

> **Global identity FKs.** Eleven clinical tables carry both `global_patient_id` and
> `patient_clinic_record_id` as FKs since mig 080: `clinical_notes`, `prescription_items`,
> `appointments`, `lab_orders`, `lab_results`, `imaging_orders`, `vital_signs`,
> `patient_consent_grants`, `doctor_patient_relationships`, `patient_visibility`,
> `patient_phone_history`. The mig 081 compatibility shim triggers normalize INSERT shapes
> across the legacy `patient_id` and the new `global_patient_id` + `patient_clinic_record_id`
> paths until the data-layer cutover completes (Prompt 6.5). See §5.4.

### 8.3 Operations Tables

```
appointments              → Scheduled + walk-in appointments. One of the 11 tables carrying global
                            FKs (mig 080); see §8.2 callout.
doctor_availability       → Weekly time slots per doctor
check_in_queue            → Real-time patient queue
payments                  → Payment records with method tracking
```

### 8.4 Communication Tables

```
conversations             → Doctor-patient conversation threads (parent of messages, mig 011).
                            RLS: clinic-scoped per the operations-table policy pattern (§12).
messages                  → Individual messages within a conversation. RLS via EXISTS-on-parent (§12).
notifications             → In-app notifications (patient_arrived, appointment_booked, phone_change_*,
                            share_expiring, etc.)
otp_codes                 → OTP verification codes
sms_log                   → SMS delivery tracking
push_subscriptions        → Web Push subscription endpoints (one per device per user). See §11.
patient_consent_grants    → Per-(patient, clinic, consent_type) consent grants. Drives messaging consent
                            and the messaging-reconsent flow (B04). Mig 013; one of the 11 tables
                            carrying global FKs (§8.2).
```

### 8.5 Security & Audit

```
rate_limits               → Per-IP/user rate limiting
audit_log                 → Older clinic-level audit trail (service-role-only; see TD-013).
audit_events              → Newer global-scoped audit trail (OWNER-readable, used by Build 02-05 audits).
                            audit_log and audit_events coexist; consolidation deferred to Year 2 — both
                            tables are written to in parallel by current handlers.
patient_visibility        → Legacy intra-clinic per-doctor patient access grants (seeded from
                            doctor↔patient relationships, mig 052). Cross-clinic grants now live in
                            patient_data_shares (§5.6); patient_visibility retirement is scheduled in
                            Prompt 6.5. One of the 11 tables carrying global FKs (§8.2).
phone_change_requests     → Dual-OTP phone change workflow. `user_id` + nullable `patient_id` (XOR check),
                            status CHECK includes `'rejected'`. 3 RLS policies (staff SELECT, staff INSERT,
                            OWNER cross-clinic SELECT). Mig 013 (scaffolding), mig 070 (production-ready).
patient_phone_history     → Phone change audit trail. `changed_by` FK → users (mig 070), `change_reason`
                            with CHECK enum. One of the 11 tables carrying `global_patient_id` (mig 080)
                            with a mig 081 compatibility shim trigger; note that only a subset of those
                            11 tables (clinical_notes, appointments, patient_consent_grants,
                            doctor_patient_relationships, patient_visibility) additionally have
                            `patient_clinic_record_id NOT NULL` — `patient_phone_history` does not, since
                            phone-history rows can land via flows where the PCR is not yet established.

# ── Privacy code (B04) — see §5.5 for the architecture ──
patient_privacy_codes     → One active 6-char privacy code per global_patient (bcrypt cost 12).
                            Unique partial index where revoked_at IS NULL. Mig 085.
privacy_code_attempts     → Per-(global_patient, clinic) attempt log; drives 5/hr per-clinic rate limit
                            and 5-failure 24h per-code lockout. Mig 084.
privacy_code_sms_tokens   → 4-digit SMS share tokens, 5-min TTL, single-use. Mig 086.

# ── Directional consent (B05) — see §5.6 ──
patient_data_shares       → Cross-clinic share grants (grantor → grantee). Default 90d expiry,
                            patient-extendable to 1y or permanent, hard-revocable. Active iff
                            revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW()). Mig 090.
```

### 8.6 Migration Timeline

111 non-rollback migration files on disk; highest base is 108 (the Phase F Task 18 teardown fix, applied 2026-05-07). Several conceptual ranges are split into multiple files (e.g., 094a is a numbered amendment to 094); a handful of tracking rows reference SQL applied via dashboard with no file (backfilled by mig 100). For full file-vs-staging reconciliation see `audits/database-audit/staging-vs-mig-reconciliation.md`.

| Range | Era | Key Changes |
|-------|-----|-------------|
| 001-005 | Foundation | Users, doctors, patients, RLS policies |
| 006-012 | Features | Frontdesk, prescriptions, vitals, labs, messaging, imaging |
| 013-017 | Privacy | Privacy reconciliation, rate limits, multi-tenant clinic |
| 018-023 | Multi-Tenant | Unified RBAC, clinic IDs everywhere, centralized access |
| 024-032 | Clinical | OTP fixes, appointments, Rx intelligence, templates, SMS |
| 033-044 | Operations | Clinic address, invites, storage, scheduling, invoices, dev accounts |
| 045-051 | Data Integrity | `clinic_id` `NOT NULL` enforcement across 21 tables. Backfill legacy NULL rows in `clinical_notes` (56 rows) and `payments` (9 rows). D-041. |
| 052-054 | RLS Foundation | 052: Seed `patient_visibility` from active doctor↔patient relationships (32 rows), add partial unique index. 053: Create 4 enums (`visibility_mode`, `consent_type`, `assignment_scope`, `assignment_status`), convert 4 TEXT columns, backfill 3 NULL `appointments.clinic_id` rows and SET NOT NULL, add `clinics.default_visibility` + `clinics.settings`. 054: Create 3 access-control functions (`can_access_patient`, `is_clinic_member`, `get_clinic_role`) — all SECURITY DEFINER, owned by `postgres`. |
| 055-067 | RLS Per-Table Policies (legacy set) | Ten new clinic-scoped policies across all tenant tables. 056: Fix `clinic_memberships` self-referential recursion (→ `is_clinic_member`). 057: Enable RLS on `vital_signs`, `lab_orders`, `lab_results`, `lab_tests` (policies existed but `relrowsecurity=false`). 058-067: Per-table policies via three patterns — see §12. D-048, D-049. **Superseded** by the Prompt 6 RLS rewrite (mig 092-097); the legacy policies remain alongside the new ones during the rollout per the additive-then-cleanup pattern. |
| 068 | RLS Cleanup (aborted) | Originally drafted as the cleanup pass for the 055-067 era — drop redundant legacy SELECTs, cross-clinic-leak policies, legacy permissive INSERTs. **Aborted** mid-2026-04; the cleanup work was absorbed into the broader Prompt 6 rewrite (mig 092-097). The file remains in the repo as a known-skipped artifact awaiting `.RETIRED` annotation or delete (Phase F follow-up). |
| 069 | Idempotency Keys (D-050) | `client_idempotency_key` columns on `payments` and `clinical_notes` with partial unique index `WHERE NOT NULL`. Enables the offline-write Phase 1 replay-safe ingestion path (TD-008 resolved); see §10.2. |
| 070 | Phone-Change Schema | `users.phone_verified` + `phone_verified_at` (backfilled 288 users to `true`). `patient_phone_history.changed_by` FK + `change_reason` CHECK enum. `phone_change_requests.user_id`, `patient_id` made nullable with XOR check, status CHECK extended (`'rejected'`), partial index `idx_phone_change_user`. 3 RLS policies. 2 SECURITY DEFINER functions: `change_phone_commit(...)` (atomic SQL commit with cross-clinic propagation, returns touched `(clinicId, patientId)` pairs as JSONB) and `change_phone_rollback(...)` (compensating reversal, keyed by `subject_id` not phone). Both gate patient propagation on `subject_kind = 'patient'` to prevent staff→patient cross-contamination. D-051. |
| 071-082 | Patient Identity Stack (Builds 02-03) | Two-layer global identity. Architectural migrations: 073 (`global_patients` keyed by phone), 075 (`patient_clinic_records` per gpid+clinic), 077 (`patients.global_patient_id` NOT NULL after backfill), 080 (global FKs added to 11 clinical tables), 081 (compatibility shim triggers normalize INSERT shapes). Supporting work: 071 (phone normalization), 072 (patient-side dedup detection), 076 (quarantine resolution paths), 078-079 (user-side dedup), 082 (R1 phone recovery sweep). See §5.4. |
| 083-088 | Privacy Code + Messaging Reconsent Bridge (Build 04) | Privacy code mechanism. Architectural migrations: 084 (`privacy_code_attempts` rate-limit table), 085 (`patient_privacy_codes`), 086 (`privacy_code_sms_tokens`), 087 (`verify_privacy_code` + `regenerate_privacy_code` SECURITY DEFINER RPCs). Supporting work: 083 (`effective_messaging_consent` view bridging legacy `patient_consent_grants` to new `patient_clinic_records.consent_to_messaging` during 90-day grace window), 088 (PCR insert audit trigger). See §5.5. |
| 089-091 | Auth Phone Hygiene + Directional Consent (Builds 04-05) | `auth.users.phone` normalization sweep — 29 staff rows reconciled with `public.users.phone` (mig 089, Build 04 D7). `patient_data_shares` table + lifecycle RPCs — revoke, extend, auto-renew-on-visit, mark-share-expired-notification (mig 090). `create_shares_for_grantors` atomic helper RPC for the verify-* handlers (mig 091). See §5.6. |
| 092-097 + 094a | RLS Policy Rewrite (Prompt 6) | Helper functions (mig 092: `is_clinic_member` DEFINER, `can_clinic_access_global_patient` INVOKER, `can_patient_access_global_patient` INVOKER, `can_view_patient_data_at_clinic` DEFINER); per-table policies grouped by concern — patient identity (093), clinical data (094), operations (095), communication (096), non-patient (097). Mig 094a amends 094 with helper fixes including the post-094a DEFINER helper `user_has_clinic_path_to_gp`. Hybrid INVOKER/DEFINER security mode per Mo's 2026-04-30 ruling. Helpers #2 and #3 drifted to DEFINER on staging between authoring and 2026-05-03; mig 106 (forensic set) restored them to INVOKER per the original ruling. See §12. |
| 098 | patient_code Schema Applied + Retired (R7) | Schema columns (`patient_code_hash`, `patient_code_generated_at`, `patient_code_expires_at`) applied to `global_patients` on staging 2026-05-03 02:28 UTC, despite the R7 retirement direction (2026-04-30) preceding the apply. The companion mig 099 (`patient_code_rpcs.sql`) was blocked at apply time and deleted from the repo in commit `6adeffa` (2026-05-04 audit detour Day 2). The schema columns remain on staging awaiting a future cleanup migration. See `audits/database-audit/out-of-band-post-2026-04-08.md`. |
| 100-106 | Forensic Backfill Set (Foundation Audit) | Authored by Audit Sessions A/B/C and applied to staging 2026-05-03 to reconcile staging schema with the migration tree (Empirical Lessons #7-#12). 100: backfills two 2026-04-08 out-of-band RLS hardening fixes — applied via the migrations CLI at the time but never committed as files (tracking rows `20260408145102` and `20260408145129`); the two fixes produce 9 policies between them. 101: backfills 5 unclaimed tables (`account_recovery_requests`, `audit_log`, `phone_corrections`, `sms_reminders`, `patient_phone_verification_issues`) with full DDL, FKs, indexes, RLS, and 5 policies. 102: backfills 6 dashboard-applied helper functions and 3 triggers. 103: idempotent `IF NOT EXISTS` guard for `patients.email` (already present). 104: drops 3 unused PII columns from `patients` (verified 100% NULL pre-drop). 105: drops orphan `patient_phone_verification_issues` (verified 0 rows pre-drop). 106: reverts mig 092 helpers #2 and #3 from `SECURITY DEFINER` (drifted on staging) → `SECURITY INVOKER` (documented intent + Mo's 2026-04-30 hybrid ruling). Only 106 carries behavioral change; 100-105 are idempotent backfills. See `audits/database-audit/out-of-band-post-2026-04-08.md` and `apply-runbook-v2.md`. |
| 107 | Phase D matrix prep (D-074) | Retypes `_rls_test_results.run_no` from `INTEGER` to `NUMERIC` so fractional run numbers (1.5, 1.6, …) can be recorded for re-runs of the Phase D RLS regression matrix. Adds `_rls_test_results.source_file TEXT` so each recorded row names the executable .sql that produced it (closes the Empirical Lesson #12 gap surfaced by the missing run #1 source). Re-CREATEs `public.rls_test_record(numeric, text, text, text, text, integer, boolean, text, text)` with the new parameter signature (DROP-then-CREATE since CREATE OR REPLACE cannot retype parameters). Smoke probe at end asserts run_no=1 / run_no=99 row counts preserved (177 / 1) and a fractional `1.5` round-trips through the recorder. Applied 2026-05-06; precondition for `audits/rls-test-matrix-reconstructed.sql` Run #1.5 (177/177 PASS). |
| 108 | rls_test_teardown audit_events fix (Phase F Task 18, D-074 amendment) | Extends `public.rls_test_teardown()`'s `audit_events` DELETE clause to also catch PCR audit rows attributed to test global_patients (`resolved_global_patient_id = ANY(test_gps)` plus a defensive `entity_type='patient_clinic_record' AND metadata->>'global_patient_id' = ANY(test_gps)` clause). Pre-mig-108 the DELETE only matched `entity_type IN ('global_patients', 'patient_data_share')`; PCR audits emitted by mig 088's `tg_audit_pcr_insert_trg` accumulated +4 rows per seed cycle, causing `audit_events.S6` row count to drift across matrix runs (run #1 = 8, run #1.5 = 10). Smoke probe at end inserts a sentinel PCR audit row, calls teardown, asserts the row was cleaned + post-cleanup PCR audit count for test gps = 0. Schema-fact captured in DECISIONS_LOG D-074 amendment: `audit_events.resolved_global_patient_id` is a GENERATED ALWAYS column (not a resolver trigger output) — computed from `metadata->>'global_patient_id'` or `entity_id` when `entity_type='global_patients'`. Re-running matrix at run_no=1.6 produces 177/177 PASS with `audit_events.S6` row count stable at 1 per cycle (the post-fix invariant). Applied 2026-05-07. |

---

## 9. Frontend Architecture

### 9.1 Design System

| Token | Value | Usage |
|-------|-------|-------|
| Primary | `#16A34A` | CTAs, active states, brand |
| Light Green | `#DCFCE7` | Success backgrounds |
| Background | `#F9FAFB` | Page backgrounds |
| Card Background | `#FFFFFF` | Card surfaces |
| Border | `#E5E7EB` | Card borders, dividers |
| Text Primary | `#030712` | Headings, body |
| Text Secondary | `#4B5563` | Labels, descriptions |
| Text Muted | `#9CA3AF` | Timestamps, placeholders |
| Error | `#DC2626` | Errors, destructive actions |
| Warning | `#F59E0B` | Pending/waiting states |

**Typography**: Cairo (Arabic primary), Inter (Latin fallback), Noto Sans Arabic (Arabic fallback)

**Spacing**: Mobile-first `max-w-lg` container, `p-4` card padding, `rounded-[12px]` cards, `h-[44px]` buttons

### 9.2 Component Architecture

```
DoctorShell               → Mobile RTL wrapper (dir="rtl", max-w-lg, bg-[#F9FAFB])
├── DashboardHeader       → Welcome message, clinic selector, stats
├── PatientQueueCard      → Patient card with visit type + action buttons
├── BottomNav             → Fixed bottom: schedule, FAB, messages
├── FloatingActionButton  → Expands: new session + add appointment
└── SettingsDrawer        → Slide-out: profile, clinic, assistants, logout

FrontdeskBottomNav        → Fixed bottom: dashboard, check-in, appointments, payments, reports, account
├── DoctorStatusCard      → Live doctor session with timer
└── PaymentForm           → Amount + method + patient selector
```

> **Note on legacy frontdesk components (TD-010).** `QueueList`, `CheckInForm`, `AppointmentBookingForm`,
> and `PatientRegistrationForm` exist under `packages/ui-clinic/components/frontdesk/` but are no longer
> mounted by any route — they were superseded by route-level pages and per-page components during the
> mobile-first redesign. Listed here for historical reference; deletion or repurposing tracked in TD-010.

### 9.3 RTL Implementation

- Root containers set `dir="rtl"`
- Tailwind handles flex/margin/padding direction automatically
- Icons from `lucide-react` (direction-agnostic)
- All user-facing text from `packages/shared/lib/i18n/ar.ts`
- Number formatting: `toLocaleString('ar-EG')`

### 9.4 State Management

- **Server Components**: Data fetching at the layout/page level
- **Client Components**: `useState` / `useEffect` for interactive elements
- **No global state library**: React Context used only for clinic selector
- **Cookies**: `active_clinic_id` for persistent clinic selection
- **SessionStorage**: Temporary registration data during OTP flow

---

## 10. Real-Time & Offline

### 10.1 Realtime

- Supabase Realtime subscriptions on `check_in_queue` for live queue updates
- `RealtimeQueueWrapper` component wraps queue displays with subscription lifecycle
- Fallback: polling every 5 seconds if WebSocket disconnects

### 10.2 Offline / PWA

- **Service Worker**: `next-pwa` generates SW with precaching
- **Offline page**: `/offline` fallback when network unavailable
- **IDB Cache + Pending Writes Queue**: `packages/shared/lib/offline/idb-cache.ts` exposes:
  - `cacheGet` / `cacheSet` — TTL'd API response cache
  - `addPendingWrite(url, method, body)` — enqueue offline mutation
  - `getPendingWriteCount()` — UI badge data
  - `syncPendingWrites()` — flush queue on reconnect (called by `OfflineIndicator`)
- **Offline Indicator**: `packages/ui-clinic/components/frontdesk/OfflineIndicator.tsx` mounts in the frontdesk layout, listens to `online`/`offline` events, dynamically imports `idb-cache` for the badge count and reconnect-time sync.
- **LAN Sync**: deferred — see D-044. Re-evaluate after Capacitor mobile (D-043) ships.
- **Phase 1 (D-050, shipped 26 April 2026)**: `useOfflineMutation` hook now wraps `addPendingWrite`, mounted on frontdesk check-in, payment create, and clinical-note save surfaces. Server idempotency: check-in uses natural dedupe (handler returns 200 with `deduped:true` instead of 409); payments + clinical_notes use `client_idempotency_key` (migration 069, partial unique index `WHERE NOT NULL`). Legacy localStorage queue is one-shot drained into IDB on first hook mount post-deploy. Resolves TD-008.
- **Phase 2 (open)**: auth-refresh-mid-replay for outages longer than the JWT lifetime, per-row "queued" UI affordances. Re-evaluate when production telemetry shows outages long enough to need it.

---

## 11. SMS & Notifications

- **Twilio**: OTP codes, appointment reminders, prescription delivery
- **Templates**: Arabic SMS templates in `packages/shared/lib/sms/reminder-templates.ts`
- **Cron**: `/api/cron/appointment-reminders` for scheduled reminder sends
- **In-app**: `notifications` table with type-specific icons (patient_arrived, appointment_booked, phone_change_pending_approval, phone_change_approved, phone_change_rejected, phone_change_committed, etc.)
- **Push**: Web Push subscriptions via `/api/push/subscribe`

---

## 12. Security

- **RLS**: Clinic-scoped Row Level Security is the primary security gate. The Prompt 6 RLS rewrite (migrations 092-097, plus the 094a amendment and forensic mig 106) replaced the legacy 055-067 policy set with a new generation built around the global identity layer (§5.4 / §5.6).

  RLS helper functions follow a hybrid security mode after the Prompt 6 rewrite + forensic mig 106: **3 DEFINER + 2 INVOKER**. The split reflects whether each helper's body queries can trigger RLS recursion through itself.

  - `is_clinic_member(clinic_id, user_id)` — DEFINER. Checks `clinic_memberships` with `status='ACTIVE'`. The membership table has a self-referential SELECT policy under `authenticated`; DEFINER bypasses that during the helper's internal lookup, breaking the recursion cycle (see mig 056). Mig 092 helper #1.
  - `can_clinic_access_global_patient(global_patient_id, clinic_id)` — INVOKER post-mig-106. Returns true iff the clinic has its own PCR row (intra-clinic ownership) OR is the grantee on an active, non-expired share (cross-clinic grant). See §5.6. The helper itself does not check membership; the calling policy pairs it with "is the caller an active member of this clinic." Mig 092 helper #2.
  - `can_patient_access_global_patient(global_patient_id, user_id)` — INVOKER post-mig-106. Returns true iff the user is the claimed patient for this `global_patient`. The user's visibility into `global_patients.claimed_user_id` is sufficient — no recursion path. Mig 092 helper #3.
  - `can_view_patient_data_at_clinic(global_patient_id, clinic_id, user_id)` — DEFINER. Composite check used by clinical-table policies; queries multiple RLS-enabled tables internally (PCR, shares, memberships) — DEFINER required to avoid cross-table EXISTS recursion. Mig 092 helper #4.
  - `user_has_clinic_path_to_gp(global_patient_id, user_id)` — DEFINER. Added by mig 094a. Returns true iff the user is an ACTIVE member of any clinic where the gp has a PCR. Replaces inline EXISTS in `global_patients` / `patients` SELECT policies that would have recursed.

  Helpers #2 and #3 drifted to DEFINER on staging between authoring and 2026-05-03; mig 106 restored both to INVOKER per Mo's 2026-04-30 ruling. The hybrid mode is codified as Empirical Lesson #1 (amended) in `audits/EXECUTION_PROMPTS.md` — INVOKER is allowed for helpers whose internal queries provably do not recurse; DEFINER is the default; burden of proof is on the engineer proposing INVOKER.

  **Empirical regression coverage**: `audits/rls-test-matrix-reconstructed.sql` is the canonical 177-scenario / 24-table regression test for this hybrid mode and is the empirical gate any future RLS-touching change re-runs before push. Authored 2026-05-06 (D-074) by replaying Phase D run #1 against post-mig-106 staging; recorded 177/177 PASS at `run_no = 1.5` in `_rls_test_results`. Pairs with mig 107 (`run_no INTEGER → NUMERIC` + `source_file TEXT` column + recorder fn signature update) and the seed/teardown helpers (`public.rls_test_seed()`, `public.rls_test_teardown()`, `public.rls_test_record(numeric, text, text, text, text, integer, boolean, text, text)`). The matrix file's `audit_events` block computes its expected count dynamically because the seed `teardown` does not currently scrub `entity_type='patient_clinic_record'` audits — a known seed-cycle drift that does not affect outcome correctness.

  Two earlier helpers from mig 054 (`can_access_patient`, `get_clinic_role`) remain defined to support the legacy 055-067 policy set during the additive-then-cleanup rollout. Both are scheduled for retirement in Prompt 6.5.

  Three policy patterns are in use:
  1. **Helper-function predicates** (clinical + identity tables): policies call `can_view_patient_data_at_clinic`, `can_clinic_access_global_patient`, etc. Used by clinical_notes, prescription_items, lab_orders, lab_results (v2), imaging_orders, vital_signs, patient_consent_grants, doctor_patient_relationships, patients, global_patients.
  2. **`is_clinic_member` triple-OR for operations tables** (legacy + new): user is patient OR is treating doctor OR is a clinic member of the row's clinic. Used by check_in_queue, conversations, payments, appointments.
  3. **EXISTS-on-parent for child tables** (legacy 055-067 era): the child table's USING/WITH CHECK clause queries its parent and applies the parent's access check. Used by `messages` → `conversations` (mig 063) and `lab_results` → `lab_orders` (mig 060). The new clinical-data policies (mig 094) supplant the EXISTS-on-parent variant for `lab_results` once the legacy set retires; `messages` → `conversations` remains the canonical example.

  D-048, D-049 capture the rollout strategy (additive-then-cleanup, ascending blast radius).

- **Admin Client Scope**: `createAdminClient(scope)` requires an explicit scope string for audit (D-008). Service-role admin endpoints additionally use `requireServiceRole(request)` — bearer-token timing-safe compare against `SUPABASE_SERVICE_ROLE_KEY`, returning 401 for any failure mode. The scope-tracking pattern has known drift — current `ALLOWED_ADMIN_SCOPES` covers ~35 scopes while the codebase uses ~135 distinct scope strings; validation is `console.warn` only. Reconciliation queued in `audits/PROGRAM_STATE.md` Phase F follow-up tasks.
- **Rate Limiting**: `rate_limits` table, 8 auth attempts / 60 seconds
- **Input Validation**: Zod schemas in `packages/shared/lib/validation/`. `isPhone` in `schemas.ts` now defers to the canonical phone validator (not a length-only stub).
- **Phone Validation**: Canonical module at `packages/shared/lib/utils/phone-validation.ts`. Two helpers: `getEgyptianPhoneError(phone)` (strict, for form submission — returns Arabic error string or `null`) and `getEgyptianPhoneSearchError(phone)` (lax, for search inputs — tolerates still-typing state and 10-digit-without-leading-zero paste). Also exports: `EGYPT_LOCAL_PHONE_RE` (`01[0125]\d{8}`), `normalizeEgyptianDigits` (Arabic-Indic → Latin), `isValidEgyptianLocalPhone`, `validateEgyptianPhone` (server-side E.164). All 9 client surfaces use the canonical helpers; 0 inline regex remaining on the client side. See D-046, D-047.
- **Phone-Change Security**: Dual-OTP verification (old phone + new phone) for phone number changes. Self-approval banned — solo-clinic OWNERs cannot approve their own phone change (support email route). Security SMS to old phone post-commit for out-of-band recovery. Compensating rollback RPC if `auth.users.phone` admin sync fails. All phone-change operations audited via `logAuditEvent` (7 phone-change actions, part of the broader 52-action AuditAction enum). Feature-gated: `FEATURE_PHONE_CHANGE_V2` env flag returns 404 until flipped. See D-051.
- **OTP**: 4-digit codes, 5-minute expiry, stored in `otp_codes` table. OTP `purpose` union extended with phone-change purposes.
- **Session**: httpOnly cookies, server-side validation, no localStorage for auth
- **CORS**: Next.js default (same-origin)
- **Audit Trail**: Two modules — `audit_log` (older clinic-level audit trail, service-role-only) and `audit_events` (newer global-scoped audit trail, OWNER-readable). Both tables are written to in parallel by current handlers; consolidation is deferred to Year 2. The `AuditAction` enum has 52 entries spanning original (18), phone-change (7, mig 070), patient identity v2 (Builds 02-03, 9 entries), privacy code + reconsent + R1 phone recovery (Build 04, 12 entries), auth phone hygiene (Build 04 D7, 1 entry), directional consent (Build 05, 5 entries). Privacy-sensitive events (`VIEW_PATIENT`, `CODE_ATTEMPT`, `SHARE_*`, `REVOKE_SHARE`, `SMS_CONSENT_SENT`) are written synchronously and transactionally per the 2026-04-28 ruling — the parent transaction rolls back if the audit write fails. The auto-renew-on-visit hook is the documented exception (fire-and-forget; see §5.6).

Standing engineering rules referenced inline above (RLS recursion safety, hybrid INVOKER/DEFINER security mode, sync-transactional audit for privacy-sensitive events, phone-validation canonical helpers) are codified as Empirical Lessons in `audits/EXECUTION_PROMPTS.md`. Lessons that affect architectural decisions are referenced inline at the relevant bullet.

---

## 13. Dev & Test Accounts

Created via Migration 043. All passwords: `Test1234!`

| Role | Email | Phone | Clinics |
|------|-------|-------|---------|
| Doctor | dr.ahmed@medassist.dev | 01000000001 | Clinic A (owner) + Clinic B |
| Frontdesk | nour@medassist.dev | 01000000002 | Clinic A + Clinic B |
| Patient | khaled@medassist.dev | 01000000003 | — |
| Doctor 2 | dr.sara@medassist.dev | 01000000004 | Clinic B |

---

## 14. TypeScript Health

- **Path aliases**: `@shared/*`, `@ui-clinic/*`, `@patient/*`, `@clinic/*` in root `tsconfig.json` (the previous shared `@/*` per-app convention was retired by D-065 — see §2 "Path alias mechanics")
- **Current errors**: 0 (was 3 `@capacitor/*` errors; all resolved by removing the unreachable Capacitor SQLite/LAN scaffolding — D-043, D-044). Root `tsc --noEmit` and per-workspace `type-check` both clean.
- **Strict mode**: Enabled
- **CI gate**: `npm run type-check` (root) and per-workspace `type-check -w @medassist/clinic` / `-w @medassist/patient` are required CI checks. Pre-push hook runs the same root + clinic-workspace combo locally (D-042 + D-045).
- **Verification**: `npx tsc --noEmit` from project root → 0 errors.
- **Test runner**: Mixed. `doctor-stats.test.ts` (31 tests) and `drug-interactions.test.ts` use a hand-rolled `test()` harness via `npx tsx <file>`. `frontdesk/payments/create/__tests__/handler.test.ts` and `packages/shared/hooks/__tests__/useOfflineMutation.test.ts` use Vitest with compile-time witnesses + `@ts-expect-error` regression guards. The `useOfflineMutation` test locks the hook surface, the optional `clientIdempotencyKey` data-layer contract, and the idb-cache 409-as-success invariant (D-050). Full Vitest migration recommended before CI enforcement.

---

## 15. Key Architectural Patterns

| Pattern | Where | Why |
|---------|-------|-----|
| Route Groups | `(doctor)`, `(frontdesk)`, `(auth)` | Role-based layout isolation without URL nesting |
| Admin Client Scope | `createAdminClient('scope')` | Audit trail for RLS-bypassing operations |
| Fire-and-forget | Rx Intelligence logging | Non-blocking clinical save |
| Session verification loop | Login + OTP | Exponential backoff polling for cookie readiness |
| Debounced search | Patient search inputs | 300ms debounce prevents API spam |
| Client pagination | Patient lists | 50 items/page, prevents DOM overflow |
| Error boundaries | `ErrorBoundary.tsx` | Arabic fallback UI, prevents white screen |
| Double-click prevention | Forms with `isSaving` guard | Prevents duplicate database records |
| Chip input | Medical conditions, allergies | Faster data entry than free text |
| Invite codes | Clinic staff onboarding | XXXX-YY format, simpler than email invitations |
| Cairo date boundaries | Analytics, profile stats, frontdesk, appointments | All "today"/"this month" logic uses Africa/Cairo helpers, never raw `new Date()` |
| Dual-source analytics | `doctor-stats.ts` | Income from `payments`, visits from `clinical_notes` — never mix financial and clinical counts |
| Calendar-scoped charts | Analytics page | Day chart = current Cairo month; month chart = 12 calendar months. Zero-filled via `cairoEachDay`/`cairoEachMonth` iterators — no gaps |
| Payment status constants | `payments.ts` | Never hardcode `'completed'` / `'paid'` — use `PAYMENT_STATUS.COMPLETED` and `isCollectedPayment()` |
| Server-resolved tenant scope | All write handlers with `clinic_id` | `clinic_id` is derived from `auth.uid()` via `getFrontdeskClinicId()` / `getClinicContext()` — never read straight from the request body or query string. Body/cookie hints (when present) are validated against the user's `clinic_memberships` before use. See D-041 |
| Canonical phone validation | All 9 client phone inputs | Import `getEgyptianPhoneError` (forms) or `getEgyptianPhoneSearchError` (search) from `phone-validation.ts`. Never inline a regex. Two modes because form inputs require strict prefix/length checking while search inputs need still-typing tolerance. See D-046, D-047 |
| RLS: SECURITY DEFINER for membership checks | `clinic_memberships` policies | Never use a self-referential subquery on `clinic_memberships` — it causes infinite recursion under `authenticated` role. Use `is_clinic_member()` SECURITY DEFINER function instead. See mig 056 |
| RLS: Additive-then-cleanup | Migrations 055-067 (additive); cleanup absorbed into Prompt 6 rewrite (mig 092-097) after the originally-scoped 068 cleanup was aborted | New clinic-scoped policies are added alongside legacy policies. Legacy drops are batched into a separate migration for rollback safety. See D-048 |
| RLS: Ascending blast radius | Per-table policy rollout | Apply policies to lowest-row tables first (vital_signs: 0 rows), highest-row tables last (patients: 35 rows). By the time identity tables are touched, access-control functions are battle-tested. See D-048 |
| Service-role bearer for admin endpoints | `requireServiceRole(request)` in `auth/session.ts` | Admin/verification endpoints (`/api/admin/global-patients/lookup`, `/api/admin/patient-clinic-records`) require a Supabase service-role bearer token, not a user session. Bearer is timing-safe-compared against `SUPABASE_SERVICE_ROLE_KEY`. Returns 401 for any failure mode (missing header, wrong token, missing env var) — deliberately not 500, to avoid leaking config state. Use this for endpoints reachable only via internal admin/verification tooling — no end-user role should grant access. Added in B04 (commit `f61356f`). |
| Feature flag gating | Phone-change endpoints | `FEATURE_PHONE_CHANGE_V2` env var. When falsy, all 8 handlers return 404 — code is deployed but dormant. Flip the flag to activate without a deploy. Pattern reusable for future gated features. See D-051 |
| Frontdesk-as-proxy | Phone-change Flow E | For patient identity-phone changes, the frontdesk staffer initiates the change and the patient provides the OTPs verbally. Handler validates `actor.role === 'frontdesk' AND patient.clinic_id === getFrontdeskClinicId(actor)` and records `actorRole='frontdesk_proxy'` in audit metadata. Mirrors the existing physical-world workflow. See D-051, D-055 |
| Compensating rollback | `change_phone_commit` + `change_phone_rollback` RPCs | After SQL commit succeeds, auth-admin sync may fail. On failure, `change_phone_rollback` fires to revert `users.phone` + `patients.phone` changes. Rollback keyed by `subject_id` (not by phone value) to avoid clobbering unrelated users. See D-051 |
| Phone-first identity | Register page (`/frontdesk/patients/register`) | Phone field renders first with `autoFocus`; name, age, sex inputs disabled until `isValidEgyptianLocalPhone(phone)` returns true. Enforces phone-as-identity at the UI layer — existing-patient detection happens at the phone field, never at submit. Do not add name typeahead to identity-establishing forms. See D-057 |
| Discovery vs. identity | Check-in (discovery) vs. Register (identity) | Name search is a discovery aid on the Check-in page only. Identity is established exclusively via phone on the Register page. Do not promote name to a discovery primitive on registration forms. See D-057 |
| Onboarding auto-seed | `createDoctorAccount()` in `users.ts` | New doctors get 5 default `doctor_availability` rows (Sun–Thu 09:00–17:00, 15-min slots). Prevents empty appointment slot picker on first use. Idempotent `upsert` — failure logs but does not fail registration. See D-058 |
| API reason enum for empty states | `getAvailableSlots()` → `AvailableSlotsResult` | When a list endpoint returns empty, distinguish *why* via a `reason` enum field instead of a bare `[]`. Enables the UI to render actionable Arabic messages per cause. See D-058 |

---

## 16. Known Technical Debt

> Tracking table for identified issues. TD-001–005 resolved; TD-007 superseded; TD-008 resolved 26 Apr (D-050); TD-006, TD-009, TD-010, TD-011, TD-012, TD-013, TD-014, TD-015, TD-016 open. Operational follow-up tasks (forensic-apply cleanups, mig 068/099 retirements, search_path audit, admin-scope reconciliation, EN sharing-strings parity) are tracked in `audits/PROGRAM_STATE.md` Phase F task list.

| ID | Issue | Location | Impact | Status |
|----|-------|----------|--------|--------|
| TD-001 | **Profile API picks wrong clinic for multi-clinic doctors.** | `api/doctor/stats/route.ts` | UI inconsistency for multi-clinic doctors | **Resolved** 22 Apr — D-037. |
| TD-002 | **"ملخص هذا الشهر" shows all-time data.** | `profile/page.tsx`, `stats/route.ts` | Misleading stats on doctor profile | **Resolved** 22 Apr — D-037. |
| TD-003 | **"Today"/"This month" use server-local TZ, not Africa/Cairo.** | `doctor-stats.ts`, `stats/route.ts` | Incorrect daily/monthly boundaries | **Resolved** 22 Apr — D-035. |
| TD-004 | **Analytics not scoped by `clinic_id`.** | `doctor-stats.ts` | Cross-clinic data leakage in analytics | **Resolved** 22 Apr — D-034. |
| TD-005 | **NULL `clinic_id` on legacy `clinical_notes` and `payments` rows + 19 untightened tables.** Save-path holes allowed orphan rows in `clinical_notes` (56) and `payments` (9). Plus mig 019/026 never landed on live DB — 19 tables were missing the `clinic_id` column entirely. Resolved by migrations 045-051 and matching save-path tightening in `data/clinical-notes.ts`, `data/frontdesk.ts`, `clinical/notes/handler.ts`, `frontdesk/payments/create/handler.ts`, `offline/data-service.ts`. | `clinical_notes` + `payments` + 19 other tables; 5 files | Legacy data invisible to scoped queries; new orphan writes blocked at schema layer | **Resolved** 25 Apr — D-041 + migrations 045-051. |
| TD-006 | **Clinical-notes handler trusts body-supplied `clinicId` without re-validating it against the doctor's memberships.** `handlers/clinical/notes/handler.ts:37` accepts `bodyClinicId` directly into the resolution chain. A doctor's authenticated session means we can validate the value via `getClinicContext(user.id, 'doctor', bodyClinicId)`, but currently we don't. Lower urgency than TD-005 because the only writer is the doctor's own session form (no UI to forge another clinic), but it's a D-041 violation and should be tightened before any third-party clinical-write integration. | `clinical/notes/handler.ts` | Theoretical write-target leak across clinics for malicious/compromised clients | Open — follow-up PR. |
| TD-007 | **Offline payment shim points at the wrong endpoint and uses the wrong body shape.** `offline/data-service.ts:424` POSTs to `/api/frontdesk/payments` (GET-only — would 405) instead of `/api/frontdesk/payments/create`; same in `sync-queue.ts:105`. Both also send snake_case while the handler expects camelCase. | `offline/data-service.ts`, `offline/sync-queue.ts` | Offline payment + clinical-note replays would silently fail (405/400) when network returns | **Superseded** 25 Apr — both files deleted (D-043, D-044). Replacement work: TD-008 (offline-write Phase 1 on idb-cache) will write the new shim correctly the first time. |
| TD-008 | **Offline-write queue Phase 1 not wired.** After D-043/D-044 cleanup, `idb-cache.ts` exposed offline-write primitives but no write surface enqueued. All three high-frequency frontdesk surfaces (check-in, payments, clinical notes) now queue offline via `useOfflineMutation` hook backed by IDB and replay safely on reconnect. Migration 069 added `client_idempotency_key` with partial unique index. | check-in client code, `payments/create`, `clinical/notes` write surfaces | During internet outages, frontdesk and doctors lose ability to record check-ins, payments, and notes. | **Resolved** 26 Apr — D-050 + migration 069. |
| TD-009 | **Server auth handlers still use inline E.164 regex instead of canonical phone validator.** `api/auth/login/route.ts` and `api/auth/register/route.ts` ship `^\+2001[0125][0-9]{8}$` inline. The `DEV_BYPASS_OTP` E.164 branch makes a direct swap to `validateEgyptianPhone` non-trivial — the canonical function operates on local-format `01xxx` while these handlers expect `+2001xxx`. Needs a wrapper or the canonical module needs an E.164 mode. | `api/auth/login/route.ts`, `api/auth/register/route.ts` | Drift risk: if the regex or carrier prefixes change, auth handlers won't pick up the canonical update. | Open — follow-up PR. Low urgency since the regex is correct today. |
| TD-010 | **Orphaned frontdesk UI components still in the repo and referenced by ARCHITECTURE.md.** `ui-clinic/components/frontdesk/PatientRegistrationForm.tsx`, `CheckInForm.tsx`, `AppointmentBookingForm.tsx` are no longer mounted by any route but are still listed in §9.2 Component Architecture. | `packages/ui-clinic/components/frontdesk/` | Dead code, misleading documentation | Open — separate decision: delete or repurpose. |
| TD-011 | **Phone-change client UI (PR-3) not started.** `ChangePhoneFlow` component, `OtpInput` extracted from auth OTP page, 5 new pages, frontdesk + doctor profile-page modifications, owner-inbox UI for approvals. Server side complete, gated behind `FEATURE_PHONE_CHANGE_V2`. | Clinic app frontend | Phone-change feature deployed but inaccessible to users until PR-3 ships | Open — next PR after flag flip. |
| TD-012 | **`commit_phase_b.sh` one-shot build tool left in repo.** Used during phone-change development to orchestrate multi-commit workflow. No longer needed. | Repo root | Dead file | Open — `rm` it. |
| TD-013 | **Dual audit modules: `audit_log` (legacy) vs `audit_events` (clinic-scoped).** `audit_log` is service-role-only, invisible to OWNERs. `audit_events` is clinic-scoped, OWNER-readable. Phone changes (Phase A + B) use `logAuditEvent` (audit_events). Legacy `auditLog` still used by older surfaces. | `packages/shared/lib/audit/`, multiple handler files | Audit data split across two tables with different access models; OWNER cannot see legacy audit entries | Open — deprecate `auditLog` and migrate callers to `logAuditEvent`. |
| TD-014 | **Phase A frontdesk profile PATCH has a 30-day removal trigger.** Top-of-file SECURITY NOTE documents that once Phase B is live and PR-3 ships, the legacy no-OTP path should be removed. `metadata.pathway: 'phase_a_legacy_no_otp'` marker distinguishes legacy changes in audit queries. | Frontdesk patient profile PATCH handler | Security: Phase A allows phone changes without OTP verification, relying only on frontdesk trust | Open — remove 30 days after `FEATURE_PHONE_CHANGE_V2` flag flip. |
| TD-015 | **1 already-divergent `auth.users.phone` row in production.** Found during phone-change investigation: 1 of 288 rows where `auth.users.phone` differs from `public.users.phone`. Root cause unknown (likely prior manual fix or migration gap). `change_phone_commit` now syncs both tables going forward, but the pre-existing divergence was not remediated. | `auth.users` table, production DB | That user's login could fail depending on which table's phone value the code path reads | Open — investigate and reconcile manually. |
| TD-016 | **Several write handlers still use `getUserClinicId` instead of `getFrontdeskClinicId` for tenant resolution.** D-059 fixed `checkInPatient` and `createAppointment` handlers but the same pattern divergence from D-041 exists in: `patients/create`, `patients/[id]`, `patients/onboard`, `patients/my-patients`, `doctor/patients/add`, frontdesk layout. `getUserClinicId` silently returns null when the user has no matching membership, causing downstream writes to either 500 (NOT NULL constraint) or scope incorrectly. | Multiple handler files across `api/frontdesk/` and `api/doctor/` | D-041 violation; writes may fail or mis-scope under edge cases | Open — audit and swap to `getFrontdeskClinicId`/`getClinicContext` per D-041. |
