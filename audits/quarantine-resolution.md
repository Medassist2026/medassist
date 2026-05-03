# `_phone_normalize_quarantine` resolution log

> Created: 2026-04-28 during Build 02 staging apply (mig 071).
> Companion to `audits/patient-identity-build-02-staging-apply.md` § 2.
>
> Each row in `public._phone_normalize_quarantine` is a phone that mig
> 071's `normalize_phone_e164(...)` returned `NULL` for. The decision per
> row is one of:
>
> - **PATH A (recoverable)** — phone is correctable; UPDATE the source
>   table, DELETE the quarantine row, re-run the normalizer for that
>   row. Owner of the data must confirm the corrected number.
> - **PATH B (unrecoverable, deferred)** — leave the row in quarantine.
>   Prompt 3's mig 075 will emit a sentinel `global_patients` row for
>   the affected `patients`/`users` row (account_status reflects the
>   sentinel state — exact lifecycle is Prompt 3's call).
>
> Quarantine alone does NOT block mig 072 (read-only) or mig 073
> (assertion gates on `_patient_dedup_plan`, not on quarantine).
> Quarantine resolution is owed BEFORE the `patients.global_patient_id
> NOT NULL` flip in Prompt 3.

---

## Build 02 staging apply — 2026-04-28

### Inventory at apply time

```sql
SELECT table_name, COUNT(*) AS row_count
  FROM public._phone_normalize_quarantine
 GROUP BY table_name;
```

| table_name | row_count |
|------------|-----------|
| patients   | 3         |
| users      | 71        |
| **total**  | **74**    |

### Categorization (74 rows)

| Bucket | Count | Examples (raw_phone) | Reason for failure |
|---|---|---|---|
| A. Test data with extra leading 0 (`+2001…`, `+200…`) | ~30 | `+2001234737110`, `+2001132356789`, `+2001012345678`, `+2001222222224`, `+2001098765432`, `+200121212123` | After `+20`, an extra leading `0` makes 11 digits where the normalizer expects 10. |
| B. Invalid Egyptian mobile prefix (after `+20`, mobile must start `10/11/12/15`) | ~12 | `+201471221529`, `+201371221529`, `+20173846534`, `+201664783498`, `+20185348957`, `+20151624723` | Mobile prefix `13/14/15/16/17/18` (other than `15`) is not a valid Egyptian mobile range. |
| C. Wrong digit length after `+20` | ~14 | `+20143865734`, `+20111111111`, `+20156565656`, `+2014628895`, `+20100000001`, `+2012985675` | `length(digits) ≠ 10` after `+20`. |
| D. Non-Egypt country codes | ~5 | `+15555713308`, `+15551856092`, `+15554407060`, `+15559999`, `+2122222222` | `+1` (US) and `+2` short-form numbers. Out of scope for the Egyptian normalizer. |
| E. Other malformed / no `+20` | ~3 | `+223456789`, `+2234567891`, `+2345678910` | After `+`, doesn't start with country code `20`. |
| F. Sentinel / overflow strings | 6 (3 patients + 3 mirroring users) | `DEP_1774760598411_HE63R`, `DEP_1774891041036_AW55P`, `010343485734345` | Two `DEP_*` sentinels (already-departed/anonymized markers), one 15-digit overflow. The 3 patient quarantine UUIDs (`81696b8a…`, `bbb7c45a…`, `fdbc93ce…`) mirror exactly into the user quarantine — same UUIDs, same garbage phones. |

### Decision

**PATH B for ALL 74 rows.**

**Reasoning** (Mo, 2026-04-28).

- This is staging data: 74/323 ≈ 23 % of `(patients ∪ users)` is in
  quarantine. Real production data would not have anywhere near that
  rate; the bulk is seed/test rows (mostly bucket A — `+2001…` extra-
  leading-zero patterns characteristic of test fixtures). PATH A would
  burn a lot of operator time correcting fake numbers.
- Buckets A–E never represent real Egyptian patients — the inputs are
  syntactically not Egyptian mobile numbers. Correcting them would mean
  inventing values, which is worse than leaving them out of
  `global_patients` until Prompt 3.
- Bucket F's three `DEP_*` / 15-digit rows are explicitly marked as
  unsafe phones — leaving them quarantined preserves that signal.
- The 3 patient UUIDs mirror exactly into 3 user UUIDs — same person on
  both sides — which Prompt 3's mig 075 will pair into a single
  sentinel `global_patients` row.

**Action taken at this step:** none. The 74 rows remain in
`public._phone_normalize_quarantine`. Mig 072 (read-only) is safe to
proceed without quarantine resolution. Mig 073 is also safe (its gate
is on `_patient_dedup_plan`, not on quarantine).

**Follow-up owed (Prompt 3):** mig 075 emits a sentinel
`global_patients` row per quarantined `patients` / `users`, lifecycle
state per Prompt 3's design. After mig 075 lands, the
`patients.global_patient_id NOT NULL` flip becomes safe.

### Sign-off

Reviewed and signed off by Mo on 2026-04-28 (PATH B for all 74; quarantine deferred to Prompt 3 mig 075).
