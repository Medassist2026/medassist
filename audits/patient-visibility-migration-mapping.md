# patient_visibility → patient_data_shares migration mapping

**Build prompt 05 § B3 conditional migration decision.**
**Date: 2026-04-29 (staging snapshot).**

## Question
Should rows from `patient_visibility` be backfilled into the new
`patient_data_shares` table (mig 090)?

## Answer
**No.** The two tables represent fundamentally different consent models,
and `patient_data_shares`'s schema-level constraints actively reject every
existing `patient_visibility` row.

## Inventory (staging, 2026-04-29)

```
total rows                    : 32
rows with no expiry           : 32
rows expired                  : 0
rows with consent='revoked'   : 0
grantee_type='clinic'         : 0
grantee_type='doctor'         : 32
mode                          : DOCTOR_SCOPED_OWNER (all 32)
consent                       : IMPLICIT_CLINIC_POLICY (all 32)
earliest                      : 2026-04-12 09:40:09 UTC
latest                        : 2026-04-25 18:50:40 UTC
```

## Why migration is inappropriate

1. **Different semantics.** `patient_visibility.DOCTOR_SCOPED_OWNER + IMPLICIT_CLINIC_POLICY` represents a doctor (owner role) having visibility over patients _at their own clinic_ — an **intra-clinic** access model. `patient_data_shares` is the **cross-clinic** consent model: grantor clinic granting grantee clinic visibility over a patient's records. They are not the same thing.

2. **Schema-level rejection.** `patient_data_shares` carries `CHECK (grantor_clinic_id != grantee_clinic_id)`. To migrate a `patient_visibility` row we would need a grantor and grantee clinic, but the existing rows describe one-clinic relationships only. There is no second clinic to fill in.

3. **No data is lost.** `patient_visibility` continues to exist and continues to back the legacy `/api/patient/sharing` GET handler (which returns `{ grants: [...] }`). Per memory note `RLS Rewrite Status (Mig 020/021)`, the live grants point to OWNERs and clinics are effectively solo today, so the existing rows do not represent any cross-clinic consent that would need a `patient_data_shares` representation.

4. **Prompt 6.5 owns the deprecation.** The prompt explicitly forbids dropping `patient_visibility` (Prompt 6.5's exclusive scope). Migration would only be useful if the rows held cross-clinic grants worth preserving — they do not.

## Operational consequences

- The legacy `/api/patient/sharing` `GET` handler continues to return rows from `patient_visibility` in the `grants` array.
- Build 05 augments that handler to ALSO return rows from `patient_data_shares` in a new `shares` array. Old patient-app clients that read `grants` keep working; the new sharing UI reads `shares`.
- The legacy handler's `DELETE` path (which keys on `visibilityId` and writes a `REVOKE_SHARE` audit) is preserved and untouched by Build 05.
- No schema changes to `patient_visibility` in this build.

## Open orphan

`ORPH-V5-02` — `patient_visibility` table deprecation. Closed by Prompt 6.5
once RLS rewrite verifies safety. The 32 existing rows can be (a) deleted as
no-ops if the data layer is fully cut over to `patient_data_shares`, or (b)
left in place as a frozen historical record. Decision deferred to Prompt 6.5.

## Conclusion

No row-level migration is performed in Build 05. The architectural decision
(documented above) is recorded so a future audit can confirm the gap was
intentional, not an oversight.
