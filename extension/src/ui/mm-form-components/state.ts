export const once = new WeakSet<HTMLElement>()
export const selectBound = new WeakSet<HTMLElement>()
export const searchSelectBound = new WeakSet<HTMLElement>()

export function markReady(el: HTMLElement, className: string): void {
  if (once.has(el)) {
    return
  }
  once.add(el)
  el.classList.add(className)
}
