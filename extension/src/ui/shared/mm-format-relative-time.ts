/**
 * Compact relative/absolute label for script updated timestamps in extension UI.
 * @param updatedAtMs Epoch milliseconds
 * @returns Human-readable label or em dash when missing
 */
export function formatScriptUpdatedAt(updatedAtMs?: number): string {
  if (typeof updatedAtMs !== 'number' || !Number.isFinite(updatedAtMs) || updatedAtMs <= 0) {
    return '—'
  }

  const date = new Date(updatedAtMs)
  if (Number.isNaN(date.getTime())) {
    return '—'
  }

  const diffMs = Date.now() - updatedAtMs
  if (diffMs < 60_000) {
    return 'Just now'
  }
  if (diffMs < 3_600_000) {
    return `${Math.floor(diffMs / 60_000)}m ago`
  }
  if (diffMs < 86_400_000) {
    return `${Math.floor(diffMs / 3_600_000)}h ago`
  }
  if (diffMs < 7 * 86_400_000) {
    return `${Math.floor(diffMs / 86_400_000)}d ago`
  }

  const now = new Date()
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
    hour: '2-digit',
    minute: '2-digit',
  })
}
