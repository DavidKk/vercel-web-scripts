export type MmCheckboxOptions = {
  checked?: boolean
  disabled?: boolean
  label?: string
}

const CHECKMARK_SVG =
  '<svg class="mm-checkbox-icon" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="m2.5 6 2 2 5-5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>'

/**
 * Insert the custom checkbox control after a native input when missing.
 * @param input Checkbox input to enhance
 */
export function ensureMmCheckboxControl(input: HTMLInputElement): void {
  input.classList.add('mm-checkbox-input')
  const parent = input.parentElement
  if (!parent?.querySelector('.mm-checkbox-control')) {
    const control = document.createElement('span')
    control.className = 'mm-checkbox-control'
    control.setAttribute('aria-hidden', 'true')
    control.innerHTML = CHECKMARK_SVG
    input.insertAdjacentElement('afterend', control)
  }
}

/**
 * Upgrade a label wrapper to the MagickMonkey checkbox UI.
 * @param label Label containing a checkbox input
 * @returns The checkbox input, or null when missing
 */
export function enhanceMmCheckboxLabel(label: HTMLLabelElement): HTMLInputElement | null {
  label.classList.add('mm-checkbox')
  const input = label.querySelector('input[type="checkbox"]')
  if (!(input instanceof HTMLInputElement)) {
    return null
  }
  ensureMmCheckboxControl(input)
  const text = label.querySelector(':scope > span:not(.mm-checkbox-control)')
  if (text && !text.classList.contains('mm-checkbox-label')) {
    text.classList.add('mm-checkbox-label')
  }
  return input
}

/**
 * Build a MagickMonkey checkbox (hidden native input + custom control).
 * @param options Initial checked/disabled state and optional label text
 */
export function createMmCheckbox(options: MmCheckboxOptions = {}): { root: HTMLLabelElement; input: HTMLInputElement } {
  const root = document.createElement('label')
  root.className = 'mm-checkbox'

  const input = document.createElement('input')
  input.type = 'checkbox'
  input.className = 'mm-checkbox-input'
  input.checked = options.checked ?? false
  input.disabled = options.disabled ?? false

  const control = document.createElement('span')
  control.className = 'mm-checkbox-control'
  control.setAttribute('aria-hidden', 'true')
  control.innerHTML = CHECKMARK_SVG

  root.append(input, control)
  if (options.label) {
    const label = document.createElement('span')
    label.className = 'mm-checkbox-label'
    label.textContent = options.label
    root.append(label)
  }

  return { root, input }
}
