export type ScriptsFooterStats = {
  serviceCount: number
  scriptTotal: number
  installedCount: number
  enabledCount: number
  uninstalledCount: number
  visibleCount?: number
  filtered?: boolean
}

/**
 * One-line Scripts page footer summary.
 */
export function formatScriptsFooterText(stats: ScriptsFooterStats): string {
  const parts = [
    `${stats.serviceCount} service${stats.serviceCount === 1 ? '' : 's'}`,
    `${stats.scriptTotal} script${stats.scriptTotal === 1 ? '' : 's'}`,
    `${stats.installedCount} installed`,
    `${stats.enabledCount} enabled`,
  ]

  if (stats.uninstalledCount > 0) {
    parts.push(`${stats.uninstalledCount} uninstalled`)
  }

  let text = parts.join(' · ')

  if (stats.filtered && stats.visibleCount !== undefined && stats.visibleCount !== stats.scriptTotal) {
    text = `Showing ${stats.visibleCount} of ${stats.scriptTotal} · ${text}`
  }

  return text
}

export function computeScriptsFooterStats(rows: Array<{ serviceLabel: string; installed: boolean; enabled: boolean }>): Omit<ScriptsFooterStats, 'visibleCount' | 'filtered'> {
  const serviceLabels = new Set<string>()
  let installedCount = 0
  let enabledCount = 0
  let uninstalledCount = 0

  for (const row of rows) {
    if (row.serviceLabel) {
      serviceLabels.add(row.serviceLabel)
    }
    if (row.installed) {
      installedCount += 1
      if (row.enabled) {
        enabledCount += 1
      }
    } else {
      uninstalledCount += 1
    }
  }

  return {
    serviceCount: serviceLabels.size,
    scriptTotal: rows.length,
    installedCount,
    enabledCount,
    uninstalledCount,
  }
}
