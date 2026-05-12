/**
 * ESLint flat config — scopes-only (lint:scopes script target).
 *
 * Phase F Task 20 / Deferral C (2026-05-11): replaces the pre-flat
 * `--no-eslintrc --no-inline-config --parser @typescript-eslint/parser
 * --rulesdir eslint-rules --rule '{...}' --ext .ts,.tsx` invocation that
 * `lint:scopes` previously used under ESLint 8 + `.eslintrc.json`.
 *
 * Architectural contract: this config MUST stay tight and narrow.
 *   - It enables ONLY the two medassist-local rules.
 *   - It does NOT extend `next/core-web-vitals` or any other ruleset.
 *   - Run via `eslint --config eslint.config.scopes.mjs --no-config-lookup ...`
 *     so the main `eslint.config.mjs` is NOT discovered/merged.
 *
 * This separation exists because `lint:scopes` is a focused, fail-fast gate
 * for admin-scope discipline (D-008 / Phase F Task 20) and
 * delegation-capability discipline. Folding it into the full lint ruleset
 * would mix concerns and make the gate slower + harder to triage.
 */

import medassistLocal from './eslint-rules/index.js'
import tsParser from '@typescript-eslint/parser'

export default [
  {
    files: ['**/*.ts', '**/*.tsx'],
    linterOptions: {
      // Equivalent of the pre-flat `--no-inline-config` CLI flag the prior
      // `lint:scopes` script passed. Source files in this repo contain
      // `eslint-disable` directives referencing rules from the FULL ruleset
      // (e.g. `react-hooks/exhaustive-deps`, `@next/next/no-img-element`).
      // Under this scopes-only config those rules are not loaded; without
      // disabling inline-config processing ESLint 9 surfaces them as
      // "Definition for rule 'X' was not found" errors. The scopes gate is
      // intentionally narrow — it should never fire on inline directives
      // intended for the main lint pass.
      noInlineConfig: true,
      reportUnusedDisableDirectives: 'off',
    },
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    plugins: {
      'medassist-local': medassistLocal,
    },
    rules: {
      'medassist-local/no-unregistered-admin-scope': 'error',
      'medassist-local/no-unregistered-delegation-capability': 'error',
    },
  },
]
