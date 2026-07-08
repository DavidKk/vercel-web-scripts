import type { OtaReleaseStage } from '@shared/script-ota-policy'

/** Preset slot while async status has not resolved yet — same monospace width as semver. */
export const POPUP_PRESET_VERSION_LOADING = '…'

/** Rapid clicks on the popup version footer required to trigger extension download. */
export const POPUP_VERSION_FOOTER_COMBO_CLICKS = 10

function formatRuntimeStageLabel(stage: OtaReleaseStage | null | undefined): string {
  if (stage === 'alpha') {
    return ' · ALP'
  }
  if (stage === 'stable') {
    return ' · STB'
  }
  return ''
}

/**
 * Footer line for popup: `Preset v… · STB · Extension v…`
 * Extension version is always known synchronously from the manifest.
 */
export function formatPopupVersionFooter(
  extensionVersion: string,
  presetVersion: string | null | undefined,
  options?: { presetLoading?: boolean; runtimeStage?: OtaReleaseStage | null }
): string {
  const ext = extensionVersion.trim() || '0.0.0'
  const stageLabel = formatRuntimeStageLabel(options?.runtimeStage)
  const preset = presetVersion?.trim()
  if (preset) {
    return `Preset v${preset}${stageLabel} · Extension v${ext}`
  }
  if (options?.presetLoading) {
    return `Preset v${POPUP_PRESET_VERSION_LOADING}${stageLabel} · Extension v${ext}`
  }
  return `Preset v—${stageLabel} · Extension v${ext}`
}
