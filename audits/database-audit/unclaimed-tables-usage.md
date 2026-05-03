# Audit Session B — 5 Unclaimed Tables: Usage and Feature Classification

**Captured:** 2026-05-03
**Scope:** the 5 tables that exist on staging with no `CREATE TABLE` migration in the repo (per Session A): `account_recovery_requests`, `audit_log`, `patient_phone_verification_issues`, `phone_corrections`, `sms_reminders`.

## Verdict matrix

| Table | Classification | Reads | Writes | RLS / policies | Reachable UI |
|---|---|---:|---:|---|---|
| `account_recovery_requests` | **ACTIVE FEATURE** | 1 | 1 | RLS on, **0 policies** (service_role only) | Frontdesk / clinic-owner phone-change-request inbox |
| `audit_log` | **ACTIVE FEATURE** (compliance) | 0 | 1 | RLS on, 1 policy (service_role only) | Internal — fire-and-forget logger |
| `patient_phone_verification_issues` | **NO REFERENCES** | 0 | 0 | RLS on, 1 policy (staff SELECT) | None |
| `phone_corrections` | **ACTIVE FEATURE** | 0 | 1 | RLS on, 1 policy (staff ALL) | Frontdesk "fix typo" phone-correction flow |
| `sms_reminders` | **ACTIVE FEATURE** | 0 | 2 | RLS on, 1 policy (service_role only) | Doctor/frontdesk appointment SMS, prescription SMS |

Net: 4 of 5 tables are wired into real product flows. 1 (`patient_phone_verification_issues`) has zero application code references.

---

## 1. `account_recovery_requests`

### Classification: ACTIVE FEATURE — preservation value: HIGH

The owner-inbox UI for phone-change fallback requests reads from this table. Removing it would silently break the frontdesk/owner approval flow for patients who lost their old phone.

### Reads (1 callsite)

#### `packages/shared/lib/data/phone-changes.ts:1055`

Inside `listPendingApprovals()` (or similar — the surrounding function builds the owner-inbox listing). Loads the latest row by `phone_change_request_id` to recover the patient's stated reason:

```
1051:    if (r.patient_id) {
1052:      const { data: arr } = await admin
1053:        .from('account_recovery_requests')
1054:        .select('verification_data')
1055:        .eq('verification_data->>phone_change_request_id', r.id)
1056:        .order('created_at', { ascending: false })
1057:        .limit(1)
1058:        .maybeSingle()
1059:      const vd = (arr as any)?.verification_data
1060:      if (vd && typeof vd === 'object') reason = (vd as any).reason || null
```

Reachable from `packages/shared/lib/api/handlers/clinic/phone-change-requests/handler.ts` (owner-inbox list endpoint).

### Writes (1 callsite)

#### `packages/shared/lib/data/phone-changes.ts:879` (function: `openFallback()` — surrounding code)

Inside the fallback-flow opener (`'sms_new_only'` verification path), after a `phone_change_requests` row is created and an OTP sent to the new phone:

```
875:  if (request.patient_id) {
876:    void admin.from('account_recovery_requests').insert({
877:      claimed_phone: request.old_phone,
878:      claimed_patient_id: request.patient_id,
879:      new_phone: request.new_phone,
880:      status: 'pending',
881:      verification_method: 'sms_new_only',
882:      verification_data: { phone_change_request_id: request.id, reason: input.reason },
883:    })
884:  }
```

Reachable from clinic phone-change request endpoints. Triage tag in admin client: `'phone-change-fallback'` (`packages/shared/lib/supabase/admin.ts:33`).

### Feature description

When a patient loses access to their old phone, the frontdesk opens a fallback request. The request goes through a clinic-owner approval queue. This table backs the queue's record of the patient-stated reason and the link to the underlying `phone_change_requests` row.

### Roles that trigger it

* **frontdesk** writes (when opening a fallback for a patient).
* **clinic owner** reads (in the approval inbox).
* **patient** indirectly — the owner approves/rejects on the patient's behalf.

### RLS

**RLS enabled, ZERO policies.** This means only `service_role` (the admin client) can read or write. The app code uses `createAdminClient('phone-change-fallback')` — writes work. The read in `phone-changes.ts:1052` also uses `admin`. All flows use service_role. No direct authenticated-role access — which is correct for this table's threat model.

### Recommendation

Backfill into a migration as-is. Schema is in active use. Add an explicit "service_role only" policy so the absence of policies isn't ambiguous.

---

## 2. `audit_log`

### Classification: ACTIVE FEATURE (compliance) — preservation value: HIGH

The single insertion point is `auditLog()` in `packages/shared/lib/audit/logger.ts`, called from at least 6 places (admin patient-dedup, patient-dedup data layer, sms reminder service). Fire-and-forget compliance logger.

### Reads

**Zero.** Nothing in the app code reads from `audit_log`. It's a write-only sink.

### Writes (1 callsite)

#### `packages/shared/lib/audit/logger.ts:25`

The full write site (the only one):

```
20:  void (async () => {
21:    try {
22:      const admin = createAdminClient('audit-log')
23:
24:      await admin
25:        .from('audit_log')
26:        .insert({
27:          user_id: params.userId,
28:          user_role: params.userRole,
29:          action: params.action,
30:          resource_type: params.resourceType || null,
31:          resource_id: params.resourceId || null,
32:          details: params.details || null,
33:          ip_address: params.ipAddress || null,
34:          created_at: new Date().toISOString()
35:        })
```

Wrapped in `try/catch` — failures are logged to console and don't propagate.

### Callers of `auditLog()`

* `packages/shared/lib/sms/reminder-service.ts:47` (every SMS sent)
* `packages/shared/lib/api/handlers/admin/patient-dedup/handler.ts:38, 104`
* `packages/shared/lib/data/patient-dedup.ts:189, 277, 332`

### Note: dual audit systems

The codebase ALSO has `audit_events` (a separate, claimed-in-migration-files table) and `logAuditEvent()` (a separate function in `packages/shared/lib/audit/audit-events.ts`, used heavily by the phone-change flow). `audit_log` and `audit_events` are **two distinct systems** with different schemas, different writers, and different consumers.

Architectural smell — Session C may want to consolidate, but that's product work, not audit work. For now: **`audit_log` is alive but parallel to `audit_events`.**

### RLS

RLS enabled, 1 policy: `service_role_audit_log` ALL `auth.role() = 'service_role'`. Service-role writes only. Matches the writer.

### Recommendation

Backfill into a migration. Either consolidate with `audit_events` (product decision) or leave alongside. Schema is in active use today.

---

## 3. `patient_phone_verification_issues`

### Classification: NO REFERENCES — preservation value: LOW

Zero matches in `apps/` or `packages/` for the table name (case-insensitive). Zero `.from('patient_phone_verification_issues')` calls. No insert/select anywhere in the app code.

### Schema present anyway

The table exists on staging with 12 columns and an RLS SELECT policy ("Staff can view phone verification issues" — granted to doctor/frontdesk roles). Likely created during the patient-identity build cycle as scaffolding for a UI that was never wired.

### Possible explanations

1. Authored ahead of a planned UI (the table name suggests a "review issues with patient phone verification" admin surface).
2. Originally written from triggers/SQL functions on staging directly — but the schema audit found no triggers writing to it.
3. Abandoned scaffolding from an early build pass.

### Recommendation

Drop in Session C unless Mo recalls intent for it. Cost of preserving: schema clutter, RLS policy on a dead table. Cost of dropping: nothing, since no app code references it.

---

## 4. `phone_corrections`

### Classification: ACTIVE FEATURE — preservation value: HIGH

The frontdesk "fix typo" phone-correction flow inserts here. Distinct from the OTP-verified phone-change flow (which uses `phone_change_requests`). This is the "we typed it wrong at registration" path.

### Reads

**Zero.** Pure write sink — no app code reads it back.

### Writes (1 callsite)

#### `packages/shared/lib/data/phone-changes.ts:1343` (function: `correctPatientPhone()` — surrounding code)

```
1337:  const oldPhone = (patient as any).phone as string
1338:  ...
1343:  await admin.from('phone_corrections').insert({
1344:    patient_id: input.patientId,
1345:    old_phone: oldPhone,
1346:    new_phone: newPhoneLocal,
1347:    reason: input.reason,
1348:    verification_method: 'frontdesk_no_otp',
1349:    initiated_by: 'frontdesk',
1350:    initiated_by_user_id: input.actorId,
1351:    status: 'completed',
1352:    completed_at: new Date().toISOString(),
1353:  })
```

Triage tag: `'phone-correction'` (`packages/shared/lib/supabase/admin.ts:37`).

### Reachability

`apps/clinic/app/api/frontdesk/patients/[id]/phone-correction/route.ts:3` exports the handler:

```
3: export { PATCH } from '@shared/lib/api/handlers/frontdesk/patients/[id]/phone-correction/handler'
```

Handler at `packages/shared/lib/api/handlers/frontdesk/patients/[id]/phone-correction/handler.ts`. UI strings are present in i18n (`correctPhoneCta`, `correctPhoneTitle`, etc.) — flow is fully built.

### Roles that trigger it

* **frontdesk** writes when fixing a registration typo.
* The flow refuses if the patient is `phone_verified` AND has an `auth.users` row — those go through the OTP change flow instead (`phone-changes.ts:1308`).

### RLS

RLS enabled, 1 policy: `'Staff can manage phone corrections'` ALL — restricted to `users.role IN ('doctor', 'frontdesk')`. Note: this policy reads `public.users.role` to gate access. The query goes through service_role at write time, so the policy is bypassed. Reads (none in app code today) would be staff-gated.

### Recommendation

Backfill into a migration as-is. Active flow, recently shipped (Phase C of phone-changes), explicit triage tag, full UI. Highest preservation priority among the 5.

---

## 5. `sms_reminders`

### Classification: ACTIVE FEATURE — preservation value: HIGH

Two writers: appointment reminder service and prescription SMS sender. Both Twilio-backed. Fire-and-forget logging of every outbound SMS.

### Reads

**Zero in app code.** Pure audit/log sink.

### Writes (2 callsites)

#### `packages/shared/lib/sms/reminder-service.ts:32`

```
32:  await admin.from('sms_reminders').insert({
33:    patient_id: patientId,
34:    appointment_id: appointmentId || null,
35:    clinic_id: clinicId || null,
36:    phone_number: phoneNumber,
37:    message_type: messageType,
38:    message_body: messageBody,
39:    message_body_ar: messages.ar,
40:    status: result.success ? 'sent' : 'failed',
41:    twilio_sid: result.sid || null,
42:    error_message: result.error || null,
43:    sent_at: result.success ? new Date().toISOString() : null,
44:  })
```

Called from `sendReminder()`. `sendReminder` is invoked from at least 5 routes:

* `packages/shared/lib/api/handlers/sms/send/handler.ts:51`
* `packages/shared/lib/api/handlers/doctor/appointments/handler.ts:324`
* `packages/shared/lib/api/handlers/frontdesk/appointments/handler.ts:283`
* `packages/shared/lib/api/handlers/frontdesk/appointments/create/handler.ts:181`
* `packages/shared/lib/api/handlers/frontdesk/checkin/handler.ts:209`

#### `packages/shared/lib/sms/prescription-sms.ts:240`

```
240:    await admin.from('sms_reminders').insert({
241:      patient_id:      patientId,
242:      ...
247:      message_type:    'prescription',
```

Called from `packages/shared/lib/api/handlers/clinical/notes/handler.ts:193+` after a doctor saves a clinical note containing a prescription. Triage tag: `'prescription-sms'`.

### Roles that trigger it

* **doctor** (saving notes with prescriptions; sending direct reminders).
* **frontdesk** (creating appointments, checking patients in, sending direct reminders).

### RLS

RLS enabled, 1 policy: `service_role_sms` ALL `auth.role() = 'service_role'`. Both writers use `createAdminClient`. Matches the writer.

### Recommendation

Backfill into a migration as-is. Active across the entire SMS-touching surface area.

---

## Cross-table observations

### Naming collision — `audit_log` vs `audit_events`

Two distinct compliance-log tables exist with different schemas, different writers, and different consumers. `audit_events` is in the migration tree (created mig 044 / 057) and is heavily used by the phone-change flow. `audit_log` is the unclaimed table here, used by patient-dedup and SMS service. **Session C should flag this for product consolidation.**

### `account_recovery_requests` policy gap

RLS enabled with **zero policies** is a hardening footgun. Today only `service_role` can read/write (because no policy permits any other role to do anything). If a future code change uses an authenticated-role client by mistake, it will silently return zero rows and the bug will be hard to trace. **Recommendation:** add an explicit `service_role only` policy when backfilling.

### Phone correction flow is split across two tables (`phone_corrections` + `patient_phone_history`)

Every correction also INSERTs two rows into `patient_phone_history` (an old-phone-removed row + a new-phone-current row). `patient_phone_history` IS in the migration tree. Session C should keep both tables atomically — they're paired.

### `patient_phone_verification_issues` truly orphaned

Zero references. Schema is reasonable (issue_type, error_code, resolution_action, resolved_by) — looks like the start of a triage admin surface. Either ship the surface or drop the table.

## Summary recommendation for Session C

Backfill 4 of 5 unclaimed tables into a forensic migration (`account_recovery_requests`, `audit_log`, `phone_corrections`, `sms_reminders`). Drop `patient_phone_verification_issues` unless Mo recalls intent. Add the missing service-role policy on `account_recovery_requests`. Note the `audit_log`/`audit_events` duplication for product consolidation review.
