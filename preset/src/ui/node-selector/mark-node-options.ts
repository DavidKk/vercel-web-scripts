import type { MarkNodeOptions } from './types'

/**
 * Normalize markNode arguments (positional or options object)
 */
export function normalizeMarkNodeOptions(labelOrOptions?: string | MarkNodeOptions, color?: string, caller?: string, barLabel?: string): MarkNodeOptions {
  if (labelOrOptions !== null && typeof labelOrOptions === 'object') {
    return labelOrOptions
  }

  return {
    label: labelOrOptions,
    color,
    caller,
    barLabel,
  }
}

/**
 * Resolve floating bar display text: custom barLabel, else caller name
 */
export function resolveBarDisplayText(barLabel: string | undefined, caller: string): string {
  const trimmed = barLabel?.trim()
  return trimmed || caller
}
