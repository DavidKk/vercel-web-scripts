/** Preset slot while async status has not resolved yet — same monospace width as semver. */
export const POPUP_PRESET_VERSION_LOADING = '…'

/**
 * Footer line for popup: `Preset v… · Extension v…`
 * Extension version is always known synchronously from the manifest.
 */
export function formatPopupVersionFooter(extensionVersion: string, presetVersion: string | null | undefined, options?: { presetLoading?: boolean }): string {
  const ext = extensionVersion.trim() || '0.0.0'
  const preset = presetVersion?.trim()
  if (preset) {
    return `Preset v${preset} · Extension v${ext}`
  }
  if (options?.presetLoading) {
    return `Preset v${POPUP_PRESET_VERSION_LOADING} · Extension v${ext}`
  }
  return `Preset v— · Extension v${ext}`
}
