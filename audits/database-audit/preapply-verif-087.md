# Pre-Apply Verification — Mig 087 Body Alignment

**Captured:** 2026-05-03
**Verifier:** Pre-apply read-only verification session
**Source of truth:** `pg_get_functiondef()` on staging (medassist-egypt, mtmdotixlhwksyoordbl) at 2026-05-03 17:00 UTC
**Compared against:** `supabase/migrations/087_privacy_code_functions.sql` working tree

---

## Summary

**7 of 8 functions MATCH; 1 is BEHAVIORAL.**

Session C's R6 claim — that the file matches staging "modulo cosmetic diffs (whitespace, VOLATILE keyword, comments, dead `v_pc_revoked_at` variable)" — is **CONTRADICTED**. There is a second body discrepancy in `verify_privacy_code` that Session C did not document:

> The file is missing one `PERFORM pg_sleep(GREATEST(0, ...));` statement immediately before the final `RETURN v_failure_payload;` at the bottom of the wrong-code/lockout path.

If the file is reapplied via `CREATE OR REPLACE`, this would silently REMOVE that statement from the live function body — a measurable schema change, not a no-op as the apply-runbook spec assumes.

**Recommendation: do not apply the file in its current form.** Either (a) edit the file to add the missing `PERFORM pg_sleep(...)` before the final RETURN so reapplication is truly a no-op, or (b) accept the behavioral change explicitly, document why, and update the runbook's failure-mode trigger.

---

## Per-function verdicts

| # | Function | Args | Verdict |
|---|---|---|---|
| 1 | `_generate_privacy_code_plaintext` | `()` | MATCH |
| 2 | `_generate_sms_code_plaintext` | `()` | MATCH |
| 3 | `record_privacy_code_attempt` | `(uuid, uuid, uuid, uuid, privacy_code_attempt_result, inet, text, uuid)` | MATCH |
| 4 | `regenerate_privacy_code` | `(uuid)` | MATCH |
| 5 | `verify_privacy_code` | `(text, text, uuid, uuid, inet, text, uuid)` | **DIFFERENT-BEHAVIORAL** |
| 6 | `check_phone_uniform` | `(text)` | MATCH |
| 7 | `initiate_sms_share` | `(text, uuid, uuid, uuid)` | MATCH |
| 8 | `verify_sms_code` | `(text, text, uuid, uuid, inet, text, uuid)` | MATCH |

All 8 functions match on the gating attributes:
- `prosecdef = true` (SECURITY DEFINER) — all 8 ✓
- `proconfig = ['search_path=public, extensions, pg_temp']` — all 8 ✓
- Identity arguments — all 8 ✓
- Return type — all 8 ✓
- LANGUAGE — all 8 ✓

The differences are confined to function bodies. Cosmetic-only diffs (whitespace collapse, comment stripping, `VOLATILE` keyword stripped by Postgres default) are present in all 7 MATCH cases and treated as acceptable per the spec.

---

## DIFFERENT-BEHAVIORAL: `verify_privacy_code`

### Statement counts

Probe used:
```sql
SELECT
  (length(def) - length(replace(def, 'PERFORM pg_sleep', ''))) / length('PERFORM pg_sleep') AS perform_pg_sleep_count,
  (length(def) - length(replace(def, 'RETURN ', ''))) / length('RETURN ') AS return_count
FROM (SELECT pg_get_functiondef(p.oid) AS def FROM pg_proc p ...) sub;
```

| Source | `PERFORM pg_sleep` count | `RETURN ` count |
|---|---|---|
| Live staging | **7** | 7 |
| File `087_privacy_code_functions.sql` | **6** | 7 |

The repo file has every RETURN that live has but is missing one of the seven `PERFORM pg_sleep(...)` statements that surround them.

### Side-by-side: the missing statement

The discrepancy is at the very bottom of `verify_privacy_code`, in the wrong-code branch (after `v_match` is FALSE, after the failure audit insert, and inside/after the `IF v_new_attempts >= 5 THEN ... END IF;` lockout-emit block).

**File `supabase/migrations/087_privacy_code_functions.sql` lines 454–476:**

```sql
  IF v_new_attempts >= 5 THEN
    -- Patient SMS notification on per-code lockout. ...
    INSERT INTO public.audit_events (
      clinic_id, actor_user_id, actor_kind, action,
      entity_type, entity_id, metadata
    ) VALUES (
      p_attempted_by_clinic_id, NULL, 'system',
      'PRIVACY_CODE_LOCKED',
      'global_patients', v_gpid,
      jsonb_build_object(
        'privacy_code_id', v_pc_id,
        'locked_until', (NOW() + INTERVAL '24 hours'),
        'attempts_count', v_new_attempts,
        'sms_dispatch_pending', TRUE
      )
    );
  END IF;

  RETURN v_failure_payload;
END;
```

**Live staging body (corresponding region):**

```sql
  IF v_new_attempts >= 5 THEN
    INSERT INTO public.audit_events (
      clinic_id, actor_user_id, actor_kind, action, entity_type, entity_id, metadata
    ) VALUES (
      p_attempted_by_clinic_id, NULL, 'system', 'PRIVACY_CODE_LOCKED',
      'global_patients', v_gpid,
      jsonb_build_object(
        'privacy_code_id',v_pc_id,
        'locked_until',(NOW() + INTERVAL '24 hours'),
        'attempts_count',v_new_attempts,
        'sms_dispatch_pending',TRUE));
  END IF;

  PERFORM pg_sleep(GREATEST(0, (v_min_ms - EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000) / 1000.0));
  RETURN v_failure_payload;
END;
```

The file is missing the `PERFORM pg_sleep(...)` line immediately before the final `RETURN v_failure_payload;`. Every other branch in the function (normalize-NULL, no-such-gpid, rate-limited, no-active-code, locked-out, success) does have its own pg_sleep before its RETURN, in both file and live. Only the wrong-code branch's terminal RETURN is missing the pad statement in the file.

Sanity check: the file's pg_sleep instances are at lines 314, 324, 351, 373, 391, 423 (six); live's bodies emit those six plus one more before the final `RETURN v_failure_payload;`.

### Practical effect

Bcrypt verify (`crypt(p_code, v_pc_hash) = v_pc_hash`) executed earlier in this branch takes ~400 ms at cost 12. The pad is `GREATEST(0, (50 - elapsed_ms) / 1000.0)`; with elapsed_ms ≥ 400, the pad is always 0 and pg_sleep returns immediately. **Runtime behavior is identical** between the two bodies in steady state.

### Why it still matters

The spec for this verification defines BEHAVIORAL as including "Different SQL statements." The file has one fewer SQL statement than live in this function. Two consequences:

1. **Reapplying the file via `CREATE OR REPLACE FUNCTION` will produce a measurable change to `pg_get_functiondef()` output** — the function body shrinks by one statement. The runbook's Step 3 expectation ("Live function bodies should not change because the file edits are no-ops on staging") would be violated, and its failure-mode trigger ("STOP. Live function bodies should not change because the file edits are no-ops on staging. If CREATE OR REPLACE produces a real change, the verification was wrong.") would fire on apply.
2. **Session C's R6 byte-alignment claim is contradicted.** The file's header comment (lines 36–39) asserts the only body delta from live is the dead `v_pc_revoked_at` variable. There is at least one more delta. Either the audit's diffing missed it, or it was applied on staging out of band after the file was last edited.

---

## Greenlight criterion

The spec requires: *"all functions are MATCH or DIFFERENT-COSMETIC-PLUS. Any single BEHAVIORAL difference invalidates Session C's R6 claim and requires a real rewrite."*

**This verification does NOT meet the greenlight criterion.** One function (`verify_privacy_code`) has a DIFFERENT-BEHAVIORAL verdict.

---

## Recommended next step

Option A (fastest, preserves the "no-op apply" property): edit the file to insert the missing `PERFORM pg_sleep(...)` before line 475's `RETURN v_failure_payload;`. After the edit, re-run this verification — all 8 functions should be MATCH and the runbook's no-op assumption holds.

Option B: accept that applying the file will silently strip one pad statement from the wrong-code path. Update the runbook's Step 3 expectation to "live function bodies should match the file after apply, not before" and explicitly call out this single-statement removal in the apply log. Practically a no-op at runtime (bcrypt naturally pads), but the schema_migrations row will record the body change.

Option C: investigate when and why staging's body diverged from the file. The file lacks the line; staging has it. Either (i) the file was edited to remove it post-deploy and the edit was never reapplied, or (ii) staging was hot-patched to add it after a deploy. Searching the migration tracking table (087 has three rows; the third hardening row may have added this) and the git log for the file would settle which.

Pending a chosen option, **do not proceed to write the apply runbook** and **do not apply mig 087 in-place to staging**.
