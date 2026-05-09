/**
 * ESLint rule: no-unregistered-delegation-capability
 *
 * Sibling to `no-unregistered-admin-scope`. Enforces static-string
 * discipline at every callsite that passes a delegation capability token,
 * mirroring D-008's admin-scope discipline. B07 Phase C — see the
 * Phase C-E execution log for full reasoning.
 *
 * The TypeScript literal-union `AllowedCapability` (defined in
 * `packages/shared/lib/data/delegations.ts`) is the load-bearing
 * compile-time enforcement; this rule adds:
 *   1. A lint:scopes-pass-time guarantee that capability values are static
 *      string literals (no template literals, no variables, no function
 *      calls). Static-only discipline supports project-wide grep audits.
 *   2. A defense-in-depth validation that the literal is in the allowed
 *      set — covering the case where an `as` cast or `as any` slips a
 *      stray string past the type system.
 *
 * Targets:
 *   - Object property: `{ capabilities: [...] }` and `{ capability: '...' }`.
 *     Triggered on Property nodes with key 'capabilities' (array value) or
 *     'capability' (string value).
 *   - Function calls: `requireCapability(<gp>, '<cap>')` (Phase E auth
 *     helper). The second arg must be a static string literal in the set.
 *
 * Three checks per match site (mirroring no-unregistered-admin-scope):
 *   1. String literal that's a member of ALLOWED_DELEGATION_CAPABILITIES → OK
 *   2. String literal NOT in the set → REJECT (unregisteredCapability)
 *   3. Template literal or non-Literal expression → REJECT (templateLiteral
 *      or nonLiteral)
 *
 * The allowed set is parsed from `delegations.ts` at rule-load time, in
 * the same shape `no-unregistered-admin-scope` parses `admin.ts`.
 */

'use strict'

const fs = require('fs')
const path = require('path')

let cachedAllowedCapabilities = null

function loadAllowedCapabilities() {
  if (cachedAllowedCapabilities) return cachedAllowedCapabilities

  // <repo>/eslint-rules/no-unregistered-delegation-capability.js
  // <repo>/packages/shared/lib/data/delegations.ts
  const delegationsTsPath = path.resolve(
    __dirname,
    '..',
    'packages',
    'shared',
    'lib',
    'data',
    'delegations.ts'
  )

  let source
  try {
    source = fs.readFileSync(delegationsTsPath, 'utf8')
  } catch (err) {
    console.warn(
      `[no-unregistered-delegation-capability] Could not read ${delegationsTsPath}: ${err.message}. ` +
        `Rule disabled for this lint run.`
    )
    cachedAllowedCapabilities = new Set()
    return cachedAllowedCapabilities
  }

  // Match the same shape no-unregistered-admin-scope uses:
  //   const ALLOWED_DELEGATION_CAPABILITIES = [
  //     'view_records',
  //     ...
  //   ] as const
  const setStart = source.indexOf(
    'const ALLOWED_DELEGATION_CAPABILITIES = ['
  )
  // Walk to the closing bracket — look for the next `] as const` or `])`
  // shape. The literal-union shape uses `] as const`, distinct from the
  // admin Set's `])`, so we anchor on the array close.
  const setEnd = source.indexOf(']', setStart)
  if (setStart < 0 || setEnd < 0) {
    console.warn(
      `[no-unregistered-delegation-capability] Could not locate ALLOWED_DELEGATION_CAPABILITIES in delegations.ts. ` +
        `Rule disabled for this lint run.`
    )
    cachedAllowedCapabilities = new Set()
    return cachedAllowedCapabilities
  }
  const block = source.slice(setStart, setEnd)
  const lines = block.split('\n')
  const capabilities = new Set()
  for (const line of lines) {
    // Strip line comments
    const stripped = line.replace(/\/\/.*$/, '')
    // Match leading-quoted snake_case capability strings. The literal-
    // union convention is single-quoted; we accept either quote.
    const match = stripped.match(/^\s*['"]([a-z][a-z0-9_]*)['"]/)
    if (match) capabilities.add(match[1])
  }
  cachedAllowedCapabilities = capabilities
  return cachedAllowedCapabilities
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Enforce static-string discipline on delegation capability tokens; ' +
        'reject unknown tokens and reject any non-literal capability value.',
      recommended: true,
    },
    schema: [],
    messages: {
      unregisteredCapability:
        "Delegation capability '{{capability}}' is not in ALLOWED_DELEGATION_CAPABILITIES. " +
        'Add it to packages/shared/lib/data/delegations.ts in the same commit, ' +
        'or correct the spelling. ' +
        '(B07 Phase C — delegation capability discipline)',
      templateLiteral:
        'Delegation capability must be a static string literal — template literals ' +
        '(backticks) are forbidden. Static-only discipline supports project-wide grep audits. ' +
        '(B07 Phase C — delegation capability discipline)',
      nonLiteral:
        'Delegation capability must be a static string literal — variables, function calls, ' +
        'and other expressions are forbidden. Pass the capability as a plain string. ' +
        '(B07 Phase C — delegation capability discipline)',
    },
  },

  create(context) {
    const allowed = loadAllowedCapabilities()

    /**
     * Check a single AST node that is in capability-token position. May
     * be a string Literal, a TemplateLiteral, or an arbitrary Expression.
     */
    function checkCapabilityNode(node) {
      if (node.type === 'Literal' && typeof node.value === 'string') {
        if (!allowed.has(node.value)) {
          context.report({
            node,
            messageId: 'unregisteredCapability',
            data: { capability: node.value },
          })
        }
        return
      }
      if (node.type === 'TemplateLiteral') {
        context.report({ node, messageId: 'templateLiteral' })
        return
      }
      // Spread elements `...arr` are passed through (we cannot statically
      // inspect their contents; the TS literal union catches them).
      if (node.type === 'SpreadElement') return
      // Any other expression shape — REJECT.
      context.report({ node, messageId: 'nonLiteral' })
    }

    return {
      // 1. Object property: { capabilities: [...] } or { capability: '...' }
      Property(node) {
        if (
          node.key.type !== 'Identifier' ||
          (node.key.name !== 'capabilities' && node.key.name !== 'capability')
        ) {
          return
        }
        // Skip computed keys and shorthand properties (where key === value
        // and is just a variable reference, not a literal).
        if (node.computed || node.shorthand) return

        if (node.key.name === 'capabilities') {
          // Expect ArrayExpression value. If it's not an array (e.g.,
          // a variable or function call), the TS literal union enforces
          // typing — we don't double-check here because grep-via-AST on
          // arbitrary expressions doesn't help static auditability.
          if (node.value.type === 'ArrayExpression') {
            for (const element of node.value.elements) {
              if (element === null) continue // hole in array
              checkCapabilityNode(element)
            }
          }
          return
        }
        // node.key.name === 'capability' — single token.
        checkCapabilityNode(node.value)
      },

      // 2. Function call: requireCapability(globalPatientId, 'view_records')
      CallExpression(node) {
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
        if (calleeName !== 'requireCapability') return

        // Second arg is the capability token. (First arg is the gp id.)
        if (node.arguments.length < 2) return
        checkCapabilityNode(node.arguments[1])
      },
    }
  },
}
