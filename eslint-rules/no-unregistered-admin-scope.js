/**
 * ESLint rule: no-unregistered-admin-scope
 *
 * Enforces static-string discipline at every `createAdminClient(...)` callsite.
 * Phase 2 of D-008 Amendment 2026-05-08's Option D sequenced hybrid plan
 * (admin scope reconciliation, Phase F Task 20).
 *
 * Three checks:
 *   1. createAdminClient() with no arg — OK (uses default 'api-route')
 *   2. createAdminClient('static-literal') — must be in ALLOWED_ADMIN_SCOPES
 *      (parsed from packages/shared/lib/supabase/admin.ts at rule-load time)
 *   3. createAdminClient(`tpl-literal`) or createAdminClient(variable) — REJECT
 *      (the static-literal precondition for Phase 3's Option C.1 TypeScript
 *      literal-union refactor; locks today's empirical "0 dynamic scopes"
 *      forward, not just at this snapshot)
 *
 * The runtime `Set.has(scope)` check in createAdminClient() stays as a
 * defense-in-depth signal during the Phase 2 → Phase 3 transition; it will
 * be dropped when Phase 3 ships. The eslint rule is the load-bearing gate
 * going forward.
 *
 * Reference docs:
 *   - audits/admin-scope-reconciliation-2026-05-08.md §5 (Option D / Phase 2)
 *   - DECISIONS_LOG.md D-008 Amendment 2026-05-09 (this rule's authoring)
 *   - packages/shared/lib/supabase/admin.ts ALLOWED_ADMIN_SCOPES
 */

'use strict'

const fs = require('fs')
const path = require('path')

/**
 * Parse `ALLOWED_ADMIN_SCOPES` from admin.ts source. We do NOT import the
 * runtime module — eslint runs without the TypeScript transpile pipeline,
 * and `import` from a `.ts` file would require additional plumbing. Instead
 * we parse the source file with the same regex inventory used in the
 * 2026-05-08 reconciliation pass, which has been empirically validated.
 *
 * Cached after first call so we don't re-read for every callsite.
 */
let cachedAllowedScopes = null

function loadAllowedScopes() {
  if (cachedAllowedScopes) return cachedAllowedScopes

  // Walk up from this file to find admin.ts. This rule lives at
  // <repo>/eslint-rules/no-unregistered-admin-scope.js; admin.ts lives at
  // <repo>/packages/shared/lib/supabase/admin.ts. Resolve relative to __dirname.
  const adminTsPath = path.resolve(
    __dirname,
    '..',
    'packages',
    'shared',
    'lib',
    'supabase',
    'admin.ts'
  )

  let source
  try {
    source = fs.readFileSync(adminTsPath, 'utf8')
  } catch (err) {
    // If we can't read admin.ts, fail open (don't crash lint runs). A separate
    // lint failure would be raised by tsc / next build for unresolved imports
    // if admin.ts is genuinely gone.
    console.warn(
      `[no-unregistered-admin-scope] Could not read ${adminTsPath}: ${err.message}. ` +
        `Rule disabled for this lint run.`
    )
    cachedAllowedScopes = new Set()
    return cachedAllowedScopes
  }

  // Match the same shape the 2026-05-08 reconciliation grep used:
  //   sed -n '/^const ALLOWED_ADMIN_SCOPES = new Set(\[/,/^\])/p'
  //     | sed 's|//.*$||'
  //     | grep -oE "^[[:space:]]*'[a-zA-Z][^']*'"
  //     | sed "s/^[[:space:]]*'//; s/'$//"
  const setStart = source.indexOf('const ALLOWED_ADMIN_SCOPES = new Set([')
  const setEnd = source.indexOf('])', setStart)
  if (setStart < 0 || setEnd < 0) {
    console.warn(
      `[no-unregistered-admin-scope] Could not locate ALLOWED_ADMIN_SCOPES Set in admin.ts. ` +
        `Rule disabled for this lint run.`
    )
    cachedAllowedScopes = new Set()
    return cachedAllowedScopes
  }
  const block = source.slice(setStart, setEnd)
  const lines = block.split('\n')
  const scopes = new Set()
  for (const line of lines) {
    // Strip comments
    const stripped = line.replace(/\/\/.*$/, '')
    // Match leading-quoted scope strings (kebab-case pattern)
    const match = stripped.match(/^\s*'([a-zA-Z][a-zA-Z0-9-]*)'/)
    if (match) scopes.add(match[1])
  }
  cachedAllowedScopes = scopes
  return cachedAllowedScopes
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Enforce static-string discipline on createAdminClient(scope) callsites; ' +
        'reject scopes not in ALLOWED_ADMIN_SCOPES and reject any non-literal arg.',
      recommended: true,
    },
    schema: [], // no options
    messages: {
      unregisteredScope:
        "createAdminClient scope '{{scope}}' is not in ALLOWED_ADMIN_SCOPES. " +
        'Add it to packages/shared/lib/supabase/admin.ts in the same commit, ' +
        "grouped under the appropriate feature comment block. " +
        '(D-008 / Phase F Task 20 — admin scope discipline)',
      templateLiteral:
        'createAdminClient scope must be a static string literal — template literals ' +
        '(backticks) are forbidden. Dynamic scope construction defeats the audit-trail ' +
        'guarantee and blocks the Phase 3 TypeScript literal-union refactor. ' +
        '(D-008 / Phase F Task 20 — admin scope discipline)',
      nonLiteral:
        "createAdminClient scope must be a static string literal — variables, function calls, " +
        'and other expressions are forbidden. Pass the scope as a plain string. ' +
        '(D-008 / Phase F Task 20 — admin scope discipline)',
    },
  },

  create(context) {
    const allowedScopes = loadAllowedScopes()

    return {
      CallExpression(node) {
        // Match createAdminClient(...) — both unqualified call and member access
        // (e.g. `import { createAdminClient } from ...; createAdminClient('x')`,
        // also possible: `mod.createAdminClient('x')`). Match callee name only.
        let calleeName
        if (node.callee.type === 'Identifier') {
          calleeName = node.callee.name
        } else if (
          node.callee.type === 'MemberExpression' &&
          node.callee.property.type === 'Identifier'
        ) {
          calleeName = node.callee.property.name
        } else {
          return
        }
        if (calleeName !== 'createAdminClient') return

        // No arg → uses default 'api-route' → OK
        if (node.arguments.length === 0) return

        const arg = node.arguments[0]

        // Static string literal — check membership
        if (arg.type === 'Literal' && typeof arg.value === 'string') {
          if (!allowedScopes.has(arg.value)) {
            context.report({
              node: arg,
              messageId: 'unregisteredScope',
              data: { scope: arg.value },
            })
          }
          return
        }

        // Template literal (backticks) — REJECT, even if it contains no
        // expressions. Static-only discipline.
        if (arg.type === 'TemplateLiteral') {
          context.report({ node: arg, messageId: 'templateLiteral' })
          return
        }

        // Anything else (Identifier, CallExpression, MemberExpression, etc.) —
        // REJECT.
        context.report({ node: arg, messageId: 'nonLiteral' })
      },
    }
  },
}
