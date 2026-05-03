# Phase A.2 — createAdminClient triage

**Scope:** Prompt 6 / Phase A.2. Tags every `createAdminClient(...)` callsite KEEP-ADMIN / MIGRATE-TO-USER / SECURITY-DEFINER / INVESTIGATE.
**Date:** 2026-04-30
**Total callsites:** 210
**Total files:** 92

## Bucket summary (by scope, top 30)

| Scope | Callsites | Verdict | Notes |
|---|---|---|---|
| `patient-privacy-checks` | 14 | **MIGRATE-TO-USER** | Has user context; will use RLS under Prompt 6 |
| `phone-change-request` | 8 | **KEEP-ADMIN** | Mid-flow phone change (no session for new number) |
| `clinic-context` | 7 | **MIGRATE-TO-USER** | Has user context; will use RLS under Prompt 6 |
| `visibility` | 7 | **MIGRATE-TO-USER** | Has user context; will use RLS under Prompt 6 |
| `prescription-sync` | 6 | **MIGRATE-TO-USER** | Has user context; will use RLS under Prompt 6 |
| `user-registration` | 6 | **KEEP-ADMIN** | Pre-auth lookup or invite code |
| `lab-results` | 5 | **MIGRATE-TO-USER** | Has user context; will use RLS under Prompt 6 |
| `memberships` | 5 | **MIGRATE-TO-USER** | Has user context; will use RLS under Prompt 6 |
| `(default)` | 4 | **INVESTIGATE** | Ambiguous scope; per-callsite review required |
| `patient-dedup` | 4 | **SECURITY-DEFINER** | Should move to SECURITY DEFINER RPC, not admin client |
| `clinic-staff` | 3 | **MIGRATE-TO-USER** | Has user context; will use RLS under Prompt 6 |
| `patient-onboarding` | 3 | **KEEP-ADMIN** | Pre-auth lookup or invite code |
| `phone-change-fallback` | 3 | **KEEP-ADMIN** | Mid-flow phone change (no session for new number) |
| `auth-login-lookup` | 2 | **KEEP-ADMIN** | Pre-session auth bootstrapping |
| `clinic-registration` | 2 | **KEEP-ADMIN** | Pre-auth lookup or invite code |
| `doctor-appointments` | 2 | **MIGRATE-TO-USER** | Has user context; will use RLS under Prompt 6 |
| `doctor-settings` | 2 | **MIGRATE-TO-USER** | Has user context; will use RLS under Prompt 6 |
| `global-patients-lookup` | 2 | **SECURITY-DEFINER** | Should move to SECURITY DEFINER RPC, not admin client |
| `notifications` | 2 | **MIGRATE-TO-USER** | Has user context; will use RLS under Prompt 6 |
| `patient-appointments` | 2 | **MIGRATE-TO-USER** | Has user context; will use RLS under Prompt 6 |
| `patient-code` | 2 | **SECURITY-DEFINER** | Should move to SECURITY DEFINER RPC, not admin client |
| `patient-sharing` | 2 | **MIGRATE-TO-USER** | Has user context; will use RLS under Prompt 6 |
| `phone-change-verify` | 2 | **KEEP-ADMIN** | Mid-flow phone change (no session for new number) |
| `phone-correction` | 2 | **INVESTIGATE** | Ambiguous scope; per-callsite review required |
| `sms-reminders` | 2 | **KEEP-ADMIN** | System/cron operation, no user session |
| `assign-walkin-slot` | 1 | **MIGRATE-TO-USER** | Has user context; will use RLS under Prompt 6 |
| `audit-log` | 1 | **KEEP-ADMIN** | System/cron operation, no user session |
| `audit-logging` | 1 | **KEEP-ADMIN** | System/cron operation, no user session |
| `audit-read` | 1 | **KEEP-ADMIN** | System/cron operation, no user session |
| `auth-assignments` | 1 | **KEEP-ADMIN** | Pre-session auth bootstrapping |

## Verdict counts

- **KEEP-ADMIN:** 60 callsites
- **MIGRATE-TO-USER:** 119 callsites
- **SECURITY-DEFINER:** 8 callsites (should move to RPC)
- **INVESTIGATE:** 23 callsites (ambiguous scope)
- **Total:** 210

## Per-callsite triage (all callsites)

| File | Line | Scope | Verdict | Role |
|---|---|---|---|---|
| `clinic/app/api/frontdesk/invoice/[paymentId]/route.ts` | 23 | `(default)` | **INVESTIGATE** | page |
| `clinic/app/api/frontdesk/invoice/[paymentId]/route.ts` | 179 | `(default)` | **INVESTIGATE** | page |
| `clinic/app/api/public/invoice/[paymentId]/route.ts` | 19 | `(default)` | **INVESTIGATE** | page |
| `lib/supabase/admin.ts` | 47 | `(default)` | **INVESTIGATE** | data-layer |
| `lib/data/frontdesk.ts` | 956 | `assign-walkin-slot` | **MIGRATE-TO-USER** | data-layer |
| `lib/audit/logger.ts` | 22 | `audit-log` | **KEEP-ADMIN** | audit |
| `lib/data/audit.ts` | 240 | `audit-logging` | **KEEP-ADMIN** | data-layer |
| `lib/data/audit.ts` | 284 | `audit-read` | **KEEP-ADMIN** | data-layer |
| `lib/auth/session.ts` | 264 | `auth-assignments` | **KEEP-ADMIN** | auth |
| `lib/auth/session.ts` | 246 | `auth-clinic-role` | **KEEP-ADMIN** | auth |
| `lib/api/handlers/auth/check-phone/handler.ts` | 34 | `auth-login-lookup` | **KEEP-ADMIN** | handler |
| `lib/api/handlers/auth/login/handler.ts` | 44 | `auth-login-lookup` | **KEEP-ADMIN** | handler |
| `lib/auth/session.ts` | 225 | `auth-memberships` | **KEEP-ADMIN** | auth |
| `lib/api/handlers/frontdesk/checkin/handler.ts` | 145 | `auto-renew-on-visit-gpid-lookup` | **KEEP-ADMIN** | handler |
| `lib/data/frontdesk.ts` | 640 | `available-slots-gap-aware` | **MIGRATE-TO-USER** | data-layer |
| `lib/data/clinic-context.ts` | 77 | `clinic-context` | **MIGRATE-TO-USER** | data-layer |
| `lib/data/clinic-context.ts` | 115 | `clinic-context` | **MIGRATE-TO-USER** | data-layer |
| `lib/data/clinic-context.ts` | 220 | `clinic-context` | **MIGRATE-TO-USER** | data-layer |
| `lib/data/clinic-context.ts` | 246 | `clinic-context` | **MIGRATE-TO-USER** | data-layer |
| `lib/data/clinic-context.ts` | 264 | `clinic-context` | **MIGRATE-TO-USER** | data-layer |
| `lib/data/clinic-context.ts` | 294 | `clinic-context` | **MIGRATE-TO-USER** | data-layer |
| `lib/data/clinic-context.ts` | 370 | `clinic-context` | **MIGRATE-TO-USER** | data-layer |
| `lib/api/handlers/clinic/invite/handler.ts` | 35 | `clinic-invite` | **MIGRATE-TO-USER** | handler |
| `lib/api/handlers/clinic/join/handler.ts` | 32 | `clinic-join` | **MIGRATE-TO-USER** | handler |
| `clinic/app/api/clinic/leave/route.ts` | 35 | `clinic-leave` | **MIGRATE-TO-USER** | page |
| `clinic/app/api/clinic/membership/route.ts` | 48 | `clinic-membership-revoke` | **MIGRATE-TO-USER** | page |
| `lib/api/handlers/auth/register/handler.ts` | 99 | `clinic-registration` | **KEEP-ADMIN** | handler |
| `lib/data/users.ts` | 234 | `clinic-registration` | **KEEP-ADMIN** | data-layer |
| `lib/api/handlers/clinic/settings/handler.ts` | 136 | `clinic-settings-patch` | **MIGRATE-TO-USER** | handler |
| `lib/api/handlers/clinic/staff/handler.ts` | 21 | `clinic-staff` | **MIGRATE-TO-USER** | handler |
| `lib/api/handlers/clinic/staff/handler.ts` | 137 | `clinic-staff` | **MIGRATE-TO-USER** | handler |
| `lib/api/handlers/clinic/staff/handler.ts` | 195 | `clinic-staff` | **MIGRATE-TO-USER** | handler |
| `lib/api/handlers/clinical/notes/handler.ts` | 69 | `clinical-notes-clinic` | **MIGRATE-TO-USER** | handler |
| `lib/data/frontdesk.ts` | 502 | `complete-queue-session` | **MIGRATE-TO-USER** | data-layer |
| `lib/api/handlers/doctor/messages/conversations/handler.ts` | 13 | `conversations-with-patient-names` | **MIGRATE-TO-USER** | handler |
| `lib/data/patient-shares.ts` | 212 | `create-shares-for-grantors` | **MIGRATE-TO-USER** | data-layer |
| `clinic/app/api/cron/expire-stale-shares/route.ts` | 67 | `cron-expire-stale-shares` | **KEEP-ADMIN** | page |
| `lib/api/handlers/doctor/appointments/handler.ts` | 206 | `doctor-appointments` | **MIGRATE-TO-USER** | handler |
| `lib/api/handlers/doctor/appointments/handler.ts` | 381 | `doctor-appointments` | **MIGRATE-TO-USER** | handler |
| `lib/data/messaging-consent.ts` | 331 | `doctor-conversation-create` | **MIGRATE-TO-USER** | data-layer |
| `lib/analytics/doctor-stats.ts` | 418 | `doctor-income-stats` | **MIGRATE-TO-USER** | data-layer |
| `clinic/app/api/doctor/profile/route.ts` | 15 | `doctor-profile-get` | **MIGRATE-TO-USER** | page |
| `clinic/app/api/doctor/profile/route.ts` | 45 | `doctor-profile-update` | **MIGRATE-TO-USER** | page |
| `lib/api/handlers/doctor/settings/handler.ts` | 14 | `doctor-settings` | **MIGRATE-TO-USER** | handler |
| `lib/api/handlers/doctor/settings/handler.ts` | 58 | `doctor-settings` | **MIGRATE-TO-USER** | handler |
| `clinic/app/api/doctor/stats/route.ts` | 29 | `doctor-stats` | **MIGRATE-TO-USER** | page |
| `lib/analytics/doctor-stats.ts` | 170 | `doctor-stats-events` | **MIGRATE-TO-USER** | data-layer |
| `lib/analytics/doctor-stats.ts` | 195 | `doctor-stats-notes` | **MIGRATE-TO-USER** | data-layer |
| `lib/data/messaging-consent.ts` | 68 | `effective-messaging-consent-list` | **MIGRATE-TO-USER** | data-layer |
| `lib/data/messaging-consent.ts` | 40 | `effective-messaging-consent-read` | **MIGRATE-TO-USER** | data-layer |
| `clinic/app/api/frontdesk/doctors/fees/route.ts` | 29 | `fee-lookup` | **MIGRATE-TO-USER** | page |
| `clinic/app/api/frontdesk/doctors/fees/route.ts` | 112 | `fee-update` | **MIGRATE-TO-USER** | page |
| `lib/api/handlers/frontdesk/checkin/handler.ts` | 172 | `first-visit-sms-invitation` | **INVESTIGATE** | handler |
| `clinic/app/api/frontdesk/invite/route.ts` | 14 | `frontdesk-invite` | **INVESTIGATE** | page |
| `clinic/app/api/frontdesk/invite/route.ts` | 69 | `frontdesk-invite-action` | **INVESTIGATE** | page |
| `clinic/app/(frontdesk)/layout.tsx` | 27 | `frontdesk-layout` | **MIGRATE-TO-USER** | page |
| `clinic/app/api/frontdesk/profile/route.ts` | 43 | `frontdesk-profile` | **MIGRATE-TO-USER** | page |
| `clinic/app/api/frontdesk/profile/route.ts` | 106 | `frontdesk-profile-update` | **MIGRATE-TO-USER** | page |
| `lib/data/frontdesk.ts` | 760 | `gap-aware-schedule` | **MIGRATE-TO-USER** | data-layer |
| `lib/data/appointments.ts` | 78 | `get-appointment` | **MIGRATE-TO-USER** | data-layer |
| `lib/data/appointments.ts` | 31 | `get-today-appointments` | **MIGRATE-TO-USER** | data-layer |
| `lib/data/global-patients.ts` | 75 | `global-patients-lookup` | **SECURITY-DEFINER** | data-layer |
| `lib/data/global-patients.ts` | 103 | `global-patients-lookup` | **SECURITY-DEFINER** | data-layer |
| `lib/data/identity-resolution.ts` | 108 | `identity-resolution-create` | **INVESTIGATE** | data-layer |
| `lib/data/identity-resolution.ts` | 199 | `identity-resolution-legacy` | **INVESTIGATE** | data-layer |
| `lib/utils/invite-code.ts` | 24 | `invite-code-gen` | **KEEP-ADMIN** | data-layer |
| `lib/api/handlers/clinic/invite-code/handler.ts` | 21 | `invite-code-get` | **KEEP-ADMIN** | handler |
| `lib/api/handlers/clinic/invite-code/handler.ts` | 65 | `invite-code-regen` | **KEEP-ADMIN** | handler |
| `lib/data/lab-results.ts` | 190 | `lab-results` | **MIGRATE-TO-USER** | data-layer |
| `lib/data/lab-results.ts` | 234 | `lab-results` | **MIGRATE-TO-USER** | data-layer |
| `lib/data/lab-results.ts` | 268 | `lab-results` | **MIGRATE-TO-USER** | data-layer |
| `lib/data/lab-results.ts` | 290 | `lab-results` | **MIGRATE-TO-USER** | data-layer |
| `lib/data/lab-results.ts` | 310 | `lab-results` | **MIGRATE-TO-USER** | data-layer |
| `lib/data/memberships.ts` | 17 | `memberships` | **MIGRATE-TO-USER** | data-layer |
| `lib/data/memberships.ts` | 39 | `memberships` | **MIGRATE-TO-USER** | data-layer |
| `lib/data/memberships.ts` | 58 | `memberships` | **MIGRATE-TO-USER** | data-layer |
| `lib/data/memberships.ts` | 72 | `memberships` | **MIGRATE-TO-USER** | data-layer |
| `lib/data/memberships.ts` | 86 | `memberships` | **MIGRATE-TO-USER** | data-layer |
| `lib/data/messaging-consent.ts` | 243 | `messaging-consent-check` | **MIGRATE-TO-USER** | data-layer |
| `lib/data/messaging-consent.ts` | 99 | `messaging-reconsent-decision` | **MIGRATE-TO-USER** | data-layer |
| `clinic/app/api/doctor/notifications/route.ts` | 18 | `notifications` | **MIGRATE-TO-USER** | page |
| `clinic/app/api/doctor/notifications/route.ts` | 76 | `notifications` | **MIGRATE-TO-USER** | page |
| `lib/notifications/create.ts` | 101 | `notifications-bulk` | **KEEP-ADMIN** | data-layer |
| `clinic/app/(doctor)/doctor/dashboard/page.tsx` | 40 | `notifications-count` | **KEEP-ADMIN** | page |
| `lib/notifications/create.ts` | 63 | `notifications-create` | **KEEP-ADMIN** | data-layer |
| `lib/auth/otp.ts` | 26 | `otp-create` | **KEEP-ADMIN** | auth |
| `lib/auth/otp.ts` | 90 | `otp-verify` | **KEEP-ADMIN** | auth |
| `lib/api/handlers/auth/verify-otp/handler.ts` | 57 | `otp-verify-token` | **KEEP-ADMIN** | handler |
| `lib/api/handlers/auth/reset-password/handler.ts` | 68 | `password-reset` | **KEEP-ADMIN** | handler |
| `lib/api/handlers/doctor/appointments/handler.ts` | 24 | `patient-appointments` | **MIGRATE-TO-USER** | handler |
| `lib/api/handlers/patient/appointments/handler.ts` | 10 | `patient-appointments` | **MIGRATE-TO-USER** | handler |
| `lib/data/patient-clinic-records.ts` | 59 | `patient-clinic-records-find` | **MIGRATE-TO-USER** | data-layer |
| `lib/data/patient-clinic-records.ts` | 183 | `patient-clinic-records-list-clinic` | **MIGRATE-TO-USER** | data-layer |
| `lib/data/patient-clinic-records.ts` | 154 | `patient-clinic-records-list-global` | **MIGRATE-TO-USER** | data-layer |
| `lib/data/patient-clinic-records.ts` | 100 | `patient-clinic-records-upsert` | **MIGRATE-TO-USER** | data-layer |
| `lib/api/handlers/patient/my-code/handler.ts` | 13 | `patient-code` | **SECURITY-DEFINER** | handler |
| `lib/api/handlers/patient/my-code/handler.ts` | 41 | `patient-code` | **SECURITY-DEFINER** | handler |
| `lib/api/handlers/patient/messages/conversations/handler.ts` | 12 | `patient-conversations-with-doctors` | **MIGRATE-TO-USER** | handler |
| `lib/api/handlers/doctor/patients/create/handler.ts` | 81 | `patient-create-clinic` | **MIGRATE-TO-USER** | handler |
| `lib/api/handlers/clinical/notes/handler.ts` | 28 | `patient-dedup` | **SECURITY-DEFINER** | handler |
| `lib/data/patient-dedup.ts` | 91 | `patient-dedup` | **SECURITY-DEFINER** | data-layer |
| `lib/data/patient-dedup.ts` | 217 | `patient-dedup` | **SECURITY-DEFINER** | data-layer |
| `lib/data/patient-dedup.ts` | 303 | `patient-dedup` | **SECURITY-DEFINER** | data-layer |
| `lib/api/handlers/doctor/patients/[id]/handler.ts` | 14 | `patient-details` | **MIGRATE-TO-USER** | handler |
| `lib/data/messaging-consent.ts` | 197 | `patient-messaging-conversation` | **MIGRATE-TO-USER** | data-layer |
| `lib/data/messaging-consent.ts` | 158 | `patient-messaging-eligibility` | **MIGRATE-TO-USER** | data-layer |
| `lib/data/patients.ts` | 206 | `patient-onboarding` | **KEEP-ADMIN** | data-layer |
| `lib/data/patients.ts` | 454 | `patient-onboarding` | **KEEP-ADMIN** | data-layer |
| `lib/data/patients.ts` | 754 | `patient-onboarding` | **KEEP-ADMIN** | data-layer |
| `lib/api/handlers/patient/prescriptions/handler.ts` | 23 | `patient-prescriptions` | **MIGRATE-TO-USER** | handler |
| `lib/api/handlers/doctor/imaging-orders/handler.ts` | 189 | `patient-privacy-checks` | **MIGRATE-TO-USER** | handler |
| `lib/api/handlers/doctor/imaging-orders/handler.ts` | 240 | `patient-privacy-checks` | **MIGRATE-TO-USER** | handler |
| `lib/api/handlers/doctor/patients/handler.ts` | 14 | `patient-privacy-checks` | **MIGRATE-TO-USER** | handler |
| `lib/api/handlers/doctors/list/handler.ts` | 45 | `patient-privacy-checks` | **MIGRATE-TO-USER** | handler |
| `lib/data/clinical-notes.ts` | 228 | `patient-privacy-checks` | **MIGRATE-TO-USER** | data-layer |
| `lib/data/frontdesk-scope.ts` | 14 | `patient-privacy-checks` | **MIGRATE-TO-USER** | data-layer |
| `lib/data/frontdesk-scope.ts` | 42 | `patient-privacy-checks` | **MIGRATE-TO-USER** | data-layer |
| `lib/data/frontdesk-scope.ts` | 80 | `patient-privacy-checks` | **MIGRATE-TO-USER** | data-layer |
| `lib/data/frontdesk.ts` | 214 | `patient-privacy-checks` | **MIGRATE-TO-USER** | data-layer |
| `lib/data/patients.ts` | 103 | `patient-privacy-checks` | **MIGRATE-TO-USER** | data-layer |
| `lib/data/patients.ts` | 141 | `patient-privacy-checks` | **MIGRATE-TO-USER** | data-layer |
| `lib/data/patients.ts` | 814 | `patient-privacy-checks` | **MIGRATE-TO-USER** | data-layer |
| `lib/data/patients.ts` | 873 | `patient-privacy-checks` | **MIGRATE-TO-USER** | data-layer |
| `lib/data/patients.ts` | 988 | `patient-privacy-checks` | **MIGRATE-TO-USER** | data-layer |
| `lib/api/handlers/patient/privacy-code/handler.ts` | 33 | `patient-privacy-code-get` | **INVESTIGATE** | handler |
| `lib/api/handlers/patient/privacy-code-regenerate/handler.ts` | 38 | `patient-privacy-code-regenerate` | **INVESTIGATE** | handler |
| `patient/app/(patient)/patient/privacy/page.tsx` | 28 | `patient-privacy-page-server` | **MIGRATE-TO-USER** | page |
| `lib/api/handlers/patient/messaging-reconsent/handler.ts` | 27 | `patient-reconsent-list` | **MIGRATE-TO-USER** | handler |
| `lib/api/handlers/patient/messaging-reconsent/handler.ts` | 88 | `patient-reconsent-record` | **MIGRATE-TO-USER** | handler |
| `lib/api/handlers/doctor/patients/search/handler.ts` | 26 | `patient-search-access` | **MIGRATE-TO-USER** | handler |
| `lib/data/patient-shares.ts` | 332 | `patient-shares-auto-renew` | **MIGRATE-TO-USER** | data-layer |
| `lib/data/patient-shares.ts` | 136 | `patient-shares-create` | **MIGRATE-TO-USER** | data-layer |
| `lib/data/patient-shares.ts` | 446 | `patient-shares-cron-expiring` | **KEEP-ADMIN** | data-layer |
| `lib/data/patient-shares.ts` | 276 | `patient-shares-extend` | **MIGRATE-TO-USER** | data-layer |
| `lib/data/patient-shares.ts` | 418 | `patient-shares-list-grantee` | **MIGRATE-TO-USER** | data-layer |
| `lib/data/patient-shares.ts` | 391 | `patient-shares-list-patient` | **MIGRATE-TO-USER** | data-layer |
| `lib/data/patient-shares.ts` | 471 | `patient-shares-mark-notified` | **MIGRATE-TO-USER** | data-layer |
| `lib/data/patient-shares.ts` | 364 | `patient-shares-read` | **MIGRATE-TO-USER** | data-layer |
| `lib/data/patient-shares.ts` | 299 | `patient-shares-revoke` | **MIGRATE-TO-USER** | data-layer |
| `lib/api/handlers/patient/sharing/handler.ts` | 33 | `patient-sharing` | **MIGRATE-TO-USER** | handler |
| `lib/api/handlers/patient/sharing/handler.ts` | 149 | `patient-sharing` | **MIGRATE-TO-USER** | handler |
| `lib/api/handlers/patient/sharing/extend-handler.ts` | 48 | `patient-sharing-extend-authz` | **MIGRATE-TO-USER** | handler |
| `lib/api/handlers/patient/sharing/revoke-handler.ts` | 50 | `patient-sharing-revoke-authz` | **MIGRATE-TO-USER** | handler |
| `clinic/app/api/clinical/patient-summary/route.ts` | 38 | `patient-summary` | **MIGRATE-TO-USER** | page |
| `lib/api/handlers/patient/visits/handler.ts` | 10 | `patient-visits` | **MIGRATE-TO-USER** | handler |
| `clinic/app/api/doctor/personalized-chips/route.ts` | 53 | `personalized-chips` | **MIGRATE-TO-USER** | page |
| `lib/data/phone-changes.ts` | 761 | `phone-change-cancel` | **KEEP-ADMIN** | data-layer |
| `lib/data/phone-changes.ts` | 612 | `phone-change-commit` | **KEEP-ADMIN** | data-layer |
| `lib/data/phone-changes.ts` | 818 | `phone-change-fallback` | **KEEP-ADMIN** | data-layer |
| `lib/data/phone-changes.ts` | 921 | `phone-change-fallback` | **KEEP-ADMIN** | data-layer |
| `lib/data/phone-changes.ts` | 958 | `phone-change-fallback` | **KEEP-ADMIN** | data-layer |
| `lib/data/phone-changes.ts` | 1095 | `phone-change-owner-approve` | **KEEP-ADMIN** | data-layer |
| `lib/data/phone-changes.ts` | 997 | `phone-change-owner-inbox-read` | **KEEP-ADMIN** | data-layer |
| `lib/data/phone-changes.ts` | 1169 | `phone-change-owner-reject` | **KEEP-ADMIN** | data-layer |
| `lib/api/handlers/auth/change-phone/request/handler.ts` | 98 | `phone-change-request` | **KEEP-ADMIN** | handler |
| `lib/api/handlers/auth/change-phone/request/handler.ts` | 136 | `phone-change-request` | **KEEP-ADMIN** | handler |
| `lib/data/phone-changes.ts` | 110 | `phone-change-request` | **KEEP-ADMIN** | data-layer |
| `lib/data/phone-changes.ts` | 133 | `phone-change-request` | **KEEP-ADMIN** | data-layer |
| `lib/data/phone-changes.ts` | 151 | `phone-change-request` | **KEEP-ADMIN** | data-layer |
| `lib/data/phone-changes.ts` | 178 | `phone-change-request` | **KEEP-ADMIN** | data-layer |
| `lib/data/phone-changes.ts` | 226 | `phone-change-request` | **KEEP-ADMIN** | data-layer |
| `lib/data/phone-changes.ts` | 274 | `phone-change-request` | **KEEP-ADMIN** | data-layer |
| `lib/api/handlers/auth/change-phone/verify/handler.ts` | 82 | `phone-change-verify` | **KEEP-ADMIN** | handler |
| `lib/data/phone-changes.ts` | 465 | `phone-change-verify` | **KEEP-ADMIN** | data-layer |
| `lib/api/handlers/frontdesk/patients/[id]/phone-correction/handler.ts` | 87 | `phone-correction` | **INVESTIGATE** | handler |
| `lib/data/phone-changes.ts` | 1261 | `phone-correction` | **INVESTIGATE** | data-layer |
| `lib/api/handlers/clinical/prescription/handler.ts` | 73 | `prescription-fetch` | **INVESTIGATE** | handler |
| `lib/sms/prescription-sms.ts` | 239 | `prescription-sms` | **KEEP-ADMIN** | cron |
| `lib/api/handlers/clinical/notes/handler.ts` | 193 | `prescription-sms-lookup` | **KEEP-ADMIN** | handler |
| `lib/api/handlers/clinical/prescription-pdf/handler.ts` | 419 | `prescription-sync` | **MIGRATE-TO-USER** | handler |
| `lib/data/prescription-sync.ts` | 57 | `prescription-sync` | **MIGRATE-TO-USER** | data-layer |
| `lib/data/prescription-sync.ts` | 104 | `prescription-sync` | **MIGRATE-TO-USER** | data-layer |
| `lib/data/prescription-sync.ts` | 151 | `prescription-sync` | **MIGRATE-TO-USER** | data-layer |
| `lib/data/prescription-sync.ts` | 200 | `prescription-sync` | **MIGRATE-TO-USER** | data-layer |
| `lib/data/prescription-sync.ts` | 224 | `prescription-sync` | **MIGRATE-TO-USER** | data-layer |
| `clinic/app/api/doctor/prescriptions/route.ts` | 11 | `prescriptions-list` | **INVESTIGATE** | page |
| `lib/data/privacy-codes.ts` | 285 | `privacy-code-exists-check` | **INVESTIGATE** | data-layer |
| `lib/api/handlers/doctor/public-fee/handler.ts` | 23 | `public-fee` | **MIGRATE-TO-USER** | handler |
| `clinic/app/api/frontdesk/queue/reorder/route.ts` | 26 | `queue-reorder` | **MIGRATE-TO-USER** | page |
| `lib/data/frontdesk.ts` | 237 | `queue-with-patient-names` | **MIGRATE-TO-USER** | data-layer |
| `lib/security/rate-limit.ts` | 30 | `rate-limit` | **KEEP-ADMIN** | data-layer |
| `lib/data/privacy-codes.ts` | 253 | `regenerate-privacy-code-service` | **INVESTIGATE** | data-layer |
| `lib/privacy/schema-health.ts` | 39 | `schema-health-check` | **KEEP-ADMIN** | security |
| `lib/api/handlers/clinical/notes/handler.ts` | 164 | `session-appointment-completion` | **MIGRATE-TO-USER** | handler |
| `lib/api/handlers/clinical/notes/handler.ts` | 131 | `session-queue-completion` | **MIGRATE-TO-USER** | handler |
| `lib/api/handlers/clinic/settings/handler.ts` | 26 | `settings-owner-check` | **INVESTIGATE** | handler |
| `lib/sms/reminder-service.ts` | 31 | `sms-reminders` | **KEEP-ADMIN** | cron |
| `lib/sms/reminder-service.ts` | 60 | `sms-reminders` | **KEEP-ADMIN** | cron |
| `lib/data/privacy-codes.ts` | 321 | `sms-share-dispatcher` | **INVESTIGATE** | data-layer |
| `clinic/app/api/patients/upgrade-relationship/route.ts` | 44 | `upgrade-relationship` | **INVESTIGATE** | page |
| `clinic/app/api/frontdesk/appointments/urgent/route.ts` | 37 | `urgent-booking` | **INVESTIGATE** | page |
| `lib/data/users.ts` | 45 | `user-registration` | **KEEP-ADMIN** | data-layer |
| `lib/data/users.ts` | 78 | `user-registration` | **KEEP-ADMIN** | data-layer |
| `lib/data/users.ts` | 159 | `user-registration` | **KEEP-ADMIN** | data-layer |
| `lib/data/users.ts` | 190 | `user-registration` | **KEEP-ADMIN** | data-layer |
| `lib/data/users.ts` | 328 | `user-registration` | **KEEP-ADMIN** | data-layer |
| `lib/data/users.ts` | 362 | `user-registration` | **KEEP-ADMIN** | data-layer |
| `lib/api/handlers/patients/verify-privacy-code/handler.ts` | 176 | `verify-privacy-code-grantor-lookup` | **KEEP-ADMIN** | handler |
| `lib/api/handlers/patients/verify-privacy-code/handler.ts` | 138 | `verify-privacy-code-patient-lookup` | **KEEP-ADMIN** | handler |
| `lib/api/handlers/patients/verify-sms-code/handler.ts` | 121 | `verify-sms-code-grantor-lookup` | **KEEP-ADMIN** | handler |
| `lib/api/handlers/patients/verify-sms-code/handler.ts` | 93 | `verify-sms-code-patient-lookup` | **KEEP-ADMIN** | handler |
| `lib/data/visibility.ts` | 29 | `visibility` | **MIGRATE-TO-USER** | data-layer |
| `lib/data/visibility.ts` | 81 | `visibility` | **MIGRATE-TO-USER** | data-layer |
| `lib/data/visibility.ts` | 109 | `visibility` | **MIGRATE-TO-USER** | data-layer |
| `lib/data/visibility.ts` | 133 | `visibility` | **MIGRATE-TO-USER** | data-layer |
| `lib/data/visibility.ts` | 153 | `visibility` | **MIGRATE-TO-USER** | data-layer |
| `lib/data/visibility.ts` | 184 | `visibility` | **MIGRATE-TO-USER** | data-layer |
| `lib/data/visibility.ts` | 213 | `visibility` | **MIGRATE-TO-USER** | data-layer |
| `lib/api/handlers/clinic/patient-visibility/handler.ts` | 37 | `visibility-names` | **INVESTIGATE** | handler |
| `lib/data/frontdesk.ts` | 346 | `window-aware-checkin` | **INVESTIGATE** | data-layer |

## MIGRATE-TO-USER by directory

- **apps/clinic** (15 callsites): clinic-leave, clinic-membership-revoke, doctor-profile-get, doctor-profile-update, doctor-stats, fee-lookup, fee-update, frontdesk-layout, frontdesk-profile, frontdesk-profile-update, notifications, patient-summary, personalized-chips, queue-reorder
- **apps/patient** (1 callsites): patient-privacy-page-server
- **packages/** (103 callsites): assign-walkin-slot, available-slots-gap-aware, clinic-context, clinic-invite, clinic-join, clinic-settings-patch, clinic-staff, clinical-notes-clinic, complete-queue-session, conversations-with-patient-names, create-shares-for-grantors, doctor-appointments, doctor-conversation-create, doctor-income-stats, doctor-settings, doctor-stats-events, doctor-stats-notes, effective-messaging-consent-list, effective-messaging-consent-read, gap-aware-schedule, get-appointment, get-today-appointments, lab-results, memberships, messaging-consent-check, messaging-reconsent-decision, patient-appointments, patient-clinic-records-find, patient-clinic-records-list-clinic, patient-clinic-records-list-global, patient-clinic-records-upsert, patient-conversations-with-doctors, patient-create-clinic, patient-details, patient-messaging-conversation, patient-messaging-eligibility, patient-prescriptions, patient-privacy-checks, patient-reconsent-list, patient-reconsent-record, patient-search-access, patient-shares-auto-renew, patient-shares-create, patient-shares-extend, patient-shares-list-grantee, patient-shares-list-patient, patient-shares-mark-notified, patient-shares-read, patient-shares-revoke, patient-sharing, patient-sharing-extend-authz, patient-sharing-revoke-authz, patient-visits, prescription-sync, public-fee, queue-with-patient-names, session-appointment-completion, session-queue-completion, visibility

## SECURITY-DEFINER candidates (Phase B follow-up)

These scopes represent operations that should move into stored functions with SECURITY DEFINER, 
so the callsite can use `createClient()` (user context) instead of `createAdminClient()`. 
The RPC itself would perform the bypass transparently.

- **global-patients-lookup** (2 callsites)
  - Example: `lib/data/global-patients.ts:75`
- **patient-code** (2 callsites)
  - Example: `lib/api/handlers/patient/my-code/handler.ts:13`
- **patient-dedup** (4 callsites)
  - Example: `lib/api/handlers/clinical/notes/handler.ts:28`

## Key findings

1. **Default scope risk:** 3 callsites with no scope arg (`createAdminClient()`) — all in invoice routes. These default to 'api-route' but lack audit trail. Recommend scoping all three:
   - `apps/clinic/app/api/frontdesk/invoice/[paymentId]/route.ts:23` (GET)
   - `apps/clinic/app/api/frontdesk/invoice/[paymentId]/route.ts:179` (POST sms_sent)
   - `apps/clinic/app/api/public/invoice/[paymentId]/route.ts:19` (GET public)

2. **MIGRATE concentration:** 119 callsites (57% of total) depend on RLS policies. Largest scopes: patient-privacy-checks (14), clinic-context (7), visibility (7), prescription-sync (6), lab-results (5).

3. **SECURITY-DEFINER pattern:** 8 callsites (patient-dedup, global-patients-lookup, patient-code) are lookups that should be public RPCs, not admin clients at the callsite. Blocks cross-doctor deduping, pre-auth phone validation, and code verification workflows.

4. **Phone-change flow:** 11 callsites across request/verify/commit/cancel/owner-approve/owner-reject. All correctly tagged KEEP-ADMIN because the flow operates without a valid session for the new phone.

5. **INVESTIGATE ambiguity:** 23 callsites with unclear scope names require per-file review. Key patterns: identity-resolution (2), patient-privacy-code-* (2), frontdesk-invite-* (2), phone-correction (2), window-aware-checkin (1).

## Top 5 MIGRATE-TO-USER scopes (Phase B/C dependency)

- **patient-privacy-checks** (14 callsites) — dependency for doctor/clinic patient-data reads
- **clinic-context** (7 callsites) — dependency for doctor/clinic patient-data reads
- **visibility** (7 callsites) — dependency for doctor/clinic patient-data reads
- **prescription-sync** (6 callsites) — dependency for doctor/clinic patient-data reads
- **lab-results** (5 callsites) — dependency for doctor/clinic patient-data reads

---
*End of Phase A.2 triage report.*