# Mig 087 — Missing-pg_sleep edit confirmation

**Author:** Audit Session C continuation
**Date:** 2026-05-03
**Trigger:** Q3 ruling — edit mig 087 to add the missing `PERFORM pg_sleep(...)` pad before the wrong-code branch's terminal `RETURN v_failure_payload;`.
**Source detail:** `audits/database-audit/preapply-verif-087.md` § "Side-by-side: the missing statement" (lines 67–119).

---

## What was missing (pre-edit)

`verify_privacy_code` emits a uniform timing pad immediately before every `RETURN` in every branch. Six of seven branches in the file had this pad. The seventh branch — wrong-code, after the lockout-emit `IF v_new_attempts >= 5 THEN ... END IF;` block at file lines 454–473 — fell through directly to `RETURN v_failure_payload;` without the pad. Live staging has the pad on this branch.

| Source | `PERFORM pg_sleep` count in `verify_privacy_code` | `RETURN` count |
|---|---|---|
| Live staging (pre-edit) | 7 | 7 |
| File (pre-edit) | 6 | 7 |
| File (post-edit) | 7 | 7 |

---

## The edit

`Edit` tool, exact-string replacement on `supabase/migrations/087_privacy_code_functions.sql`.

**Old fragment (file lines 472–479):**

```sql
    );
  END IF;

  RETURN v_failure_payload;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.verify_privacy_code(TEXT, TEXT, UUID, UUID, INET, TEXT, UUID) FROM PUBLIC, anon;
```

**New fragment:**

```sql
    );
  END IF;

  PERFORM pg_sleep(GREATEST(0, (v_min_ms - EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000) / 1000.0));
  RETURN v_failure_payload;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.verify_privacy_code(TEXT, TEXT, UUID, UUID, INET, TEXT, UUID) FROM PUBLIC, anon;
```

The inserted statement is byte-identical to the six other `PERFORM pg_sleep(...)` calls in `verify_privacy_code` (lines 314, 324, 351, 373, 391, 423 in the pre-edit file). Indentation is two spaces, matching the surrounding `END IF;` / `RETURN v_failure_payload;` block (function-body level, not inside the IF).

## Header comment update

Augmented the file's "VERIFIED 2026-05-03 (Audit Session C, ruling R6)" block with a 2026-05-03 continuation note recording the additional body diff, the file edit, and the post-edit byte-level alignment. Verbatim insertion (between the existing "removes that dead variable" paragraph and "This file is now CANONICAL"):

```
-- 2026-05-03 (continuation, Q3 ruling): a second body diff was caught by
-- the pre-apply re-verification (audits/database-audit/preapply-verif-087.md).
-- The wrong-code branch's terminal RETURN was missing its uniform-timing pad
-- statement (`PERFORM pg_sleep(GREATEST(0, ...))`) that every other branch
-- in verify_privacy_code emits before its RETURN. Added the missing pg_sleep
-- pad in wrong-code branch terminal RETURN per preapply-verif-087.md so the
-- file body matches live byte-for-byte. After this edit `PERFORM pg_sleep`
-- count = 7 in both file and live (verified Step "Re-verify" in
-- audits/database-audit/mig-087-edit-confirmation.md).
```

---

## Re-verification

### Live (re-run, 2026-05-03)

Probe:

```sql
WITH live AS (
  SELECT pg_get_functiondef(p.oid) AS def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND proname = 'verify_privacy_code'
)
SELECT 
  (length(def) - length(replace(def, 'PERFORM pg_sleep', ''))) / length('PERFORM pg_sleep') AS perform_pg_sleep_count,
  (length(def) - length(replace(def, 'RETURN ', ''))) / length('RETURN ') AS return_count
FROM live;
```

Result:

```
perform_pg_sleep_count = 7
return_count           = 7
```

### File (post-edit)

Counted `PERFORM pg_sleep` occurrences within the bounded function block (file lines 284–488, where line 284 is `CREATE OR REPLACE FUNCTION public.verify_privacy_code(` and line 488 is the closing `$$;`):

```
$ awk 'NR>=284 && NR<=488' supabase/migrations/087_privacy_code_functions.sql | grep -c "PERFORM pg_sleep"
7
```

Sample of the pattern (line numbers within the awk slice; offset 283 from real file):

```
41:    PERFORM pg_sleep(...);
42:    RETURN v_failure_payload;
51:    PERFORM pg_sleep(...);
52:    RETURN v_failure_payload;
78:    PERFORM pg_sleep(...);
79:    RETURN v_failure_payload;
100:    PERFORM pg_sleep(...);
101:    RETURN v_failure_payload;
118:    PERFORM pg_sleep(...);
119:    RETURN v_failure_payload;
150:    PERFORM pg_sleep(...);
151:    RETURN jsonb_build_object(...);
202:  PERFORM pg_sleep(...);     ← NEW: wrong-code branch terminal pad
203:  RETURN v_failure_payload;
```

Every `RETURN` in the function is now preceded by a `PERFORM pg_sleep` pad, matching the live body.

### Verdict

**MATCH.** File `verify_privacy_code` now has 7 `PERFORM pg_sleep` statements within its body, identical to live staging. Re-applying mig 087 via `CREATE OR REPLACE FUNCTION` is now a true no-op for this function (was: would have silently stripped the wrong-code branch pad).

---

## Implication for the apply runbook

The runbook's Step 4 ("Apply mig 087 in-place edit; should now be true no-op") can rely on this confirmation. After the edit, mig 087's body matches live staging byte-for-byte (modulo non-semantic whitespace), and the previously-required behavioral acceptance from the V1 caveat is no longer needed.

The single-statement insertion is the only edit to mig 087 in this session. The file's earlier "removed dead variable v_pc_revoked_at" R6 edit is unchanged.

## Files touched

- `supabase/migrations/087_privacy_code_functions.sql`:
  - Added `PERFORM pg_sleep(...)` line before line 475's `RETURN v_failure_payload;` (now line 476).
  - Augmented header comment block with the 2026-05-03 continuation note.
- `audits/database-audit/mig-087-edit-confirmation.md` (this file).

No other code paths, RLS policies, application code, or tests were touched. The edit is read-only with respect to staging (no DDL applied). The file remains uncommitted in the working tree pending the apply runbook.
