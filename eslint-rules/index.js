/**
 * Local ESLint plugin for MedAssist project-specific rules.
 *
 * Packaged as `eslint-plugin-medassist-local` via a `file:` linkage in root
 * package.json devDependencies. The naming follows ESLint's plugin
 * convention (`eslint-plugin-<name>`) which lets us reference rules in
 * the flat config as `medassist-local/<rule-name>` (the plugin key in
 * `eslint.config.mjs`).
 *
 * Phase F Task 20 / Deferral C (2026-05-11): added `meta.name` and
 * `meta.version` to satisfy ESLint 9's plugin-meta convention (used by
 * config inspector + cache key derivation under flat config).
 *
 * Add new rules by:
 *   1. Authoring the rule in `eslint-rules/<rule-name>.js`
 *   2. Adding it to the `rules` map below
 *   3. Wiring it into `eslint.config.mjs` (and `eslint.config.scopes.mjs`
 *      if it should also fire in the `lint:scopes` gate)
 *   4. Updating Phase F Task 20 progress notes if rule scope evolves
 */

'use strict'

const pkg = require('./package.json')

module.exports = {
  meta: {
    name: pkg.name,
    version: pkg.version,
  },
  rules: {
    'no-unregistered-admin-scope': require('./no-unregistered-admin-scope.js'),
    'no-unregistered-delegation-capability': require('./no-unregistered-delegation-capability.js'),
  },
}
