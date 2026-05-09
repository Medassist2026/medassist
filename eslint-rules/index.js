/**
 * Local ESLint plugin for MedAssist project-specific rules.
 *
 * Packaged as `eslint-plugin-medassist-local` via a `file:` linkage in root
 * package.json devDependencies. The naming follows ESLint's plugin
 * convention (`eslint-plugin-<name>`) which lets us reference rules in
 * `.eslintrc.json` as `medassist-local/<rule-name>`.
 *
 * Add new rules by:
 *   1. Authoring the rule in `eslint-rules/<rule-name>.js`
 *   2. Adding it to the `rules` map below
 *   3. Wiring it into `.eslintrc.json` with desired severity
 *   4. Updating Phase F Task 20 progress notes if rule scope evolves
 */

'use strict'

module.exports = {
  rules: {
    'no-unregistered-admin-scope': require('./no-unregistered-admin-scope.js'),
    'no-unregistered-delegation-capability': require('./no-unregistered-delegation-capability.js'),
  },
}
