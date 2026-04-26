# MedAssist — Architecture Document

> Last updated: 26 April 2026 | Version 0.6.0

---

## 1. What Is MedAssist?

MedAssist is an Arabic-first, mobile-first clinic management system built for Egyptian healthcare. It serves three user roles — doctors, frontdesk staff, and patients — across a multi-clinic architecture where a single doctor can belong to multiple clinics and a single frontdesk staff member manages one clinic's daily operations.

The system runs as a Next.js 14 web app backed by Supabase (PostgreSQL + Auth + Realtime + Storage), with an offline-capable PWA shell. Mobile distribution will use a **Capacitor PWA shell** wrapping the same Next.js app for iOS and Android (D-043), reusing every line of `@medassist/shared` and `@medassist/ui-clinic`.

---

## 2. Monorepo Structure

```
medassist/
├── apps/
│   └── clinic/                    # Primary web app (Next.js 14.2, App Router)
│       ├── app/
│       │   ├── (auth)/            # Auth route group (public)
│       │   ├── (doctor)/          # Doctor route group (role-gated)
│       │   ├── (doctor-print)/    # Print-only layout (no nav chrome)
│       │   ├── (frontdesk)/       # Frontdesk route group (role-gated)
│       │   └── api/               # ~90 API route handlers
│       ├── public/                # Static assets, PWA manifest
│       └── tailwind.config.ts     # Design tokens, custom theme
│
├── packages/
│   ├── shared/                    # @medassist/shared
│   │   └── lib/
│   │       ├── auth/              # Session management, OTP
│   │       ├── data/              # Data access layer (~25 modules)
│   │       ├── date/              # Cairo timezone helpers (cairo-date.ts)
│   │       ├── i18n/              # Arabic + English string tables
│   │       ├── analytics/         # Doctor stats, event tracking (31 tests)
│   │       ├── api/handlers/      # Shared API handler logic (doctor/appointments, frontdesk/checkin, queue, payments)
│   │       ├── audit/             # Audit trail logger
│   │       ├── notifications/     # Push notification creation
│   │       ├── offline/           # IndexedDB cache + pending-writes queue (idb-cache.ts only)
│   │       ├── privacy/           # Schema health checks
│   │       ├── realtime/          # Supabase realtime subscriptions
│   │       ├── security/          # Rate limiting
│   │       ├── sms/               # Twilio client, SMS templates
│   │       ├── supabase/          # Client/server/admin Supabase factories
│   │       ├── utils/             # Phone validation, invite codes, etc.
│   │       └── validation/        # Zod schemas, input validators
│   │
│   └── ui-clinic/                 # @medassist/ui-clinic
│       └── components/
│           ├── clinic/            # Clinic-wide components (selector, badges)
│           ├── doctor/            # Doctor section UI (shell, header, cards)
│           ├── frontdesk/         # Frontdesk section UI (queue, forms)
│           ├── patient/           # Patient section UI (shell, nav)
│           └── shared/            # Cross-role shared components
│
├── supabase/
│   └── migrations/                # 70 sequential SQL migrations (068 staged for cleanup)
│
├── .husky/
│   └── pre-push                   # Type-check gate (see D-042)
├── package.json                   # npm workspaces root (prepare: husky)
├── tsconfig.json                  # Root TypeScript config with path aliases
└── turbo.json                     # Turborepo pipeline config
```

**Workspace wiring**: npm workspaces link `@medassist/shared` and `@medassist/ui-clinic` into `apps/clinic`. TypeScript path aliases (`@shared/*`, `@ui-clinic/*`, `@/*`) are defined in the root `tsconfig.json`.

---

## 3. Technology Stack

| Layer | Technology | Version | Notes |
|-------|-----------|---------|-------|
| Framework | Next.js (App Router) | 14.2.25 | Server components + client islands |
| Language | TypeScript | 5.x | Strict mode, 0 errors (D-043 cleanup; root + workspace tsc gated in CI per D-045) |
| Styling | Tailwind CSS | 3.4 | Custom design tokens, Cairo font, RTL-first |
| Database | PostgreSQL (Supabase) | 15 | RLS policies (clinic-scoped, 052–067), 67 migrations |
| Auth | Supabase Auth | — | Email/phone + password, OTP verification |
| Realtime | Supabase Realtime | — | Queue subscriptions, live updates |
| Storage | Supabase Storage | — | Attachments bucket |
| SMS | Twilio | — | OTP, appointment reminders, prescription delivery |
| PWA | next-pwa | 5.6 | Service worker, offline page, IDB cache |
| Error Tracking | Sentry | 10.38 | `@sentry/nextjs` integration |
| Package Manager | npm | 10.2.4 | Workspaces for monorepo |
| Build | Turborepo | — | Pipeline: lint → type-check → build |
| Git Hooks | Husky | — | `pre-push`: runs `npm run type-check -w @medassist/clinic` to catch type errors before they reach Vercel. Added after `b724eb1` incident (see D-042). Activates via `prepare: husky` script. |

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
NOTE: Legacy tables `front_desk_staff` and `clinic_doctors` still exist
      but are deprecated. Direct-query removal deferred (was originally mig 052,
      now superseded by RLS rewrite 052-068). Queued for a future PR.

assistant_doctor_assignments (scope control)
├── assistant_user_id
├── doctor_user_id
└── scope: 'PATIENT_DEMOGRAPHICS' | 'FULL_DOCTOR_SUPPORT'
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

- **Doctors**: Can belong to multiple clinics. Active clinic stored in `active_clinic_id` cookie.
- **Frontdesk**: Single clinic assignment. Resolved via `getFrontdeskClinic()`.
- **Data isolation**: All queries scoped to `clinic_id`. RLS enforces at DB level.

### 5.3 Patient Visibility Model

Two modes per clinic (configured in `clinics.default_visibility`):

- **`DOCTOR_SCOPED`**: Each doctor sees only their own patients
- **`CLINIC_WIDE`**: All doctors in the clinic see all patients

Frontdesk always sees all patients in their clinic.

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
| `frontdesk.ts` | Queue management, check-in, appointments, payments |
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
| `payments.ts` | Payment status constants (`PAYMENT_STATUS`: `pending \| completed \| refunded \| cancelled`), `isCollectedPayment` predicate. Single source of truth for payment status checks — never hardcode status strings in queries. |
| `users.ts` | User account creation per role |
| `phone-changes.ts` | Phone-change workflow engine (~1100 lines, 8 public functions). Covers the full lifecycle: `requestPhoneChange`, `verifyPhoneChangeOtp`, `cancelPhoneChange`, `openFallbackPhoneChange`, `approvePhoneChangeRequest`, `rejectPhoneChangeRequest`, `commitPhoneChange`, `correctPatientPhone`. Orchestrates dual-OTP verification (old phone + new phone), auth-admin sync (`supabase.auth.admin.updateUserById`), cross-clinic patient propagation via `change_phone_commit` RPC, compensating rollback via `change_phone_rollback` RPC on auth-admin failure, and per-clinic audit fan-out. All endpoints gated behind `FEATURE_PHONE_CHANGE_V2` env flag. See D-051. |

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

## 7. API Routes (~98 endpoints)

### 7.1 Route Organization

```
/api/auth/*              → Authentication (login, register, OTP, reset, change-phone/*)
/api/doctor/*            → Doctor-specific (patients, appointments, stats, settings)
/api/frontdesk/*         → Frontdesk-specific (checkin, queue, slots, payments, patients/:id/phone-correction)
/api/clinical/*          → Clinical data (notes, prescriptions, labs, templates)
/api/clinic/*            → Clinic management (create, join, invite, settings, staff, phone-change-requests/*)
/api/patients/*          → Patient operations (create, search, onboard, verify)
/api/drugs/*             → Drug database (search, interactions, alternatives, recent)
/api/analytics/*         → Stats and event tracking
/api/admin/*             → Admin operations (patient dedup)
/api/cron/*              → Scheduled tasks (appointment reminders)
/api/sms/*               → SMS sending
/api/push/*              → Push notification subscriptions
/api/icd10/*             → ICD-10 diagnosis code search
/api/medications/*       → Medication status updates
/api/templates/*         → Prescription template management
/api/doctors/*           → Public doctor listing
/api/setup/*             → Initial setup (create frontdesk)
```

### 7.2 API Conventions

- All protected routes use `requireApiRole()` or `requireApiAuth()`
- Request/response: JSON, `Content-Type: application/json`
- Error format: `{ error: string, details?: string }`
- Success format: `{ success: true, ...data }`
- Admin client uses explicit scope: `createAdminClient('clinical-notes')`

---

## 8. Database Schema (70 Migrations)

### 8.1 Core Tables

```
users                     → Role assignment (doctor/patient/frontdesk), phone_verified + phone_verified_at (mig 070)
doctors                   → Doctor profiles (specialty, license, fees)
patients                  → Patient demographics, medical history
clinics                   → Clinic info, settings, invite codes
clinic_memberships        → Unified RBAC (replaces legacy tables)
```

### 8.2 Clinical Tables

```
clinical_notes            → Session data, diagnosis, vitals, prescriptions
prescriptions             → Standalone prescription records
prescription_templates    → Doctor's reusable medication templates
medications               → Patient medication tracking
medication_intake_log     → Patient medication compliance
lab_results               → Lab test results
imaging_orders            → Radiology/imaging orders
```

### 8.3 Operations Tables

```
appointments              → Scheduled + walk-in appointments
doctor_availability       → Weekly time slots per doctor
check_in_queue            → Real-time patient queue
payments                  → Payment records with method tracking
```

### 8.4 Communication Tables

```
messages                  → Doctor-patient messaging
notifications             → In-app notifications
otp_codes                 → OTP verification codes
sms_log                   → SMS delivery tracking
```

### 8.5 Security & Audit

```
rate_limits               → Per-IP/user rate limiting
audit_log                 → Clinic-level audit trail (legacy, service-role-only — see TD-013)
audit_events              → Clinic-scoped audit trail (OWNER-readable, used by Phase A/B phone changes)
consent_log               → Patient consent tracking
patient_visibility        → Per-doctor patient access grants (seeded from doctor↔patient relationships, mig 052)
phone_change_requests     → Dual-OTP phone change workflow. `user_id` + nullable `patient_id` (XOR check), status CHECK includes `'rejected'`. 3 RLS policies (staff SELECT, staff INSERT, OWNER cross-clinic SELECT). Mig 013 (scaffolding), mig 070 (production-ready).
patient_phone_history     → Phone change audit trail. `changed_by` FK → users (mig 070), `change_reason` with CHECK enum.
```

### 8.6 Migration Timeline

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
| 055-067 | RLS Per-Table Policies | Ten new clinic-scoped policies across all tenant tables. 056: Fix `clinic_memberships` self-referential recursion (→ `is_clinic_member`). 057: Enable RLS on `vital_signs`, `lab_orders`, `lab_results`, `lab_tests` (policies existed but `relrowsecurity=false`). 058-067: Per-table policies via three patterns — see §12. D-048, D-049. |
| 068 | RLS Cleanup (staged) | Drop 11 redundant legacy SELECTs, 5 cross-clinic-leak policies (global `users.role='frontdesk'` ones), legacy permissive INSERT on `clinical_notes`, replace global appointment ALL with clinic-scoped equivalent. |
| 070 | Phone-Change Schema (live) | `users.phone_verified` + `phone_verified_at` (backfilled 288 users to `true`). `patient_phone_history.changed_by` FK + `change_reason` CHECK enum. `phone_change_requests.user_id`, `patient_id` made nullable with XOR check, status CHECK extended (`'rejected'`), partial index `idx_phone_change_user`. 3 RLS policies. 2 SECURITY DEFINER functions: `change_phone_commit(...)` (atomic SQL commit with cross-clinic propagation, returns touched `(clinicId, patientId)` pairs as JSONB) and `change_phone_rollback(...)` (compensating reversal, keyed by `subject_id` not phone). Both gate patient propagation on `subject_kind = 'patient'` to prevent staff→patient cross-contamination. D-051. |

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

**Spacing**: Mobile-first `max-w-md` container, `p-4` card padding, `rounded-[12px]` cards, `h-[44px]` buttons

### 9.2 Component Architecture

```
DoctorShell               → Mobile RTL wrapper (dir="rtl", max-w-md, bg-[#F9FAFB])
├── DashboardHeader       → Welcome message, clinic selector, stats
├── PatientQueueCard      → Patient card with visit type + action buttons
├── BottomNav             → Fixed bottom: schedule, FAB, messages
├── FloatingActionButton  → Expands: new session + add appointment
└── SettingsDrawer        → Slide-out: profile, clinic, assistants, logout

FrontdeskBottomNav        → Fixed bottom: dashboard, check-in, appointments, payments, reports, account
├── DoctorStatusCard      → Live doctor session with timer
├── QueueList             → Real-time patient queue
├── CheckInForm           → Patient search + doctor selector + queue type
├── AppointmentBookingForm→ Patient + doctor + date + time slots
└── PaymentForm           → Amount + method + patient selector
```

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

- **RLS**: Clinic-scoped Row Level Security on all tenant tables (migrations 052–067). Three access-control functions (SECURITY DEFINER, owned by `postgres`): `can_access_patient(patient_id, user_id)` — triple-OR: user is the patient, is the treating doctor, or is a clinic member of the patient's clinic; `is_clinic_member(clinic_id, user_id)` — checks `clinic_memberships` with `status='ACTIVE'`; `get_clinic_role(clinic_id, user_id)` — returns the user's role in a clinic. Three policy patterns: (1) `can_access_patient` triple-OR for clinical tables (vital_signs, imaging_orders, lab_orders, clinical_notes, patients), (2) `is_clinic_member` triple-OR for operations tables (check_in_queue, conversations, payments, appointments), (3) EXISTS-via-parent join for child tables (lab_results → lab_orders, messages → conversations). Important: `createAdminClient` (service-role) bypasses RLS on most read paths — RLS is defense-in-depth, not the primary runtime gate. See D-048, D-049
- **Admin Client Scope**: `createAdminClient(scope)` requires explicit scope string for audit
- **Rate Limiting**: `rate_limits` table, 8 auth attempts / 60 seconds
- **Input Validation**: Zod schemas in `packages/shared/lib/validation/`. `isPhone` in `schemas.ts` now defers to the canonical phone validator (not a length-only stub).
- **Phone Validation**: Canonical module at `packages/shared/lib/utils/phone-validation.ts`. Two helpers: `getEgyptianPhoneError(phone)` (strict, for form submission — returns Arabic error string or `null`) and `getEgyptianPhoneSearchError(phone)` (lax, for search inputs — tolerates still-typing state and 10-digit-without-leading-zero paste). Also exports: `EGYPT_LOCAL_PHONE_RE` (`01[0125]\d{8}`), `normalizeEgyptianDigits` (Arabic-Indic → Latin), `isValidEgyptianLocalPhone`, `validateEgyptianPhone` (server-side E.164). All 9 client surfaces use the canonical helpers; 0 inline regex remaining on the client side. See D-046, D-047.
- **Phone-Change Security**: Dual-OTP verification (old phone + new phone) for phone number changes. Self-approval banned — solo-clinic OWNERs cannot approve their own phone change (support email route). Security SMS to old phone post-commit for out-of-band recovery. Compensating rollback RPC if `auth.users.phone` admin sync fails. All phone-change operations audited via `logAuditEvent` (7 new AuditAction values). Feature-gated: `FEATURE_PHONE_CHANGE_V2` env flag returns 404 until flipped. See D-051.
- **OTP**: 4-digit codes, 5-minute expiry, stored in `otp_codes` table. OTP `purpose` union extended with phone-change purposes.
- **Session**: httpOnly cookies, server-side validation, no localStorage for auth
- **CORS**: Next.js default (same-origin)
- **Audit Trail**: Two modules — `audit_log` (legacy, service-role-only) and `audit_events` (clinic-scoped, OWNER-readable). Phone changes use `logAuditEvent` (audit_events). AuditAction enum: 25 values (18 original + 7 phone-change). Legacy module flagged for deprecation — see TD-013.

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

- **Path aliases**: `@/*`, `@shared/*`, `@ui-clinic/*` in root `tsconfig.json`
- **Current errors**: 0 (was 3 `@capacitor/*` errors; all resolved by removing the unreachable Capacitor SQLite/LAN scaffolding — D-043, D-044). Root `tsc --noEmit` and per-workspace `type-check` both clean.
- **Strict mode**: Enabled
- **CI gate**: `npm run type-check` (root) and per-workspace `type-check -w @medassist/clinic` / `-w @medassist/patient` are required CI checks. Pre-push hook runs the same root + clinic-workspace combo locally (D-042 + D-045).
- **Verification**: `npx tsc --noEmit` from project root → 0 errors.
- **Test runner**: Mixed. `doctor-stats.test.ts` (31 tests) and `drug-interactions.test.ts` use a hand-rolled `test()` harness via `npx tsx <file>`. `frontdesk/payments/create/__tests__/handler.test.ts` uses Vitest with compile-time witnesses + `@ts-expect-error` regression guards — first Vitest usage in the repo. Full Vitest migration recommended before CI enforcement.

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
| RLS: Additive-then-cleanup | Migrations 055-067 (additive), 068 (cleanup) | New clinic-scoped policies are added alongside legacy policies. Legacy drops are batched into a separate migration for rollback safety. See D-048 |
| RLS: Ascending blast radius | Per-table policy rollout | Apply policies to lowest-row tables first (vital_signs: 0 rows), highest-row tables last (patients: 35 rows). By the time identity tables are touched, access-control functions are battle-tested. See D-048 |
| Feature flag gating | Phone-change endpoints | `FEATURE_PHONE_CHANGE_V2` env var. When falsy, all 8 handlers return 404 — code is deployed but dormant. Flip the flag to activate without a deploy. Pattern reusable for future gated features. See D-051 |
| Frontdesk-as-proxy | Phone-change Flow E | For patient identity-phone changes, the frontdesk staffer initiates the change and the patient provides the OTPs verbally. Handler validates `actor.role === 'frontdesk' AND patient.clinic_id === getFrontdeskClinicId(actor)` and records `actorRole='frontdesk_proxy'` in audit metadata. Mirrors the existing physical-world workflow. See D-051, D-055 |
| Compensating rollback | `change_phone_commit` + `change_phone_rollback` RPCs | After SQL commit succeeds, auth-admin sync may fail. On failure, `change_phone_rollback` fires to revert `users.phone` + `patients.phone` changes. Rollback keyed by `subject_id` (not by phone value) to avoid clobbering unrelated users. See D-051 |

---

## 16. Known Technical Debt

> Tracking table for identified issues. TD-001–005 resolved; TD-007 superseded; TD-008 resolved 26 Apr (D-050); TD-006, TD-009, TD-010, TD-011, TD-012, TD-013, TD-014, TD-015 open.

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
