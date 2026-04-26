# Phone-Change Flow — End-to-End Investigation & Implementation Plan

> **Status**: All open questions resolved by Mo on 2026-04-25 (see §10.2). Ready for code start (PR-1: Migration 070 first).
> **Date**: 25 April 2026 (`2026-04-25`); resolved 2026-04-25
> **Author**: Claude (working session)
> **Scope**: Phase A (stop-the-bleeding), Phase B (proper dual-OTP flow), Phase C (patient phone correction)
> **Architectural anchors**: D-007, D-008, D-019, D-024, D-041, D-046, D-047
> **Proposed new decision**: D-050 — *Phone is identity; changing it is a deliberate dual-OTP event with auth-side sync* (add to `DECISIONS_LOG.md` after PR-2 lands)

---

## 1. Executive Summary

### What's broken today

Phone is identity in MedAssist (login, patient global ID, future routing key for labs/pharmacy/insurance). Today, **only one phone-change path is wired** and it has three gaps that should not exist together:

1. **Frontdesk staff own-phone PATCH** (`apps/clinic/app/api/frontdesk/profile/route.ts:71-137`) writes `users.phone` with a `length < 10` check and zero regex validation — accepts any 10+ character string. No OTP. No audit log. No `phone_verified` tracking. (`users` doesn't even have a `phone_verified` column — only `patients` does.)
2. **Doctor own-phone PATCH** (`apps/clinic/app/api/doctor/profile/route.ts:40-72`) silently drops `body.phone` — only `specialty` and `fullName` are accepted. There is no path for a doctor to change phone today.
3. **Patient own-phone change** has no endpoint at all. The patient app is Phase 2 of the roadmap so the UI is correctly absent, but the backend is also absent.

The DB has been *partially* prepared for the proper flow:

- `phone_change_requests` (full dual-OTP shape: `pending → old_verified → new_verified → completed | expired | cancelled`)
- `patient_phone_history` (with `removed_reason` enum including `user_changed` and `entry_error`)
- `phone_corrections` (separate table — Phase C)
- `account_recovery_requests` (the lost-old-phone fallback)
- `patient_phone_verification_issues`, `patient_recovery_codes`
- `otp_codes.purpose` CHECK already accepts `phone_change_old`, `phone_change_new`, `phone_correction`, `account_recovery`

But every one of those tables is **empty in production** (`phone_change_requests`: 0 rows, `phone_corrections`: not yet checked, `account_recovery_requests`: 0 rows). They were designed but never wired.

Two tables are also wrong-shaped for what we need:

- `phone_change_requests.patient_id` is FK to `patients(id)` — the table cannot model a staff (frontdesk/doctor) phone change as designed.
- `users` has no `phone_verified` column at all (the brief assumed it; not true). All 35 patients in production have `phone_verified IS DISTINCT FROM true` (i.e. NULL or false), even though some came in via OTP — the existing `onboardPatient` path never sets the flag.

### What we're building, in what order

| Phase | Window | Deliverable | Migration? | Feature flag? |
|---|---|---|---|---|
| **A** — Stop the bleeding | 1–2 days, ship this week | Server-side regex validation on existing `PATCH /api/frontdesk/profile`, plus an `audit_events` write for every phone change, plus an explicit comment in the route documenting that no OTP is enforced yet | No | No — ship straight |
| **B** — Proper dual-OTP flow | 1–2 weeks | New `/api/auth/change-phone/{request,verify,cancel,fallback}` shared by all three roles. Owner-approval inbox endpoints. Wires up `phone_change_requests`, `patient_phone_history`, `account_recovery_requests`. New `users.phone_verified` + `users.phone_verified_at` columns. New table or table-shape change for staff phone-change requests. Phase A path retired behind a feature flag. | Yes (3 migrations) | `FEATURE_PHONE_CHANGE_V2` |
| **C** — Patient phone correction (typo fix) | Bundled with B | New `PATCH /api/frontdesk/patients/:id/phone-correction` endpoint, no OTP, mandatory reason, writes `phone_corrections` + `patient_phone_history` (`removed_reason='entry_error'`) | Already exists (table already there) | Same flag |

Patient app phone change for Phase 2 is **stubbed but not exposed**: the change-phone backend endpoint accepts a `patient` role caller but no patient UI ships in this batch. Documented inline.

### Risk highlights (full list in §10)

- **Race on `users.phone` UNIQUE constraint** during OTP-in-flight — the new phone may get registered by someone else between OTP send and OTP commit. Plan handles via 23505 catch + clean error.
- **Cross-clinic propagation has zero production data today** (35 patients, 35 distinct phones, 0 dups), but the schema permits multiple patient rows per phone (`patients.phone` has only an index, no UNIQUE). The propagation rule must update *all* patient rows that share the old phone, gated by visibility model.
- **Twilio SMS cost** — dual-OTP doubles SMS spend per change. Plan adds a per-user-per-day rate cap.
- **`phone_change_requests` table is patient-scoped only.** Staff phone changes are added by Migration 070 via a nullable `user_id` column + XOR check (option A, decided).
- **`auth.users.phone` synchronization is mandatory** (resolved Q1, 2026-04-25). 53 of 288 production accounts authenticate against `auth.users.phone` directly — the commit must call `supabase.auth.admin.updateUserById` or those users can't log in after their change.

---

## 2. Codebase Audit

Every claim below is grounded in a file I read. Line numbers are inclusive.

### 2.1 Frontdesk own-profile UI — `apps/clinic/app/(frontdesk)/frontdesk/profile/page.tsx`

- 1016-line client component, edit/view mode toggle, RTL `dir="rtl"`, mobile-first `max-w-md`.
- Phone field is rendered inline alongside name + email and edited in the same form (no separate change-phone surface today).
- Client-side validation already correct: imports `getEgyptianPhoneError()` and `normalizeEgyptianDigits()` from `@shared/lib/utils/phone-validation` — confirmed by Grep at lines 187 and 196.
- Submits via `PATCH /api/frontdesk/profile` with `{ fullName, phone, email }`.
- **What's reusable for Phase B**: top-of-page toast pattern (line 369-380), modal overlay pattern (lines 703-899), accordion sectioning, edit/save button pair. The new "Change Phone" button replaces the inline phone field's edit affordance.
- **What's missing**: any indication that phone change is identity-affecting; any "verify with OTP" sub-flow; any read of `phone_verified`.

### 2.2 Frontdesk profile route — `apps/clinic/app/api/frontdesk/profile/route.ts` (137 lines)

PATCH handler **verbatim relevant block** (lines 100–127):

```ts
// Update users table (phone, email)
const userUpdates: Record<string, any> = {}
if (phone !== undefined) {
  const normalized = phone.replace(/[\s\-\(\)]/g, '')
  if (!normalized || normalized.length < 10) {
    errors.push('رقم الهاتف غير صحيح')
  } else {
    userUpdates.phone = normalized
  }
}
if (email !== undefined) {
  userUpdates.email = email?.trim() || null
}

if (Object.keys(userUpdates).length > 0 && errors.length === 0) {
  const { error } = await supabase
    .from('users')
    .update(userUpdates)
    .eq('id', user.id)

  if (error) {
    if (error.message.includes('duplicate') || error.message.includes('unique')) {
      errors.push('رقم الهاتف مستخدم من حساب آخر')
    } else {
      errors.push('فشل تحديث البيانات')
    }
  }
}
```

Findings:

- **Validation is wrong** (line 103-104): strips formatting then checks `length < 10`. Accepts `1234567890`, `0123456`, `+447911123456`, anything 10+ chars. Never calls `validateEgyptianPhone()` despite that helper being canonical (D-046). `users.phone` is therefore writable with non-Egyptian formats today.
- **No audit log** anywhere in the handler. No call to `auditLog()` or `logAuditEvent()`.
- **No `phone_verified` write** because the column doesn't exist on `users` (verified via DB introspection in §3).
- **Duplicate detection is reactive** (line 121-122): catches Postgres unique-violation messages by string match. Works today because `users.phone` has UNIQUE constraint (`users_phone_key`), but the error string match is fragile.
- **Uses admin client** (`createAdminClient('frontdesk-profile-update')`, line 77) — D-008 compliant scope name. Could equivalently use the user's own session client since the `users` UPDATE policy is `auth.uid() = id`, but the existing code uses admin. Phase A keeps the admin-client pattern to minimize surface change.

### 2.3 Doctor profile route — `apps/clinic/app/api/doctor/profile/route.ts` (72 lines)

PATCH handler **verbatim** (lines 40–72):

```ts
export async function PATCH(request: Request) {
  try {
    const user = await requireApiRole('doctor')
    const body = await request.json()
    const admin = createAdminClient('doctor-profile-update')
    const updates: Record<string, any> = {}
    if (body.specialty) updates.specialty = body.specialty
    if (body.fullName) updates.full_name = body.fullName
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'لا توجد بيانات للتحديث' }, { status: 400 })
    }
    const { error } = await admin.from('doctors').update(updates).eq('id', user.id)
    if (error) throw new Error(error.message)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return toApiErrorResponse(error, 'فشل في تحديث الملف الشخصي')
  }
}
```

- `body.phone` is **never read**. There is no doctor-side phone-change endpoint at all today.
- The `doctors` table doesn't carry `phone` — the canonical phone for any user is `users.phone`. So even if the route accepted phone, it would be writing to the wrong table.

### 2.4 OTP infrastructure

**`packages/shared/lib/auth/otp.ts`** (149 lines, read in full):

```ts
export async function createOTP(
  phone: string,
  purpose: 'registration' | 'login' | 'password_reset'
): Promise<string>

export async function verifyOTP(
  phone: string,
  code: string,
  purpose: 'registration' | 'login' | 'password_reset'
): Promise<{ valid: boolean; error?: string }>
```

- Generates 4-digit codes via `crypto.randomInt(1000, 10000)` (line 7-9).
- SHA-256 hashes for storage (`hashOTP`, line 14-16).
- Insert sets `expires_at = now + 5 min` (line 29), `max_attempts = 5` (line 57). Note the DB column default is 3 — the explicit insert at 5 wins.
- On verify: invalidates by setting `used = true` + `consumed_at = now` (line 138-145). Single-use enforced.
- Verify-side does **not** scope by `clinic_id` or any tenant — purely phone+purpose.
- **Gap for Phase B**: TS purpose union must extend to include `'phone_change_old' | 'phone_change_new' | 'phone_correction'`. The DB CHECK already accepts these (verified §3), so this is a TypeScript-only change.

**`packages/shared/lib/api/handlers/auth/send-otp/handler.ts`** (81 lines):

- Rate limit `enforceRateLimit(request, 'otp-send', 5, 60_000)` (line 18) — 5 sends per IP per minute.
- **`validPurposes = ['registration', 'login', 'password_reset']`** (line 36) — same TS-only gap as `otp.ts`. Must add three more values.
- SMS template (line 58): `رمز التحقق الخاص بك في MedAssist هو: ${code}\nصالح لمدة ٥ دقائق.`
- `DEV_BYPASS_OTP=true` env var skips SMS entirely (line 13, 44-52). Useful for Phase B testing without burning Twilio credits.

**`packages/shared/lib/api/handlers/auth/verify-otp/handler.ts`** (94 lines):

- Rate limit `'otp-verify', 10, 60_000` (line 17).
- `OTP_BYPASS_CODE` env var lets a fixed code skip verification (line 36-37).
- For `password_reset` purpose, generates a separate 32-byte reset token stored as a second `otp_codes` row with `purpose='reset_token'` (line 51-78). This is the existing pattern for "verified, now do the next thing" — Phase B's dual-OTP flow follows it.

**OTP UI page — `apps/clinic/app/(auth)/otp/page.tsx`** (364 lines):

- Reads `phone` and `purpose` from URL search params (line 19-20).
- 4-digit input row, auto-advance, auto-submit on 4th digit (line 44-58).
- 30-second resend countdown with `formatTime(seconds)` MM:SS display (line 25, 150-154, 273-291).
- Error rendered as red text with framer-motion fade-in (line 220-228).
- Trust panel on left (desktop only) lists three claims (line 156-160) — note: claim says `صالح لمدة ٣٠ دقيقة فقط` but actual TTL is 5 min, not 30. Real bug surfaced by this audit, but out of scope.
- Hard-codes the post-verify routing for `registration` and `password_reset` (line 90-126). Phase B adds `phone_change_old` and `phone_change_new` branches.

### 2.5 Auth route inventory — `apps/clinic/app/api/auth/*`

```
check-phone/route.ts     → re-exports @shared/lib/api/handlers/auth/check-phone/handler
login/route.ts           → re-exports @shared/lib/api/handlers/auth/login/handler
logout/route.ts          → re-exports …/logout/handler
register/route.ts        → re-exports …/register/handler
reset-password/route.ts  → re-exports …/reset-password/handler
send-otp/route.ts        → re-exports …/send-otp/handler
verify-otp/route.ts      → re-exports …/verify-otp/handler
```

Phase B adds a new sub-tree `apps/clinic/app/api/auth/change-phone/{request,verify,cancel,fallback}/route.ts` (each one a thin re-export of a handler under `packages/shared/lib/api/handlers/auth/change-phone/`).

### 2.6 Patient data layer — `packages/shared/lib/data/patients.ts`

- `createWalkInPatient` (lines 440–749) is the only writer of `patient_phone_history`. INSERT block at lines 671–678:

```ts
await adminSupabase
  .from('patient_phone_history')
  .insert({
    patient_id: userId,
    phone: data.phone,
    is_current: true,
    verified: false
  })
```

- `verified: false` even though walk-in registration may already have an OTP step elsewhere. Not setting `verified_at` is fine because `verified=false`. Not setting `changed_at` is fine because the column has `DEFAULT now()`.
- `onboardPatient` (lines 189–438) does **not** write to `patient_phone_history`. The 29 history rows in production all came from `createWalkInPatient`.
- No function in this module supports phone *change*. Phase B adds this in a new module `packages/shared/lib/data/phone-changes.ts` (see §6).

### 2.7 Audit infrastructure

**Two audit modules exist** — both real, both used. This needs to be acknowledged before the new flow picks one.

| Module | Table | Action vocabulary | Tenant-aware? | Insert client |
|---|---|---|---|---|
| `packages/shared/lib/audit/logger.ts` → `auditLog()` | `audit_log` | freeform string (`'create' \| 'read' \| 'update' \| ...`) | No (no `clinic_id` column) | admin client, scope `'audit-log'` |
| `packages/shared/lib/data/audit.ts` → `logAuditEvent()` | `audit_events` | typed `AuditAction` enum (18 values today: `VIEW_PATIENT`, `EDIT_PATIENT`, `CREATE_PATIENT`, `VIEW_CLINICAL_NOTE`, `CREATE_CLINICAL_NOTE`, `VIEW_PRESCRIPTION`, `PRINT_PRESCRIPTION`, `CREATE_APPOINTMENT`, `VIEW_LAB_RESULTS`, `CREATE_LAB_ORDER`, `SHARE_PATIENT`, `REVOKE_SHARE`, `TRANSFER_PATIENT`, `VIEW_VITALS`, `CREATE_VITALS`, `LOGIN`, `LOGOUT`, `EXPORT_DATA`) | Yes (`clinic_id` on row) | admin client, scope `'audit-logging'` |

`audit_events` is the newer, clinic-scoped, OWNER-readable surface (RLS policy `owners_view_audit_events` — confirmed in §3). `audit_log` is the older fire-and-forget service-role-only surface. The clinic owner audit page reads `audit_events` via `getAuditLog(clinicId, opts)` in `data/audit.ts:53-79`.

**Decision**: Phase A and Phase B both use `logAuditEvent` (`audit_events`). Reasons: (1) clinic-scoped, so an OWNER can see staff phone changes in the existing audit-log UI; (2) typed enum forces us to extend `AuditAction`, making the addition reviewable; (3) consistent with newer code paths. We extend `AuditAction` in `data/audit.ts:5-23` to add `'CHANGE_PHONE_REQUESTED' | 'CHANGE_PHONE_COMMITTED' | 'CHANGE_PHONE_CANCELLED' | 'CHANGE_PHONE_FALLBACK_OPENED' | 'CHANGE_PHONE_FALLBACK_APPROVED' | 'CHANGE_PHONE_FALLBACK_REJECTED' | 'CORRECT_PATIENT_PHONE'` (7 new values; enum grows from 18 → 25).

### 2.8 SMS — `packages/shared/lib/sms/twilio-client.ts`

- `sendSMS(to, body)` and `sendWhatsApp(to, body)` exist with `{ success, sid?, error? }` shape.
- Reads `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`.
- 6-second timeout, fails open with `success: true, sid: 'stub_…'` if creds are placeholders. **Important for Phase B**: a Twilio outage will silently complete `sendSMS` — the verify step then fails when the user can't read a code. Add a structured log so this is visible.
- `reminder-templates.ts` has 6 Arabic templates; **none are OTP-shaped**. The OTP send-otp handler builds the SMS body inline (not from this template module). Phase B follows the same inline-template pattern but adds a clearer body specifically labelled "تغيير رقم الهاتف".

### 2.9 Validation, rate limit, phone helpers, i18n

- `packages/shared/lib/validation/schemas.ts` — `isPhone(val)` defers to `validateEgyptianPhone(val).isValid` (D-046). Reusable for the new endpoint's Zod-ish body validators.
- `packages/shared/lib/utils/phone-validation.ts` — canonical helpers (D-046, D-047). Phase B uses `validateEgyptianPhone(local)` server-side for normalization-into-E.164 and `getEgyptianPhoneError(local)` for client form validation.
- `packages/shared/lib/security/rate-limit.ts` — `enforceRateLimit(request, scope, max, windowMs)` uses RPC `consume_rate_limit` (function exists in DB; verified in §3). Plan adds three new scopes: `'change-phone-request'` (3 / 60s), `'change-phone-verify'` (10 / 60s), `'change-phone-fallback'` (2 / 24h).
- `packages/shared/lib/i18n/ar.ts` — relevant existing keys (verified by Grep):

| Key | Value |
|---|---|
| `phone` | `رقم الهاتف` |
| `mobile` | `رقم الجوال` |
| `mobileNumber` | `رقم الموبايل` |
| `phoneNumber` | `رقم الهاتف` |
| `confirm` | `تأكيد` |
| `verifyCode` | `تحقق` |
| `otpVerification` | `التحقق من الرمز` |
| `enterOtpCode` | `أدخل رمز التحقق المرسل إلى` |
| `otpResend` | `إعادة إرسال الرمز` |
| `otpResendIn` | `إعادة الإرسال خلال` |
| `otpInvalid` | `رمز التحقق غير صحيح` |
| `otpExpired` | `انتهت صلاحية رمز التحقق` |
| `invalidPhoneNumber` | `رقم هاتف غير صحيح` |
| `unsavedChanges` | `هناك تغييرات غير محفوظة` |
| `passwordResetSuccess` | `تم تغيير كلمة المرور بنجاح` |

  House style observed:
  - Mixes `الهاتف` / `الجوال` / `الموبايل` for phone — no single canonical term. The frontdesk profile page uses `الهاتف`. New copy uses `رقم الهاتف` for the field label and `رقم الموبايل الجديد` for the new-phone confirmation step (more colloquial).
  - Errors lean colloquial Egyptian (`الاسم لازم يكون على الأقل حرفين` in the existing route). New copy follows: `لازم تأكد الرقم القديم الأول`, `الكود غلط، حاول تاني`.
  - Forms lean semi-formal MSA (`رقم الهاتف`, `إعادة الإرسال`).
  - SMS body template established by send-otp handler: `رمز التحقق الخاص بك في MedAssist هو: ${code}\nصالح لمدة ٥ دقائق.`

### 2.10 Reusability matrix (collapsed)

| Helper / endpoint | Reuse as-is? | Action |
|---|---|---|
| `validateEgyptianPhone()` | ✅ | Use in Phase A handler patch + every Phase B endpoint |
| `getEgyptianPhoneError()` | ✅ | All client forms |
| `normalizeEgyptianDigits()` | ✅ | All client inputs |
| `requireApiRole(role)` | ✅ | Auth guard for new endpoints |
| `toApiErrorResponse()` | ✅ | Error envelope |
| `enforceRateLimit()` | ✅ | New scopes (see §5) |
| `createAdminClient(scope)` | ✅ | New scopes: `'phone-change-request'`, `'phone-change-verify'`, `'phone-correction'`, `'phone-change-fallback'` |
| `createOTP(phone, purpose)` | ⚠️ Extend TS purpose union | Add `'phone_change_old' \| 'phone_change_new' \| 'phone_correction'` (DB CHECK already accepts) |
| `verifyOTP(phone, code, purpose)` | ⚠️ Extend TS purpose union | Same |
| `send-otp/handler.ts` `validPurposes` array (line 36) | ⚠️ Extend | Add same three values |
| `verify-otp/handler.ts` | ⚠️ Optional extend | The new `/api/auth/change-phone/verify` endpoint is a separate handler — does NOT route through this one (it has its own state-machine logic) |
| `sendSMS()` | ✅ | Inline template per call |
| `logAuditEvent()` | ⚠️ Extend `AuditAction` enum | Add 7 new values listed in §2.7 + §5.3 (`CHANGE_PHONE_CANCELLED` per §5.3); enum grows from 18 → 25 |
| `auditLog()` (legacy) | ❌ | Do not use for new flow — choose `logAuditEvent` for clinic-scoping |
| OTP page `apps/clinic/app/(auth)/otp/page.tsx` | ⚠️ Extend | Add `phone_change_old` and `phone_change_new` branches in the post-verify router; consider extracting the 4-digit input + countdown into `packages/ui-clinic/components/auth/OtpInput.tsx` for reuse on the new in-app modal screens (currently inline in this page) |
| Frontdesk profile page form | ⚠️ Modify | Replace inline phone-edit with a "تغيير رقم الهاتف" button that opens a flow at `/frontdesk/profile/change-phone` |
| Doctor profile page form | ⚠️ Add | Same button + flow at `/doctor/profile/change-phone` |

---

## 3. Schema Audit (Live DB)

All findings below come from `mcp__supabase` queries against project `mtmdotixlhwksyoordbl` (medassist-egypt) on 2026-04-25, not from migration source files. Where migration source disagrees with live state I flag it.

### 3.1 Tables that exist + relevant columns

#### `phone_change_requests` (0 rows in production — completely dormant)

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | `uuid_generate_v4()` |
| patient_id | uuid | NO | — (FK → `patients(id)` ON DELETE CASCADE) |
| old_phone | text | NO | — |
| new_phone | text | NO | — |
| status | text | YES | `'pending'` |
| verification_method | text | YES | — |
| old_phone_otp_hash | text | YES | — |
| old_phone_verified_at | timestamptz | YES | — |
| new_phone_otp_hash | text | YES | — |
| new_phone_verified_at | timestamptz | YES | — |
| created_at | timestamptz | YES | `now()` |
| expires_at | timestamptz | YES | `now() + 24h` |
| completed_at | timestamptz | YES | — |
| requested_at | timestamptz | NO | `now()` |

**CHECK constraints (verbatim from `pg_get_constraintdef`)**:

```
status IN ('pending','old_verified','new_verified','completed','expired','cancelled')
verification_method IN ('sms_both','sms_new_only','email','national_id','recovery_code','manual')
```

Indexes: `idx_phone_change_patient (patient_id)`, `idx_phone_change_status (status)`, partial `idx_phone_change_pending (patient_id, status) WHERE status IN ('pending','old_verified')`.

RLS (from `pg_policies`):
- INSERT: `patient_id = auth.uid()` (patient creates their own request)
- SELECT: `patient_id = auth.uid()` (patient reads their own)
- **No UPDATE policy.** Status transitions can only happen via service-role/admin client. This is fine — every write goes through the new endpoint anyway.
- **No frontdesk-side or owner-side SELECT policy.** The owner-approval inbox endpoint (Phase B) reads via admin client and authorizes via OWNER role check in handler code — same pattern as `/api/clinic/staff` and `/api/clinic/audit-log`.

**Critical limitation**: `patient_id` is FK to `patients(id)`. Staff (frontdesk/doctor) phone changes cannot be modeled here as designed. See §3.4 for the migration option chosen.

#### `patient_phone_history` (29 rows in production)

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | `uuid_generate_v4()` |
| patient_id | uuid | NO | — (FK → `patients(id)` ON DELETE CASCADE) |
| phone | text | NO | — |
| is_current | boolean | YES | `true` |
| verified | boolean | YES | `false` |
| verified_at | timestamptz | YES | — |
| added_at | timestamptz | YES | `now()` |
| removed_at | timestamptz | YES | — |
| removed_reason | text | YES | — |
| changed_at | timestamptz | NO | `now()` |

**CHECK constraint**:
```
removed_reason IN ('user_changed','number_recycled','user_reported_lost',
                   'admin_removed','verification_failed','entry_error')
```

Indexes: `idx_phone_history_patient (patient_id)`, `idx_phone_history_phone (phone)`, partial `idx_phone_history_current WHERE is_current = true`.

RLS:
- SELECT: `patient_id = auth.uid()` for patient self; `users.role='doctor'` for any doctor (this leaks across clinics — flagged §10).
- No INSERT/UPDATE/DELETE policy. All writes admin-client.

**Missing column**: `changed_by uuid` — who initiated the change. The new flow needs this for accountability. Migration 070 adds it.

#### `phone_corrections` (Phase C — exists, 0 rows checked; columns confirmed)

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | `uuid_generate_v4()` |
| patient_id | uuid | NO | FK → patients |
| old_phone | text | NO | — |
| new_phone | text | NO | — |
| reason | text | NO | — |
| verification_method | text | YES | — |
| initiated_by | text | NO | — |
| initiated_by_user_id | uuid | YES | FK → users |
| status | text | YES | `'pending'` |
| otp_hash | text | YES | — |
| created_at | timestamptz | YES | `now()` |
| completed_at | timestamptz | YES | — |

This is exactly the Phase C correction shape — already named and structured. No migration needed for the table; we wire it.

#### `account_recovery_requests` (lost-old-phone fallback — 0 rows, columns confirmed)

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | `uuid_generate_v4()` |
| claimed_phone | text | NO | — |
| claimed_patient_id | uuid | YES | FK → patients |
| new_phone | text | NO | — |
| status | text | YES | `'pending'` |
| verification_method | text | YES | — |
| verification_data | jsonb | YES | — |
| reviewed_by | uuid | YES | FK → users |
| reviewed_at | timestamptz | YES | — |
| review_notes | text | YES | — |
| created_at | timestamptz | YES | `now()` |
| expires_at | timestamptz | YES | `now() + 7 days` |
| completed_at | timestamptz | YES | — |

This is the **fallback flow** table referenced in the brief as "phone_change_requests row with approval workflow." It's a separate table — better, because it lets the approval inbox query a single shape regardless of which channel triggered it. **Patient-only.** Staff fallback (out-of-band support ticket per scope decision §6 of brief) does not need DB rows; it is handled via support email + manual `audit_events` write.

#### `otp_codes` (6 rows, healthy)

Schema columns: `id, phone, code_hash, otp_hash, purpose, patient_id?, attempts, max_attempts, used, used_at, consumed_at, created_at, expires_at`.

**CHECK constraint on `purpose` (verbatim)**:
```
purpose IN ('phone_verification','phone_change_old','phone_change_new',
            'phone_correction','account_recovery','login','registration',
            'password_reset','reset_token')
```

DB already accepts the new purposes. Only the TS types need extending. Indexes: `idx_otp_codes_phone_purpose (phone, purpose, expires_at DESC) WHERE used=false` is partial — perfect for "find latest unused OTP."

#### `users` (288 rows)

`id, phone, email, role, created_at`.

- `users.phone` has `UNIQUE (phone)` constraint (`users_phone_key`). 
- `users.id` is FK to `auth.users(id) ON DELETE CASCADE`.
- **There is no `phone_verified` or `phone_verified_at` column on `users`.** The brief assumed otherwise. Migration 070 adds them.
- RLS: SELECT/UPDATE on own row only (`auth.uid() = id`); INSERT for own id only.

#### `patients` (35 rows, all `phone_verified IS DISTINCT FROM true`)

Relevant columns: `id, phone, phone_verified (default false), phone_verified_at, clinic_id (NOT NULL)`.

- `patients.id` is FK to `users(id) ON DELETE CASCADE`. Every patient row implies a corresponding users row at the same id.
- **`patients.phone` has NO unique constraint** — only `idx_patients_phone` btree index. Multiple patient rows could legally share a phone. Today: 0 dups in 35 rows.
- `phone_verified` exists with default `false`. None of the 35 rows have it set to `true` despite `onboardPatient` running OTP — so the existing onboard path forgets to flip it.

#### `audit_log` vs `audit_events` (both exist)

- `audit_log`: `id, user_id, user_role, action, resource_type, resource_id, details (jsonb), ip_address, created_at`. RLS: ALL for `service_role` only. No tenant scope.
- `audit_events`: `id, clinic_id, actor_user_id, action, entity_type, entity_id, metadata (jsonb), created_at`. RLS: SELECT for the row's clinic OWNER (active membership). Used by the existing OWNER audit-log UI (`getAuditLog(clinicId)` in `data/audit.ts`).

New flow uses `audit_events`. See §2.7 for the 6 new `AuditAction` enum values.

#### Dormant supporting tables (already exist)

- `patient_phone_verification_issues` — captures failed verifications with `issue_type`, `error_code`, `resolved_by`. Future-tense; not wired in Phase A/B. Phase B writes a row when `verifyOTP` returns `valid: false` 3 times in a row, so support can investigate.
- `patient_recovery_codes` — backup codes for patient self-recovery. Not wired in this batch (orthogonal feature).

#### Tables the brief mentioned that DO NOT exist

- `consent_log` — referenced in `ARCHITECTURE.md` §8.5 but not present in live `information_schema.tables`. Out of scope for this plan; flag it under §10 risk.
- `rate_limits` — referenced in ARCHITECTURE.md §8.5 but the live mechanism is the `consume_rate_limit()` RPC function (verified `pg_proc` count = 1). The function presumably maintains its own bucketing inside (likely `pg_advisory_xact_lock` + a counter table not visible at the schema level — out of scope to inspect).

### 3.2 RPC functions in scope

- `consume_rate_limit(p_scope, p_key_hash, p_window_ms, p_max_requests)` — exists. Used by `enforceRateLimit()`. Plan reuses with new scope strings.
- Access-control SECURITY DEFINER functions from D-049 (mig 054): `can_access_patient`, `is_clinic_member`, `get_clinic_role`. Plan uses `is_clinic_member(clinic_id, auth.uid())` in the owner-inbox RLS policy (Migration 070).

### 3.3 Foreign-key cascade summary

The relevant cascades (verified):

| Child table | FK col | Parent | On delete |
|---|---|---|---|
| `users` | id | `auth.users` | CASCADE |
| `patients` | id | `users` | CASCADE |
| `patient_phone_history` | patient_id | `patients` | CASCADE |
| `phone_change_requests` | patient_id | `patients` | CASCADE |
| `phone_corrections` | patient_id | `patients` | CASCADE |
| `account_recovery_requests` | claimed_patient_id | `patients` | (no action — soft FK) |
| `otp_codes` | patient_id | `patients` | (no action — non-cascading; OTPs survive patient delete; safe because `used` flag still applies) |
| `audit_events` | actor_user_id | `users` | (no action — preserves audit trail across user deletion; intentional) |

**Implication for Phase B**: deleting an auth user wipes their patient row and all history. There is no current need for change-phone bookkeeping on user delete, but the audit trail in `audit_events` survives.

### 3.4 Required migrations

#### Migration 069 already exists (idempotency keys — D-008-adjacent, used by offline-write Phase 1)

Confirmed in the migrations directory listing. Phase B's request endpoint accepts an idempotency key. No DDL change needed for that piece.

#### **Migration 070** — `users_phone_verified_and_phone_change_for_staff.sql`

Three changes, batched because they share the same conceptual boundary:

```sql
-- 1) Add phone_verified columns to users (parallels patients.phone_verified)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS phone_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS phone_verified_at timestamptz NULL;

-- Backfill: for users created before today, assume their original registration
-- went through OTP — so phone_verified=true, verified_at=created_at.
-- Reasoning: the registration flow has required OTP since day one (mig 024).
-- Any user that signed up via the app verified at sign-up time. Treating them
-- as verified avoids forcing 288 users through a re-verification dance just to
-- log in. New users created after this migration get the default `false` until
-- they complete OTP (the registration handler will be updated to set it).
UPDATE users SET phone_verified = true, phone_verified_at = created_at
WHERE created_at < now();

-- 2) Add changed_by + reason columns to patient_phone_history
--    Without these, accountability for a phone change is missing from history.
ALTER TABLE patient_phone_history
  ADD COLUMN IF NOT EXISTS changed_by uuid NULL REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS change_reason text NULL CHECK (
    change_reason IS NULL OR change_reason IN (
      'self_service_change',  -- patient or staff member changed own phone via dual-OTP
      'frontdesk_correction', -- frontdesk fixed a typo (Phase C)
      'fallback_approved',    -- owner approved fallback / account_recovery_requests
      'admin_change'          -- support team via DB
    )
  );

-- 3) Extend phone_change_requests to support staff (DOCTOR / FRONT_DESK / OWNER / ASSISTANT)
--    Option chosen: add nullable `user_id` and a CHECK that exactly one of patient_id/user_id is set.
--    Rejected alternative A: separate `staff_phone_change_requests` table — duplicates state machine.
--    Rejected alternative B: drop patient_id NOT NULL and overload it with users.id — patients FK
--    would block doctor/frontdesk users.
ALTER TABLE phone_change_requests
  ALTER COLUMN patient_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS user_id uuid NULL REFERENCES users(id) ON DELETE CASCADE,
  ADD CONSTRAINT phone_change_requests_subject_xor CHECK (
    (patient_id IS NULL) <> (user_id IS NULL)
  );

CREATE INDEX IF NOT EXISTS idx_phone_change_user
  ON phone_change_requests (user_id) WHERE user_id IS NOT NULL;

-- 4) RLS additions:
--    a) User can SELECT their own staff phone change requests
CREATE POLICY "Staff can view own phone change requests"
  ON phone_change_requests FOR SELECT
  USING (user_id = auth.uid());

--    b) User can INSERT their own staff phone change requests
CREATE POLICY "Staff can create own phone change requests"
  ON phone_change_requests FOR INSERT
  WITH CHECK (user_id = auth.uid());

--    c) Clinic OWNER can SELECT phone-change-requests where the staff user is a
--       member of their clinic — for the approval inbox
CREATE POLICY "Owners can view staff phone change requests in their clinic"
  ON phone_change_requests FOR SELECT
  USING (
    user_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM clinic_memberships m1
      JOIN clinic_memberships m2 ON m2.clinic_id = m1.clinic_id
      WHERE m1.user_id = auth.uid()
        AND m1.role = 'OWNER'
        AND m1.status = 'ACTIVE'
        AND m2.user_id = phone_change_requests.user_id
        AND m2.status = 'ACTIVE'
    )
  );
```

Migration is idempotent (`IF NOT EXISTS` everywhere, `IF EXISTS` on policy DROP would also be added in a safety preamble). The `UPDATE users` backfill is one-shot but safe to re-run because it only touches rows with `created_at < now()` and only sets the columns from `false → true` (never the reverse).

The backfill decision (see §9) is documented in the migration comment.

#### **Migration 071** (optional, deferred) — clean up dead RLS duplicates on `patient_phone_history`

The current policies include a literal duplicate (`"Patients can view phone history"` and `"Patients can view own phone history"` have identical predicates). Drop one. Plus the global `users.role='doctor'` SELECT policy leaks history across clinics — replace with a clinic-scoped equivalent using `is_clinic_member`. Both deferred to a separate cleanup PR — not on the critical path.

---

## 4. UX Flows per Role

All flows are **mobile-first** (`max-w-md` container, RTL `dir="rtl"`, Cairo font). Wireframes are in text. Arabic copy below is finalized for direct paste into `ar.ts` — every string is ready to ship. Existing key references where applicable.

### 4.0 Convention — what to add to `ar.ts`

New i18n keys to add (see §5 for endpoint names; this is the user-facing copy bundle):

```ts
// Phone-change flow (Phase B)
changePhone:                'تغيير رقم الهاتف',
changePhoneCta:             'تغيير الرقم',
changePhoneIntroTitle:      'هتغير رقم الهاتف اللي بتدخل بيه',
changePhoneIntroBody:       'هنبعتلك كود على رقمك القديم وكود تاني على الرقم الجديد عشان نتأكد إن الرقمين معاك. الرقم الجديد هيبقى رقم الدخول من بكره.',
changePhoneStartBtn:        'يلا نبدأ',

newPhoneLabel:              'الرقم الجديد',
newPhoneHint:               'لازم رقم مصري شغال على الجوال',

oldPhoneOtpHeading:         'أكد الرقم القديم الأول',
oldPhoneOtpSubheading:      'بعتنالك كود على',
newPhoneOtpHeading:         'دلوقتي أكد الرقم الجديد',
newPhoneOtpSubheading:      'بعتنالك كود على',
codeSentHint:               'الكود وصل في رسالة، صالح ٥ دقايق',

didntGetCode:               'مفيش كود؟',
resendIn:                   'إعادة الإرسال خلال',  // followed by "MM:SS"
resendNow:                  'ابعت تاني',

cantAccessOldPhone:         'مش معاي الرقم القديم',
fallbackTitle:              'هنحول طلبك للمالك يوافق',
fallbackBody:               'لو فقدت الرقم القديم وما تقدرش تستلم الكود عليه، صاحب العيادة لازم يوافق على الطلب يدوياً. هيوصله إشعار وهيراجع طلبك خلال ٢٤–٤٨ ساعة.',
fallbackReasonLabel:        'ليه عايز تغير الرقم؟',
fallbackReasonPlaceholder:  'مثال: الرقم القديم اتسرق / ضاعت الشريحة',
fallbackSubmit:             'ابعت الطلب للمالك',
fallbackSubmittedTitle:     'الطلب وصل للمالك',
fallbackSubmittedBody:      'هتلاقي إشعار لما يوافق أو يرفض. ممكن ترجع تتأكد من الحالة من نفس الصفحة.',

changePhoneSuccessTitle:    'تم تغيير الرقم',
changePhoneSuccessBody:     'الرقم الجديد فعّال دلوقتي. لو هتدخل من جهاز تاني سجل دخول بالرقم الجديد.',
changePhoneCancel:          'إلغاء الطلب',
changePhoneCancelConfirm:   'تأكيد إلغاء طلب تغيير الرقم؟',

// Errors
errCodeWrong:               'الكود غلط، حاول تاني',
errCodeExpired:             'الكود انتهت صلاحيته. اطلب كود جديد',
errCodeAttemptsExceeded:    'حاولت كتير. حاول كمان شوية',
errPhoneTaken:              'الرقم ده مستخدم من حساب تاني',
errPhoneSameAsOld:          'الرقم الجديد لازم يبقى مختلف عن القديم',
errInvalidEgyptianPhone:    'رقم هاتف مصري غير صحيح — يبدأ بـ 010 أو 011 أو 012 أو 015',
errRateLimit:               'محاولات كتيرة. حاول بعد شوية',
errOldPhoneNotMatched:      'الكود ده على الرقم القديم بس',
errNetworkRetry:            'في مشكلة في الاتصال. حاول تاني',

// Patient correction (Phase C — frontdesk side)
correctPhoneCta:            'تصحيح الرقم (خطأ كتابي)',
correctPhoneTitle:          'تصحيح رقم المريض',
correctPhoneSubtitle:       'استخدم ده لو الرقم اتدخل غلط في التسجيل. ده مش تغيير حقيقي للرقم.',
correctPhoneReasonLabel:    'سبب التصحيح',
correctPhoneReasonPlaceholder: 'مثال: غلطة كتابة وقت التسجيل',
correctPhoneNewLabel:       'الرقم الصحيح',
correctPhoneSaveBtn:        'احفظ التصحيح',
correctPhoneSuccess:        'تم تصحيح الرقم',
correctPhoneVsChange:       'لو المريض غير رقمه فعلاً، استخدم زر "تغيير الرقم" لإرسال كود تأكيد.',

// Owner approval inbox
approvalInboxTitle:         'طلبات تغيير الأرقام',
approvalInboxEmpty:         'مفيش طلبات في الوقت الحالي',
approvalInboxReason:        'سبب الطلب',
approvalInboxApprove:       'وافق على التغيير',
approvalInboxReject:        'ارفض الطلب',
approvalInboxRejectReason:  'سبب الرفض (هيظهر للموظف)',
approvalInboxApproved:      'تم الموافقة وتغيير الرقم',
approvalInboxRejected:      'تم رفض الطلب',
approvalInboxNotifyApprove: 'هيتم تغيير رقم {name} لـ {newPhone}',
approvalInboxNotifyReject:  'هيتم إخطار {name} بالرفض. الرقم القديم هيفضل شغال',
```

### 4.1 Flow A — Frontdesk staff changes own login phone (happy path)

**Entry point**: From `/frontdesk/profile`, the existing inline phone field is replaced with a row showing the current phone + a `تغيير الرقم` button (the inline edit affordance is gone for phone — name and email keep their inline edit).

Tap → navigates to `/frontdesk/profile/change-phone`.

**Screen 1 — Intro / current phone**

```
[← back chevron]                                       تغيير رقم الهاتف
                                                       
┌─────────────────────────────────────────────────────┐
│  الرقم الحالي                                         │
│  01012345678                       [✓ موثق]          │
└─────────────────────────────────────────────────────┘

  هتغير رقم الهاتف اللي بتدخل بيه
  
  هنبعتلك كود على رقمك القديم وكود تاني على
  الرقم الجديد عشان نتأكد إن الرقمين معاك.
  الرقم الجديد هيبقى رقم الدخول من بكره.

  ┌───────────────────────────────────────────┐
  │ الرقم الجديد                                │
  │ ┌───────────────────────────────────────┐ │
  │ │ 01_________                            │ │
  │ └───────────────────────────────────────┘ │
  │ لازم رقم مصري شغال على الجوال               │
  └───────────────────────────────────────────┘

  [   يلا نبدأ   ]    ← primary button, disabled until valid

  مش معاي الرقم القديم →   ← link to fallback
```

- Phone input runs `getEgyptianPhoneError()` on blur (D-046). If invalid: red text under the field with the canonical error.
- If user enters their *current* phone in the new field: error inline `errPhoneSameAsOld`.
- Submit calls `POST /api/auth/change-phone/request` (§5.1). Receives `{ requestId, expiresAt }` and the OTP for the OLD phone is sent via SMS.

**Screen 2 — Verify OLD phone**

```
[← back]                                  أكد الرقم القديم الأول

                       🛡️  
                       
                  بعتنالك كود على
                  ‎+20 1012345678   ← LTR
                  
                   [_][_][_][_]      ← 4-digit input, auto-advance
                   
                  الكود وصل في رسالة، صالح ٥ دقايق
                  
                  مفيش كود؟  إعادة الإرسال خلال  00:30
                  
                  [        تأكيد        ]
```

- Same input UX as the existing OTP page (4 boxes, auto-advance, 30s resend countdown).
- Submit calls `POST /api/auth/change-phone/verify` with `{ requestId, side: 'old', code }`. On success the request status moves `pending → old_verified` and the new-phone OTP is sent automatically (server triggers the second SMS without a second client call).
- Loading text: `جاري التحقق…`
- Errors map to `errCodeWrong`, `errCodeExpired`, `errCodeAttemptsExceeded`, `errOldPhoneNotMatched`.

**Screen 3 — Verify NEW phone** (same layout as Screen 2, heading swapped)

```
[← back]                                  دلوقتي أكد الرقم الجديد

                       🛡️ 
                  بعتنالك كود على
                  ‎+20 1099887766
                  
                   [_][_][_][_]
                   
                  الكود وصل في رسالة، صالح ٥ دقايق
                  مفيش كود؟  إعادة الإرسال خلال  00:30
                  
                  [        تأكيد        ]
```

- Submit calls `POST /api/auth/change-phone/verify` with `{ requestId, side: 'new', code }`. On success: status `new_verified → completed`, server commits `users.phone = new_phone`, sets `phone_verified=true`, `phone_verified_at=now()`, writes `audit_events`. Returns `{ success: true, newPhone }`.

**Screen 4 — Success**

```
                       ✅
                  
                  تم تغيير الرقم
                  
                  الرقم الجديد فعّال دلوقتي.
                  لو هتدخل من جهاز تاني سجل دخول
                  بالرقم الجديد.
                  
                  [   ارجع للملف الشخصي   ]
```

- Auto-redirect to `/frontdesk/profile` after 3 seconds OR on tap.
- The user's session continues to work — the `auth.users.email` (which is what Supabase Auth actually uses) is unchanged. Only `users.phone` rotates. Confirmed: nothing in the auth path keys off `users.phone` at runtime, only at login by phone resolution.

**Edge case states**

| State | Render |
|---|---|
| Network failure on Screen 1 → 4 | Toast at top: `errNetworkRetry`. Form preserved. |
| Rate limit (5 sends/min hit) | Inline warning under input: `errRateLimit`. Resend button disabled until window clears. |
| New phone already taken (race during OTP-in-flight) | Screen 3 shows `errPhoneTaken` after submit. Request marked `cancelled`. CTA: "ابدأ من جديد" → returns to Screen 1. |
| OTP expired during resend cooldown | Inline: `errCodeExpired`. Resend countdown reset. |
| User taps `[← back]` after Screen 2 | Confirm modal: `هتلغي طلب تغيير الرقم؟ هيلزمك تبدأ من الأول.` Cancel → stay; Yes → POST `/cancel`, status `cancelled`. |

**Components**: Reuse the OTP page's input row + countdown — extract into `packages/ui-clinic/components/auth/OtpInput.tsx` so the same component renders inside both the auth flow's full page and the in-app modal flow's screens. New component `packages/ui-clinic/components/profile/ChangePhoneFlow.tsx` orchestrates Screens 1–4 as steps in a single client component.

### 4.2 Flow B — Frontdesk staff: old phone unreachable (fallback)

Triggered from Screen 1's `مش معاي الرقم القديم` link, or after 3 failed OTP attempts on Screen 2 with a banner: `مفيش كود واصل؟ ممكن تتحول للموافقة اليدوية`.

**Screen F1 — Fallback intro**

```
[← back]                            هنحول طلبك للمالك يوافق

  لو فقدت الرقم القديم وما تقدرش تستلم
  الكود عليه، صاحب العيادة لازم يوافق على
  الطلب يدوياً.
  
  هيوصله إشعار وهيراجع طلبك خلال
  ٢٤–٤٨ ساعة.

  ┌───────────────────────────────────────────┐
  │ الرقم الجديد                                │
  │ 01099887766                                │   ← carried from Screen 1
  └───────────────────────────────────────────┘

  ┌───────────────────────────────────────────┐
  │ ليه عايز تغير الرقم؟                        │
  │ ┌───────────────────────────────────────┐ │
  │ │ مثال: الرقم القديم اتسرق / ضاعت الشريحة  │ │
  │ │                                          │ │
  │ │                                          │ │
  │ └───────────────────────────────────────────┘ │
  │ ٢٠–٥٠٠ حرف                                  │
  └───────────────────────────────────────────┘

  [   ابعت الطلب للمالك   ]
```

- Reason field: required, 20–500 chars.
- Submit calls `POST /api/auth/change-phone/fallback` with `{ requestId, reason }`. Server still sends an OTP to the new phone (proves user controls it) — that OTP is verified in the next screen and recorded as part of the fallback row.

**Screen F2 — Verify NEW phone** (same as Screen 3 above; the new phone OTP must still be verified to prove the requester controls the destination)

**Screen F3 — Submitted**

```
                       📤
                  
                  الطلب وصل للمالك
                  
                  هتلاقي إشعار لما يوافق أو يرفض.
                  ممكن ترجع تتأكد من الحالة من
                  نفس الصفحة.
                  
                  حالة الطلب:  قيد المراجعة
                  
                  [   ارجع للملف الشخصي   ]
```

- The request stays in `phone_change_requests.status = 'old_verified'` (only NEW side verified) with `verification_method = 'sms_new_only'` and a row in `audit_events` action `CHANGE_PHONE_FALLBACK_OPENED`.
- Owner sees it in the approval inbox (Flow E).
- On approval: server sets status `completed`, writes `users.phone`, writes `phone_verified=true`, writes `patient_phone_history` entry if user is also a patient (rare for frontdesk staff), writes `audit_events` action `CHANGE_PHONE_FALLBACK_APPROVED`. Pushes a notification to the requester via `notifications` table.

### 4.3 Flow C — Doctor changes own login phone (happy path only — no v1 fallback per scope decision)

Identical to Flow A in shape, mounted at `/doctor/profile/change-phone` from a new "تغيير رقم الهاتف" button in the doctor profile page (currently no phone display; the new button lives in the new "Contact" accordion section).

Differences from Flow A:

- The "مش معاي الرقم القديم" link is replaced with a help row: `لو فقدت الرقم القديم، تواصل مع الدعم: support@medassist.app`. No fallback endpoint call from the doctor flow in v1.
- Same `ChangePhoneFlow` component, with prop `fallbackEnabled={false}`.
- After commit, the doctor's clinic-context cookie is unaffected. No further redirects.

**Why no doctor fallback in v1**: doctor accounts are higher-value targets (clinical liability, prescription signing). Manual support handling adds an extra human in the loop and is acceptable while we have ~tens of doctors in production.

### 4.4 Flow D — Frontdesk corrects a patient's record phone (Phase C, typo fix)

**Entry point**: Patient detail/edit page (frontdesk-side patient list → tap patient). Today the phone field is editable inline. Replace with the same pattern as own-profile: read-only row + two CTAs side-by-side:

```
رقم المريض
01098712345                 [تصحيح الرقم]   [تغيير الرقم]
                            ← Phase C       ← Phase B (real change with OTP)
```

The two are visually distinct: `تصحيح الرقم` opens a typo-fix modal (no OTP); `تغيير الرقم` opens the dual-OTP flow with the patient present (Flow E below).

**Modal — Tap `تصحيح الرقم`**

```
                  تصحيح رقم المريض

  استخدم ده لو الرقم اتدخل غلط في التسجيل.
  ده مش تغيير حقيقي للرقم.

  لو المريض غير رقمه فعلاً، استخدم زر
  "تغيير الرقم" لإرسال كود تأكيد.

  ┌─────────────────────────────────────────┐
  │ الرقم الحالي                              │
  │ 01098712345                              │
  └─────────────────────────────────────────┘

  ┌─────────────────────────────────────────┐
  │ الرقم الصحيح                              │
  │ ┌─────────────────────────────────────┐ │
  │ │ 01_________                          │ │
  │ └─────────────────────────────────────┘ │
  └─────────────────────────────────────────┘

  ┌─────────────────────────────────────────┐
  │ سبب التصحيح                               │
  │ ┌─────────────────────────────────────┐ │
  │ │ مثال: غلطة كتابة وقت التسجيل           │ │
  │ │                                        │ │
  │ └─────────────────────────────────────┘ │
  │ ١٠–٢٠٠ حرف                                │
  └─────────────────────────────────────────┘

  [إلغاء]                       [احفظ التصحيح]
```

- Submit calls `PATCH /api/frontdesk/patients/:id/phone-correction` (§5.7).
- No OTP — frontdesk has the patient on phone or in person. Hard-coded scope assumption documented in handler.
- Required: new phone valid (Egyptian regex), reason 10–200 chars.
- Server writes: `patients.phone` updated, `phone_corrections` row inserted with status `completed`, `patient_phone_history` row inserted with `removed_reason='entry_error'` for the old phone (`is_current=false`) and `is_current=true` for the new, `change_reason='frontdesk_correction'` (Migration 070), `changed_by=auth.uid()`. `audit_events` action `CORRECT_PATIENT_PHONE` with `metadata = { old_phone, new_phone, reason, patient_id }`.
- Toast on success: `correctPhoneSuccess`.
- Disambiguation: button is **disabled** for patients whose `phone_verified=true` AND have any associated `auth.users` (registered for the patient app). Tooltip: `لازم المريض يغير الرقم بنفسه عشان موثق`. Forces them through Flow E instead.

### 4.5 Flow E — Frontdesk changes a patient's identity phone with patient present (Phase B real change)

Triggered from the patient detail page's `تغيير الرقم` button.

This is **the patient app flow temporarily proxied through frontdesk** while the patient app is unbuilt. The frontdesk staffer enters the new phone, hands the phone to the patient who reads aloud the OTP from the old phone, then again from the new phone. This mirrors how clinics do this for password resets in WhatsApp Business today.

**Screen P1 — Intro (with patient present banner)**

```
[← back]                                  تغيير رقم المريض

  ╔═══════════════════════════════════════╗
  ║  ⚠️  المريض لازم يكون موجود              ║
  ║  هيستلم كود على الرقم القديم +           ║
  ║  كود على الرقم الجديد                    ║
  ╚═══════════════════════════════════════╝

  المريض:  أحمد علي
  الرقم القديم:  01098712345

  ┌─────────────────────────────────────────┐
  │ الرقم الجديد                              │
  │ 01_________                              │
  └─────────────────────────────────────────┘

  [   ابعت الكود   ]
```

**Screens P2, P3** — same dual-OTP pattern as Flow A.

- Submit on each calls `POST /api/auth/change-phone/verify` with `actorRole='frontdesk_proxy'` and `targetPatientId=:id` body fields. Server permits this only when `actorRole === 'frontdesk_proxy'` AND `getFrontdeskClinicId(actor) === patient.clinic_id` — a frontdesk worker cannot proxy a patient outside their clinic.

**Screen P4 — Success**

```
                       ✅
                  
                  تم تغيير رقم المريض
                  
                  الرقم الجديد:  01099887766
                  هيستخدمه المريض لو فعّل
                  حسابه على التطبيق لاحقاً.
```

- Server updates `patients.phone` (and `users.phone` if the patient already has an auth account). Writes `patient_phone_history` with `change_reason='self_service_change'`, `changed_by=actor.id`. Audit `CHANGE_PHONE_COMMITTED` with `metadata = { actor_role: 'frontdesk_proxy', patient_id, old_phone, new_phone }`.

### 4.6 Flow F — Owner approval inbox

**Entry point**: New section in `/doctor/clinic-settings` (existing route; doctor with OWNER role). Add a card "طلبات تغيير الأرقام" with badge count.

Tap → `/doctor/clinic-settings/phone-change-requests` (new sub-route).

**Inbox list**

```
[← back]                              طلبات تغيير الأرقام

  ┌─────────────────────────────────────────┐
  │ نور إبراهيم  ·  موظفة استقبال              │
  │ 01098712345  →  01099887766               │
  │ سبب الطلب                                  │
  │ "ضاعت الشريحة وما عندي وصول للرقم القديم"  │
  │ من ٣ ساعات                                 │
  │                                            │
  │ [وافق على التغيير]   [ارفض الطلب]           │
  └─────────────────────────────────────────┘

  ┌─────────────────────────────────────────┐
  │ خالد محمود  ·  مريض                       │
  │ 01087600099  →  01100123456               │
  │ سبب الطلب                                  │
  │ "اتسرق الموبايل"                          │
  │ من يوم                                    │
  │                                          │
  │ [وافق على التغيير]   [ارفض الطلب]         │
  └─────────────────────────────────────────┘
```

- List: only requests where `verification_method='sms_new_only'` (i.e. fallback-opened) AND `status='old_verified'` (NEW phone confirmed; waiting for human gate on the OLD phone bypass).
- Sorted oldest-first to surface stale requests.
- Badge count comes from a separate endpoint `GET /api/clinic/phone-change-requests?count=true` for the nav indicator.

**Approve confirm modal**

```
                وافق على تغيير الرقم؟

  هيتم تغيير رقم نور إبراهيم لـ 01099887766.
  ده هيعمل تسجيل دخول جديد فقط بالرقم الجديد
  ولن يقبل الدخول بالرقم القديم.

  [إلغاء]                           [وافق]
```

**Reject modal**

```
                ارفض الطلب؟

  ┌───────────────────────────────────────┐
  │ سبب الرفض (هيظهر للموظف)                │
  │ ┌─────────────────────────────────────┐│
  │ │                                       ││
  │ │                                       ││
  │ └─────────────────────────────────────┘│
  └───────────────────────────────────────┘

  [إلغاء]                          [ارفض]
```

- Reject reason required, 5–500 chars.
- On approve: `POST /api/clinic/phone-change-requests/:id/approve`. Server commits the change (same path as the verify step's commit) and writes `audit_events` action `CHANGE_PHONE_FALLBACK_APPROVED`. Push notification to requester: `تم الموافقة على طلب تغيير الرقم. الرقم الجديد فعّال دلوقتي.`
- On reject: `POST /api/clinic/phone-change-requests/:id/reject`. Status `rejected` (we'll add this status — note: the existing CHECK constraint allows `cancelled` but not `rejected`. Migration 070 adds `'rejected'` to the CHECK list — minor amend, included).

**Wait — schema correction.** The existing CHECK on `phone_change_requests.status` is `'pending','old_verified','new_verified','completed','expired','cancelled'`. There is no `rejected`. Two options:
- (a) Reuse `cancelled` for both user-cancelled and owner-rejected, distinguished by `audit_events` action.
- (b) Add `rejected` to the CHECK constraint in Migration 070.

**Recommend (b)** — distinguishing in audit only is fragile when the inbox UI needs to render historical rejects with a different label. Migration 070 amended below:

```sql
ALTER TABLE phone_change_requests
  DROP CONSTRAINT phone_change_requests_status_check,
  ADD CONSTRAINT phone_change_requests_status_check CHECK (
    status IN ('pending','old_verified','new_verified','completed',
               'expired','cancelled','rejected')
  );
```

---

## 5. API Contract Design

### 5.0 Conventions

- All endpoints accept/return JSON (`Content-Type: application/json`).
- Error envelope: `{ error: string, details?: object | string, code?: string }` (existing convention from D-027).
- Success envelope: `{ success: true, ...data }` per endpoint.
- All write handlers resolve tenant from session via `getClinicContext()` / `getFrontdeskClinicId()` (D-041). Phone-change endpoints additionally validate that the actor's session is fresh enough — see §5.1 for the freshness check.
- Validators below are written in Zod. Today the codebase uses hand-rolled `validate.ts`; for the new module we **introduce Zod** (already a transitive dep via `@supabase/...`? need to confirm — if not, add `zod` to `packages/shared`).
- All audit writes via `logAuditEvent({ clinicId, actorUserId, action, entityType, entityId, metadata })`.

### 5.1 `POST /api/auth/change-phone/request` (Phase B)

**Auth**: `requireApiAuth()` — any authenticated user (doctor, frontdesk, patient role).
**Rate limit**: `enforceRateLimit(req, 'change-phone-request', 3, 60_000)` — 3 starts per IP per minute. Plus a per-user-per-day cap of 5 enforced via `audit_events` count over last 24h (handler-side check after rate limiter).
**Idempotency**: Body accepts `idempotencyKey` (uuid). If a `phone_change_requests` row exists for the same `(actor_user_id_or_patient_id, idempotency_key)` and is not yet `completed/expired/rejected/cancelled`, return its current state instead of creating a new row.

```ts
const RequestBody = z.object({
  newPhone: z.string().min(11).max(14),                  // local 01… or +201…; normalized server-side
  forPatientId: z.string().uuid().optional(),            // omit unless actor is FRONTDESK proxying for a patient
  idempotencyKey: z.string().uuid()
})
```

**Resolution rules**:
- If `forPatientId` is omitted → subject is the actor (`user_id = auth.uid()`). The new request row uses the new `user_id` column (Migration 070).
- If `forPatientId` is provided → actor MUST have role `frontdesk` AND `getFrontdeskClinicId(actor.id) === patient.clinic_id` AND patient must exist. Subject is the patient (`patient_id = forPatientId`).
- A patient subject's request goes against `phone_change_requests.patient_id`. A staff subject's request uses `user_id`. Migration 070's XOR check enforces exactly one is set.

**Behavior**:

```
1. validateEgyptianPhone(newPhone) → normalize to E.164 form (canonical).
2. Reject if newPhone === currentPhone (errPhoneSameAsOld).
3. Reject if a non-terminal request already exists for this subject:
     SELECT FROM phone_change_requests
       WHERE (patient_id = subject OR user_id = subject)
         AND status IN ('pending','old_verified')
   → 409 { error: 'request_in_flight', existingRequestId }
4. Insert phone_change_requests row:
     status = 'pending',
     verification_method = 'sms_both',  (changed to 'sms_new_only' on fallback path)
     old_phone = subject's current users.phone (or patients.phone),
     new_phone = normalized new phone,
     expires_at = now() + 24h
5. Generate OTP for OLD phone via createOTP(oldPhone, 'phone_change_old'),
   store hash in phone_change_requests.old_phone_otp_hash too (defensive 2nd copy).
6. sendSMS(oldPhone, "كود تأكيد تغيير رقم الهاتف على MedAssist: {code}\nصالح ٥ دقايق.")
7. logAuditEvent({
     clinicId: subject's clinic (or null if patient with no current visit clinic),
     actorUserId: actor.id,
     action: 'CHANGE_PHONE_REQUESTED',
     entityType: 'phone_change_request',
     entityId: requestId,
     metadata: { subject_kind, subject_id, masked_old_phone, masked_new_phone }
   })
8. Return: { success: true, requestId, expiresAt, nextStep: 'verify_old', oldPhoneMasked: '0109***5678' }
```

**Errors**:

| HTTP | code | Arabic message |
|---|---|---|
| 400 | `invalid_phone` | `errInvalidEgyptianPhone` |
| 400 | `same_as_current` | `errPhoneSameAsOld` |
| 401 | `unauthorized` | `Unauthorized` |
| 403 | `forbidden_proxy` | `مش مسموح تغير رقم مريض من عيادة تانية` |
| 404 | `patient_not_found` | `المريض غير موجود` |
| 409 | `request_in_flight` | `في طلب شغال خلاص. أكمل الموجود أو ألغيه قبل ما تبدأ تاني` |
| 409 | `phone_taken` | `errPhoneTaken` (proactive — pre-checked via `users.phone` lookup) |
| 429 | `rate_limit_request` | `errRateLimit` |
| 500 | `sms_failed` | `مفيش كود لسه؟ حاول كمان شوية` (generic — don't leak Twilio failure) |

**Side effects (in order)**: (1) INSERT `phone_change_requests`; (2) INSERT `otp_codes`; (3) Twilio SMS; (4) INSERT `audit_events`. Steps 1+2 in a single transaction; step 3 happens after commit; step 4 fire-and-forget.

### 5.2 `POST /api/auth/change-phone/verify` (Phase B)

**Auth**: `requireApiAuth()`. Same role rules as 5.1.
**Rate limit**: `enforceRateLimit(req, 'change-phone-verify', 10, 60_000)`.

```ts
const VerifyBody = z.object({
  requestId: z.string().uuid(),
  side:      z.enum(['old', 'new']),
  code:      z.string().regex(/^\d{4}$/)
})
```

**Behavior**:

```
1. Load request by id; assert request.subject_id matches actor (or actor proxies allowed
   subject). Assert status is in valid state for the side:
     side='old' → status must be 'pending'
     side='new' → status must be 'old_verified'  (or 'pending' if verification_method='sms_new_only' for fallback)
2. Resolve which phone to verify:
     side='old' → request.old_phone
     side='new' → request.new_phone
3. verifyOTP(phoneToVerify, code, side === 'old' ? 'phone_change_old' : 'phone_change_new')
4. If valid:
     UPDATE phone_change_requests
       SET old_phone_verified_at = now() (if side='old'),
           new_phone_verified_at = now() (if side='new'),
           status = CASE
             WHEN side='old' THEN 'old_verified'
             WHEN side='new' AND verification_method='sms_new_only' THEN 'old_verified'   ← fallback path holds at old_verified pending owner approval
             WHEN side='new' AND verification_method='sms_both'    THEN 'new_verified'
           END
       WHERE id = requestId
5. If side='old' AND verification_method='sms_both':
     trigger send-OTP for new phone (createOTP + sendSMS), inline.
6. If side='new' AND status now 'new_verified':
     COMMIT (see 5.2.1 below)
7. If side='new' AND verification_method='sms_new_only':
     leave status at 'old_verified', return { success: true, requiresOwnerApproval: true }
8. logAuditEvent: action = 'CHANGE_PHONE_REQUESTED' supplemented;
   on commit, action = 'CHANGE_PHONE_COMMITTED'.
```

#### 5.2.1 Commit transaction (the atomic write)

Per resolved Q1 (§10.2): the auth-side phone in `auth.users` MUST be updated alongside `public.users.phone` because 53 production accounts authenticate via `auth.users.phone` directly. The auth admin call sits outside the SQL transaction (Supabase's auth admin API is a separate REST call) but inside the same try/catch with a compensating rollback.

```ts
async function commitPhoneChange(req, actor) {
  const admin = createAdminClient('phone-change-commit')
  const newE164  = req.new_phone        // already E.164 normalized at request time
  const oldPhone = req.old_phone

  // ── PHASE 1: SQL transaction ──────────────────────────────────────────────
  const { data: txResult, error: txErr } = await admin.rpc('change_phone_commit', {
    p_request_id:    req.id,
    p_subject_id:    req.subject_user_id_or_patient_id,
    p_subject_kind:  req.subject_kind,        // 'staff_user' | 'patient'
    p_old_phone:     oldPhone,
    p_new_phone:     newE164,
    p_actor_id:      actor.id,
    p_change_reason: 'self_service_change',   // or 'fallback_approved' for owner-approve path
  })
  // The RPC executes the SQL below in a single transaction and returns the list of
  // touched (patient_id, clinic_id) pairs for §7 audit fan-out.

  if (txErr) {
    if (txErr.code === '23505') {
      // users.phone unique violation — newPhone got registered by someone else mid-flight
      await admin.from('phone_change_requests')
        .update({ status: 'cancelled', completed_at: new Date().toISOString() })
        .eq('id', req.id)
      throw new PhoneChangeError('phone_taken', 409, 'errPhoneTaken')
    }
    throw txErr
  }

  // ── PHASE 2: Auth admin sync ──────────────────────────────────────────────
  // Critical for the 53 phone-only accounts (auth.users.phone is their login key).
  // No-op-equivalent for the 235 email-or-synthesized-email accounts but we still call
  // it to keep auth.users.phone in sync (avoids future drift; fixes 1 already-divergent row).
  const { error: authErr } = await admin.auth.admin.updateUserById(
    req.subject_user_id_or_patient_id,
    { phone: newE164 }
  )

  if (authErr) {
    // Compensating rollback: revert public.users.phone and patients.phone, mark cancelled.
    // We do NOT revert patient_phone_history rows — the audit trail of the attempt is intentional;
    // the rollback writes a separate "rolled back" history pair.
    await admin.rpc('change_phone_rollback', {
      p_request_id: req.id,
      p_old_phone:  oldPhone,
      p_new_phone:  newE164,
      p_actor_id:   actor.id,
    })
    throw new PhoneChangeError('auth_sync_failed', 500,
      'مشكلة في تحديث الرقم. حاول تاني أو تواصل مع الدعم.')
  }

  // ── PHASE 3: Fire-and-forget post-commit side effects ────────────────────
  // Per Q3 (resolved): security-signal SMS to OLD phone
  void sendSMS(oldPhone,
    'تم تغيير رقم الدخول لحساب MedAssist بتاعك. ' +
    'لو مش انت اللي عملت ده، تواصل مع الدعم على support@medassist.app فوراً.'
  )

  // Confirmation SMS to NEW phone
  void sendSMS(newE164,
    'تم تأكيد رقمك الجديد على MedAssist. مرحباً بك ✓'
  )

  // Audit fan-out: 1 audit_events row per touched clinic (per §7)
  for (const { clinicId } of txResult.touchedClinics) {
    void logAuditEvent({
      clinicId,
      actorUserId: actor.id,
      action: 'CHANGE_PHONE_COMMITTED',
      entityType: req.subject_kind === 'patient' ? 'patient' : 'user',
      entityId: req.subject_user_id_or_patient_id,
      metadata: {
        request_id: req.id,
        old_phone: maskPhone(oldPhone),
        new_phone: maskPhone(newE164),
        actor_role: actor.role,
        verification_method: req.verification_method,
        change_reason: 'self_service_change',
      },
    })
  }

  // In-app notification to subject
  if (req.subject_kind === 'staff_user') {
    void admin.from('notifications').insert({
      recipient_id: req.subject_user_id_or_patient_id,
      type: 'phone_change_completed',
      title: 'تم تغيير رقم الهاتف',
      body: `الرقم الجديد فعّال: ${maskPhone(newE164)}`,
    })
  }
}
```

The SQL inside `change_phone_commit` (Postgres function added in Migration 070, idempotent):

```sql
CREATE OR REPLACE FUNCTION change_phone_commit(
  p_request_id    uuid,
  p_subject_id    uuid,
  p_subject_kind  text,
  p_old_phone     text,
  p_new_phone     text,
  p_actor_id      uuid,
  p_change_reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  touched_clinics jsonb := '[]'::jsonb;
  rec record;
BEGIN
  -- Lock the request row to serialize concurrent verify calls
  PERFORM 1 FROM phone_change_requests WHERE id = p_request_id FOR UPDATE;

  -- 1) Update users.phone for staff subject (raises 23505 on collision)
  IF p_subject_kind = 'staff_user' THEN
    UPDATE users
       SET phone = p_new_phone, phone_verified = true, phone_verified_at = now()
     WHERE id = p_subject_id;
  ELSE
    -- Patient subject: update users row IF it exists (defensive)
    UPDATE users
       SET phone = p_new_phone, phone_verified = true, phone_verified_at = now()
     WHERE id = p_subject_id;
  END IF;

  -- 2) Patient-side propagation per §7 (strict policy from Q4)
  --    Touch every patients row where phone = old_phone (cross-clinic propagation
  --    only when phones already match).
  FOR rec IN
    UPDATE patients
       SET phone = p_new_phone, phone_verified = true, phone_verified_at = now()
     WHERE phone = p_old_phone
     RETURNING id, clinic_id
  LOOP
    -- 3) History pair per touched patient
    INSERT INTO patient_phone_history
      (patient_id, phone, is_current, removed_at, removed_reason, change_reason, changed_by)
    VALUES
      (rec.id, p_old_phone, false, now(), 'user_changed', p_change_reason, p_actor_id);

    INSERT INTO patient_phone_history
      (patient_id, phone, is_current, verified, verified_at, change_reason, changed_by)
    VALUES
      (rec.id, p_new_phone, true, true, now(), p_change_reason, p_actor_id);

    touched_clinics := touched_clinics || jsonb_build_object('clinicId', rec.clinic_id, 'patientId', rec.id);
  END LOOP;

  -- 4) Mark request completed
  UPDATE phone_change_requests
     SET status = 'completed', completed_at = now()
   WHERE id = p_request_id;

  RETURN jsonb_build_object('touchedClinics', touched_clinics);
END $$;
```

The commit function is idempotent only at the SQL level (the request status check at the top of the verify handler ensures it's not called twice for the same request). The auth admin call is also idempotent (setting `auth.users.phone` to the same value is a no-op).

If the auth admin call fails AFTER the SQL transaction succeeded, the compensating `change_phone_rollback` RPC reverses public.users + patients writes and adds a "rolled back" history pair. This rollback path is a known-rare error case (we believe Supabase Auth admin to be stable). Track its frequency via the `auth_sync_failed` error code.

### 5.3 `POST /api/auth/change-phone/cancel` (Phase B)

**Auth**: `requireApiAuth()`.
**Rate limit**: low — `'change-phone-cancel', 5, 60_000`.

```ts
const CancelBody = z.object({ requestId: z.string().uuid() })
```

Loads request, asserts subject==actor or proxy authorization. Sets status `cancelled` if currently in `pending` or `old_verified`. Idempotent: returns 200 even if already cancelled. Audit: `CHANGE_PHONE_REQUESTED` follow-up note in metadata `{ outcome: 'cancelled' }` (or new action `CHANGE_PHONE_CANCELLED` — let's add it; Phase B `AuditAction` extension list grows from 6 to 7).

### 5.4 `POST /api/auth/change-phone/fallback` (Phase B)

**Auth**: `requireApiAuth()`.
**Rate limit**: very low — `'change-phone-fallback', 2, 86_400_000` (2 per 24h per user).

```ts
const FallbackBody = z.object({
  requestId: z.string().uuid(),
  reason:    z.string().min(20).max(500)
})
```

**Behavior**:

```
1. Load request; assert subject==actor; assert status ∈ {'pending'}.
2. UPDATE phone_change_requests
     SET verification_method = 'sms_new_only',
         status = 'pending'                   -- still pending until new-OTP verified
   WHERE id = :requestId
3. Generate + send OTP to NEW phone (we still verify the user controls the destination).
4. The next verify call (side='new') leaves status at 'old_verified' (instead of completing).
5. INSERT a row referencing this request into account_recovery_requests
   (patient case) OR write a richer audit_events row (staff case),
   storing the user-supplied reason.
6. logAuditEvent action 'CHANGE_PHONE_FALLBACK_OPENED', metadata = { reason, requestId }
7. (Per Q5 resolved): fire-and-forget INSERT into `notifications` for every
   ACTIVE OWNER of every clinic touching this subject:
     - staff subject → all clinics where the staff has ACTIVE membership
     - patient subject → the patient's clinic_id
   Notification shape:
     { recipient_id: ownerUserId,
       type: 'phone_change_pending_approval',
       title: 'طلب تغيير رقم جديد محتاج موافقتك',
       body:  '{subjectName} طالب تغيير رقم. اضغط لمراجعة الطلب.',
       action_url: '/doctor/clinic-settings/phone-change-requests' }
8. Return: { success: true, requiresOwnerApproval: true, expectedReviewWindow: '24-48h' }
```

For staff fallback (no `account_recovery_requests` row, since that table is patient-only): the request stays in `phone_change_requests` with `verification_method='sms_new_only'`. The owner inbox query union-selects from both shapes.

### 5.5 `GET /api/clinic/phone-change-requests` (Phase B — owner inbox list)

**Auth**: `requireApiRole('doctor')` + handler-side check `getClinicRole(actor.id, clinicId) === 'OWNER'`.
**Query params**: `count=true|false` (default false).

**Behavior**:

```
1. Resolve activeClinicId via getClinicContext(actor.id, 'doctor').
2. Authorize OWNER role in that clinic; 403 otherwise.
3. SELECT FROM phone_change_requests
     LEFT JOIN users    ON users.id = phone_change_requests.user_id
     LEFT JOIN patients ON patients.id = phone_change_requests.patient_id
   WHERE verification_method = 'sms_new_only'
     AND status = 'old_verified'
     AND (
       -- staff case: subject's user is a member of this clinic
       (user_id IS NOT NULL AND EXISTS (SELECT 1 FROM clinic_memberships
         WHERE user_id = phone_change_requests.user_id
           AND clinic_id = :activeClinicId
           AND status = 'ACTIVE'))
       OR
       -- patient case: patient's clinic_id matches
       (patient_id IS NOT NULL AND EXISTS (SELECT 1 FROM patients
         WHERE id = phone_change_requests.patient_id
           AND clinic_id = :activeClinicId))
     )
   ORDER BY created_at ASC
4. For each, JOIN account_recovery_requests (patient) for the reason text,
   OR pull reason from audit_events.metadata->>'reason' for staff.
5. Return: { requests: [{ id, subjectKind, subjectName, oldPhoneMasked, newPhoneMasked, reason, createdAt }] }
```

### 5.6 `POST /api/clinic/phone-change-requests/:id/approve` and `…/reject`

**Auth**: same as 5.5. Plus an extra check that the request's subject is in the OWNER's clinic.

**Approve body**: `{}` (empty). **Behavior**: runs the same commit transaction as §5.2.1. Audit `CHANGE_PHONE_FALLBACK_APPROVED` with metadata `{ approvedBy, requestId, oldPhone, newPhone }`. Notification to subject.

**Reject body**: `{ reason: z.string().min(5).max(500) }`. **Behavior**: status `rejected`, completed_at set, write audit `CHANGE_PHONE_FALLBACK_REJECTED` with `{ rejectedBy, reason }`. Notification to subject including the reason.

### 5.7 `PATCH /api/frontdesk/patients/:id/phone-correction` (Phase C)

**Auth**: `requireApiRole('frontdesk')`. Plus `getFrontdeskClinicId(actor.id) === patient.clinic_id` (D-041 server-resolved tenant).
**Rate limit**: `'phone-correction', 10, 60_000` (10 corrections per IP per minute — generous because legitimate batch fixes happen).

```ts
const CorrectionBody = z.object({
  newPhone: z.string().min(11).max(14),
  reason:   z.string().min(10).max(200)
})
```

**Behavior**:

```
1. Validate newPhone via validateEgyptianPhone.
2. Load patient, assert patient.clinic_id === actor's frontdesk clinic.
3. Reject if patient.phone_verified === true AND a corresponding auth.users row exists
   for the patient — they need to use the real change flow, not correction.
   Return 409 { code: 'verified_patient_must_change' }
4. BEGIN;
     UPDATE patients SET phone = :newPhone WHERE id = :patientId;
     INSERT INTO phone_corrections (patient_id, old_phone, new_phone, reason,
                                     verification_method, initiated_by, initiated_by_user_id,
                                     status, completed_at)
       VALUES (:patientId, :oldPhone, :newPhone, :reason,
               'frontdesk_no_otp', 'frontdesk', :actor.id,
               'completed', now());
     INSERT INTO patient_phone_history (patient_id, phone, is_current, removed_at,
                                         removed_reason, change_reason, changed_by)
       VALUES (:patientId, :oldPhone, false, now(), 'entry_error',
               'frontdesk_correction', :actor.id);
     INSERT INTO patient_phone_history (patient_id, phone, is_current, verified, verified_at,
                                         change_reason, changed_by)
       VALUES (:patientId, :newPhone, true, false, NULL,  -- correction does NOT verify
               'frontdesk_correction', :actor.id);
   COMMIT;
5. logAuditEvent action='CORRECT_PATIENT_PHONE',
   entityType='patient', entityId=patientId,
   metadata={ old_phone, new_phone, reason, frontdesk_user_id }.
6. Return: { success: true, patient: { id, phone: newPhone } }
```

**Cross-clinic note**: if the patient's phone matches OTHER patient rows in OTHER clinics, the correction is **scoped to this clinic only** — see §7. Other clinics retain the typo-version of the phone. Justification: a correction is a clinic-local data-quality fix, not an identity event.

### 5.8 Modified `PATCH /api/frontdesk/profile` (Phase A — minimal patch)

**Goal**: Close the validation gap and add audit log without breaking existing UI.

**Diff** (apply to existing route):

```ts
// Before (lines 102-109):
if (phone !== undefined) {
  const normalized = phone.replace(/[\s\-\(\)]/g, '')
  if (!normalized || normalized.length < 10) {
    errors.push('رقم الهاتف غير صحيح')
  } else {
    userUpdates.phone = normalized
  }
}

// After:
import { validateEgyptianPhone } from '@shared/lib/utils/phone-validation'
import { logAuditEvent } from '@shared/lib/data/audit'
import { getFrontdeskClinicId } from '@shared/lib/data/frontdesk-scope'

// ...

let oldPhone: string | undefined
if (phone !== undefined) {
  const v = validateEgyptianPhone(phone)
  if (!v.isValid) {
    errors.push(v.errorAr || 'رقم هاتف مصري غير صحيح')
  } else {
    oldPhone = userResult?.data?.phone   // capture for audit (re-fetch if not loaded)
    userUpdates.phone = v.normalized      // E.164 form
  }
}

// after the UPDATE succeeds:
if (userUpdates.phone && oldPhone !== userUpdates.phone) {
  const clinicId = await getFrontdeskClinicId(supabase, user.id).catch(() => null)
  await logAuditEvent({
    clinicId,
    actorUserId: user.id,
    action: 'CHANGE_PHONE_COMMITTED',  // Phase A reuses the Phase B action — semantically the same
    entityType: 'user',
    entityId: user.id,
    metadata: {
      old_phone: oldPhone,
      new_phone: userUpdates.phone,
      pathway: 'phase_a_legacy_no_otp',  // ← marker so we can find these later
    },
  })
}
```

Phase A also adds a top-of-file comment:

```ts
/**
 * SECURITY NOTE (TD-011, Phase A patch 2026-04-25):
 * This handler currently writes users.phone WITHOUT OTP verification.
 * Phase B (FEATURE_PHONE_CHANGE_V2) replaces this path with /api/auth/change-phone/*.
 * Until then, server-side validation + audit logging are the only guards.
 */
```

**No migration needed for Phase A.**

### 5.9 State machine diagram (dual-OTP flow)

```
                             ┌────────────┐
                             │   none     │   (no row in phone_change_requests)
                             └─────┬──────┘
                                   │ POST /change-phone/request
                                   ▼
                             ┌────────────┐
            ┌─ POST cancel ──│  pending   │ ◄── time → expires_at? → 'expired'
            │                └─────┬──────┘
            │                      │ POST /verify side='old' (sms_both path)
            │                      ▼
            │                ┌──────────────┐
            ├─ POST cancel ──│ old_verified │ ◄── time?      → 'expired'
            │                │              │ ◄── owner reject (sms_new_only) → 'rejected'
            │                └─────┬────────┘
            │                      │ POST /verify side='new' (sms_both path)
            │                      ▼
            │                ┌──────────────┐
            │                │ new_verified │   (transient — server immediately commits)
            │                └─────┬────────┘
            │                      │ commit (5.2.1)
            ▼                      ▼
       ┌──────────┐           ┌────────────┐
       │cancelled │           │ completed  │
       └──────────┘           └────────────┘

Fallback path (sms_new_only):
  pending --POST /fallback--> pending (verification_method flipped)
  pending --POST /verify side='new'--> old_verified (held; new phone proven)
  old_verified --POST /clinic/phone-change-requests/:id/approve--> completed
  old_verified --POST /clinic/phone-change-requests/:id/reject --> rejected
```

Terminal states: `completed`, `expired`, `cancelled`, `rejected`. Non-terminal: `pending`, `old_verified`. The partial index `idx_phone_change_pending` is exactly the inbox-finder for active in-flight requests.

---

## 6. Data Layer Design

Per D-024 (centralized access control), all phone-change logic lives in `packages/shared/lib/data/phone-changes.ts`. API handlers in `packages/shared/lib/api/handlers/auth/change-phone/*` and `…/clinic/phone-change-requests/*` are thin — they validate input, resolve auth/clinic, then call into the data module.

### 6.1 Module file: `packages/shared/lib/data/phone-changes.ts`

```ts
import { createAdminClient } from '@shared/lib/supabase/admin'
import { createOTP, verifyOTP } from '@shared/lib/auth/otp'
import { sendSMS } from '@shared/lib/sms/twilio-client'
import { logAuditEvent } from '@shared/lib/data/audit'
import { validateEgyptianPhone, maskPhone } from '@shared/lib/utils/phone-validation'

// ────────────────────────────────────────────────────────────────────────────
// Subject — the entity whose phone is being changed
// ────────────────────────────────────────────────────────────────────────────
export type Subject =
  | { kind: 'staff_user'; userId: string }
  | { kind: 'patient';    patientId: string }

// ────────────────────────────────────────────────────────────────────────────
// Request lifecycle
// ────────────────────────────────────────────────────────────────────────────

export interface PhoneChangeRequest {
  id: string
  subject: Subject
  oldPhone: string
  newPhone: string
  status:
    | 'pending'
    | 'old_verified'
    | 'new_verified'   // transient
    | 'completed'
    | 'expired'
    | 'cancelled'
    | 'rejected'
  verificationMethod: 'sms_both' | 'sms_new_only'
  createdAt: string
  expiresAt: string
}

export interface RequestPhoneChangeInput {
  actorId: string                   // auth.uid()
  subject: Subject                  // resolved by handler from session + body
  newPhone: string                  // raw input; will be normalized
  idempotencyKey: string
  clinicIdForAudit?: string | null  // resolved upstream
}

export async function requestPhoneChange(
  input: RequestPhoneChangeInput
): Promise<{ requestId: string; expiresAt: string; oldPhoneMasked: string }>

// ────────────────────────────────────────────────────────────────────────────
// Verify a single side of the dual OTP
// ────────────────────────────────────────────────────────────────────────────
export interface VerifyPhoneChangeInput {
  actorId: string
  requestId: string
  side: 'old' | 'new'
  code: string
  clinicIdForAudit?: string | null
}

export type VerifyOutcome =
  | { kind: 'old_verified'; nextStep: 'verify_new' }
  | { kind: 'completed' }
  | { kind: 'awaiting_owner_approval' }       // fallback path

export async function verifyPhoneChangeStep(
  input: VerifyPhoneChangeInput
): Promise<VerifyOutcome>

// ────────────────────────────────────────────────────────────────────────────
// Cancel
// ────────────────────────────────────────────────────────────────────────────
export async function cancelPhoneChange(
  actorId: string,
  requestId: string
): Promise<void>

// ────────────────────────────────────────────────────────────────────────────
// Fallback (old phone unreachable)
// ────────────────────────────────────────────────────────────────────────────
export async function openPhoneChangeFallback(
  actorId: string,
  requestId: string,
  reason: string
): Promise<{ requiresOwnerApproval: true }>

// ────────────────────────────────────────────────────────────────────────────
// Owner inbox
// ────────────────────────────────────────────────────────────────────────────
export interface PendingApprovalRow {
  requestId: string
  subjectKind: 'staff_user' | 'patient'
  subjectId: string
  subjectName: string
  oldPhoneMasked: string
  newPhoneMasked: string
  reason: string | null
  createdAt: string
}

export async function getPendingPhoneChangeRequests(
  clinicId: string
): Promise<PendingApprovalRow[]>

export async function approvePhoneChangeRequest(
  ownerId: string,
  clinicId: string,
  requestId: string
): Promise<void>

export async function rejectPhoneChangeRequest(
  ownerId: string,
  clinicId: string,
  requestId: string,
  reason: string
): Promise<void>

// ────────────────────────────────────────────────────────────────────────────
// Phase C — Patient phone correction (no OTP)
// ────────────────────────────────────────────────────────────────────────────
export interface CorrectPatientPhoneInput {
  actorId: string                   // frontdesk user.id
  actorClinicId: string             // resolved via getFrontdeskClinicId
  patientId: string
  newPhone: string
  reason: string
}

export async function correctPatientPhone(
  input: CorrectPatientPhoneInput
): Promise<{ patient: { id: string; phone: string } }>
```

### 6.2 Admin-client scopes (D-008)

Every `createAdminClient(scope)` call needs an explicit scope. The new module uses these scopes (each justified):

| Scope | Used by | Why admin client (vs user session)? |
|---|---|---|
| `'phone-change-request'` | `requestPhoneChange` | Inserts into `phone_change_requests` AND `otp_codes`. The user can INSERT into `phone_change_requests` for their own subject, but cannot insert into `otp_codes` (no INSERT policy). One scoped admin call keeps the two writes in a single transaction; admin is unavoidable for the OTP table. |
| `'phone-change-verify'` | `verifyPhoneChangeStep` | Calls `verifyOTP` (which already uses admin internally) and updates `phone_change_requests.status` (no UPDATE policy on the table). |
| `'phone-change-commit'` | the commit transaction in `verifyPhoneChangeStep` (calls SQL RPC `change_phone_commit` AND `supabase.auth.admin.updateUserById`) | Updates `users.phone`, `patients.phone`, AND `auth.users.phone` (mandatory per resolved Q1 — 53 production accounts authenticate via auth.users.phone). Single admin client scope covers all three writes; auth admin requires service-role unconditionally. |
| `'phone-change-rollback'` | compensating rollback when the auth admin sync fails after the SQL transaction succeeded | Same surface as `phone-change-commit` plus writes a "rolled back" history pair. |
| `'phone-change-cancel'` | `cancelPhoneChange` | UPDATE on `phone_change_requests` (no UPDATE policy). |
| `'phone-change-fallback'` | `openPhoneChangeFallback` | UPDATE on phone_change_requests + INSERT into account_recovery_requests. |
| `'phone-change-owner-inbox-read'` | `getPendingPhoneChangeRequests` | SELECT joining requests, users, patients, memberships. RLS is ANDed with handler-side OWNER check; admin scope makes the JOIN viable across tables. |
| `'phone-change-owner-approve'` | `approvePhoneChangeRequest` | Same as commit. |
| `'phone-change-owner-reject'` | `rejectPhoneChangeRequest` | UPDATE on phone_change_requests. |
| `'phone-correction'` | `correctPatientPhone` | UPDATE patients + INSERT phone_corrections + 2× INSERT patient_phone_history. |

All scopes added to `ALLOWED_ADMIN_SCOPES` set in `packages/shared/lib/supabase/admin.ts` (existing registry).

### 6.3 Subject resolution — patient vs staff at write time

```ts
function commitPhoneChange(req: PhoneChangeRequest, actorId: string) {
  // Step 1: Always update users.phone (auth-side phone)
  // Step 2: If subject is also a patient (and subject is the actor themselves), update patients.phone
  //         If subject is staff, skip patients (staff aren't patients).
  //         If subject is a patient AND actor is frontdesk proxying, only update patients.phone — DO NOT touch users.phone (the patient may not have an auth.users row at all).
}
```

**Three concrete cases**:

| Case | What gets updated |
|---|---|
| Frontdesk staff changes own login phone | `users.phone` only. Mig 070's `users.phone_verified` set to true. |
| Doctor changes own login phone | Same. Plus `doctors` table is untouched (no phone there). |
| Patient (via frontdesk proxy) changes their phone | `patients.phone` always. `users.phone` ONLY IF a `users` row exists for that patient (`SELECT id FROM users WHERE id = :patientId`). Most current patients DO have a users row because of the FK constraint, but new walk-in patients don't always. Defensive: try the users update conditionally. |
| Patient (via the future patient app) changes their own phone | Same as above. |

### 6.4 Patient visibility propagation per D-007

When a patient phone is changed, **every patient row sharing the old phone** (across all clinics) must be updated. This is the cross-clinic propagation question — full treatment in §7. The data layer signature:

```ts
async function propagatePatientPhoneChange(
  oldPhone: string,
  newPhone: string,
  changedByUserId: string,
  reason: 'self_service_change' | 'fallback_approved'
): Promise<{ touched: { patientId: string; clinicId: string }[] }>
```

This finds every `patients` row with `phone = oldPhone` (today: at most one row, but the schema permits more), updates them all, writes one history pair per patient, returns the list for cross-clinic audit_events writes (one event per touched clinic).

### 6.5 Error handling and idempotency

- Every public function in `phone-changes.ts` throws typed errors that the handlers convert to API error envelopes:
  - `PhoneChangeError` with `{ code, httpStatus, arabicMessage }`. Handler maps to NextResponse.
- `requestPhoneChange` returns the existing request if `(subject, idempotencyKey)` matches an existing non-terminal row — caller's request is idempotent.
- `verifyPhoneChangeStep` is **not** idempotent on success (verifying the same OTP twice should fail because the OTP is single-use). But verifying when the request is already in a terminal state returns a structured error `{ code: 'request_terminal', currentStatus }` so the client can recover.
- All write paths catch Postgres `23505` (unique_violation) on `users.phone` and translate to `phone_taken` cleanly.

---

## 7. Cross-Clinic Propagation

This is the highest-stakes design question because privacy mistakes here unwind the whole network-effect strategy described in `PRODUCT_SPEC.md` §"Patient Identity Network."

### 7.1 The model today (verified from live data)

- `patients.phone` has NO unique constraint — only an index. Multiple `patients` rows can legally share the same phone (one per clinic).
- Production today: 35 patients, 35 distinct phones, 0 duplicates. The cross-clinic problem is theoretical right now.
- `patients.id = users.id` (FK CASCADE). A patient with a registered auth account has exactly one `users` row, which points at exactly one `users.phone` (UNIQUE). So the auth-side phone is global; the patient-side phone is per-clinic.

This means there are two propagation surfaces:

1. **Auth-side (`users.phone`)** — global. One change updates one row.
2. **Patient-side (`patients.phone`)** — per-clinic. One change may need to update N rows.

### 7.2 The propagation rule

When a phone change is **committed** (Phase B, identity event):

| Touched scope | What gets written |
|---|---|
| `users.phone` | Always updated to new phone, single row, by primary key. |
| `patients` rows where `phone = oldPhone` | All updated to new phone, regardless of `clinic_id`. |
| `patient_phone_history` | One pair (old `is_current=false`, new `is_current=true`) per touched patient row. |
| `audit_events` | **One row per touched clinic.** This is critical: each clinic that owned a patient row gets an audit entry visible to its OWNER. |

When a phone is **corrected** (Phase C, typo fix):

| Touched scope | What gets written |
|---|---|
| `patients` row WHERE `id = :patientId` | Single row, scoped to the frontdesk's clinic. |
| `users.phone` | NOT touched. A typo-fix to a record-side phone does not retroactively change the auth-side identity. |
| `phone_corrections` | One row, this clinic. |
| `patient_phone_history` | One pair, this patient row only. |
| `audit_events` | One row, this clinic. |

The asymmetry is deliberate: a Phase B change is the patient asserting "this is my new phone everywhere," whereas a Phase C correction is "this clinic mistyped." If the patient really has a new phone, the proper Phase B flow is required.

### 7.3 What Clinic B sees during a Phase B transition

Scenario: Patient has records at Clinic A (DOCTOR_SCOPED) and Clinic B (CLINIC_WIDE). Patient initiates phone change via Clinic A's frontdesk.

**During transition** (`phone_change_requests.status` ∈ `pending`, `old_verified`):
- Clinic A's frontdesk: sees the patient with old phone. Sees a small "تغيير قيد المراجعة" badge on the patient's row (new UI element — derived from `phone_change_requests` lookup with status filter).
- Clinic B's frontdesk: sees the patient with old phone. **Sees no transition badge.** Clinic B's existence is not leaked to Clinic A and vice versa during the verification window.

**On commit**:
- All `patients` rows with `phone = oldPhone` flip to new phone in a single transaction.
- `users.phone` flips at the same time.
- Clinic B's frontdesk on next refresh sees the new phone. They were not notified — the change is silent from B's perspective. (See §10 for an open question on whether to push a notification to all clinics with a record.)

### 7.4 Privacy: do not leak cross-clinic existence

The triggering clinic (A) knows about the patient. Clinic B should NOT learn anything new from the change. Specifically:

- The phone-change request UI on Clinic A's side shows: "هتغير رقم المريض في عيادتنا. لو المريض مسجل في عيادات تانية على MedAssist، الرقم هيتغير عندهم برضو." — informs the user that the change is global without naming Clinic B.
- The owner-approval inbox on Clinic A's owner side shows the same patient row, the same reason — no mention of Clinic B's name.
- Clinic B's owner inbox does NOT receive a copy of the request. The audit_events row is written for each touched clinic only AFTER commit. So B's owner sees the post-fact change in their audit log, not the in-flight request.

### 7.5 History query scoping

`patient_phone_history` is per-patient (FK is `patient_id`). Today the history rows are written per patient row, so a phone change that touches N patient rows produces N×2 history rows. To answer "what is this patient's phone history?" — query depends on the asker:

- **Patient (via patient app, future Phase 2)**: query rows for any patient_id that resolves to the patient's `users.id`. Today this is a single id, so single query.
- **Clinic A's frontdesk reading Clinic A's patient record**: query rows for Clinic A's patient_id only. Does NOT see Clinic B's history rows even if they exist for the same person.
- **Clinic A's owner audit log**: same as above — clinic-scoped.

This naturally enforces clinic isolation on history reads.

### 7.6 DOCTOR_SCOPED leak prevention specifically

If Clinic A is DOCTOR_SCOPED and the patient is the doctor's patient, the frontdesk sees the patient regardless (D-007: "Frontdesk always sees all patients in their clinic"). So a frontdesk-driven phone change at Clinic A doesn't reveal anything to other doctors at A that the frontdesk shouldn't already know.

The leak risk is **across clinics**: a Clinic A action shouldn't tell Clinic B that the patient exists at A. This is enforced by:
- The transition badge is rendered from a query scoped to the local patient_id (Clinic A's row). Clinic B's query for B's row finds no `phone_change_requests` (the request points at A's patient_id).
- The audit_events writes are per-clinic (one per touched clinic), and each clinic OWNER only sees their own `audit_events.clinic_id`.

### 7.7 Duplicate-detection during a change (race + cross-clinic)

When Phase A or B writes the new phone to `users.phone`, the UNIQUE constraint catches a collision with another **user** (any role, any clinic). What about a collision with another **patient** in another clinic?

- `patients.phone` has no UNIQUE → no DB error.
- But: per D-007 strategy, phone is the global patient identifier. Two patient rows with the same phone in different clinics actually represent the same person (or a data error).
- The new-phone validation step (server-side, before sending OTP) does this check:

```ts
const collidingUsers   = await db.from('users').select('id,role').eq('phone', newPhone)
const collidingPatients = await db.from('patients').select('id,clinic_id').eq('phone', newPhone)
```

  - `collidingUsers.length > 0`: 409 `phone_taken` immediately. Done.
  - `collidingPatients.length > 0` AND no `users` row collision: this is a **patient-only collision**. Three sub-cases:
    1. Subject is a patient at one of the clinics where the colliding patient already exists → it's almost certainly the same person across clinics; this is the network-effect "merge" condition. Defer to a future merge flow (§10 open question). For now: 409 `phone_taken` with arabic body `الرقم ده مسجل لمريض تاني عندنا. تواصل مع الدعم.`
    2. Subject is a staff user → 409 `phone_taken`.
    3. Subject is a patient at a DIFFERENT clinic than the colliding patient — same as 1, defer to merge flow.

  This is a pragmatic guard that prevents two patient rows from sharing a phone going forward. Existing collisions (today: 0) are out of scope.

### 7.8 Summary table — propagation matrix

| Event | `users.phone` | `patients.phone` (subject's clinic) | `patients.phone` (other clinics) | `patient_phone_history` | `audit_events` |
|---|---|---|---|---|---|
| Phase A frontdesk own change | UPDATE (single row) | n/a — frontdesk staff is not a patient | n/a | none | 1 row, frontdesk's clinic |
| Phase B staff own change (committed) | UPDATE (single row) | n/a (staff) | n/a | none | 1 row per clinic where staff is a member (usually 1) |
| Phase B patient change (committed) | UPDATE (1 row, if patient has users row) | UPDATE | UPDATE (all rows with old phone) | 1 pair per touched patient row | 1 row per touched clinic |
| Phase C patient correction | NOT touched | UPDATE | NOT touched | 1 pair (this patient row only) | 1 row, this clinic |
| Phase B fallback approved | UPDATE (1 row) | UPDATE | UPDATE (all rows with old phone) | 1 pair per touched patient row | 1 row per touched clinic + 1 fallback-approved row in approving clinic |

---

## 8. Test Plan

The repo currently mixes a hand-rolled `test()` harness (e.g. `doctor-stats.test.ts`, 31 tests) with Vitest (e.g. `frontdesk/payments/create/__tests__`). Per ARCHITECTURE.md §14 the recommendation is to migrate to Vitest. **The phone-change tests are written in Vitest.**

### 8.1 Unit tests — `packages/shared/lib/data/__tests__/phone-changes.test.ts`

Per public function, both happy and error paths.

#### `requestPhoneChange`

- ✅ Inserts a `phone_change_requests` row with status='pending', `verification_method='sms_both'`.
- ✅ Calls `createOTP(oldPhone, 'phone_change_old')` exactly once.
- ✅ Calls `sendSMS(oldPhone, …)` exactly once with body containing the code.
- ✅ Writes one `audit_events` row with action `CHANGE_PHONE_REQUESTED`.
- ✅ Returns `{ requestId, expiresAt, oldPhoneMasked }` with masked phone (`maskPhone` output).
- ❌ Returns existing requestId when `(subject, idempotencyKey)` matches an in-flight row (idempotency).
- ❌ Throws `request_in_flight` when an active request exists with a different idempotency key.
- ❌ Throws `same_as_current` when newPhone normalizes to currentPhone.
- ❌ Throws `invalid_phone` when `validateEgyptianPhone(newPhone).isValid === false`.
- ❌ Throws `phone_taken` when `users.phone` already has the new phone.
- ❌ Throws `phone_taken` when `patients.phone` collision (per §7.7 sub-cases).
- ❌ Throws `forbidden_proxy` when actor is frontdesk and patient.clinic_id ≠ actor's clinic.

#### `verifyPhoneChangeStep`

- ✅ side='old' transitions status `pending → old_verified`, sets `old_phone_verified_at`, sends new-phone OTP.
- ✅ side='new' (sms_both path) transitions `old_verified → new_verified` and immediately commits.
- ✅ side='new' (sms_new_only path) transitions `pending → old_verified` (held for owner approval) and returns `awaiting_owner_approval`.
- ✅ Commit updates `users.phone`, sets `phone_verified=true` and `phone_verified_at`, marks request `completed`.
- ✅ For patient subject, commit also updates `patients.phone` for ALL rows with old phone (cross-clinic propagation).
- ✅ Commit writes `patient_phone_history` rows (old `is_current=false` `removed_reason='user_changed'`, new `is_current=true` `verified=true`).
- ✅ Commit writes audit_events action `CHANGE_PHONE_COMMITTED` per touched clinic.
- ❌ Throws `code_wrong` when `verifyOTP` returns `valid: false`.
- ❌ Throws `request_terminal` when status is already `completed/expired/cancelled/rejected`.
- ❌ Throws `wrong_side` when client passes side='new' before old has been verified (sms_both path).
- ❌ Catches PG 23505 on users.phone update, marks request `cancelled`, throws `phone_taken`.

#### `cancelPhoneChange` / `openPhoneChangeFallback` / `correctPatientPhone` etc.

Each gets the same shape: 1 happy + N error cases. List omitted for brevity but enumerated in the test file.

### 8.2 Phone validation regex tests — `packages/shared/lib/utils/__tests__/phone-validation.test.ts` (extend existing)

(D-046 already added some — these are the gap-fillers.)

- ✅ `validateEgyptianPhone('01012345678')` → valid, normalized `+201012345678`.
- ✅ `validateEgyptianPhone('+201012345678')` → valid, normalized.
- ✅ All 4 carriers: `010`, `011`, `012`, `015`. Invalid: `013`, `014`, `016`, `017`, `018`, `019`.
- ❌ Length 10, 12, 13, 14 (too short / too long for local form).
- ❌ Spaces, dashes, parens — should normalize, not reject (existing behavior; verify via `normalizeEgyptianDigits`).
- ❌ Arabic-Indic digits `٠١٢…` should normalize to Latin (existing behavior).
- ❌ International non-Egyptian formats: `+447911123456`, `+11234567890`.
- ❌ Empty string, all-zeros, all-letters.

### 8.3 OTP unit tests — `packages/shared/lib/auth/__tests__/otp.test.ts` (extend if exists)

After purpose union extension (Phase B):
- ✅ `createOTP(phone, 'phone_change_old')` accepts the new purpose.
- ✅ Same for `phone_change_new`, `phone_correction`.
- ✅ `verifyOTP` correct, wrong, expired, attempts-exceeded, already-used.
- ✅ Single-use enforcement: `verifyOTP` then `verifyOTP` again with same code → second fails.

### 8.4 Integration tests — API endpoints

Use Vitest + a per-test Supabase test database (existing pattern in `payments/create/__tests__`). One file per endpoint:

- `change-phone/request/__tests__/handler.test.ts`
  - 200 happy path (staff subject, then patient subject).
  - 401 unauthenticated.
  - 403 frontdesk proxying for other-clinic patient.
  - 409 in-flight request, phone-taken, same-as-current.
  - 429 rate limit (mock `enforceRateLimit` to return `allowed:false`).
  - **RLS spec**: a curl call from another user's session cannot read the request after creation.

- `change-phone/verify/__tests__/handler.test.ts`
  - Both sides happy paths + sms_new_only fallback variant.
  - 400 wrong code, expired code, request_terminal.
  - **Concurrency test**: two simultaneous `verify` calls for the same request — exactly one wins, the other returns 409 `request_terminal`. Implemented by holding a SELECT FOR UPDATE on the request row inside the verify transaction.

- `change-phone/cancel/__tests__/handler.test.ts`
  - Happy + idempotent re-cancel + 403 on other actor's request.

- `change-phone/fallback/__tests__/handler.test.ts`
  - Happy + 24h rate limit + insertion of `account_recovery_requests` row for patient subject.

- `clinic/phone-change-requests/__tests__/handler.test.ts` (list, approve, reject)
  - List filters by clinic correctly (RLS + handler both); cross-clinic rows do NOT appear.
  - Approve commits and writes audit row with `CHANGE_PHONE_FALLBACK_APPROVED`.
  - Reject sets status `rejected`, requires reason, notifies subject.

- `frontdesk/patients/[id]/phone-correction/__tests__/handler.test.ts`
  - Happy + 409 when patient is `phone_verified=true` with auth user (must use real change).
  - 403 when frontdesk and patient differ in clinic.

### 8.5 Cross-clinic propagation tests

Specifically in `phone-changes.test.ts`:

- Set up: 2 patient rows with same `phone='01001234567'`, different clinics.
- Run a Phase B commit for that phone → assert BOTH rows updated.
- Assert `patient_phone_history` has 4 rows (2 old, 2 new).
- Assert `audit_events` has 2 rows, one per `clinic_id`.

### 8.6 E2E tests

Playwright (recommended; not currently set up in repo — flag in §10). One spec per UX flow in §4:

- `e2e/phone-change/frontdesk-own-happy-path.spec.ts`
- `e2e/phone-change/frontdesk-own-fallback.spec.ts`
- `e2e/phone-change/doctor-own-happy-path.spec.ts`
- `e2e/phone-change/frontdesk-patient-correction.spec.ts`
- `e2e/phone-change/frontdesk-patient-real-change.spec.ts`
- `e2e/phone-change/owner-approval-inbox.spec.ts`

For each: full happy path, then resend during cooldown, then OTP-expired by waiting 6 minutes (or mocking the clock). Use `DEV_BYPASS_OTP=true` so any 4-digit code works in the OTP UI.

### 8.7 Migration tests

- `migration_070.test.ts` (using a temp DB or shadow):
  - Apply once → expect users.phone_verified column added with default false.
  - Backfill confirmed: `SELECT COUNT(*) FROM users WHERE phone_verified=true` equals total count of users with `created_at < migration_time`.
  - Apply migration twice → second run is no-op (IDEMPOTENCY guards everywhere).
  - Insert a phone_change_requests row with both patient_id AND user_id → expect XOR check to reject.
  - Insert with neither → expect XOR check to reject.
  - Drop+recreate the status CHECK to add `'rejected'` → existing rows unaffected.

### 8.8 Backfill verification (one-shot, not a unit test)

After migration 070 in production, run a manual SQL audit:

```sql
SELECT
  count(*) FILTER (WHERE phone_verified IS NULL)            AS null_count,
  count(*) FILTER (WHERE phone_verified = true)             AS true_count,
  count(*) FILTER (WHERE phone_verified = false)            AS false_count,
  count(*) FILTER (WHERE phone_verified_at IS NULL)         AS null_at_count
FROM users;
```

Expected: null_count=0, false_count=0 (all backfilled to true; new users post-migration come in as false but won't exist immediately).

---

## 9. Rollout Strategy

### 9.1 Phase A — this week, no migration

Single PR. Touches one file (`apps/clinic/app/api/frontdesk/profile/route.ts`) plus the `AuditAction` enum extension in `packages/shared/lib/data/audit.ts`. Plus a docstring update.

- **Migration**: none. The `audit_events` table already exists; `AuditAction` is a TypeScript enum, not a DB enum.
- **Feature flag**: none. Pure validation tightening + audit logging — strictly safer than current.
- **Rollback plan**: revert the PR. The audit rows that were written remain in `audit_events` with `metadata.pathway='phase_a_legacy_no_otp'` — useful as a record of who was changing phones during the gap period.
- **Deploy ordering**: ship to `main` → Vercel deploys → done. No coordination with DB.
- **Smoke test after deploy**: log into a test frontdesk account, attempt to change phone to `123` (should reject with valid Egyptian phone error), then change to a valid Egyptian phone (should succeed AND produce one audit_events row visible in the OWNER audit log UI).

### 9.2 Phase B + C — feature-flagged

Single ticket spanning ~3 PRs:

1. **PR-1 (DB-only)**: Migration 070 + (optional) Migration 071 cleanup.
2. **PR-2 (server)**: New `phone-changes.ts` data module + new handlers + extended OTP purpose unions.
3. **PR-3 (client)**: New `ChangePhoneFlow` component + `OtpInput` extraction + 5 new pages + i18n keys + nav additions.

All three guarded by `FEATURE_PHONE_CHANGE_V2` env var (Vercel env var, defaults to `false`). When `false`:
- New endpoints return 404.
- New buttons are not rendered. The current frontdesk inline phone field stays.
- Owner inbox card is hidden.

When `true`:
- New buttons render. Old inline phone field is replaced with the read-only row + `تغيير الرقم` button.
- The old `PATCH /api/frontdesk/profile` keeps accepting `phone` (because the inline field is gone, no UI sends it; but if a third-party integration sends it, it falls back to Phase A's validated path). After 30 days of `FEATURE_PHONE_CHANGE_V2=true` in production, Phase A's phone branch can be removed.

**Migration order**:
1. Apply Migration 070 to staging via `mcp__supabase apply_migration` or psql. Verify backfill.
2. Deploy PR-2 (server) with flag still `false` — endpoints exist but are 404'd. Smoke test by toggling flag for a single test session.
3. Deploy PR-3 (client) with flag still `false`.
4. Apply Migration 070 to production. Verify backfill.
5. Toggle `FEATURE_PHONE_CHANGE_V2=true` in Vercel env. Vercel rebuild kicks in (~30s).
6. Hand-test all 6 flows on prod.
7. Within 24h, monitor audit_events for `CHANGE_PHONE_*` action types. Watch for unexpected error rate.

**Rollback plan**:
- If a critical bug surfaces post-toggle: set `FEATURE_PHONE_CHANGE_V2=false` in Vercel. New flow disappears. Phase A's path is still wired and still works for frontdesk.
- The DB migration cannot easily be rolled back (column adds + check changes are forward-compatible). The new columns staying around with defaults is harmless.
- In-flight Phase B requests (rows in `phone_change_requests` with status ∈ `pending|old_verified`) need cleanup if we permanently abandon. SQL: `UPDATE phone_change_requests SET status='cancelled' WHERE status IN ('pending','old_verified') AND created_at < :rollback_time`.

### 9.3 The `users.phone_verified` backfill decision (open in §10 → resolved here with a recommendation)

Two options:

| Option | Reasoning | Downside |
|---|---|---|
| **A. Backfill `phone_verified=true` for all 288 existing users** (RECOMMENDED) | Existing registration flow has required OTP since mig 024. So every user that signed up did verify. Forcing them to re-verify just to log in is friction without security gain. | If any user was created via a bypass path (DEV_BYPASS_OTP=true, manual SQL insert), they get a `true` they didn't earn. Mitigation: dev test accounts in mig 043 are deleted via mig 050; manual SQL inserts are not a real concern in this team. |
| B. Backfill `phone_verified=false`; force re-verify on next login | Stronger security posture | Forces 288 users to re-verify with no clear benefit; SMS cost spike (~288 OTPs at ~$0.02 each ≈ $6, negligible — but the UX surprise is bad) |

**Migration 070 implements option A.** The migration comment explicitly states the assumption ("registration flow has required OTP since mig 024") so a future engineer can find the rationale.

### 9.4 SMS cost projection

Current Twilio spend assumption: `$0.02-$0.04` per SMS to Egypt. Phase B doubles SMS-per-change (dual OTP). Conservative:

- 100 clinics × 5 staff phone changes/year average = 500 changes/year × 2 SMS = 1000 SMS/year ≈ **$30/year staff side**.
- Patient phone changes: very low volume in Phase 1 (no patient app); essentially zero.

Per-user-per-day rate cap of 5 prevents OTP spam abuse. SMS spend is not a real constraint at current scale.

---

## 10. Risks & Open Questions

### 10.1 Risks (with mitigations)

| # | Risk | Likelihood | Severity | Mitigation in this plan |
|---|---|---|---|---|
| R-1 | **Race on `users.phone` UNIQUE during OTP-in-flight.** Between `request` and `verify`, another user registers the new phone first. Verify's commit then 23505s. | Medium | Low | Pre-check at request time (rejects most cases). On commit, catch 23505, mark request `cancelled`, return clean `phone_taken` error. Documented in §5.2.1. |
| R-2 | **Twilio outage silently completes `sendSMS`.** Stub-mode returns success even when no SMS is sent. User stares at OTP screen. | Low | Medium | Add a structured log when Twilio response includes `sid: 'stub_…'`. Optional: surface a banner to the user via the response payload telling them to contact support if no SMS arrives within 60s. Defer banner; ship the log. |
| R-3 | **User loses old phone during a clinical session.** Phone change starts → mid-flow → loses old SIM. | Low | Low | The `pending` request expires after 24h. User can `cancel` and re-start with the fallback path. UI on Screen 2 already offers `مش معاي الرقم القديم` link. |
| R-4 | **SMS cost spike from dual-OTP abuse.** A bad actor triggers 100 change requests in a day. | Low | Low | Three rate limits stack: per-IP per-minute (`change-phone-request: 3/60s`), per-user-per-day (5/24h via audit_events count), and per-IP `otp-send: 5/60s`. |
| R-5 | **Audit_events row growth.** Each phone change writes 1-N audit rows; healthy and intentional. But the table has no retention policy. | Low | Low | Out of scope here. Add to TD list (TD-012) for a retention policy review separately. |
| R-6 | **Cross-clinic patient-existence leak.** Bug in propagation could reveal Clinic B's patient row to Clinic A's UI. | Low | High | Tests in §8.5 explicitly assert no Clinic B name leaks to A. The transition badge query is scoped by patient_id, not phone, so a sibling-patient row in B doesn't surface in A's UI. |
| R-7 | **Dual audit modules confusion.** A future PR uses `auditLog()` (legacy) instead of `logAuditEvent()` for phone changes. Owner inbox audit page wouldn't show those rows. | Medium | Medium | Explicit instruction in §2.7. Recommend deprecating `auditLog()`/`audit_log` table in a follow-up cleanup (TD-013). |
| R-8 | **Frontdesk proxy auth model is novel.** Frontdesk acting on behalf of a patient is not a pattern used elsewhere — invites RBAC drift. | Medium | Medium | The `actorRole='frontdesk_proxy'` discriminator is server-validated. The handler enforces `actor.role === 'frontdesk' AND patient.clinic_id === actor's frontdesk clinic`. Documented in §5.2 and tested in §8.4. |
| R-9 | **Patient changes phone mid-prescription.** Doctor's session-in-progress holds a stale phone in form state. Save fails or saves with wrong phone. | Very Low | Low | Phone changes are rare events; concurrent-with-session even rarer. The `clinical_notes` save uses `patient_id`, not phone, so the save itself doesn't break. The doctor's read-side phone display becomes stale until refresh — acceptable. |
| R-10 | **Phone-change at Clinic A blocks new appointments at Clinic B for the few seconds the change is committing.** | Negligible | Negligible | Commit transaction is single-clinic-row updates, completes in milliseconds. |
| R-11 | **Owner approval inbox is undiscoverable.** Owner doesn't see staff request, staff is locked out. | Medium | Medium | Add a notification for the owner when a fallback request is opened. Existing `notifications` table supports `target_user_id`; add a notification kind `phone_change_pending_approval`. Listed under §10.2 Q5. |
| R-12 | **Patient has multiple records across clinics with different phones today (data drift).** Phase B propagation assumes "all rows with old phone." If Clinic B already has a different phone for the same person, propagation misses Clinic B. | Low (today: 0 cross-clinic dups), Future-relevant | Medium | This is the network-effect identity problem in disguise. For now, the rule is: Phase B propagates rows that share the OLD phone, full stop. Patient identity reconciliation across phones is a separate product feature (Phase 2, patient app). Document in §10.2 Q4 as an open product question. |
| R-13 | **Migration 070 backfill (`phone_verified=true` for all 288 users) sets a flag we can't easily un-set.** | Low | Low | The decision is documented in the migration comment (option A in §9.3). If we later discover a class of users that didn't actually verify, we can selectively roll back to `false` for them via a follow-up migration. |
| R-14 | **`auth.users.phone` drift on commit.** ~~Hypothetical~~ **Confirmed**: 53 production accounts (mostly walk-in patients) authenticate against `auth.users.phone`. Updating only `public.users.phone` would silently break their next login. | Confirmed | High | **RESOLVED via Q1.** Commit transaction (§5.2.1) calls `supabase.auth.admin.updateUserById(id, { phone: newE164 })` after the SQL transaction succeeds. Compensating rollback if the auth admin call fails. New scope `'phone-change-commit'` registered. |
| R-17 | **One pre-existing already-divergent account** (`auth.users.phone ≠ public.users.phone` for 1 row) discovered during Q1 investigation. | Confirmed | Low | TD-015: separate one-shot SQL fix to align the divergent row. Out of scope for this plan; flagged as cleanup. |
| R-15 | **`patients.id` FK to `users.id` means deleting a user CASCADES to deleting their patient row.** A botched phone change followed by an account-removal flow could lose patient data. | Low | High | Out of scope for phone change, but the brief should not introduce new code paths that delete users. Phase B uses UPDATE only, never DELETE. |
| R-16 | **No Vitest E2E or Playwright infrastructure exists in the repo.** The §8 E2E tests cannot run today. | High | Low | Defer E2E to a follow-up PR. Phase B ships with unit + integration tests only; manual smoke tests cover E2E behavior in initial deployment. Add Playwright setup as TD-014. |

### 10.2 Resolved decisions (Mo, 2026-04-25)

> All nine open questions answered. No remaining blockers for code start.

**Q1 — Auth-side phone synchronization with `auth.users.phone`** → **RESOLVED: always update `auth.users.phone` in the commit transaction.**

Investigation against the live DB:

| Account category | Count | Login path | Phone-change impact |
|---|---|---|---|
| `public.users.email` set (email accounts) | 140 | Login handler's email branch (line 78-84) using Supabase Auth email + password | Updating only `public.users.phone` is sufficient at login time, but updating `auth.users.phone` keeps them future-proof |
| `public.users.email` NULL, `auth.users.email` set (synthesized email) | 95 | Same email branch — synthesized email is the auth-side identity | Same as above |
| `public.users.email` NULL, `auth.users.email` NULL, `auth.users.phone` set (true phone-only) | **53** | Login handler's phone branch (line 85-91) — `signInWithPassword({ phone, password })` against `auth.users.phone` | **MUST update `auth.users.phone` or login breaks** |
| Both NULL (unloggable) | 0 | n/a | n/a |

53 production accounts (mostly walk-in patients onboarded via `createWalkInPatient`) authenticate against `auth.users.phone` directly. Updating only `public.users.phone` would silently break their next login. **Decision**: the commit transaction (§5.2.1) calls `supabase.auth.admin.updateUserById(subjectId, { phone: newE164 })` immediately after the `public.users` UPDATE, inside the same try block. If the auth admin call fails, the transaction is rolled back via the same `phone_change_requests.status='cancelled'` + clean error path used for 23505. We do NOT touch `auth.users.email` (the synthesized email is the existing auth identity for the 95 synthesized-email accounts and changing it would invalidate that login path — out of scope here). We also discovered 1 already-divergent account (`auth.users.phone ≠ public.users.phone`) — flag as TD-015, not blocking.

**Q2 — Self-approval ban** → **RESOLVED: ban self-approval.** Implementation: in `approvePhoneChangeRequest(ownerId, clinicId, requestId)` reject with 403 + Arabic message `مينفعش توافق على طلبك بنفسك. تواصل مع الدعم.` when `request.subject_user_id === ownerId`. Solo doctors use the support email path documented in Flow C (§4.3).

**Q3 — Post-commit confirmation SMS to OLD phone** → **RESOLVED: ship it.** Folded into §5.2.1. The SMS body: `تم تغيير رقم الدخول لحساب MedAssist بتاعك. لو مش انت اللي عملت ده، تواصل مع الدعم على support@medassist.app فوراً.` Sent fire-and-forget after commit succeeds. Failure to deliver does not roll back the commit (the OLD phone may already be unreachable — that's the whole reason for the fallback flow).

**Q4 — Cross-clinic phone divergence (R-12)** → **RESOLVED: ship policy (i) — strict.** Phase B's propagation rule: update only `patients` rows where `phone = oldPhone`. If Clinic B has the patient under a different phone, Clinic B's row is NOT touched. Defer cross-clinic identity merging to a future "merge identity" feature in the patient app (Phase 2). Tracking: a new entry to be added to `PRODUCT_SPEC.md` "Open Product Decisions" → `OPD-004: cross-clinic patient identity merge`.

**Q5 — Owner notification on fallback open** → **RESOLVED: notify via `notifications` table.** Folded into §5.4. New notification type `phone_change_pending_approval` with `target_user_id = clinic_owner_user_id` and message `"طلب تغيير رقم جديد محتاج موافقتك"`. The notification renders with action chip `افتح صندوق الطلبات` linking to `/doctor/clinic-settings/phone-change-requests`. Fire-and-forget INSERT in the fallback handler. If the clinic has multiple OWNERs, all of them receive the notification.

**Q6 — Phase A end-of-life: 30 days** → **RESOLVED.** After 30 days at `FEATURE_PHONE_CHANGE_V2=true` in production with no critical incidents, delete the phone branch from the Phase A handler. Tracking: add to `NOTES.md` with the calendar trigger date computed at deploy time.

**Q7 — Patient app stub** → **RESOLVED: accept patient role at the endpoint, defer UI to Phase 2.** Each handler's docstring includes `// PATIENT_UI_DEFERRED: This endpoint accepts patient role for forward compatibility. Patient-side UI ships in Phase 2 (PRODUCT_SPEC.md "Phase 2: Patient Identity Network").`

**Q8 — Frontdesk-as-proxy (Flow E)** → **RESOLVED: ship.** Flow E goes live in Phase B with the audit discriminator `actorRole='frontdesk_proxy'` recorded in every event. Reviewer note: the `verify` handler (§5.2) gates this path with `actor.role === 'frontdesk' AND patient.clinic_id === getFrontdeskClinicId(actor)`.

**Q9 — Owner inbox badge placement** → **RESOLVED: ship as planned** under `/doctor/clinic-settings/phone-change-requests` with badge on the existing clinic-settings card on the doctor dashboard. Revisit if discoverability becomes a complaint.

### 10.3 Items NOT in scope for this plan

- The dead-RLS-duplicate cleanup on `patient_phone_history` (proposed Migration 071) — separate PR.
- Deprecating `auditLog()` / `audit_log` table in favor of `audit_events` — separate decision (TD-013).
- A patient-identity merge feature for cross-clinic phone reconciliation — Phase 2 product question.
- Patient mini-portal UI for phone change — Phase 2.
- Adding `clinic_id` to `audit_events` for staff requests where the staff has multiple clinic memberships — currently writes one event per touched clinic; that's fine.

### 10.4 Architecture decisions this plan would touch

| Decision | Status | Note |
|---|---|---|
| D-007 (visibility) | **Honored** | Frontdesk-always-sees-all preserved; cross-clinic propagation respects patient_visibility model. |
| D-008 (admin client scopes) | **Honored, extended** | 9 new scope strings added to `ALLOWED_ADMIN_SCOPES`. |
| D-019 (phone regex) | **Honored** | `validateEgyptianPhone` used everywhere. |
| D-024 (centralized access) | **Honored** | All logic in `packages/shared/lib/data/phone-changes.ts`; handlers are thin. |
| D-027 (Arabic error messages) | **Honored** | All errors map to Arabic strings; new keys added to `ar.ts`. |
| D-041 (server-resolved tenant) | **Honored** | Frontdesk proxy validates patient.clinic_id against `getFrontdeskClinicId(actor)`. |
| D-046 / D-047 (canonical phone validators) | **Honored** | Strict validator used server-side and on form submit; no inline regex anywhere. |
| **New: D-050 (proposed)** — *Phone is identity; changing it is a deliberate dual-OTP event* | This plan introduces it | After PR-2 lands, add D-050 to `DECISIONS_LOG.md` to record the principle. |

---

## Appendix A — Files to be added/modified (full list)

**Phase A (new files: 0; modified: 2)**
- M `apps/clinic/app/api/frontdesk/profile/route.ts` — validation tightening + audit
- M `packages/shared/lib/data/audit.ts` — add 7 new `AuditAction` enum values

**Phase B (new files: ~16; modified: ~8)**
- N `supabase/migrations/070_phone_verified_and_staff_phone_change.sql`
- N `packages/shared/lib/data/phone-changes.ts`
- N `packages/shared/lib/data/__tests__/phone-changes.test.ts`
- N `packages/shared/lib/api/handlers/auth/change-phone/request/handler.ts`
- N `packages/shared/lib/api/handlers/auth/change-phone/verify/handler.ts`
- N `packages/shared/lib/api/handlers/auth/change-phone/cancel/handler.ts`
- N `packages/shared/lib/api/handlers/auth/change-phone/fallback/handler.ts`
- N `packages/shared/lib/api/handlers/clinic/phone-change-requests/handler.ts` (list)
- N `packages/shared/lib/api/handlers/clinic/phone-change-requests/[id]/approve/handler.ts`
- N `packages/shared/lib/api/handlers/clinic/phone-change-requests/[id]/reject/handler.ts`
- N `apps/clinic/app/api/auth/change-phone/{request,verify,cancel,fallback}/route.ts` (4 thin re-exports)
- N `apps/clinic/app/api/clinic/phone-change-requests/route.ts` (and `[id]/approve/route.ts`, `[id]/reject/route.ts`)
- N `apps/clinic/app/(frontdesk)/frontdesk/profile/change-phone/page.tsx`
- N `apps/clinic/app/(doctor)/doctor/profile/change-phone/page.tsx`
- N `apps/clinic/app/(doctor)/doctor/clinic-settings/phone-change-requests/page.tsx`
- N `packages/ui-clinic/components/profile/ChangePhoneFlow.tsx`
- N `packages/ui-clinic/components/auth/OtpInput.tsx` (extracted from existing OTP page)
- M `apps/clinic/app/(auth)/otp/page.tsx` — use the extracted OtpInput; add post-verify branches for new purposes
- M `packages/shared/lib/auth/otp.ts` — extend purpose union
- M `packages/shared/lib/api/handlers/auth/send-otp/handler.ts` — extend `validPurposes` array
- M `packages/shared/lib/i18n/ar.ts` — add ~40 keys
- M `packages/shared/lib/i18n/en.ts` — add equivalents
- M `packages/shared/lib/supabase/admin.ts` — register 9 new scopes
- M `apps/clinic/app/(frontdesk)/frontdesk/profile/page.tsx` — replace inline phone edit with link to flow
- M `apps/clinic/app/(doctor)/doctor/profile/page.tsx` — add phone display + change link

**Phase C (new files: 3; modified: 2)**
- N `packages/shared/lib/api/handlers/frontdesk/patients/[id]/phone-correction/handler.ts`
- N `apps/clinic/app/api/frontdesk/patients/[id]/phone-correction/route.ts`
- N `packages/ui-clinic/components/patient/CorrectPhoneModal.tsx`
- M Patient detail/edit page (find via Glob: `apps/clinic/app/(frontdesk)/frontdesk/patients/[id]/*`) — add the dual CTA pair
- M `packages/shared/lib/data/phone-changes.ts` — add `correctPatientPhone` (already in §6.1 spec)

---

*End of plan. All Q1–Q9 resolved 2026-04-25 (see §10.2). Code starts with PR-1 (Migration 070).*


