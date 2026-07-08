/** Default idle gap (ms) after which combo click progress resets. */
export const DEFAULT_COMBO_CLICK_IDLE_MS = 1000

export type ComboClickOptions = {
  /** Clicks required to fire {@link onTrigger}. */
  targetCount: number
  /** Reset progress after this idle gap between clicks. */
  idleMs?: number
  /** Called once when {@link targetCount} clicks occur without exceeding idle gap. */
  onTrigger: () => void | Promise<void>
}

/**
 * Bind rapid-click combo detection on an element.
 * Progress resets when the gap between clicks exceeds {@link ComboClickOptions.idleMs}.
 * @param element Click target
 * @param options Combo thresholds and trigger callback
 * @returns Unbind function
 */
export function bindComboClickTrigger(element: HTMLElement, options: ComboClickOptions): () => void {
  const idleMs = options.idleMs ?? DEFAULT_COMBO_CLICK_IDLE_MS
  let count = 0
  let idleTimer: ReturnType<typeof setTimeout> | undefined
  let triggering = false

  const reset = (): void => {
    count = 0
    if (idleTimer) {
      clearTimeout(idleTimer)
      idleTimer = undefined
    }
  }

  const onClick = (): void => {
    if (triggering) {
      return
    }
    if (idleTimer) {
      clearTimeout(idleTimer)
    }
    count += 1
    if (count >= options.targetCount) {
      reset()
      triggering = true
      void Promise.resolve(options.onTrigger()).finally(() => {
        triggering = false
      })
      return
    }
    idleTimer = setTimeout(reset, idleMs)
  }

  element.addEventListener('click', onClick)
  return () => {
    reset()
    element.removeEventListener('click', onClick)
  }
}
