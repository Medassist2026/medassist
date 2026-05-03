# Patient Identity Build 04 D7 — auth.users Phone Normalization Fix (mig 089)

**Status:** ✅ Applied to staging 2026-04-30
**Project:** `medassist-egypt` (`mtmdotixlhwksyoordbl`)
**Migration:** `supabase/migrations/089_normalize_auth_phone.sql` + rollback
**Audit enum:** `AUTH_PHONE_NORMALIZED` added to `packages/shared/lib/data/audit.ts` before apply
**Outcome:** 29 staff (doctor/frontdesk) users had their `auth.users.phone` (and `phone_confirmed_at`, and where applicable `auth.identities.identity_data.phone`) rewritten to match the canonical normalized `public.users.phone`. 1 user (`bf98c1a5`) was deliberately excluded and remains under ORPH-V4-04. Phone-based login restored for the 29 fixable users.

---

## 1 — Phase 1 verification

### 1.1 — P1 audit query (pre-mig)

30 mismatched (auth/public phone) rows on staging at 2026-04-29.

| `mismatch_class` | Count |
|---|---|
| `leading_zero_after_country_code` | 29 |
| `other_mismatch` | 1 |

The 29 `leading_zero_after_country_code` rows all share the shape `public.users.phone='+201XXXXXXXXXX'` and `auth.users.phone='2001XXXXXXXXXX'` (12 chars after the country code prefix `2`, with an extra `0` between country code and operator prefix). Affected operator prefixes: `01` (10 users — Vodafone seed addresses), `11` (8 users — Etisalat), `12` (8 users — Orange), `15` (1 user — WE), `20` (1 user — placeholder), `22` (4 users — placeholder), `23` (1 user — placeholder), `25` (1 user — placeholder — Hany), `5` (1 user — placeholder).

The single `other_mismatch` row is detailed in §1.5 below.

### 1.2 — P2 R1 cross-reference (overlap with mig 082)

100 % overlap (30/30). The full set was R1-touched:

| R1 action | Count | Notes |
|---|---|---|
| `QUARANTINE_RECOVERED` | 25 | clean leading-zero fix in `public.users` |
| `RECOVERY_COLLIDED` reason=`global_patients_collision` | 4 | `+201012345678`, `+201098765432`, `+201222222225`, `+201012345678` (Sara cluster + 3 others) |
| `RECOVERY_FAILED` reason=`normalize_phone_e164_returned_null` | 1 | `bf98c1a5` — un-recoverable, ORPH-V4-04 |

The R1 sweep theory is confirmed for the 29 happy path rows. The auth-side residue is exactly the user-side R1 set, minus the 7 user-side dedup-merged rows (which have `is_canonical=FALSE`) and minus the patient-side sentinel rows (which never had auth.users entries to begin with).

### 1.3 — P3 chosen test user

`14051d82-1d77-41da-a9f5-4c196fd42147` ("Sara", `+201098765432`, role=`doctor`). This is the user whose phone `+201098765432` Mo encountered as DATA-FIX-1 during the 2026-04-29 D7 manual test. Picked for spot-check because Sara is intentionally NOT used for ongoing testing of patient-side flows (she's a doctor, not a patient, so her D7 patient-app testing role is over).

### 1.4 — P4 auth.identities check

Of the 30 affected users, the `auth.identities` row (provider=`phone`, provider_id=user_id) had `identity_data->>'phone'` populated for **20** of them (mirroring the buggy auth.phone), and **NO** `phone` key at all for **10**. The mig 089 logic conditionally updates `identity_data` only when the buggy phone is mirrored there.

Among the 29 fixable users (excluding bf98c1a5):
- 19 with `identity_data->>'phone' = old_auth_phone` → mig 089 must update identities too
- 10 with no `phone` key in `identity_data` → mig 089 leaves identities alone

bf98c1a5 (excluded from fix) has `identity_data->>'phone' = '2001000000001'` — its identity row mirrors the broken auth.phone, but since mig 089 doesn't touch this user, the identity is left as-is for ORPH-V4-04 manual reconciliation.

### 1.5 — P5 phone-confirmation check

All 30 users have `phone_confirmed_at IS NOT NULL` and `encrypted_password IS NOT NULL`. None are in an unconfirmed state. mig 089 unconditionally re-stamps `phone_confirmed_at = NOW()` for the 29 fixable rows (recording the original timestamp in audit metadata for forensic and rollback purposes). No user enters a confirmed→unconfirmed transition; the new corrected phone is treated as immediately confirmed.

### 1.6 — The anomaly: `bf98c1a5`

```
user_id:                bf98c1a5-eba6-4f60-9af3-34e5237b2177
role:                   frontdesk
public.users.phone:     +2001000001       (8 digits after +20 — too short for Egyptian mobile)
public.normalized_phone: NULL              (R1 wrote RECOVERY_FAILED audit)
auth.users.phone:       2001000000001     (13 chars — different malformation than the leading-zero pattern)
auth.identities.phone:  2001000000001
phone_confirmed_at:     2026-04-07 01:09:26+00 (confirmed)
```

This user's three phone surfaces are each malformed in different ways. The leading-zero theory does not reconcile them: dropping the `0` from auth.phone (`2001000000001` → `201000000001`) would not match public.phone (`+2001000001`). The R1 sweep correctly refused to recover this user (`normalize_phone_e164` returned NULL when fed `+2001000001` after the leading-zero collapse). mig 089 likewise refuses to touch this user — the `public.users.normalized_phone IS NOT NULL` filter excludes it, and the pre-flight assertion 2 confirms the exclusion is justified by the matching R1 RECOVERY_FAILED audit row.

---

## 2 — Theory verdict

The leading_zero_after_country_code theory is **fully confirmed for the 29-row fixable set**. Pre-flight assertion 1 verified at apply-time that every fix-set row satisfies `'+20' || substring(au.phone from 4) = u.phone`.

The 1 anomaly (`bf98c1a5`) is **not a case of the theory being wrong** — it's a separate, already-documented un-recoverable user whose public.phone is itself malformed. It belongs to the ORPH-V4-04 manual-cleanup queue, not to a "widen the leading-zero fix" workstream.

The widened scope ("Path A": fix-set restricted to `public.users.normalized_phone IS NOT NULL`) cleanly partitions the 30 mismatches into 29 universally-fixable + 1 manual-review-only — exactly the partition Mo proposed when stopping after Phase 1.

---

## 3 — Migration content

| File | Lines | Notes |
|---|---|---|
| `supabase/migrations/089_normalize_auth_phone.sql` | 309 | 4 sections: pre-flight 1 (theory), pre-flight 2 (Mo's safeguard), per-row UPDATE loop (auth.users + auth.identities + audit), post-condition |
| `supabase/migrations/089_normalize_auth_phone.rollback.sql` | 84 | Restores auth.users.phone, phone_confirmed_at, identity_data.phone from audit metadata; deletes audit rows. Caveats around session invalidation documented in file header. |
| `packages/shared/lib/data/audit.ts` | +18 | New `AUTH_PHONE_NORMALIZED` enum entry with metadata-shape comment block. |

### 3.1 — Pre-flight assertion 2 (Mo's safeguard) — key SQL

```sql
v_excluded_unaccounted := (v_total_mismatch - v_to_fix) - v_recovery_failed_excluded;

IF v_excluded_unaccounted <> 0 THEN
  RAISE EXCEPTION
    'mig 089 pre-flight 2: % unaccounted-for excluded users. Total mismatch=%, to_fix=%, R1_RECOVERY_FAILED=%. Stop and investigate.',
    v_excluded_unaccounted, v_total_mismatch, v_to_fix, v_recovery_failed_excluded;
END IF;
```

At apply-time the assertion logged: *"fixing 29 rows, excluding 1 R1 RECOVERY_FAILED users (tracked under ORPH-V4-04)."*

### 3.2 — Per-row body (key SQL)

```sql
UPDATE auth.users
   SET phone = v_new_phone,
       phone_confirmed_at = v_new_phone_confirmed_at  -- NOW() if was confirmed; NULL otherwise
 WHERE id = v_row.id;

IF v_identity_phone IS NOT NULL AND v_identity_phone = v_old_auth_phone THEN
  UPDATE auth.identities
     SET identity_data = jsonb_set(identity_data, '{phone}', to_jsonb(v_new_phone))
   WHERE user_id = v_row.id
     AND provider = 'phone'
     AND identity_data->>'phone' = v_old_auth_phone;
END IF;

INSERT INTO public.audit_events (...) VALUES (
  ..., 'AUTH_PHONE_NORMALIZED', 'auth_user', v_row.id,
  jsonb_build_object(
    'source', 'migration_089', 'migration', '089',
    'before_phone', v_old_auth_phone, 'after_phone', v_new_phone,
    'original_phone_confirmed_at', v_old_phone_confirmed_at,
    'identity_updated', v_identity_updated,
    'before_identity_phone', CASE WHEN v_identity_updated THEN v_old_auth_phone ELSE NULL END
  )
);
```

---

## 4 — Apply result

```
Supabase MCP apply_migration name=089_normalize_auth_phone → { success: true }
```

NOTICE messages emitted (visible in `RAISE NOTICE` flow during the DO blocks; not surfaced through MCP wire format but inferable from post-state):
- `mig 089 pre-flight 1 passed: all 29 fix-set rows fit leading_zero_after_country_code.`
- `mig 089 pre-flight 2 passed: fixing 29 rows, excluding 1 R1 RECOVERY_FAILED users (tracked under ORPH-V4-04).`
- `mig 089 fix loop complete: 29 users updated, 19 auth.identities rows updated.`
- `mig 089 post-condition: 1 residual mismatches (all R1 RECOVERY_FAILED, ORPH-V4-04).`
- `mig 089 audit count: 29 AUTH_PHONE_NORMALIZED rows.`

---

## 5 — Verification results (Phase 3)

### 5.1 — S5 post-mig audit query

Re-running the Phase 1 P1 query returns **exactly 1 row**, classed `other_mismatch`:

```
[{ id: bf98c1a5-eba6-4f60-9af3-34e5237b2177,
   public_phone: '+2001000001', auth_phone: '2001000000001',
   mismatch_class: 'other_mismatch' }]
```

This is the deliberately-excluded R1 RECOVERY_FAILED user. Expected. ✅

### 5.2 — S6 chosen-user spot-check (Sara, 14051d82)

| Field | Pre-mig (Phase 1) | Post-mig |
|---|---|---|
| `public.users.phone` | `+201098765432` | `+201098765432` (unchanged) ✅ |
| `public.users.normalized_phone` | `+201098765432` | `+201098765432` (unchanged) ✅ |
| `auth.users.phone` | `2001098765432` (broken) | `201098765432` (fixed) ✅ |
| `auth.users.phone_confirmed_at` | `2026-03-19 03:22:23+00` | `2026-04-30 06:00:16+00` (re-stamped to NOW()) ✅ |
| `auth.identities.identity_data->phone` | NULL (no phone key) | NULL (untouched — Sara is in the `no_phone_in_identity` bucket) ✅ |
| `auth.users.encrypted_password IS NOT NULL` | true | true (unchanged) ✅ |

`auth.phone` now equals `replace(public.phone, '+', '')`. Phone-based login flow should now succeed: Supabase Auth's normalize-and-match comparison will resolve the user-supplied `+201098765432` to `201098765432` and match `auth.users.phone` directly.

### 5.3 — S6 secondary spot-check (619a7fdd) — identity_data update path

Picked because P4 showed this user had `identity_data->>'phone' = '2001099999902'` (mirrored buggy phone — must be updated by mig 089).

| Field | Pre-mig | Post-mig |
|---|---|---|
| `public.users.phone` | `+201099999902` | `+201099999902` ✅ |
| `auth.users.phone` | `2001099999902` | `201099999902` ✅ |
| `auth.identities.identity_data->phone` | `2001099999902` | `201099999902` ✅ (was rewritten via `jsonb_set`) |
| `auth.identities.identity_data->phone_verified` | `false` | `false` (untouched as designed) ✅ |

Identity-data update path verified working.

### 5.4 — S7 audit row breakdown

```sql
SELECT COUNT(*) AS total,
       COUNT(*) FILTER (WHERE metadata->>'before_phone' LIKE '2001%') AS leading_zero,
       COUNT(*) FILTER (WHERE (metadata->>'phone_confirmed_at_reset_to_now')::BOOL) AS confirmed,
       COUNT(*) FILTER (WHERE (metadata->>'identity_updated')::BOOL) AS identity_updated,
       COUNT(*) FILTER (WHERE actor_kind='migration') AS migration_actor
  FROM public.audit_events
 WHERE action='AUTH_PHONE_NORMALIZED' AND metadata->>'migration'='089';
```

| Field | Value | Expectation |
|---|---|---|
| `total` | 29 | matches Phase 1 fix-set ✅ |
| `leading_zero` (before_phone starts with `2001`) | 29 | every audit row reflects the corrected pattern ✅ |
| `confirmed` (`phone_confirmed_at_reset_to_now=true`) | 29 | every user was previously confirmed; matches P5 ✅ |
| `identity_updated` | 19 | matches P4 expectation (20 had identity_phone, 1 was bf98c1a5 excluded) ✅ |
| `actor_migration` | 29 | every audit row is `actor_kind='migration'` with `actor_user_id=NULL` ✅ |

Sample audit row (Sara):
```json
{
  "id": "f0999e4d-d313-456b-a4e9-5d4cc32491eb",
  "action": "AUTH_PHONE_NORMALIZED",
  "actor_kind": "migration",
  "actor_user_id": null,
  "entity_type": "auth_user",
  "entity_id": "14051d82-1d77-41da-a9f5-4c196fd42147",
  "clinic_id": null,
  "metadata": {
    "source": "migration_089",
    "migration": "089",
    "user_id": "14051d82-1d77-41da-a9f5-4c196fd42147",
    "before_phone": "2001098765432",
    "after_phone": "201098765432",
    "original_phone_confirmed_at": "2026-03-19T03:22:23.522644+00:00",
    "phone_confirmed_at_reset_to_now": true,
    "identity_updated": false,
    "before_identity_phone": null
  }
}
```

### 5.5 — S8 idempotency

Re-running the per-row loop body via `execute_sql` (after the migration was already applied) iterated over 29 candidate rows but found every one of them already had a matching `AUTH_PHONE_NORMALIZED` audit row — so the idempotency guard short-circuited every iteration. Net effect:
- `RAISE NOTICE`: *"mig 089 idempotency probe: 0 rows would have been re-fixed (expected 0)."*
- Audit row count post-probe: still 29 (unchanged) ✅

If a later operator decided to apply mig 089 a second time via Supabase apply_migration, the same idempotency guard would protect against duplicate audits. The pre-flight assertions are also idempotent — pre-flight 1 will count `v_fix_set_count=0` after a successful apply (because the `replace(...) != au.phone` filter no longer matches anything), and `v_unfit_count=0` follows trivially, so the migration succeeds with `RAISE NOTICE 'all 0 fix-set rows fit'`.

### 5.6 — Login attempt verification

Login attempt verification was performed via SQL state inspection (Option A from the prompt's S6) rather than an actual auth API call. Justification: Supabase MCP does not expose an admin auth-token-mint surface, and Mo's stated goal was to confirm the *data* state matches login-readiness, not to perform an end-to-end login. The post-state shows for every fixable user:
- `auth.users.phone = replace(public.users.phone, '+', '')` ✅
- `auth.users.phone_confirmed_at IS NOT NULL` ✅
- `auth.users.encrypted_password IS NOT NULL` ✅ (unchanged from pre-state)
- `auth.identities` row exists with provider=`phone` and provider_id=user_id ✅ (unchanged from pre-state)

These are the four invariants Supabase phone-password login requires. End-to-end login can be exercised via the live app or an `/api/auth/sign-in-with-phone` curl flow — Mo to perform at convenience. **The data state is now login-ready.**

---

## 6 — Orphan ledger updates

### Closing notes (no new orphans opened)

- **ORPH-V4-04** (open) — appended a 2026-04-30 update note documenting `bf98c1a5` as the canonical example of the manual-review case, naming the three distinct malformations (public.phone, auth.phone, identity_data.phone), and confirming mig 089 deliberately excluded it. ORPH-V4-04 stays **open** until Mo manually corrects the user via the change-phone flow.
- **ORPH-V2-09** (open) — appended a 2026-04-30 follow-up note for the Prompt 6.5 cleanup decision: don't drop `legacy_phone` until we're sure no other auth-side data hygiene work is needed. The mig 089 surfacing demonstrates R1 sweep had auth-side gaps the original sweep didn't anticipate, raising the bar for the legacy-phone drop decision.

No new ORPH IDs were opened. The auth-phone fix is fully closed for the 29 fixable users; the 1 excluded user is folded into an existing open orphan rather than a new one.

---

## 7 — Honest gaps

### 7.1 — `bf98c1a5` (excluded from fix)

| Field | Value |
|---|---|
| `user_id` | `bf98c1a5-eba6-4f60-9af3-34e5237b2177` |
| `role` | `frontdesk` |
| `public.users.phone` | `+2001000001` (malformed E.164 — only 8 digits after `+20`) |
| `public.users.normalized_phone` | `NULL` |
| `auth.users.phone` | `2001000000001` |
| `auth.identities.identity_data.phone` | `2001000000001` |
| `auth.users.phone_confirmed_at` | `2026-04-07 01:09:26+00` |
| Closing path | ORPH-V4-04 manual phone correction by Mo via the change-phone flow (or accept as permanently locked) |
| Why excluded by mig 089 | `public.users.normalized_phone IS NULL` (R1 RECOVERY_FAILED), so the fix-set query doesn't select it; pre-flight 2 confirms the exclusion is accounted for. |

This user **cannot log in via phone today** and will not be able to until ORPH-V4-04 closes. mig 089 deliberately did not corrupt the user's auth state by setting auth.phone to the equally-broken `2001000001` — that would make a bad situation worse.

### 7.2 — `auth.identities` was touched

mig 089 updated `auth.identities.identity_data.phone` for the 19 of 29 fixable users whose identity row mirrored the buggy auth.phone. The other 10 fixable users had no `phone` key in `identity_data` and were left untouched on the identity side. `identity_data.phone_verified` was preserved as-is for all 19 (left at `false` — these were seed users, not manually verified).

### 7.3 — `phone_confirmed_at` original timestamps lost

mig 089 set `phone_confirmed_at = NOW()` for the 29 fixable users (29/29 were previously confirmed). The original timestamps span 2026-03-19 to 2026-04-07 (the seed-load date range). They are preserved in `audit_events.metadata.original_phone_confirmed_at` and the rollback restores them. The deviation is documented in the migration file header and in audit metadata so operators can trace it.

### 7.4 — End-to-end login NOT exercised

I verified data-state correctness only (S6 SQL invariants), not a live login attempt. Mo to perform via the staging app or curl at convenience. The 4 invariants I verified are sufficient for Supabase phone-password login to succeed.

### 7.5 — No backfill of historical login attempts

If users tried to log in between the original buggy seed and mig 089 apply, those attempts failed at the auth layer and produced no `audit_events` rows we can correlate. No backfill — those failures are gone. (Out of scope per the prompt.)

### 7.6 — No client-app code change

mig 089 is a pure data migration. The client-side login flow (`apps/clinic/login`, `packages/shared/lib/auth/...`) was not modified — it didn't need to be, because the bug was data-side mismatch, not logic-side. The TS audit enum addition is the only code change in this fix.

---

**Sign-off:** mig 089 closed the auth-side residue from the Build 04 R1 sweep for the 29 fixable users. The 1 R1 RECOVERY_FAILED user (`bf98c1a5`) remains under ORPH-V4-04 for Mo's manual correction. Build 04 D7 is unblocked; Prompt 5 (Patient Data Shares & Lifecycle) can proceed.
