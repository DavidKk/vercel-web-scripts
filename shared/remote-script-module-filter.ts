/** Marker line before each compiled GIST module in remote bundles (`// file.ts`). */
import { joinRemoteBundleModules, REMOTE_MODULE_MARKER_RE, splitRemoteBundleModules } from './remote-script-bundle-modules'

export { REMOTE_MODULE_MARKER_RE }

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

  const modules = splitRemoteBundleModules(content)
  if (modules.length === 0) {
    return content
  }

  const kept = modules.filter((module) => !disabled.has(module.file))
  return joinRemoteBundleModules(kept)
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
  return splitRemoteBundleModules(content)
    .filter((module) => disabledSet.has(module.file))
    .map((module) => module.file)
    .sort()
}
