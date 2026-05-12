# Deferral C — ESLint config migration (2026-05-11)

Phase F Task 20 cleanup track. Closes Dependabot advisory cluster rooted at
`eslint-config-next` per `audits/dependabot-inventory-2026-05-11.md`.

## Executive summary

| | |
|---|---|
| Commit | (TBD — set at push) |
| Target version (eslint-config-next) | **15.5.18** (NOT 16.x — see §1) |
| Migration scope (Mo's ruling) | **Full flat-config via FlatCompat** (Path C in pre-flight surface) |
| Advisories closed (unique, npm-audit dedup) | **7** (pre: 18 → post: 11) |
| Sandbox gates | 4/4 clean |
| Custom rule empirical verification | Pass (violation fires, revert clean) |
| Total session time (Deferral C only) | ~45 min |

## 1. Why 15.x not 16.x — STOP exception #1 invoked

The combined-batch prompt's literal target was `eslint-config-next@16.2.6`.
The Dependabot inventory targeted 16.x because it was "latest stable," not
because 16.x is required for advisory closure. Empirical npm-registry findings:

- Advisory range (row 15): `14.0.5-canary.0 - 15.0.0-rc.1`. **Fix-version =
  15.0.0 stable.** So 15.x closes the parent advisory; 16.x is unnecessary
  for security.
- `eslint-config-next@15.x` peerDep: `eslint: ^7 || ^8 || ^9`, no `next`
  peer listed. Compatible with our Next 14.2.35.
- `eslint-config-next@16.x` peerDep: `eslint: >=9`. Layout/dep changes
  (`typescript-eslint@^8.46.0` meta package, `globals@16.4.0`) suggest
  Next 16-era integration. Higher coupling risk.

Mo's ruling (2026-05-11): use **`eslint-config-next@15.5.18`** (latest 15.x
stable). Deferral C completes its advisory-closure goal; Next 16 + native
flat-config integration in eslint-config-next@16 await Deferral A.

## 2. Why FlatCompat — Path C in scope surface

`eslint-config-next@15.x` still ships as a legacy `.eslintrc`-style config.
Native flat-config support landed in `eslint-config-next@16.x`. To do the
migration the prompt requested while remaining on 15.x, we bridge via
`@eslint/eslintrc`'s `FlatCompat.extends('next/core-web-vitals')`.

Surfaced to Mo (2026-05-11) as Path A (minimal, no flat config) / Path B
(ESLint 9 + legacy config) / Path C (full flat config with FlatCompat).
**Mo chose Path C.**

Trade-off: FlatCompat adds one dev dep + one shim file. Deferral A's eventual
Next bump will let us drop FlatCompat and use direct flat-config imports
from `eslint-config-next@16`. Documented in `eslint.config.mjs` header.

## 3. Concrete changes

### Files modified

- `package.json` (root):
  - `eslint`: `^8` → `^9.39.4`
  - `eslint-config-next`: `14.1.0` → `15.5.18`
  - Added `@eslint/eslintrc: ^3.3.5` (FlatCompat shim)
  - Added `@typescript-eslint/parser: ^8.59.3` (direct dep for scopes config;
    was previously a transitive of `eslint-config-next@14`)
  - `lint` script: `next lint` → `eslint .` (Next 14.2.35's `next lint` does
    not auto-discover flat config)
  - `lint:scopes` script: rewritten to use `eslint --config
    eslint.config.scopes.mjs --no-config-lookup --quiet <globs>` (ESLint 9
    removed `--no-eslintrc`, `--rulesdir`, `--parser`, `--ext`)
- `apps/clinic/package.json`: same eslint + eslint-config-next bump, `lint`
  script `next lint` → `eslint .`
- `apps/patient/package.json`: same as clinic
- `eslint-rules/index.js`: added `meta.name` / `meta.version` (ESLint 9
  plugin-naming convention; used by config inspector + cache-key derivation
  under flat config). Read from `eslint-rules/package.json` so name+version
  stay in lockstep with the local plugin's manifest.
- `eslint-rules/package.json`: peerDep `eslint: ^8` → `^8 || ^9`

### Files created

- `eslint.config.mjs` (root): main flat config. Uses FlatCompat for
  `next/core-web-vitals`, loads `medassist-local` plugin, preserves the
  `react/no-unescaped-entities: 'off'` exception from the legacy config.
  Explicit `ignores` for `.next/`, `node_modules/`, build/dist/coverage,
  and the `public/sw.js` / `public/workbox-*.js` service-worker artifacts
  (next-pwa output, not source-controlled lint targets).
- `eslint.config.scopes.mjs` (root): scopes-only flat config for `lint:scopes`.
  Loads ONLY the two `medassist-local` rules. Uses
  `linterOptions.noInlineConfig: true` (equivalent of the prior
  `--no-inline-config` CLI flag) so the scopes gate doesn't surface
  "rule not found" errors for `eslint-disable-next-line` directives
  referencing rules from the full ruleset.

### Files deleted

- `.eslintrc.json` (root): legacy config replaced by `eslint.config.mjs`.
  ESLint 9 ignores legacy config files automatically when flat config is
  present, but leaving the file would mislead future maintainers.

## 4. Sandbox gate baseline (pre + post migration)

| Gate | Pre-migration | Post-migration |
|---|---|---|
| root tsc | exit 0 | exit 0 |
| clinic tsc | exit 0 | exit 0 |
| patient tsc | exit 0 | exit 0 |
| lint:scopes | exit 0 | exit 0 |

Additionally verified (not in pre-work checklist but CI runs them):

- `npm run lint -w @medassist/clinic`: exit 0 (4 warnings, 0 errors;
  pre-existing patterns)
- `npm run lint -w @medassist/patient`: exit 0 (2 warnings, 0 errors;
  pre-existing patterns)

## 5. Custom-rule empirical verification

Per prompt Section C3 step 2 — deliberate violation + revert.

1. Wrote `packages/shared/lib/__deferral_c_lint_test__.ts` with
   `createAdminClient('totally-bogus-scope-never-registered')`.
2. Ran `npm run lint:scopes`: exit code **1**, rule
   `medassist-local/no-unregistered-admin-scope` fired with the full
   D-008 message including the "Add it to admin.ts in the same commit"
   guidance.
3. Removed the test file.
4. Re-ran `npm run lint:scopes`: exit code **0**, clean output.

This confirms the FlatCompat-based plugin loading + the `meta.name`/`version`
addition + `noInlineConfig` setting all work together to preserve the rule's
behavior under ESLint 9.

## 6. Advisories closed

`npm audit` before: **18** advisories (2 moderate, 16 high).
`npm audit` after: **11** advisories (2 moderate, 9 high).

Net: **7 unique advisories closed** by this commit.

Per-package breakdown (from `npm audit` deltas):

| Closed | Package | Was reported in row(s) of inventory |
|---|---|---|
| ✓ | `eslint-config-next` | 15 |
| ✓ | `@next/eslint-plugin-next` | 16 |
| ✓ | `glob` (via eslint chain) | 17 |
| ✓ | `@typescript-eslint/parser` (via eslint chain) | 18 |
| ✓ | `@typescript-eslint/typescript-estree` (via eslint chain) | 19 |
| ✓ | `minimatch` (via eslint chain) | 20-22 |
| ✓ | `flatted` (via eslint chain) | 26-27 |

The inventory's claim of "15 Dependabot advisories closed" was a per-manifest
count (one advisory reported per workspace package.json). The unique-advisory
count is 7. This is the same closure work; the count differs because npm-audit
deduplicates across the workspace tree while Dependabot reports per-manifest.

Remaining advisories (11) belong to other deferral tracks:
- `next` itself (5 advisories) — Deferral A
- `next-pwa` cluster (serialize-javascript, rollup-plugin-terser, workbox-*,
  @babel/plugin-transform-modules-systemjs — 5 advisories) — Deferral B
- `postcss` nested under `next` (1 advisory) — blocked by Deferral A
- `fast-uri`, `picomatch`, `brace-expansion` — still appear because they
  have parent chains through next-pwa or next, not just the eslint chain.
  These will close as Deferral A and B land.

## 7. Decision log

1. **Target eslint-config-next 15.x not 16.x.** Empirical npm-registry
   probe + advisory fix-version analysis. (See §1.)
2. **Path C: full flat-config migration with FlatCompat shim.** Mo's ruling
   after surface presented A/B/C. (See §2.)
3. **Separate `eslint.config.scopes.mjs` for `lint:scopes`.** Preserves the
   architectural separation between the focused scope-discipline gate and
   the full lint pass. Run via `--no-config-lookup --config
   eslint.config.scopes.mjs` so the main config is never merged in.
4. **`linterOptions.noInlineConfig: true` in scopes config.** Direct
   replacement for the legacy `--no-inline-config` CLI flag. Without it,
   ESLint 9 surfaces "Definition for rule 'X' was not found" errors when
   source files contain `eslint-disable-next-line` referencing rules
   (e.g. `react-hooks/exhaustive-deps`) that aren't loaded under the
   scopes-only config.
5. **`--quiet` on `lint:scopes`.** Suppresses the cosmetic warnings about
   inline-disable directives having no effect (caused by item 4). The
   scopes gate's job is to fail on custom-rule errors; warnings are noise.
6. **`next lint` → `eslint .` in all three workspaces.** Next 14.2.35's
   `next lint` does not auto-discover flat config. Switching to `eslint .`
   decouples lint from the next-cli version and lets each workspace use
   the root flat config via ESLint's standard config discovery (walks up
   from cwd).
7. **Read plugin name/version from `eslint-rules/package.json`** instead of
   hardcoding in index.js. Keeps the plugin meta consistent if package.json
   is bumped later.

## 8. STOP exceptions tripped during execution

- **#1 (eslint-config-next@16 requires Next 15)**: surfaced as the
  decision-tree question to Mo; resolved by ruling 15.x not 16.x.

- *(eslint-config-next@15.x is still legacy-config requiring FlatCompat)*:
  not literally in the prompt's STOP-exception list but surfaced as a
  secondary architectural call; resolved by Mo's Path C ruling.

No other STOP exceptions tripped.

## 9. What to test next session

- Mac-side `npm run lint -w @medassist/clinic` + `npm run lint -w @medassist/patient`
  should both pass exit 0 (verified in sandbox, but Mac-side has the real
  ESLint 9 runner pulling from a fresh node_modules — confirm before
  proceeding to Phase H Section H0).
- CI green for this commit before Phase H section H0 starts.
- Next push (Phase H) does not touch eslint config; the migration is
  isolated to Deferral C.

## 10. Sympathetic doc updates

- `audits/dependabot-inventory-2026-05-11.md` — Deferral C row marked
  closed; 7 unique advisories closed (was projected as 15 per-manifest).
- `audits/STATE_OF_WORK.md` — Deferral C completed.
- `audits/PROGRAM_STATE.md` — Deferral C completed; B07 closure track
  unblocked for Phase H.
