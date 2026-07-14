export function isInvalidDate(date: Date) {
  return isNaN(date.getTime())
}

export { formatAbsoluteTime24h, formatRelativeTime, toEpochMs } from '../shared/format-relative-time'
