export type MmSwitchOptions = {
  checked?: boolean
  disabled?: boolean
}

export type MmSwitchElements = {
  /** Wrapper `label.mm-switch` — click target for the control */
  root: HTMLLabelElement
  input: HTMLInputElement
}

/**
 * Build a MagickMonkey toggle switch (checkbox visually hidden + track + thumb).
 * Styles: `mm-switch`, `mm-switch-input`, `mm-switch-track`, `mm-switch-thumb` in tailwind.css.
 */
export function createMmSwitch(options: MmSwitchOptions = {}): MmSwitchElements {
  const root = document.createElement('label')
  root.className = 'mm-switch'

  const input = document.createElement('input')
  input.type = 'checkbox'
  input.className = 'mm-switch-input'
  input.role = 'switch'
  input.checked = options.checked ?? false
  input.disabled = options.disabled ?? false

  const track = document.createElement('span')
  track.className = 'mm-switch-track'
  track.setAttribute('aria-hidden', 'true')

  const thumb = document.createElement('span')
  thumb.className = 'mm-switch-thumb'
  thumb.setAttribute('aria-hidden', 'true')

  root.append(input, track, thumb)
  return { root, input }
}

/**
 * Row with primary label/content on the left and a switch on the right.
 */
export function createMmSwitchRow(leading: HTMLElement, switchOptions: MmSwitchOptions = {}, rowClass = 'mm-switch-row'): MmSwitchElements & { row: HTMLElement } {
  const row = document.createElement('div')
  row.className = rowClass

  const { root, input } = createMmSwitch(switchOptions)
  row.append(leading, root)
  return { row, root, input }
}
