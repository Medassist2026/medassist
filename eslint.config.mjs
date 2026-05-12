/**
 * Root ESLint flat config.
 *
 * Phase F Task 20 / Deferral C (2026-05-11): migrated from `.eslintrc.json` to
 * flat config concurrent with the `eslint@8 → 9` and
 * `eslint-config-next@14 → 15` bumps. Closes the Dependabot advisory chain
 * rooted at `eslint-config-next`.
 *
 * Architecture notes:
 *
 *   - `eslint-config-next@15.x` still ships as a legacy `.eslintrc`-style
 *     config (native flat-config support landed in 16.x, which is paired with
 *     Next 16). To use it under ESLint 9 flat config, we bridge via
 *     `@eslint/eslintrc`'s `FlatCompat.extends()`.
 *
 *   - Custom rules from `eslint-rules/` (the local
 *     `eslint-plugin-medassist-local` plugin) are loaded as a real flat-config
 *     plugin entry. `meta.name` + `meta.version` were added to the plugin
 *     index for ESLint 9's plugin-naming convention.
 *
 *   - `lint:scopes` uses a SEPARATE config (`eslint.config.scopes.mjs`) so it
 *     keeps its tight, narrow scope-discipline contract independent of the
 *     full `next/core-web-vitals` ruleset. See that file for details.
 *
 *   - When eslint-config-next eventually bumps to 16.x (gated on Deferral A:
 *     Next 15+ bump), this file should be revisited — the FlatCompat shim
 *     becomes unnecessary and the config can use direct flat-config imports.
 */

import { FlatCompat } from '@eslint/eslintrc'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import medassistLocal from './eslint-rules/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const compat = new FlatCompat({
  baseDirectory: __dirname,
})

export default [
  {
    ignores: [
      '**/.next/**',
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/.turbo/**',
      'public/sw.js',
      'public/workbox-*.js',
      'apps/clinic/public/sw.js',
      'apps/clinic/public/workbox-*.js',
      'apps/patient/public/sw.js',
      'apps/patient/public/workbox-*.js',
    ],
  },
  ...compat.extends('next/core-web-vitals'),
  {
    plugins: {
      'medassist-local': medassistLocal,
    },
    rules: {
      'react/no-unescaped-entities': 'off',
      'medassist-local/no-unregistered-admin-scope': 'error',
      'medassist-local/no-unregistered-delegation-capability': 'error',
    },
  },
]
