# Audit Session B — App Code Supabase Touchpoints

**Captured:** 2026-05-03  
**Method:** Regex extraction of `.from('table')` and `.rpc('func')` callsites in `apps/` and `packages/` (excluding node_modules, .next).  
**Files scanned:** all `.ts` / `.tsx` under `apps/clinic`, `apps/patient`, `packages/shared`, `packages/ui-clinic`.  
**Files with at least one Supabase call:** 133.  
**Total `.from(...)` callsites:** 564.  
**Total `.rpc(...)` callsites:** 25.  
**Distinct tables referenced:** 57.  
**Distinct RPCs referenced:** 24.

Format: each section is one file. Each row is `line: kind name [ops] — snippet`.
`ops` are the chained operations within a 25-line window after the `.from('...')` call (so a single .from() may show multiple ops if subsequent select/update happen in the same chain or nearby).

**Filtering note:** `.storage.from('bucket')` calls (Supabase Storage) are excluded. One residual line still appears in the per-file dump (`apps/patient/app/(patient)/patient/messages/page.tsx:L316`) because the `.storage` token is on the preceding line; this is a known false positive — `attachments` is a Storage bucket, not a database table.

**Cross-reference vs staging-schema-2026-05-03.json:** every distinct table named here exists on staging, with the single false-positive exception above. No tables are referenced by code that are missing from staging.

---

## Aggregate stats

### Tables referenced (by callsite count)

| Table | Callsites |
|---|---:|
| `patients` | 55 |
| `clinic_memberships` | 52 |
| `appointments` | 45 |
| `clinical_notes` | 34 |
| `doctor_patient_relationships` | 30 |
| `check_in_queue` | 28 |
| `doctors` | 27 |
| `users` | 27 |
| `clinics` | 22 |
| `phone_change_requests` | 20 |
| `conversations` | 16 |
| `global_patients` | 13 |
| `patient_medical_records` | 11 |
| `payments` | 11 |
| `audit_events` | 9 |
| `doctor_availability` | 8 |
| `front_desk_staff` | 8 |
| `messages` | 8 |
| `notifications` | 8 |
| `otp_codes` | 8 |
| `patient_clinic_records` | 8 |
| `patient_visibility` | 8 |
| `lab_orders` | 7 |
| `medication_reminders` | 7 |
| `assistant_doctor_assignments` | 6 |
| `patient_data_shares` | 6 |
| `patient_medications` | 6 |
| `prescription_items` | 6 |
| `prescription_templates` | 6 |
| `patient_medication_intake` | 5 |
| `invoice_requests` | 4 |
| `lab_results` | 4 |
| `lab_results_orders` | 4 |
| `patient_consent_grants` | 4 |
| `vital_signs` | 4 |
| `analytics_events` | 3 |
| `patient_diary` | 3 |
| `patient_phone_history` | 3 |
| `account_recovery_requests` | 2 |
| `anonymous_visits` | 2 |
| `effective_messaging_consent` | 2 |
| `imaging_orders` | 2 |
| `lab_results_entries` | 2 |
| `lab_tests` | 2 |
| `opt_out_statistics` | 2 |
| `sms_reminders` | 2 |
| `attachments` | 1 |
| `audit_log` | 1 |
| `chronic_conditions` | 1 |
| `doctor_templates` | 1 |
| `immunizations` | 1 |
| `patient_allergies` | 1 |
| `patient_medication_reminders` | 1 |
| `patient_privacy_codes` | 1 |
| `phone_corrections` | 1 |
| `push_subscriptions` | 1 |
| `templates` | 1 |

### RPCs referenced

| RPC | Callsites |
|---|---:|
| `shift_queue_numbers_up` | 2 |
| `auto_renew_shares_on_visit` | 1 |
| `can_access_patient` | 1 |
| `change_phone_rollback` | 1 |
| `check_phone_uniform` | 1 |
| `consume_rate_limit` | 1 |
| `create_data_share` | 1 |
| `create_shares_for_grantors` | 1 |
| `extend_data_share` | 1 |
| `generate_prescription_number` | 1 |
| `get_next_anonymous_number` | 1 |
| `get_next_queue_number` | 1 |
| `get_next_walkin_slot` | 1 |
| `get_public_table_names` | 1 |
| `get_table_columns` | 1 |
| `increment_template_usage` | 1 |
| `initiate_sms_share` | 1 |
| `mark_share_expired_notification` | 1 |
| `nextval` | 1 |
| `regenerate_privacy_code` | 1 |
| `reorder_queue_item` | 1 |
| `revoke_data_share` | 1 |
| `verify_privacy_code` | 1 |
| `verify_sms_code` | 1 |

---

## Per-file callsites

### `apps/clinic/app/(doctor)/doctor/dashboard/page.tsx`

- L42: **from** `notifications` ops=[select] — `.from('notifications')`

### `apps/clinic/app/(frontdesk)/layout.tsx`

- L31: **from** `front_desk_staff` ops=[select] — `.from('front_desk_staff')`

### `apps/clinic/app/api/analytics/event/route.ts`

- L31: **from** `analytics_events` ops=[insert] — `.from('analytics_events')`

### `apps/clinic/app/api/clinic/leave/route.ts`

- L58: **from** `clinic_memberships` ops=[update, delete] — `.from('clinic_memberships')`
- L65: **from** `assistant_doctor_assignments` ops=[update, delete] — `.from('assistant_doctor_assignments')`

### `apps/clinic/app/api/clinic/membership/route.ts`

- L52: **from** `clinic_memberships` ops=[update] — `.from('clinic_memberships')`
- L63: **from** `assistant_doctor_assignments` ops=[update] — `.from('assistant_doctor_assignments')`

### `apps/clinic/app/api/clinical/patient-summary/route.ts`

- L42: **from** `clinical_notes` ops=[select] — `.from('clinical_notes')`

### `apps/clinic/app/api/clinical/templates/route.ts`

- L26: **from** `prescription_templates` ops=[select] — `.from('prescription_templates')`
- L67: **from** `prescription_templates` ops=[delete] — `.from('prescription_templates')`
- L101: **rpc** `increment_template_usage` ops=[—] — `const { error } = await supabase.rpc('increment_template_usage', { template_id: id, doc_id: user.id })`
- L106: **from** `prescription_templates` ops=[select, update] — `.from('prescription_templates')`
- L113: **from** `prescription_templates` ops=[update] — `.from('prescription_templates')`
- L146: **from** `prescription_templates` ops=[insert, select] — `.from('prescription_templates')`
- L194: **from** `prescription_templates` ops=[update] — `.from('prescription_templates')`

### `apps/clinic/app/api/cron/expire-stale-shares/route.ts`

- L73: **from** `global_patients` ops=[select] — `.from('global_patients')`
- L77: **from** `clinics` ops=[select] — `.from('clinics')`

### `apps/clinic/app/api/doctor/messages/block/route.ts`

- L20: **from** `conversations` ops=[update] — `.from('conversations')`

### `apps/clinic/app/api/doctor/messages/unblock/route.ts`

- L20: **from** `conversations` ops=[update] — `.from('conversations')`

### `apps/clinic/app/api/doctor/messages/unread-count/route.ts`

- L14: **from** `conversations` ops=[select] — `.from('conversations')`

### `apps/clinic/app/api/doctor/notifications/route.ts`

- L25: **from** `notifications` ops=[select] — `.from('notifications')`
- L53: **from** `notifications` ops=[select] — `.from('notifications')`
- L84: **from** `notifications` ops=[update] — `.from('notifications')`
- L95: **from** `notifications` ops=[update] — `.from('notifications')`

### `apps/clinic/app/api/doctor/personalized-chips/route.ts`

- L57: **from** `clinical_notes` ops=[select] — `.from('clinical_notes')`

### `apps/clinic/app/api/doctor/prescriptions/route.ts`

- L15: **from** `clinical_notes` ops=[select] — `.from('clinical_notes')`

### `apps/clinic/app/api/doctor/profile/route.ts`

- L18: **from** `doctors` ops=[select] — `.from('doctors')`
- L60: **from** `doctors` ops=[update] — `.from('doctors')`

### `apps/clinic/app/api/doctor/stats/route.ts`

- L34: **from** `doctors` ops=[select] — `.from('doctors')`
- L69: **from** `doctor_patient_relationships` ops=[select] — `.from('doctor_patient_relationships')`
- L84: **from** `doctor_patient_relationships` ops=[select] — `.from('doctor_patient_relationships')`
- L98: **from** `clinical_notes` ops=[select] — `.from('clinical_notes')`
- L107: **from** `clinical_notes` ops=[select] — `.from('clinical_notes')`
- L121: **from** `payments` ops=[select] — `.from('payments')`

### `apps/clinic/app/api/frontdesk/appointments/urgent/route.ts`

- L82: **from** `appointments` ops=[insert, select] — `.from('appointments')`
- L120: **from** `check_in_queue` ops=[select] — `.from('check_in_queue')`
- L130: **from** `check_in_queue` ops=[select, insert] — `.from('check_in_queue')`
- L143: **rpc** `shift_queue_numbers_up` ops=[—] — `await admin.rpc('shift_queue_numbers_up', {`
- L150: **from** `check_in_queue` ops=[insert, select, update] — `.from('check_in_queue')`
- L173: **from** `appointments` ops=[update] — `.from('appointments')`

### `apps/clinic/app/api/frontdesk/doctors/fees/route.ts`

- L31: **from** `doctors` ops=[select] — `.from('doctors')`
- L114: **from** `doctors` ops=[update] — `.from('doctors')`

### `apps/clinic/app/api/frontdesk/invite/route.ts`

- L17: **from** `clinic_memberships` ops=[select] — `.from('clinic_memberships')`
- L73: **from** `clinic_memberships` ops=[select, update] — `.from('clinic_memberships')`
- L93: **from** `clinic_memberships` ops=[update, delete] — `.from('clinic_memberships')`
- L111: **from** `clinic_memberships` ops=[delete] — `.from('clinic_memberships')`

### `apps/clinic/app/api/frontdesk/invoice/[paymentId]/route.ts`

- L34: **from** `payments` ops=[select] — `.from('payments')`
- L52: **from** `patients` ops=[select] — `.from('patients')`
- L59: **from** `doctors` ops=[select] — `.from('doctors')`
- L65: **from** `users` ops=[select] — `.from('users')`
- L72: **from** `clinics` ops=[select] — `.from('clinics')`
- L81: **from** `clinical_notes` ops=[select] — `.from('clinical_notes')`
- L106: **from** `invoice_requests` ops=[select, insert] — `.from('invoice_requests')`
- L115: **rpc** `nextval` ops=[—] — `const { data: seqRow } = await admin.rpc('nextval', { seq_name: 'invoice_seq' }).single()`
- L120: **from** `invoice_requests` ops=[insert] — `await admin.from('invoice_requests').insert({`
- L182: **from** `invoice_requests` ops=[update] — `.from('invoice_requests')`

### `apps/clinic/app/api/frontdesk/payments/route.ts`

- L82: **from** `payments` ops=[select] — `.from('payments')`
- L108: **from** `patients` ops=[select] — `.from('patients')`
- L121: **from** `users` ops=[select] — `.from('users')`

### `apps/clinic/app/api/frontdesk/payments/update/route.ts`

- L51: **from** `payments` ops=[select] — `.from('payments')`
- L139: **from** `payments` ops=[update, select] — `.from('payments')`

### `apps/clinic/app/api/frontdesk/profile/route.ts`

- L48: **from** `users` ops=[select] — `.from('users')`
- L53: **from** `front_desk_staff` ops=[select] — `.from('front_desk_staff')`
- L58: **from** `clinic_memberships` ops=[select] — `.from('clinic_memberships')`
- L121: **from** `front_desk_staff` ops=[update, select] — `.from('front_desk_staff')`
- L136: **from** `users` ops=[select] — `.from('users')`
- L165: **from** `users` ops=[update] — `.from('users')`

### `apps/clinic/app/api/frontdesk/queue/reorder/route.ts`

- L40: **from** `check_in_queue` ops=[select] — `.from('check_in_queue')`
- L71: **from** `check_in_queue` ops=[select] — `.from('check_in_queue')`
- L89: **rpc** `reorder_queue_item` ops=[—] — `const { error: reorderErr } = await admin.rpc('reorder_queue_item', {`

### `apps/clinic/app/api/patients/upgrade-relationship/route.ts`

- L48: **from** `patients` ops=[select] — `.from('patients')`
- L79: **from** `doctor_patient_relationships` ops=[select, update] — `.from('doctor_patient_relationships')`
- L99: **from** `doctor_patient_relationships` ops=[update] — `.from('doctor_patient_relationships')`

### `apps/clinic/app/api/public/invoice/[paymentId]/route.ts`

- L24: **from** `invoice_requests` ops=[select] — `.from('invoice_requests')`
- L34: **from** `payments` ops=[select] — `.from('payments')`
- L48: **from** `patients` ops=[select] — `.from('patients')`
- L54: **from** `users` ops=[select] — `.from('users')`
- L60: **from** `doctors` ops=[select] — `.from('doctors')`
- L66: **from** `clinics` ops=[select] — `.from('clinics')`
- L75: **from** `clinical_notes` ops=[select] — `.from('clinical_notes')`

### `apps/clinic/app/api/push/subscribe/route.ts`

- L41: **from** `push_subscriptions` ops=[upsert] — `.from('push_subscriptions')`

### `apps/clinic/app/api/setup/create-frontdesk/route.ts`

- L41: **from** `clinics` ops=[select] — `.from('clinics')`
- L77: **from** `users` ops=[insert, upsert] — `const { error: uErr } = await admin.from('users').insert({`
- L84: **from** `front_desk_staff` ops=[insert, upsert, select] — `const { error: sErr } = await admin.from('front_desk_staff').insert({`
- L94: **from** `clinic_memberships` ops=[upsert, select] — `const { error: cmErr } = await admin.from('clinic_memberships').upsert(`
- L102: **from** `clinic_memberships` ops=[select] — `.from('clinic_memberships')`

### `apps/patient/app/(patient)/patient/messages/page.tsx`

- L316: **from** `attachments` ops=[—] — `.from('attachments')`

### `apps/patient/app/(patient)/patient/privacy/page.tsx`

- L30: **from** `global_patients` ops=[select] — `.from('global_patients')`

### `apps/patient/app/api/patient/medications/[id]/route.ts`

- L21: **from** `patient_medications` ops=[delete] — `.from('patient_medications')`
- L61: **from** `patient_medications` ops=[update, select] — `.from('patient_medications')`

### `apps/patient/app/api/patient/messages/unread-count/route.ts`

- L20: **from** `conversations` ops=[select] — `.from('conversations')`

### `packages/shared/lib/analytics/doctor-stats.ts`

- L172: **from** `analytics_events` ops=[select] — `.from('analytics_events')`
- L197: **from** `clinical_notes` ops=[select] — `.from('clinical_notes')`
- L420: **from** `payments` ops=[select] — `.from('payments')`

### `packages/shared/lib/analytics/tracking.ts`

- L16: **from** `analytics_events` ops=[insert] — `.from('analytics_events')`

### `packages/shared/lib/api/handlers/auth/change-phone/request/handler.ts`

- L100: **from** `patients` ops=[select] — `.from('patients')`

### `packages/shared/lib/api/handlers/auth/change-phone/verify/handler.ts`

- L84: **from** `phone_change_requests` ops=[select] — `.from('phone_change_requests')`
- L92: **from** `patients` ops=[select] — `.from('patients')`

### `packages/shared/lib/api/handlers/auth/check-phone/handler.ts`

- L38: **from** `users` ops=[select] — `.from('users')`

### `packages/shared/lib/api/handlers/auth/login/handler.ts`

- L58: **from** `users` ops=[select] — `.from('users')`
- L115: **from** `users` ops=[select] — `.from('users')`

### `packages/shared/lib/api/handlers/auth/register/handler.ts`

- L103: **from** `clinics` ops=[select, insert] — `.from('clinics')`
- L114: **from** `clinic_memberships` ops=[insert] — `.from('clinic_memberships')`

### `packages/shared/lib/api/handlers/auth/reset-password/handler.ts`

- L73: **from** `otp_codes` ops=[select] — `.from('otp_codes')`
- L108: **from** `users` ops=[select] — `.from('users')`
- L122: **from** `users` ops=[select] — `.from('users')`
- L141: **from** `users` ops=[select] — `.from('users')`
- L176: **from** `otp_codes` ops=[update] — `.from('otp_codes')`

### `packages/shared/lib/api/handlers/auth/verify-otp/handler.ts`

- L59: **from** `otp_codes` ops=[insert] — `const { error: tokenInsertError } = await admin.from('otp_codes').insert({`

### `packages/shared/lib/api/handlers/clinic/invite-code/handler.ts`

- L23: **from** `clinics` ops=[select, update] — `.from('clinics')`
- L32: **from** `clinics` ops=[update] — `.from('clinics')`
- L69: **from** `clinics` ops=[update] — `.from('clinics')`

### `packages/shared/lib/api/handlers/clinic/invite/handler.ts`

- L42: **from** `users` ops=[select] — `.from('users')`
- L61: **from** `clinic_memberships` ops=[select, update] — `.from('clinic_memberships')`
- L82: **from** `clinic_memberships` ops=[update, insert] — `.from('clinic_memberships')`
- L95: **from** `clinic_memberships` ops=[insert] — `.from('clinic_memberships')`

### `packages/shared/lib/api/handlers/clinic/join/handler.ts`

- L45: **from** `clinics` ops=[select] — `.from('clinics')`
- L72: **from** `clinic_memberships` ops=[select, update] — `.from('clinic_memberships')`
- L80: **from** `clinic_memberships` ops=[select, update, insert] — `.from('clinic_memberships')`
- L94: **from** `clinic_memberships` ops=[update, insert, select] — `.from('clinic_memberships')`
- L101: **from** `clinic_memberships` ops=[insert, select] — `.from('clinic_memberships')`
- L117: **from** `clinic_memberships` ops=[select, insert] — `.from('clinic_memberships')`
- L129: **from** `notifications` ops=[insert] — `.from('notifications')`

### `packages/shared/lib/api/handlers/clinic/patient-visibility/handler.ts`

- L39: **from** `doctors` ops=[select] — `.from('doctors')`

### `packages/shared/lib/api/handlers/clinic/settings/handler.ts`

- L41: **from** `clinic_memberships` ops=[select, update] — `.from('clinic_memberships')`
- L50: **from** `clinic_memberships` ops=[select, update] — `.from('clinic_memberships')`
- L61: **from** `clinic_memberships` ops=[update] — `.from('clinic_memberships')`
- L138: **from** `clinics` ops=[update] — `.from('clinics')`

### `packages/shared/lib/api/handlers/clinic/staff/handler.ts`

- L26: **from** `clinic_memberships` ops=[select] — `.from('clinic_memberships')`
- L40: **from** `users` ops=[select] — `.from('users')`
- L50: **from** `doctors` ops=[select] — `.from('doctors')`
- L65: **from** `front_desk_staff` ops=[select] — `.from('front_desk_staff')`
- L83: **from** `assistant_doctor_assignments` ops=[select] — `.from('assistant_doctor_assignments')`
- L140: **from** `assistant_doctor_assignments` ops=[upsert, select] — `.from('assistant_doctor_assignments')`
- L197: **from** `assistant_doctor_assignments` ops=[update] — `.from('assistant_doctor_assignments')`

### `packages/shared/lib/api/handlers/clinical/notes/handler.ts`

- L30: **from** `clinical_notes` ops=[select] — `.from('clinical_notes')`
- L71: **from** `clinic_memberships` ops=[select] — `.from('clinic_memberships')`
- L136: **from** `check_in_queue` ops=[update, select] — `.from('check_in_queue')`
- L146: **from** `appointments` ops=[update] — `.from('appointments')`
- L166: **from** `appointments` ops=[update] — `.from('appointments')`
- L197: **from** `patients` ops=[select] — `admin.from('patients').select('phone, full_name').eq('id', patientId).single(),`
- L198: **from** `doctors` ops=[select] — `admin.from('doctors').select('full_name, clinic_id').eq('id', user.id).single(),`
- L208: **from** `clinics` ops=[select] — `const clinicRes = await admin.from('clinics').select('name').eq('id', resolvedClinicId).single()`

### `packages/shared/lib/api/handlers/clinical/patient-medications/handler.ts`

- L35: **from** `patient_medication_intake` ops=[select] — `.from('patient_medication_intake')`
- L54: **from** `clinical_notes` ops=[select] — `.from('clinical_notes')`
- L89: **from** `patient_medications` ops=[select] — `.from('patient_medications')`

### `packages/shared/lib/api/handlers/clinical/prescription-pdf/handler.ts`

- L423: **from** `clinical_notes` ops=[select] — `.from('clinical_notes')`
- L458: **from** `patients` ops=[select] — `.from('patients')`

### `packages/shared/lib/api/handlers/clinical/prescription/handler.ts`

- L77: **from** `clinical_notes` ops=[select] — `.from('clinical_notes')`
- L115: **from** `clinical_notes` ops=[select] — `.from('clinical_notes')`
- L150: **from** `patients` ops=[select] — `.from('patients')`

### `packages/shared/lib/api/handlers/clinical/prescription/mark-printed/handler.ts`

- L21: **from** `clinical_notes` ops=[update, select] — `.from('clinical_notes')`

### `packages/shared/lib/api/handlers/clinical/recent-patients/handler.ts`

- L17: **from** `clinical_notes` ops=[select] — `.from('clinical_notes')`

### `packages/shared/lib/api/handlers/doctor/appointments/handler.ts`

- L33: **from** `appointments` ops=[select] — `.from('appointments')`
- L86: **from** `appointments` ops=[select] — `.from('appointments')`
- L210: **from** `patients` ops=[select] — `.from('patients')`
- L224: **from** `appointments` ops=[select] — `.from('appointments')`
- L256: **from** `clinic_memberships` ops=[select, insert] — `.from('clinic_memberships')`
- L269: **from** `appointments` ops=[insert, select] — `.from('appointments')`
- L295: **from** `patients` ops=[select] — `.from('patients')`
- L304: **from** `doctors` ops=[select] — `.from('doctors')`
- L313: **from** `clinics` ops=[select] — `.from('clinics')`
- L385: **from** `appointments` ops=[select, update] — `.from('appointments')`
- L401: **from** `appointments` ops=[update] — `.from('appointments')`
- L438: **from** `appointments` ops=[update] — `.from('appointments')`

### `packages/shared/lib/api/handlers/doctor/availability/handler.ts`

- L62: **from** `doctor_availability` ops=[select] — `.from('doctor_availability')`
- L164: **from** `doctor_availability` ops=[delete, insert] — `.from('doctor_availability')`
- L178: **from** `doctor_availability` ops=[insert] — `.from('doctor_availability')`

### `packages/shared/lib/api/handlers/doctor/imaging-orders/handler.ts`

- L92: **from** `doctor_patient_relationships` ops=[select] — `.from('doctor_patient_relationships')`
- L98: **from** `appointments` ops=[select] — `.from('appointments')`
- L104: **from** `clinical_notes` ops=[select] — `.from('clinical_notes')`
- L125: **from** `doctor_patient_relationships` ops=[select] — `.from('doctor_patient_relationships')`
- L129: **from** `appointments` ops=[select] — `.from('appointments')`
- L133: **from** `clinical_notes` ops=[select] — `.from('clinical_notes')`
- L154: **from** `patient_medical_records` ops=[select] — `.from('patient_medical_records')`
- L195: **from** `imaging_orders` ops=[select] — `.from('imaging_orders')`
- L265: **from** `patients` ops=[select] — `.from('patients')`
- L280: **from** `doctors` ops=[select, insert] — `.from('doctors')`
- L299: **from** `imaging_orders` ops=[insert, select] — `.from('imaging_orders')`
- L345: **from** `patient_medical_records` ops=[insert, select] — `.from('patient_medical_records')`

### `packages/shared/lib/api/handlers/doctor/messages/conversations/handler.ts`

- L16: **from** `conversations` ops=[select] — `.from('conversations')`
- L32: **from** `patients` ops=[select] — `.from('patients')`
- L39: **from** `messages` ops=[select] — `.from('messages')`

### `packages/shared/lib/api/handlers/doctor/messages/handler.ts`

- L26: **from** `conversations` ops=[select, update] — `.from('conversations')`
- L38: **from** `messages` ops=[select, update] — `.from('messages')`
- L46: **from** `messages` ops=[update] — `.from('messages')`
- L53: **from** `conversations` ops=[update] — `.from('conversations')`
- L96: **from** `messages` ops=[insert, select, update] — `.from('messages')`
- L110: **from** `conversations` ops=[update] — `.from('conversations')`

### `packages/shared/lib/api/handlers/doctor/patients/[id]/handler.ts`

- L21: **from** `doctor_patient_relationships` ops=[select] — `.from('doctor_patient_relationships')`
- L36: **from** `patients` ops=[select] — `.from('patients')`
- L47: **from** `clinical_notes` ops=[select] — `.from('clinical_notes')`
- L119: **from** `appointments` ops=[select] — `.from('appointments')`
- L128: **from** `patient_medication_reminders` ops=[select] — `.from('patient_medication_reminders')`

### `packages/shared/lib/api/handlers/doctor/patients/add/handler.ts`

- L23: **from** `doctor_patient_relationships` ops=[select, insert] — `.from('doctor_patient_relationships')`
- L43: **from** `doctor_patient_relationships` ops=[insert] — `.from('doctor_patient_relationships')`
- L60: **from** `doctor_patient_relationships` ops=[insert] — `.from('doctor_patient_relationships')`

### `packages/shared/lib/api/handlers/doctor/patients/create/handler.ts`

- L83: **from** `clinic_memberships` ops=[select] — `.from('clinic_memberships')`

### `packages/shared/lib/api/handlers/doctor/patients/handler.ts`

- L18: **from** `doctor_patient_relationships` ops=[select] — `.from('doctor_patient_relationships')`
- L40: **from** `patients` ops=[select] — `.from('patients')`
- L53: **from** `patient_visibility` ops=[select] — `.from('patient_visibility')`
- L65: **from** `patients` ops=[select] — `.from('patients')`
- L86: **from** `clinical_notes` ops=[select] — `.from('clinical_notes')`
- L95: **from** `patients` ops=[select] — `.from('patients')`
- L121: **from** `clinical_notes` ops=[select] — `.from('clinical_notes')`

### `packages/shared/lib/api/handlers/doctor/patients/search/handler.ts`

- L29: **from** `doctor_patient_relationships` ops=[select] — `.from('doctor_patient_relationships')`

### `packages/shared/lib/api/handlers/doctor/public-fee/handler.ts`

- L26: **from** `doctors` ops=[select] — `.from('doctors')`

### `packages/shared/lib/api/handlers/doctor/settings/handler.ts`

- L17: **from** `doctors` ops=[select] — `.from('doctors')`
- L66: **from** `doctors` ops=[update] — `.from('doctors')`

### `packages/shared/lib/api/handlers/doctors/list/handler.ts`

- L16: **from** `doctors` ops=[select] — `.from('doctors')`
- L47: **from** `doctors` ops=[select] — `.from('doctors')`

### `packages/shared/lib/api/handlers/drugs/recent/handler.ts`

- L17: **from** `clinical_notes` ops=[select] — `.from('clinical_notes')`

### `packages/shared/lib/api/handlers/frontdesk/appointments/create/handler.ts`

- L69: **from** `appointments` ops=[select] — `.from('appointments')`
- L130: **from** `appointments` ops=[select, update] — `.from('appointments')`
- L147: **from** `appointments` ops=[update, select] — `.from('appointments')`
- L161: **from** `appointments` ops=[select] — `.from('appointments')`

### `packages/shared/lib/api/handlers/frontdesk/appointments/handler.ts`

- L39: **from** `appointments` ops=[select] — `.from('appointments')`
- L163: **from** `appointments` ops=[select] — `.from('appointments')`
- L244: **from** `appointments` ops=[update, select] — `.from('appointments')`
- L258: **from** `appointments` ops=[select] — `.from('appointments')`
- L278: **from** `clinics` ops=[select] — `.from('clinics')`

### `packages/shared/lib/api/handlers/frontdesk/checkin/handler.ts`

- L58: **from** `check_in_queue` ops=[select] — `.from('check_in_queue')`
- L94: **from** `check_in_queue` ops=[select, update] — `.from('check_in_queue')`
- L107: **from** `check_in_queue` ops=[update] — `.from('check_in_queue')`
- L147: **from** `patients` ops=[select] — `.from('patients')`
- L180: **from** `check_in_queue` ops=[select] — `.from('check_in_queue')`
- L190: **from** `patients` ops=[select] — `.from('patients')`
- L199: **from** `doctors` ops=[select] — `.from('doctors')`
- L206: **from** `clinics` ops=[select] — `? await admin.from('clinics').select('name').eq('id', clinicId).maybeSingle()`

### `packages/shared/lib/api/handlers/frontdesk/payments/create/handler.ts`

- L31: **from** `payments` ops=[select] — `.from('payments')`

### `packages/shared/lib/api/handlers/frontdesk/queue/update/handler.ts`

- L25: **from** `check_in_queue` ops=[select] — `.from('check_in_queue')`

### `packages/shared/lib/api/handlers/patient/allergies/handler.ts`

- L59: **from** `patient_medical_records` ops=[select] — `.from('patient_medical_records')`
- L65: **from** `patient_allergies` ops=[select] — `.from('patient_allergies')`
- L142: **from** `patient_medical_records` ops=[insert, select] — `.from('patient_medical_records')`

### `packages/shared/lib/api/handlers/patient/appointments/handler.ts`

- L14: **from** `appointments` ops=[select] — `.from('appointments')`

### `packages/shared/lib/api/handlers/patient/conditions/handler.ts`

- L47: **from** `clinical_notes` ops=[select] — `.from('clinical_notes')`
- L53: **from** `patient_medical_records` ops=[select] — `.from('patient_medical_records')`
- L60: **from** `chronic_conditions` ops=[select] — `.from('chronic_conditions')`
- L154: **from** `patient_medical_records` ops=[insert, select] — `.from('patient_medical_records')`

### `packages/shared/lib/api/handlers/patient/diary/handler.ts`

- L66: **from** `patient_diary` ops=[select] — `.from('patient_diary')`
- L103: **from** `patient_diary` ops=[select, insert] — `.from('patient_diary')`
- L122: **from** `patient_diary` ops=[insert, select] — `.from('patient_diary')`

### `packages/shared/lib/api/handlers/patient/health-summary/handler.ts`

- L35: **from** `patient_medications` ops=[select] — `.from('patient_medications')`
- L41: **from** `medication_reminders` ops=[select] — `.from('medication_reminders')`
- L47: **from** `lab_orders` ops=[select] — `.from('lab_orders')`
- L64: **from** `clinical_notes` ops=[select] — `.from('clinical_notes')`
- L76: **from** `vital_signs` ops=[select] — `.from('vital_signs')`
- L82: **from** `patient_medical_records` ops=[select] — `.from('patient_medical_records')`

### `packages/shared/lib/api/handlers/patient/immunizations/handler.ts`

- L49: **from** `patient_medical_records` ops=[select] — `.from('patient_medical_records')`
- L55: **from** `immunizations` ops=[select] — `.from('immunizations')`
- L129: **from** `patient_medical_records` ops=[insert, select] — `.from('patient_medical_records')`

### `packages/shared/lib/api/handlers/patient/lab-results/handler.ts`

- L27: **from** `patients` ops=[select] — `.from('patients')`
- L40: **from** `lab_orders` ops=[select] — `.from('lab_orders')`

### `packages/shared/lib/api/handlers/patient/medication-intake/handler.ts`

- L17: **from** `patient_medication_intake` ops=[select] — `.from('patient_medication_intake')`
- L69: **from** `patient_medication_intake` ops=[delete, insert] — `.from('patient_medication_intake')`
- L76: **from** `patient_medication_intake` ops=[insert] — `.from('patient_medication_intake')`
- L122: **from** `patient_medication_intake` ops=[insert, select] — `.from('patient_medication_intake')`

### `packages/shared/lib/api/handlers/patient/medications/handler.ts`

- L13: **from** `patient_medications` ops=[select] — `.from('patient_medications')`
- L66: **from** `patient_medications` ops=[insert, select] — `.from('patient_medications')`

### `packages/shared/lib/api/handlers/patient/messages/conversations/handler.ts`

- L15: **from** `conversations` ops=[select] — `.from('conversations')`
- L31: **from** `doctors` ops=[select] — `.from('doctors')`
- L38: **from** `messages` ops=[select] — `.from('messages')`

### `packages/shared/lib/api/handlers/patient/messages/handler.ts`

- L29: **from** `conversations` ops=[select, update] — `.from('conversations')`
- L41: **from** `messages` ops=[select, update] — `.from('messages')`
- L49: **from** `messages` ops=[update] — `.from('messages')`
- L56: **from** `conversations` ops=[update] — `.from('conversations')`
- L100: **from** `messages` ops=[insert, select, update] — `.from('messages')`
- L114: **from** `conversations` ops=[update] — `.from('conversations')`

### `packages/shared/lib/api/handlers/patient/messaging-reconsent/handler.ts`

- L29: **from** `global_patients` ops=[select] — `.from('global_patients')`
- L43: **from** `clinics` ops=[select] — `.from('clinics')`
- L90: **from** `global_patients` ops=[select] — `.from('global_patients')`

### `packages/shared/lib/api/handlers/patient/my-code/handler.ts`

- L16: **from** `patients` ops=[select] — `.from('patients')`
- L49: **from** `patients` ops=[update, select] — `.from('patients')`

### `packages/shared/lib/api/handlers/patient/prescriptions/handler.ts`

- L25: **from** `doctors` ops=[select] — `.from('doctors')`

### `packages/shared/lib/api/handlers/patient/privacy-code-regenerate/handler.ts`

- L40: **from** `global_patients` ops=[select] — `.from('global_patients')`

### `packages/shared/lib/api/handlers/patient/privacy-code/handler.ts`

- L35: **from** `global_patients` ops=[select] — `.from('global_patients')`

### `packages/shared/lib/api/handlers/patient/records/handler.ts`

- L13: **from** `patient_medical_records` ops=[select] — `.from('patient_medical_records')`
- L57: **from** `patient_medical_records` ops=[insert, select] — `.from('patient_medical_records')`

### `packages/shared/lib/api/handlers/patient/sharing/extend-handler.ts`

- L50: **from** `patient_data_shares` ops=[select] — `.from('patient_data_shares')`
- L58: **from** `global_patients` ops=[select] — `.from('global_patients')`

### `packages/shared/lib/api/handlers/patient/sharing/handler.ts`

- L43: **from** `clinics` ops=[select] — `.from('clinics')`
- L53: **from** `doctors` ops=[select] — `.from('doctors')`
- L75: **from** `global_patients` ops=[select] — `.from('global_patients')`
- L95: **from** `clinics` ops=[select] — `.from('clinics')`
- L151: **from** `patient_visibility` ops=[select] — `.from('patient_visibility')`

### `packages/shared/lib/api/handlers/patient/sharing/revoke-handler.ts`

- L52: **from** `patient_data_shares` ops=[select] — `.from('patient_data_shares')`
- L60: **from** `global_patients` ops=[select] — `.from('global_patients')`

### `packages/shared/lib/api/handlers/patient/visits/handler.ts`

- L14: **from** `clinical_notes` ops=[select] — `.from('clinical_notes')`

### `packages/shared/lib/api/handlers/patient/vitals/handler.ts`

- L13: **from** `vital_signs` ops=[select] — `.from('vital_signs')`

### `packages/shared/lib/api/handlers/patients/create/handler.ts`

- L75: **from** `doctors` ops=[select] — `.from('doctors')`

### `packages/shared/lib/api/handlers/patients/initiate-sms-share/handler.ts`

- L53: **from** `clinic_memberships` ops=[select] — `.from('clinic_memberships')`

### `packages/shared/lib/api/handlers/patients/search/handler.ts`

- L59: **from** `doctor_patient_relationships` ops=[select] — `.from('doctor_patient_relationships')`
- L80: **from** `patients` ops=[select] — `.from('patients')`

### `packages/shared/lib/api/handlers/patients/verify-privacy-code/handler.ts`

- L84: **from** `clinic_memberships` ops=[select] — `.from('clinic_memberships')`
- L140: **from** `patients` ops=[select] — `.from('patients')`
- L178: **from** `patient_clinic_records` ops=[select] — `.from('patient_clinic_records')`

### `packages/shared/lib/api/handlers/patients/verify-sms-code/handler.ts`

- L57: **from** `clinic_memberships` ops=[select] — `.from('clinic_memberships')`
- L95: **from** `patients` ops=[select] — `.from('patients')`
- L123: **from** `patient_clinic_records` ops=[select] — `.from('patient_clinic_records')`

### `packages/shared/lib/audit/logger.ts`

- L25: **from** `audit_log` ops=[insert] — `.from('audit_log')`

### `packages/shared/lib/auth/otp.ts`

- L36: **from** `otp_codes` ops=[update, insert] — `.from('otp_codes')`
- L48: **from** `otp_codes` ops=[insert] — `.from('otp_codes')`
- L95: **from** `otp_codes` ops=[select] — `.from('otp_codes')`
- L125: **from** `otp_codes` ops=[update] — `.from('otp_codes')`
- L139: **from** `otp_codes` ops=[update] — `.from('otp_codes')`

### `packages/shared/lib/auth/session.ts`

- L40: **from** `users` ops=[select] — `.from('users')`
- L228: **from** `clinic_memberships` ops=[select] — `.from('clinic_memberships')`
- L249: **from** `clinic_memberships` ops=[select] — `.from('clinic_memberships')`
- L267: **from** `assistant_doctor_assignments` ops=[select] — `.from('assistant_doctor_assignments')`

### `packages/shared/lib/data/appointments.ts`

- L42: **from** `appointments` ops=[select] — `.from('appointments')`
- L81: **from** `appointments` ops=[select] — `.from('appointments')`
- L113: **from** `appointments` ops=[update] — `.from('appointments')`

### `packages/shared/lib/data/audit.ts`

- L259: **from** `audit_events` ops=[insert] — `await supabase.from('audit_events').insert({`
- L287: **from** `audit_events` ops=[select] — `.from('audit_events')`

### `packages/shared/lib/data/clinic-context.ts`

- L80: **from** `clinic_memberships` ops=[select] — `.from('clinic_memberships')`
- L118: **from** `clinic_memberships` ops=[select] — `.from('clinic_memberships')`
- L223: **from** `clinic_memberships` ops=[select] — `.from('clinic_memberships')`
- L249: **from** `clinic_memberships` ops=[select] — `.from('clinic_memberships')`
- L267: **from** `clinics` ops=[select] — `.from('clinics')`
- L302: **from** `clinic_memberships` ops=[select] — `.from('clinic_memberships')`
- L322: **from** `doctors` ops=[select] — `.from('doctors')`
- L347: **from** `front_desk_staff` ops=[select] — `.from('front_desk_staff')`
- L373: **from** `clinic_memberships` ops=[select] — `.from('clinic_memberships')`

### `packages/shared/lib/data/clinical-notes.ts`

- L119: **from** `clinical_notes` ops=[insert, select] — `.from('clinical_notes')`
- L128: **from** `clinical_notes` ops=[insert, select] — `.from('clinical_notes')`
- L163: **from** `clinical_notes` ops=[select] — `.from('clinical_notes')`
- L186: **from** `clinical_notes` ops=[select] — `.from('clinical_notes')`
- L207: **from** `clinical_notes` ops=[select] — `.from('clinical_notes')`
- L248: **from** `medication_reminders` ops=[insert, select] — `.from('medication_reminders')`

### `packages/shared/lib/data/clinical.ts`

- L101: **from** `vital_signs` ops=[insert, select] — `.from('vital_signs')`
- L134: **from** `vital_signs` ops=[select] — `.from('vital_signs')`
- L164: **from** `lab_tests` ops=[select] — `.from('lab_tests')`
- L188: **from** `lab_tests` ops=[select] — `.from('lab_tests')`
- L213: **from** `lab_orders` ops=[insert, select] — `.from('lab_orders')`
- L234: **from** `lab_results` ops=[insert, select] — `.from('lab_results')`
- L249: **from** `lab_orders` ops=[select] — `.from('lab_orders')`
- L266: **from** `lab_results` ops=[select] — `.from('lab_results')`
- L296: **from** `lab_orders` ops=[update] — `.from('lab_orders')`
- L316: **from** `lab_results` ops=[update] — `.from('lab_results')`
- L370: **from** `lab_orders` ops=[select] — `.from('lab_orders')`
- L400: **from** `lab_orders` ops=[select] — `.from('lab_orders')`
- L435: **from** `lab_results` ops=[update] — `.from('lab_results')`
- L461: **rpc** `generate_prescription_number` ops=[—] — `const { data, error } = await supabase.rpc('generate_prescription_number')`
- L479: **from** `clinical_notes` ops=[update] — `.from('clinical_notes')`
- L497: **from** `clinical_notes` ops=[update, select] — `.from('clinical_notes')`
- L513: **from** `clinical_notes` ops=[select] — `.from('clinical_notes')`

### `packages/shared/lib/data/frontdesk-scope.ts`

- L17: **from** `clinic_memberships` ops=[select] — `.from('clinic_memberships')`
- L45: **from** `clinic_memberships` ops=[select] — `.from('clinic_memberships')`
- L83: **from** `clinic_memberships` ops=[select] — `.from('clinic_memberships')`

### `packages/shared/lib/data/frontdesk.ts`

- L216: **from** `doctors` ops=[select] — `.from('doctors')`
- L245: **from** `check_in_queue` ops=[select] — `.from('check_in_queue')`
- L290: **from** `check_in_queue` ops=[select] — `.from('check_in_queue')`
- L355: **from** `appointments` ops=[select] — `.from('appointments')`
- L368: **from** `check_in_queue` ops=[select, update] — `.from('check_in_queue')`
- L379: **from** `appointments` ops=[update] — `.from('appointments')`
- L386: **from** `check_in_queue` ops=[update] — `.from('check_in_queue')`
- L400: **rpc** `shift_queue_numbers_up` ops=[—] — `await admin.rpc('shift_queue_numbers_up', {`
- L407: **rpc** `get_next_queue_number` ops=[—] — `.rpc('get_next_queue_number', { p_doctor_id: params.doctorId })`
- L421: **from** `check_in_queue` ops=[insert, select] — `.from('check_in_queue')`
- L453: **from** `appointments` ops=[update] — `.from('appointments')`
- L479: **from** `check_in_queue` ops=[update] — `.from('check_in_queue')`
- L512: **from** `check_in_queue` ops=[select, update] — `.from('check_in_queue')`
- L523: **from** `check_in_queue` ops=[update, select] — `.from('check_in_queue')`
- L535: **from** `check_in_queue` ops=[select, update] — `.from('check_in_queue')`
- L544: **from** `appointments` ops=[select, update] — `.from('appointments')`
- L550: **from** `appointments` ops=[update, select] — `.from('appointments')`
- L560: **from** `appointments` ops=[update, select] — `.from('appointments')`
- L571: **from** `check_in_queue` ops=[select] — `.from('check_in_queue')`
- L582: **from** `appointments` ops=[select, update] — `.from('appointments')`
- L598: **from** `check_in_queue` ops=[update] — `.from('check_in_queue')`
- L608: **from** `appointments` ops=[update] — `.from('appointments')`
- L651: **from** `doctor_availability` ops=[select] — `.from('doctor_availability')`
- L675: **from** `appointments` ops=[select] — `.from('appointments')`
- L684: **from** `check_in_queue` ops=[select] — `.from('check_in_queue')`
- L769: **from** `doctor_availability` ops=[select] — `.from('doctor_availability')`
- L799: **from** `appointments` ops=[select] — `.from('appointments')`
- L809: **from** `check_in_queue` ops=[select] — `.from('check_in_queue')`
- L958: **rpc** `get_next_walkin_slot` ops=[—] — `const { data: slotTime, error } = await admin.rpc('get_next_walkin_slot', {`
- L971: **from** `check_in_queue` ops=[update] — `.from('check_in_queue')`
- L1004: **from** `appointments` ops=[insert, select] — `.from('appointments')`
- L1031: **from** `appointments` ops=[update] — `.from('appointments')`
- L1048: **from** `appointments` ops=[update] — `.from('appointments')`
- L1097: **from** `payments` ops=[insert, select] — `.from('payments')`
- L1131: **from** `payments` ops=[select] — `.from('payments')`
- L1149: **from** `payments` ops=[select] — `.from('payments')`

### `packages/shared/lib/data/global-patients.ts`

- L77: **from** `global_patients` ops=[select] — `.from('global_patients')`
- L105: **from** `global_patients` ops=[select] — `.from('global_patients')`

### `packages/shared/lib/data/identity-resolution.ts`

- L120: **from** `global_patients` ops=[insert, select] — `.from('global_patients')`
- L201: **from** `patients` ops=[select] — `.from('patients')`

### `packages/shared/lib/data/lab-results.ts`

- L194: **from** `lab_results_orders` ops=[insert, select] — `.from('lab_results_orders')`
- L219: **from** `lab_results_entries` ops=[insert, select] — `.from('lab_results_entries')`
- L237: **from** `lab_results_orders` ops=[select] — `.from('lab_results_orders')`
- L271: **from** `lab_results_entries` ops=[update] — `.from('lab_results_entries')`
- L293: **from** `lab_results_orders` ops=[update, select] — `.from('lab_results_orders')`
- L313: **from** `lab_results_orders` ops=[select] — `.from('lab_results_orders')`

### `packages/shared/lib/data/medications.ts`

- L26: **from** `medication_reminders` ops=[select] — `.from('medication_reminders')`
- L47: **from** `medication_reminders` ops=[select, update] — `.from('medication_reminders')`
- L70: **from** `medication_reminders` ops=[update, select] — `.from('medication_reminders')`
- L90: **from** `medication_reminders` ops=[select] — `.from('medication_reminders')`
- L109: **from** `medication_reminders` ops=[select] — `.from('medication_reminders')`

### `packages/shared/lib/data/memberships.ts`

- L20: **from** `clinic_memberships` ops=[select, insert] — `.from('clinic_memberships')`
- L42: **from** `clinic_memberships` ops=[insert, select, update] — `.from('clinic_memberships')`
- L61: **from** `clinic_memberships` ops=[update, select] — `.from('clinic_memberships')`
- L75: **from** `clinic_memberships` ops=[update, select] — `.from('clinic_memberships')`
- L89: **from** `clinic_memberships` ops=[update, select] — `.from('clinic_memberships')`

### `packages/shared/lib/data/messaging-consent.ts`

- L42: **from** `effective_messaging_consent` ops=[select] — `.from('effective_messaging_consent')`
- L70: **from** `effective_messaging_consent` ops=[select] — `.from('effective_messaging_consent')`
- L103: **from** `patient_clinic_records` ops=[update, insert] — `.from('patient_clinic_records')`
- L118: **from** `audit_events` ops=[insert] — `const { error: auditError } = await admin.from('audit_events').insert({`
- L162: **from** `appointments` ops=[select] — `.from('appointments')`
- L173: **from** `check_in_queue` ops=[select] — `.from('check_in_queue')`
- L204: **from** `conversations` ops=[select, insert] — `.from('conversations')`
- L214: **from** `appointments` ops=[select, insert] — `.from('appointments')`
- L223: **from** `conversations` ops=[insert, select] — `.from('conversations')`
- L257: **from** `patients` ops=[select] — `.from('patients')`
- L272: **from** `doctor_patient_relationships` ops=[select] — `.from('doctor_patient_relationships')`
- L286: **from** `patient_consent_grants` ops=[select] — `.from('patient_consent_grants')`
- L301: **from** `appointments` ops=[select] — `.from('appointments')`
- L311: **from** `check_in_queue` ops=[select] — `.from('check_in_queue')`
- L337: **from** `conversations` ops=[select] — `.from('conversations')`
- L347: **from** `appointments` ops=[select, insert] — `.from('appointments')`
- L358: **from** `check_in_queue` ops=[select, insert] — `.from('check_in_queue')`
- L367: **from** `conversations` ops=[insert, select] — `.from('conversations')`

### `packages/shared/lib/data/patient-clinic-records.ts`

- L61: **from** `patient_clinic_records` ops=[select] — `.from('patient_clinic_records')`
- L109: **from** `patient_clinic_records` ops=[update, insert, select] — `.from('patient_clinic_records')`
- L125: **from** `patient_clinic_records` ops=[insert, select] — `.from('patient_clinic_records')`
- L156: **from** `patient_clinic_records` ops=[select] — `.from('patient_clinic_records')`
- L185: **from** `patient_clinic_records` ops=[select] — `.from('patient_clinic_records')`

### `packages/shared/lib/data/patient-dedup.ts`

- L95: **from** `patients` ops=[select] — `.from('patients')`
- L106: **from** `patients` ops=[select] — `.from('patients')`
- L222: **from** `patients` ops=[select, update] — `.from('patients')`
- L228: **from** `patients` ops=[select, update] — `.from('patients')`
- L244: **from** `clinical_notes` ops=[update] — `.from('clinical_notes')`
- L252: **from** `appointments` ops=[update] — `.from('appointments')`
- L260: **from** `prescription_items` ops=[update] — `.from('prescription_items')`
- L268: **from** `patients` ops=[update] — `.from('patients')`
- L314: **from** `patients` ops=[select] — `.from('patients')`

### `packages/shared/lib/data/patient-shares.ts`

- L138: **rpc** `create_data_share` ops=[—] — `const { data, error } = await (supabase as any).rpc('create_data_share', {`
- L213: **rpc** `create_shares_for_grantors` ops=[—] — `const { data, error } = await (admin as any).rpc('create_shares_for_grantors', {`
- L277: **rpc** `extend_data_share` ops=[—] — `const { data, error } = await (admin as any).rpc('extend_data_share', {`
- L300: **rpc** `revoke_data_share` ops=[—] — `const { data, error } = await (admin as any).rpc('revoke_data_share', {`
- L333: **rpc** `auto_renew_shares_on_visit` ops=[—] — `const { data, error } = await (admin as any).rpc('auto_renew_shares_on_visit', {`
- L366: **from** `patient_data_shares` ops=[select] — `.from('patient_data_shares')`
- L393: **from** `patient_data_shares` ops=[select] — `.from('patient_data_shares')`
- L420: **from** `patient_data_shares` ops=[select] — `.from('patient_data_shares')`
- L448: **from** `patient_data_shares` ops=[select] — `.from('patient_data_shares')`
- L472: **rpc** `mark_share_expired_notification` ops=[—] — `const { data, error } = await (admin as any).rpc('mark_share_expired_notification', {`

### `packages/shared/lib/data/patients.ts`

- L113: **from** `patients` ops=[select] — `.from('patients')`
- L150: **from** `patients` ops=[select] — `.from('patients')`
- L243: **from** `clinic_memberships` ops=[select] — `.from('clinic_memberships')`
- L258: **from** `doctor_patient_relationships` ops=[select, update] — `.from('doctor_patient_relationships')`
- L273: **from** `doctor_patient_relationships` ops=[update] — `.from('doctor_patient_relationships')`
- L314: **from** `patients` ops=[select, insert] — `.from('patients')`
- L330: **from** `doctor_patient_relationships` ops=[insert, select] — `.from('doctor_patient_relationships')`
- L355: **from** `doctor_patient_relationships` ops=[insert, select] — `.from('doctor_patient_relationships')`
- L378: **from** `patient_consent_grants` ops=[insert, update, select] — `.from('patient_consent_grants')`
- L397: **from** `patients` ops=[update] — `.from('patients')`
- L477: **from** `patients` ops=[select, update] — `.from('patients')`
- L490: **from** `doctor_patient_relationships` ops=[select, update, insert] — `.from('doctor_patient_relationships')`
- L499: **from** `doctor_patient_relationships` ops=[update, insert] — `.from('doctor_patient_relationships')`
- L505: **from** `doctor_patient_relationships` ops=[insert, update] — `.from('doctor_patient_relationships')`
- L525: **from** `patients` ops=[update] — `.from('patients')`
- L561: **from** `patients` ops=[select] — `.from('patients')`
- L597: **from** `users` ops=[insert] — `.from('users')`
- L615: **from** `patients` ops=[insert, select, delete] — `.from('patients')`
- L637: **from** `users` ops=[delete] — `await adminSupabase.from('users').delete().eq('id', userId)`
- L672: **from** `patient_phone_history` ops=[insert] — `.from('patient_phone_history')`
- L688: **from** `doctor_patient_relationships` ops=[insert, select] — `.from('doctor_patient_relationships')`
- L710: **from** `doctor_patient_relationships` ops=[insert, select, delete] — `.from('doctor_patient_relationships')`
- L724: **from** `patients` ops=[delete] — `await adminSupabase.from('patients').delete().eq('id', userId)`
- L725: **from** `users` ops=[delete] — `await adminSupabase.from('users').delete().eq('id', userId)`
- L758: **rpc** `get_next_anonymous_number` ops=[—] — `.rpc('get_next_anonymous_number', { p_doctor_id: doctorId })`
- L764: **from** `anonymous_visits` ops=[insert] — `.from('anonymous_visits')`
- L779: **from** `opt_out_statistics` ops=[insert] — `.from('opt_out_statistics')`
- L818: **from** `doctor_patient_relationships` ops=[select] — `.from('doctor_patient_relationships')`
- L844: **from** `patients` ops=[select] — `.from('patients')`
- L877: **from** `doctor_patient_relationships` ops=[select] — `.from('doctor_patient_relationships')`
- L904: **from** `patients` ops=[select] — `.from('patients')`
- L941: **from** `doctor_patient_relationships` ops=[select] — `.from('doctor_patient_relationships')`
- L952: **from** `clinical_notes` ops=[select] — `.from('clinical_notes')`
- L992: **from** `patients` ops=[select, update] — `.from('patients')`
- L1013: **from** `doctor_patient_relationships` ops=[update, select] — `.from('doctor_patient_relationships')`
- L1034: **from** `doctor_patient_relationships` ops=[update, select, insert] — `.from('doctor_patient_relationships')`
- L1057: **from** `patient_consent_grants` ops=[insert, update, select] — `.from('patient_consent_grants')`
- L1095: **from** `doctor_patient_relationships` ops=[select] — `.from('doctor_patient_relationships')`
- L1106: **from** `patient_consent_grants` ops=[select] — `.from('patient_consent_grants')`
- L1125: **from** `doctor_patient_relationships` ops=[select] — `.from('doctor_patient_relationships')`
- L1168: **from** `anonymous_visits` ops=[select] — `.from('anonymous_visits')`
- L1189: **from** `opt_out_statistics` ops=[select] — `.from('opt_out_statistics')`
- L1211: **from** `patients` ops=[select] — `.from('patients')`

### `packages/shared/lib/data/phone-changes.ts`

- L114: **from** `users` ops=[select] — `.from('users')`
- L121: **from** `patients` ops=[select] — `.from('patients')`
- L135: **from** `users` ops=[select] — `.from('users')`
- L158: **from** `phone_change_requests` ops=[select] — `.from('phone_change_requests')`
- L182: **from** `users` ops=[select] — `.from('users')`
- L204: **from** `patients` ops=[select] — `.from('patients')`
- L229: **from** `audit_events` ops=[select] — `.from('audit_events')`
- L318: **from** `audit_events` ops=[select] — `.from('audit_events')`
- L331: **from** `phone_change_requests` ops=[select] — `.from('phone_change_requests')`
- L382: **from** `phone_change_requests` ops=[insert, select] — `.from('phone_change_requests')`
- L408: **from** `phone_change_requests` ops=[update] — `.from('phone_change_requests')`
- L469: **from** `phone_change_requests` ops=[select] — `.from('phone_change_requests')`
- L533: **from** `phone_change_requests` ops=[update] — `.from('phone_change_requests')`
- L547: **from** `phone_change_requests` ops=[update] — `.from('phone_change_requests')`
- L565: **from** `phone_change_requests` ops=[update] — `.from('phone_change_requests')`
- L576: **from** `phone_change_requests` ops=[update] — `.from('phone_change_requests')`
- L637: **from** `phone_change_requests` ops=[update] — `.from('phone_change_requests')`
- L663: **rpc** `change_phone_rollback` ops=[—] — `await admin.rpc('change_phone_rollback', {`
- L764: **from** `phone_change_requests` ops=[select, update] — `.from('phone_change_requests')`
- L787: **from** `phone_change_requests` ops=[update] — `.from('phone_change_requests')`
- L836: **from** `phone_change_requests` ops=[select, update] — `.from('phone_change_requests')`
- L857: **from** `phone_change_requests` ops=[update, insert] — `.from('phone_change_requests')`
- L870: **from** `phone_change_requests` ops=[update, insert] — `.from('phone_change_requests')`
- L879: **from** `account_recovery_requests` ops=[insert] — `void admin.from('account_recovery_requests').insert({`
- L926: **from** `clinic_memberships` ops=[select] — `.from('clinic_memberships')`
- L933: **from** `patients` ops=[select] — `.from('patients')`
- L943: **from** `clinic_memberships` ops=[select] — `.from('clinic_memberships')`
- L961: **from** `patients` ops=[select] — `.from('patients')`
- L970: **from** `doctors` ops=[select] — `admin.from('doctors').select('full_name').eq('id', request.user_id).maybeSingle(),`
- L971: **from** `front_desk_staff` ops=[select] — `admin.from('front_desk_staff').select('full_name').eq('id', request.user_id).maybeSingle(),`
- L1001: **from** `clinic_memberships` ops=[select] — `.from('clinic_memberships')`
- L1020: **from** `phone_change_requests` ops=[select] — `.from('phone_change_requests')`
- L1033: **from** `clinic_memberships` ops=[select] — `.from('clinic_memberships')`
- L1042: **from** `patients` ops=[select] — `.from('patients')`
- L1055: **from** `account_recovery_requests` ops=[select] — `.from('account_recovery_requests')`
- L1065: **from** `audit_events` ops=[select] — `.from('audit_events')`
- L1099: **from** `clinic_memberships` ops=[select] — `.from('clinic_memberships')`
- L1114: **from** `phone_change_requests` ops=[select] — `.from('phone_change_requests')`
- L1184: **from** `clinic_memberships` ops=[select] — `.from('clinic_memberships')`
- L1199: **from** `phone_change_requests` ops=[select, update] — `.from('phone_change_requests')`
- L1219: **from** `phone_change_requests` ops=[update] — `.from('phone_change_requests')`
- L1288: **from** `patients` ops=[select] — `.from('patients')`
- L1307: **from** `users` ops=[select] — `.from('users')`
- L1332: **from** `patients` ops=[update, insert] — `.from('patients')`
- L1343: **from** `phone_corrections` ops=[insert] — `await admin.from('phone_corrections').insert({`
- L1355: **from** `patient_phone_history` ops=[insert] — `await admin.from('patient_phone_history').insert({`
- L1364: **from** `patient_phone_history` ops=[insert] — `await admin.from('patient_phone_history').insert({`

### `packages/shared/lib/data/prescription-sync.ts`

- L84: **from** `prescription_items` ops=[insert, select] — `.from('prescription_items')`
- L107: **from** `prescription_items` ops=[select] — `.from('prescription_items')`
- L154: **from** `prescription_items` ops=[select] — `.from('prescription_items')`
- L203: **from** `prescription_items` ops=[update, select] — `.from('prescription_items')`
- L227: **from** `prescription_items` ops=[delete] — `.from('prescription_items')`

### `packages/shared/lib/data/privacy-codes.ts`

- L107: **rpc** `check_phone_uniform` ops=[—] — `await supabase.rpc('check_phone_uniform', { p_phone: rawPhone })`
- L127: **rpc** `verify_privacy_code` ops=[—] — `const { data, error } = await (supabase as any).rpc('verify_privacy_code', {`
- L175: **rpc** `initiate_sms_share` ops=[—] — `await (supabase as any).rpc('initiate_sms_share', {`
- L210: **rpc** `verify_sms_code` ops=[—] — `const { data, error } = await (supabase as any).rpc('verify_sms_code', {`
- L256: **rpc** `regenerate_privacy_code` ops=[—] — `const { data, error } = await (supabase as any).rpc('regenerate_privacy_code', {`
- L287: **from** `patient_privacy_codes` ops=[select] — `.from('patient_privacy_codes')`
- L324: **from** `audit_events` ops=[select] — `.from('audit_events')`
- L356: **from** `global_patients` ops=[select] — `.from('global_patients')`
- L360: **from** `clinics` ops=[select, update] — `admin.from('clinics').select('name').eq('id', requestingClinicId).maybeSingle(),`
- L361: **from** `users` ops=[select, update] — `admin.from('users').select('name, email').eq('id', requestingDoctorId).maybeSingle(),`
- L382: **from** `audit_events` ops=[update] — `.from('audit_events')`
- L397: **from** `audit_events` ops=[update] — `.from('audit_events')`

### `packages/shared/lib/data/templates.ts`

- L36: **from** `templates` ops=[select] — `.from('templates')`
- L57: **from** `doctor_templates` ops=[select] — `.from('doctor_templates')`

### `packages/shared/lib/data/users.ts`

- L82: **from** `users` ops=[insert] — `.from('users')`
- L98: **from** `doctors` ops=[insert] — `.from('doctors')`
- L129: **from** `doctor_availability` ops=[upsert] — `.from('doctor_availability')`
- L194: **from** `users` ops=[insert] — `.from('users')`
- L210: **from** `patients` ops=[insert] — `.from('patients')`
- L242: **from** `clinics` ops=[insert, select] — `.from('clinics')`
- L262: **from** `clinic_memberships` ops=[insert] — `.from('clinic_memberships')`
- L288: **from** `doctors` ops=[select] — `.from('doctors')`
- L307: **from** `patients` ops=[select] — `.from('patients')`
- L369: **from** `users` ops=[insert] — `.from('users')`
- L382: **from** `front_desk_staff` ops=[insert] — `.from('front_desk_staff')`

### `packages/shared/lib/data/visibility.ts`

- L32: **from** `patient_visibility` ops=[select] — `.from('patient_visibility')`
- L84: **from** `patient_visibility` ops=[insert, select] — `.from('patient_visibility')`
- L112: **from** `patient_visibility` ops=[upsert, select] — `.from('patient_visibility')`
- L136: **from** `patient_visibility` ops=[delete] — `.from('patient_visibility')`
- L156: **rpc** `can_access_patient` ops=[—] — `const { data, error } = await supabase.rpc('can_access_patient', {`
- L187: **from** `patient_visibility` ops=[select] — `.from('patient_visibility')`
- L217: **from** `clinics` ops=[select, insert] — `.from('clinics')`
- L234: **from** `patient_visibility` ops=[insert, select] — `.from('patient_visibility')`

### `packages/shared/lib/notifications/create.ts`

- L66: **from** `notifications` ops=[insert] — `.from('notifications')`
- L116: **from** `notifications` ops=[insert] — `.from('notifications')`

### `packages/shared/lib/privacy/schema-health.ts`

- L42: **rpc** `get_public_table_names` ops=[—] — `.rpc('get_public_table_names')`
- L57: **rpc** `get_table_columns` ops=[—] — `.rpc('get_table_columns', { p_table_name: 'patients' })`

### `packages/shared/lib/security/rate-limit.ts`

- L42: **rpc** `consume_rate_limit` ops=[—] — `const { data, error } = await (admin as any).rpc('consume_rate_limit', {`

### `packages/shared/lib/sms/prescription-sms.ts`

- L240: **from** `sms_reminders` ops=[insert] — `await admin.from('sms_reminders').insert({`

### `packages/shared/lib/sms/reminder-service.ts`

- L32: **from** `sms_reminders` ops=[insert] — `await admin.from('sms_reminders').insert({`
- L68: **from** `appointments` ops=[select] — `.from('appointments')`

### `packages/shared/lib/utils/clinic-hours.ts`

- L38: **from** `doctor_availability` ops=[select] — `.from('doctor_availability')`
- L53: **from** `doctor_availability` ops=[select] — `.from('doctor_availability')`

### `packages/shared/lib/utils/invite-code.ts`

- L31: **from** `clinics` ops=[select] — `.from('clinics')`
