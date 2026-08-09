/**
 * Safety ceiling for LLM↔tool rounds in one user turn.
 * Page-reading agents often need many steps; cycle detection is the primary stop.
 */
export const MAX_AGENT_SAFETY_ROUNDS = 100

/**
 * Identical consecutive rounds (period 1) need this many copies before counting as a loop.
 * Two identical snapshots (e.g. re-read after stale indexes) are legitimate; three is stuck.
 */
export const MIN_REPEATS_IDENTICAL_ROUND = 3

/**
 * Multi-step cycles (ABAB, ABCABC, …) stop after this many consecutive period copies.
 */
export const MIN_REPEATS_MULTI_STEP_CYCLE = 2

/**
 * Stable JSON stringify with sorted object keys (for tool-call fingerprints).
 * @param value Arbitrary JSON-compatible value
 * @returns Deterministic string form
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`
  }
  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort()
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`
}

/**
 * Fingerprint a single tool call from name + normalized args.
 * @param name Canonical or LLM tool name
 * @param args Tool arguments
 * @returns Fingerprint string
 */
export function fingerprintToolCall(name: string, args: Record<string, unknown>): string {
  return `${name}\0${stableStringify(args ?? {})}`
}

/**
 * Fingerprint an entire model tool round (ordered batch of calls).
 * @param calls Tool calls in invocation order
 * @returns Round signature
 */
export function fingerprintToolRound(calls: Array<{ name: string; args: Record<string, unknown> }>): string {
  return calls.map((call) => fingerprintToolCall(call.name, call.args)).join('\n')
}

/**
 * Detect whether the suffix of round signatures is a repeating cycle
 * (e.g. A,A,A or A,B,A,B or A,B,C,A,B,C).
 *
 * Period-1 (identical rounds) requires {@link MIN_REPEATS_IDENTICAL_ROUND} copies so
 * legitimate re-reads like snapshot→act→snapshot are not treated as loops.
 * @param roundSignatures Ordered round fingerprints for this turn
 * @returns True when a repeating cycle is present at the end of the sequence
 */
export function hasRepeatingToolCycle(roundSignatures: string[]): boolean {
  const n = roundSignatures.length
  if (n < MIN_REPEATS_MULTI_STEP_CYCLE) {
    return false
  }

  const maxPeriod = Math.floor(n / MIN_REPEATS_MULTI_STEP_CYCLE)
  for (let period = 1; period <= maxPeriod; period++) {
    const needed = period === 1 ? MIN_REPEATS_IDENTICAL_ROUND : MIN_REPEATS_MULTI_STEP_CYCLE
    if (n < period * needed) {
      continue
    }

    let matched = true
    for (let repeat = 1; repeat < needed; repeat++) {
      for (let i = 0; i < period; i++) {
        if (roundSignatures[n - 1 - i] !== roundSignatures[n - 1 - i - repeat * period]) {
          matched = false
          break
        }
      }
      if (!matched) {
        break
      }
    }
    if (matched) {
      return true
    }
  }
  return false
}
