export type MmToastVariant = 'success' | 'error' | 'info'

/**
 * Lightweight reusable toast presenter for extension pages.
 */
export class MmToast {
  private timer: ReturnType<typeof setTimeout> | undefined

  constructor(private readonly root: ParentNode) {}

  show(message: string, variant: MmToastVariant = 'info'): void {
    const toast = this.ensureToastElement()
    toast.textContent = message
    toast.className = `mm-global-toast mm-global-toast-visible mm-global-toast-${variant}`
    if (this.timer) {
      clearTimeout(this.timer)
    }
    this.timer = setTimeout(() => {
      toast.className = 'mm-global-toast'
      toast.textContent = ''
    }, 2400)
  }

  private ensureToastElement(): HTMLElement {
    const existing = this.root.querySelector('[data-ref="global-toast"]') as HTMLElement | null
    if (existing) {
      return existing
    }
    const el = document.createElement('p')
    el.setAttribute('data-ref', 'global-toast')
    el.className = 'mm-global-toast'
    el.setAttribute('role', 'status')
    el.setAttribute('aria-live', 'polite')
    document.body.appendChild(el)
    return el
  }
}
