/** Marker line before each compiled GIST module in remote bundles (`// file.ts`). */
const REMOTE_MODULE_MARKER_RE = /^\s*\/\/\s+([\w./-]+\.(?:js|ts))\s*$/gm

/**
 * Read extension per-file enable map from the launcher sandbox global.
 * @param host Preset / remote execution global
 * @returns Map when extension injected bootstrap; otherwise undefined
 */
export function readExtensionEnabledScripts(host: Record<string, unknown>): Record<string, boolean> | undefined {
  const map = host.__VWS_ENABLED_SCRIPTS__
  if (!map || typeof map !== 'object') {
    return undefined
  }
  return map as Record<string, boolean>
}

/**
 * Strip disabled GIST modules from a cached remote bundle before eval.
 * Works with bundles compiled before runtime guard injection (extension only).
 * @param content Remote bundle body
 * @param enabledScripts Per-file flags from extension bootstrap (`false` = skip)
 * @returns Filtered bundle (unchanged when no disabled entries)
 */
export function filterDisabledRemoteModules(content: string, enabledScripts: Record<string, boolean> | undefined | null): string {
  if (!content || !enabledScripts) {
    return content
  }

  const disabled = new Set(
    Object.entries(enabledScripts)
      .filter(([, enabled]) => enabled === false)
      .map(([file]) => file)
  )
  if (disabled.size === 0) {
    return content
  }

  const markers: Array<{ file: string; start: number }> = []
  const re = new RegExp(REMOTE_MODULE_MARKER_RE.source, 'gm')
  let match: RegExpExecArray | null
  while ((match = re.exec(content)) !== null) {
    markers.push({ file: match[1], start: match.index })
  }
  if (markers.length === 0) {
    return content
  }

  const kept: string[] = []
  for (let i = 0; i < markers.length; i++) {
    const { file, start } = markers[i]
    if (disabled.has(file)) {
      continue
    }
    const end = i + 1 < markers.length ? markers[i + 1].start : content.length
    kept.push(content.slice(start, end))
  }

  return kept.join('\n\n').trim()
}

/**
 * @param content Remote bundle body
 * @param enabledScripts Per-file flags from extension bootstrap
 * @returns Filenames removed by {@link filterDisabledRemoteModules}
 */
export function listDisabledRemoteModules(content: string, enabledScripts: Record<string, boolean> | undefined | null): string[] {
  if (!content || !enabledScripts) {
    return []
  }
  const disabled = Object.entries(enabledScripts)
    .filter(([, enabled]) => enabled === false)
    .map(([file]) => file)
  if (disabled.length === 0) {
    return []
  }
  const disabledSet = new Set(disabled)
  const present = new Set<string>()
  const re = new RegExp(REMOTE_MODULE_MARKER_RE.source, 'gm')
  let match: RegExpExecArray | null
  while ((match = re.exec(content)) !== null) {
    if (disabledSet.has(match[1])) {
      present.add(match[1])
    }
  }
  return [...present].sort()
}
