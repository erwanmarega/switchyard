import type { CredentialField } from './types.js'

export const MAX_PATTERN_LENGTH = 200

const cache = new WeakMap<CredentialField, RegExp>()

/**
 * Conservative check: rejects backreferences and a quantified group that contains a quantifier
 * (e.g. `(a+)+`, `(\\w*)*`, `(a|b+){2,}`). Returns a reason, or null when the pattern looks linear.
 */
function unsafeReason(source: string): string | null {
  const stack: boolean[] = [] // per open group: does it contain a quantifier?
  let inClass = false
  for (let i = 0; i < source.length; i++) {
    const c = source[i]!
    if (c === '\\') {
      const next = source[i + 1]
      if (next !== undefined && /[1-9]/.test(next)) return 'backreferences are not allowed'
      if (next === 'k' && source[i + 2] === '<') return 'backreferences are not allowed'
      i++
      continue
    }
    if (inClass) {
      if (c === ']') inClass = false
      continue
    }
    if (c === '[') {
      inClass = true
      continue
    }
    if (c === '(') {
      stack.push(false)
      continue
    }
    const quantifier =
      c === '*' || c === '+' || (c === '{' && /^\{\d+(?:,\d*)?\}/.test(source.slice(i)))
    if (quantifier && stack.length > 0) stack[stack.length - 1] = true
    if (c === ')') {
      const hadQuantifier = stack.pop() ?? false
      const rest = source.slice(i + 1)
      const quantified = /^(?:[*+]|\{\d+(?:,\d*)?\})/.test(rest)
      if (hadQuantifier && quantified) return 'nested quantifiers are not allowed'
      if (hadQuantifier && stack.length > 0) stack[stack.length - 1] = true
    }
  }
  return null
}

/** Validates a field pattern and returns its anchored RegExp. Throws on an unsafe pattern. */
export function compilePattern(source: string): RegExp {
  if (source.length > MAX_PATTERN_LENGTH) throw new Error('pattern too long')
  const reason = unsafeReason(source)
  if (reason) throw new Error(reason)
  return new RegExp(`^(?:${source})$`, 'u')
}

/** Compiled, anchored RegExp of a field's `pattern` (cached per field), or null without pattern. */
export function credentialPattern(field: CredentialField): RegExp | null {
  if (field.pattern === undefined) return null
  let re = cache.get(field)
  if (!re) {
    re = compilePattern(field.pattern)
    cache.set(field, re)
  }
  return re
}
