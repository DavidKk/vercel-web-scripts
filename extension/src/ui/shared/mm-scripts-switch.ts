export type MmScriptsSwitchVariant = 'on-off' | 'stable-alpha'

export type MmScriptsSwitchOptions = {
  variant: MmScriptsSwitchVariant
  checked?: boolean
  disabled?: boolean
}

export type MmScriptsSwitchElements = {
  root: HTMLLabelElement
  input: HTMLInputElement
}

const VARIANT_LABELS: Record<MmScriptsSwitchVariant, [left: string, right: string]> = {
  'on-off': ['OFF', 'ON'],
  'stable-alpha': ['ALP', 'STB'],
}

/**
 * Unified segmented switch for Scripts table (ON/OFF or STABLE/ALPHA).
 * @param options Variant, checked state, and disabled flag
 * @returns Root label and hidden checkbox input
 */
export function createMmScriptsSwitch(options: MmScriptsSwitchOptions): MmScriptsSwitchElements {
  const [leftLabel, rightLabel] = VARIANT_LABELS[options.variant]
  const root = document.createElement('label')
  root.className = `mm-scripts-switch mm-scripts-switch--${options.variant === 'stable-alpha' ? 'ota' : 'onoff'}`

  const input = document.createElement('input')
  input.type = 'checkbox'
  input.className = 'mm-scripts-switch-input'
  input.role = 'switch'
  input.checked = options.checked ?? false
  input.disabled = options.disabled ?? false

  const track = document.createElement('span')
  track.className = 'mm-scripts-switch-track'
  track.setAttribute('aria-hidden', 'true')

  const indicator = document.createElement('span')
  indicator.className = 'mm-scripts-switch-indicator'

  const leftSeg = document.createElement('span')
  leftSeg.className = 'mm-scripts-switch-seg mm-scripts-switch-seg--left'
  leftSeg.textContent = leftLabel

  const rightSeg = document.createElement('span')
  rightSeg.className = 'mm-scripts-switch-seg mm-scripts-switch-seg--right'
  rightSeg.textContent = rightLabel

  track.append(indicator, leftSeg, rightSeg)
  root.append(input, track)
  return { root, input }
}
