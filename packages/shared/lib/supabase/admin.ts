import { createClient } from '@supabase/supabase-js'

/**
 * Allow-list of admin scope strings — every `createAdminClient(scope)` callsite
 * must pass a string literal that appears below. Static-string discipline is
 * enforced at commit time by `eslint-rules/no-unregistered-admin-scope.js`
 * (Phase F Task 20, 2026-05-09; D-008 Amendment 2026-05-09). Adding a new
 * scope: add it to the appropriate group here in the same commit that adds
 * the callsite, OR the eslint rule fails the commit.
 *
 * Grouping is by feature/build affinity for readability, NOT by access policy
 * (the runtime check is just `Set.has(scope)` regardless of group).
 *
 * Roadmap (D-008 Amendment 2026-05-08 Option D, Phase 3): replace this Set
 * with a `type AdminScope = 'auth-login-lookup' | ...` literal union and drop
 * the runtime check. Compile-time + commit-time + Lesson #17's `next build`
 * gate will be the three layers; the runtime warning becomes redundant.
 */
const ALLOWED_ADMIN_SCOPES = new Set([
  // ── Core / legacy auth + admin ───────────────────────────────────────────
  'api-route',                       // default scope (createAdminClient() with no arg)
  'auth-login-lookup',
  'otp-create',
  'otp-verify',
  'patient-onboarding',
  'patient-privacy-checks',
  'schema-health-check',
  'rate-limit',
  'clinic-join',
  'clinic-registration',
  'patient-details',
  'patient-visits',
  'patient-appointments',
  'doctor-appointments',
  'prescription-sync',
  'patient-dedup',
  'audit-log',
  'sms-reminders',
  'lab-results',
  'user-registration',

  // ── Auth & session helpers ───────────────────────────────────────────────
  'auth-assignments',                // SELECT visit assignments under session.ts
  'auth-clinic-role',                // SELECT clinic_memberships.role under session.ts
  'auth-memberships',                // SELECT user clinic memberships under session.ts
  'otp-verify-token',                // verify-otp handler token-checking path
  'password-reset',                  // reset-password handler

  // ── Phone-change v2 (PR-2 / Phase B) — see PHONE_CHANGE_PLAN.md §6.2 ─────
  'phone-change-request',            // INSERT phone_change_requests + otp_codes
  'phone-change-verify',             // verify OTP + UPDATE phone_change_requests.status
  'phone-change-commit',             // SQL change_phone_commit RPC + auth.admin.updateUserById
  'phone-change-cancel',             // UPDATE phone_change_requests.status='cancelled'
  'phone-change-fallback',           // UPDATE method='sms_new_only' + INSERT account_recovery_requests
  'phone-change-owner-inbox-read',   // SELECT JOIN requests/users/patients/memberships
  'phone-change-owner-approve',      // same surface as commit
  'phone-change-owner-reject',       // UPDATE phone_change_requests.status='rejected'
  'phone-correction',                // UPDATE patients + INSERT phone_corrections + history (Phase C)

  // ── Global patient identity (mig 072 / Build prompt 02) ──────────────────
  'global-patients-lookup',          // SELECT global_patients by id / normalized_phone
  'identity-resolution-create',      // identity_resolution.ts: create resolution
  'identity-resolution-legacy',      // identity_resolution.ts: legacy fallback
  'memberships',                     // memberships.ts data layer

  // ── Patient sharing lifecycle (mig 090 / Build 05 § B7 — D-068) ──────────
  'auto-renew-on-visit-gpid-lookup', // SELECT patients.global_patient_id during fire-and-forget auto-renew block in frontdesk check-in
  'create-shares-for-grantors',      // mig 091 atomic helper
  'cron-expire-stale-shares',        // cron handler
  'patient-shares-auto-renew',       // share renewal RPC inside autoRenewOnVisit
  'patient-shares-create',
  'patient-shares-cron-expiring',
  'patient-shares-extend',
  'patient-shares-list-grantee',
  'patient-shares-list-patient',
  'patient-shares-mark-notified',
  'patient-shares-read',
  'patient-shares-revoke',
  'patient-sharing',                 // sharing handler
  'patient-sharing-extend-authz',    // extend-handler authz step
  'patient-sharing-revoke-authz',    // revoke-handler authz step
  'verify-privacy-code-grantor-lookup', // grantor share-by-privacy-code path
  'verify-privacy-code-patient-lookup', // patient share-by-privacy-code path
  'verify-sms-code-grantor-lookup',     // grantor share-by-sms path
  'verify-sms-code-patient-lookup',     // patient share-by-sms path

  // ── Privacy codes (mig 085-087) ──────────────────────────────────────────
  'privacy-code-exists-check',
  'regenerate-privacy-code-service',
  'sms-share-dispatcher',
  'patient-privacy-code-get',
  'patient-privacy-code-regenerate',
  'patient-privacy-page-server',     // server-component privacy page

  // ── Patient data + PCR layer ─────────────────────────────────────────────
  'patient-code',                    // legacy patient_code path (Phase F Task 2 retirement queued)
  'patient-clinic-records-find',
  'patient-clinic-records-list-clinic',
  'patient-clinic-records-list-global',
  'patient-clinic-records-upsert',
  'patient-conversations-with-doctors',
  'patient-create-clinic',           // doctor-side handler that creates patients in clinic
  'patient-messaging-conversation',
  'patient-messaging-eligibility',
  'patient-prescriptions',
  'patient-reconsent-list',
  'patient-reconsent-record',
  'patient-search-access',           // doctor-side patient search authz
  'patient-summary',
  'upgrade-relationship',            // patient/clinic relationship upgrade

  // ── Clinic operations ────────────────────────────────────────────────────
  'clinic-context',                  // clinic_context.ts
  'clinic-invite',
  'clinic-leave',
  'clinic-membership-revoke',
  'clinic-settings-patch',
  'clinic-staff',
  'invite-code-gen',
  'invite-code-get',
  'invite-code-regen',
  'settings-owner-check',
  'visibility',                      // visibility.ts data layer
  'visibility-names',                // visibility-names handler

  // ── Frontdesk operations ─────────────────────────────────────────────────
  'assign-walkin-slot',
  'available-slots-gap-aware',
  'complete-queue-session',
  'fee-lookup',
  'fee-update',
  'first-visit-sms-invitation',      // mig 090 sharing: first-visit SMS dispatch
  'frontdesk-invite',
  'frontdesk-invite-action',
  'frontdesk-layout',                // server-component layout
  'frontdesk-profile',
  'frontdesk-profile-update',
  'gap-aware-schedule',
  'queue-reorder',
  'queue-with-patient-names',
  'urgent-booking',
  'window-aware-checkin',

  // ── Doctor surfaces ──────────────────────────────────────────────────────
  'conversations-with-patient-names',
  'doctor-conversation-create',
  'doctor-income-stats',
  'doctor-profile-get',
  'doctor-profile-update',
  'doctor-settings',
  'doctor-stats',
  'doctor-stats-events',
  'doctor-stats-notes',
  'personalized-chips',
  'prescriptions-list',
  'public-fee',

  // ── Messaging consent (Build 04) ─────────────────────────────────────────
  'effective-messaging-consent-list',
  'effective-messaging-consent-read',
  'messaging-consent-check',
  'messaging-reconsent-decision',

  // ── Notifications ────────────────────────────────────────────────────────
  'notifications',
  'notifications-bulk',
  'notifications-count',
  'notifications-create',

  // ── Prescriptions (clinical) ─────────────────────────────────────────────
  'prescription-fetch',
  'prescription-sms',
  'prescription-sms-lookup',

  // ── Appointments ─────────────────────────────────────────────────────────
  'get-appointment',
  'get-today-appointments',

  // ── Clinical sessions / notes ────────────────────────────────────────────
  'clinical-notes-clinic',
  'session-appointment-completion',
  'session-queue-completion',

  // ── Audit ────────────────────────────────────────────────────────────────
  'audit-logging',
  'audit-read',

  // ── Dependent accounts (B07 Phase C — Pattern A child linkage) ──────────
  'dependents-create',                  // createMinorGlobalPatient
  'dependents-list-by-guardian',        // listDependentsByGuardian
  'dependents-get',                     // getDependent
  'dependents-transfer-guardian',       // transferGuardianship
  'global-patients-guardian-lookup',    // getGuardianGlobalPatient

  // ── Patient delegations (B07 Phase C — Pattern B adult delegation) ──────
  'delegations-grant',                  // grantDelegation (principal grants)
  'delegations-accept',                 // acceptDelegation (delegate accepts)
  'delegations-revoke',                 // revokeDelegation (principal or delegate)
  'delegations-update-capabilities',    // updateDelegationCapabilities
  'delegations-list-granted',           // listGrantedDelegations (outgoing)
  'delegations-list-received',          // listReceivedDelegations (incoming)
  'delegations-expire-stale',           // expireStaleDelegations (cron-callable)

  // ── B07 Phase E API surface (authority helpers + endpoint handlers) ─────
  'authority-resolve',                  // requireAuthorityOver: 3-query OR-of-three
  'authority-capability',               // requireCapability: delegated_capability_includes RPC
  'dependents-register-resolve-gp',     // POST /api/patient/dependents/register: caller's claimed gp
  'delegations-create-resolve-principal', // POST /api/patient/delegations: caller's principal gp
  'delegations-revoke-discriminate',    // PATCH /api/patient/delegations/[id]/revoke: read-before-write
  'cron-expire-stale-delegations',      // cron handler (Phase E expire-stale-delegations)

  // ── B07 Phase F.5 API surface (cross-context extensions + new endpoints) ─
  'patient-context-resolve',            // resolvePatientContext: gp→claimed_user_id mapping
  'patient-lookup-by-phone',            // POST /api/patient/lookup-by-phone (Section 2)
  'dependents-update-minor-profile',    // updateMinorProfile data-layer (Section 3)
  // Cross-context endpoint extensions — each handler now uses admin client
  // throughout per Decision 5 (handler-layer authority gate replaces RLS).
  'patient-records',                    // GET /api/patient/records
  'patient-records-create',             // POST /api/patient/records
  'patient-vitals',                     // GET /api/patient/vitals
  'patient-immunizations',              // GET /api/patient/immunizations
  'patient-immunizations-create',       // POST /api/patient/immunizations
  'patient-conditions',                 // GET /api/patient/conditions
  'patient-conditions-create',          // POST /api/patient/conditions
  'patient-allergies',                  // GET /api/patient/allergies
  'patient-allergies-create',           // POST /api/patient/allergies
  'patient-diary',                      // GET /api/patient/diary
  'patient-diary-create',               // POST /api/patient/diary
  'patient-medications',                // GET /api/patient/medications
  'patient-medications-create',         // POST /api/patient/medications
  'patient-medications-delete',         // DELETE /api/patient/medications/[id]
  'patient-medications-update',         // PATCH /api/patient/medications/[id]
  'patient-medication-intake',          // GET /api/patient/medication-intake
  'patient-medication-intake-save',     // POST /api/patient/medication-intake
  'patient-lab-results-fallback',       // legacy lab_orders fallback in lab-results handler
  'patient-health-summary',             // GET /api/patient/health-summary (6-table aggregator)
  'patient-messages',                   // GET /api/patient/messages
  'patient-messages-send',              // POST /api/patient/messages
  'patient-conversations',              // GET /api/patient/messages/conversations
  'patient-messages-unread-count',      // GET /api/patient/messages/unread-count
])

export { ALLOWED_ADMIN_SCOPES }

/**
 * Admin client that bypasses Row Level Security (RLS)
 * Used for administrative operations like creating walk-in patients
 * IMPORTANT: Only use this for trusted server-side operations
 *
 * Static-string discipline: every callsite must pass a string LITERAL that
 * appears in `ALLOWED_ADMIN_SCOPES` above. Enforced at commit time by
 * `eslint-rules/no-unregistered-admin-scope.js`. Runtime warning is retained
 * as a defense-in-depth signal during the Phase 2 → Phase 3 transition; it
 * will be removed when Phase 3 (D-008 Amendment 2026-05-08 Option C.1) ships
 * the TypeScript literal-union refactor.
 */
export function createAdminClient(scope: string = 'api-route') {
  if (!ALLOWED_ADMIN_SCOPES.has(scope)) {
    console.warn(`[AdminClient] Unregistered scope: ${scope}`)
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  )
}
