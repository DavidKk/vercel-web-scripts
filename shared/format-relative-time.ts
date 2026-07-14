/**
 * Coerce a date-like value to epoch milliseconds.
 * @param input Timestamp ms, Date, or undefined/null
 * @param fallback Fallback epoch when input is invalid
 * @returns Epoch milliseconds
 */
export function toEpochMs(input: number | Date | null | undefined, fallback = Date.now()): number {
  if (input instanceof Date) {
    const ms = input.getTime()
    return Number.isFinite(ms) ? ms : fallback
  }
  if (typeof input === 'number' && Number.isFinite(input)) {
    return input
  }
  return fallback
}

/**
 * Format a timestamp as compact 24h absolute time (`MM/DD HH:mm`, or with year when needed).
 * @param input Timestamp ms or Date
 * @param now Reference "now" for same-year decisions (defaults to current time)
 * @returns Compact absolute time string
 */
export function formatAbsoluteTime24h(input: number | Date | null | undefined, now: number | Date = Date.now()): string {
  const date = new Date(toEpochMs(input))
  const ref = new Date(toEpochMs(now))
  const pad = (n: number) => String(n).padStart(2, '0')
  const hhmm = `${pad(date.getHours())}:${pad(date.getMinutes())}`
  if (date.getFullYear() === ref.getFullYear()) {
    return `${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${hhmm}`
  }
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${hhmm}`
}

/**
 * Format a timestamp as a compact relative label (`just now`, `23min ago`, `3h ago`),
 * falling back to {@link formatAbsoluteTime24h} for older values.
 * @param input Timestamp ms or Date
 * @param now Reference "now" (defaults to current time; pass explicitly in tests)
 * @returns Relative or absolute time string
 */
export function formatRelativeTime(input: number | Date | null | undefined, now: number | Date = Date.now()): string {
  const ts = toEpochMs(input)
  const nowMs = toEpochMs(now)
  const diffMs = nowMs - ts
  const diffSec = Math.max(0, Math.floor(diffMs / 1000))
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)

  if (diffSec < 45) {
    return 'just now'
  }
  if (diffMin < 60) {
    return `${Math.max(1, diffMin)}min ago`
  }
  if (diffHour < 24) {
    return `${diffHour}h ago`
  }

  return formatAbsoluteTime24h(ts, nowMs)
}
