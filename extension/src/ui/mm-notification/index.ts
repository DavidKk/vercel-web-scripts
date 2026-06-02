import iconWarn from '~icons/mdi/alert?raw'
import iconSuccess from '~icons/mdi/check-circle?raw'
import iconError from '~icons/mdi/close-circle?raw'
import iconInfo from '~icons/mdi/information?raw'

export type MmNotificationType = 'success' | 'error' | 'info' | 'warn'

const HOST_TAG = 'mm-notification-host'

const TYPE_ICONS: Record<MmNotificationType, string> = {
  success: iconSuccess,
  error: iconError,
  info: iconInfo,
  warn: iconWarn,
}

function notificationId(): string {
  return `mm-n-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

class MmNotificationHost extends HTMLElement {
  private timers = new Map<string, ReturnType<typeof setTimeout>>()

  connectedCallback(): void {
    this.className = 'mm-notification-host'
    this.style.position = 'fixed'
    this.style.zIndex = '99999'
    this.style.top = '4.5rem'
    this.style.right = '0.75rem'
    this.setAttribute('aria-live', 'polite')
    this.setAttribute('aria-relevant', 'additions')
    if (!this.querySelector('[data-ref="stack"]')) {
      const stack = document.createElement('div')
      stack.className = 'mm-notification-stack'
      stack.setAttribute('data-ref', 'stack')
      this.appendChild(stack)
    }
  }

  show(message: string, type: MmNotificationType, duration: number): void {
    const stack = this.querySelector('[data-ref="stack"]') as HTMLElement | null
    if (!stack) {
      return
    }

    const id = notificationId()
    const item = document.createElement('div')
    item.className = `mm-notification mm-notification-${type}`
    item.dataset.notificationId = id
    item.setAttribute('role', 'status')

    const iconWrap = document.createElement('span')
    iconWrap.className = 'mm-notification-icon'
    iconWrap.setAttribute('aria-hidden', 'true')
    iconWrap.innerHTML = TYPE_ICONS[type]

    const text = document.createElement('p')
    text.className = 'mm-notification-message'
    text.textContent = message

    item.append(iconWrap, text)
    stack.appendChild(item)
    requestAnimationFrame(() => item.classList.add('is-visible'))

    if (duration <= 0) {
      return
    }

    const timer = setTimeout(() => this.dismiss(id), duration)
    this.timers.set(id, timer)
  }

  private dismiss(id: string): void {
    const timer = this.timers.get(id)
    if (timer) {
      clearTimeout(timer)
      this.timers.delete(id)
    }
    const item = this.querySelector(`[data-notification-id="${CSS.escape(id)}"]`) as HTMLElement | null
    if (!item) {
      return
    }
    item.classList.remove('is-visible')
    item.addEventListener(
      'transitionend',
      () => {
        item.remove()
      },
      { once: true }
    )
  }
}

function defineNotificationHost(): void {
  if (typeof customElements === 'undefined' || customElements.get(HOST_TAG)) {
    return
  }
  customElements.define(HOST_TAG, MmNotificationHost)
}

/** Mount the top-right notification stack once per admin page. */
export function mountMmNotificationHost(): void {
  defineNotificationHost()
  if (document.querySelector(HOST_TAG)) {
    return
  }
  document.body.appendChild(document.createElement(HOST_TAG))
}

/**
 * Show a top-right notification (extension admin global feedback).
 * @param message User-visible text
 * @param type Visual variant
 * @param duration Auto-dismiss in ms; 0 keeps the item until replaced manually
 */
export function showMmNotification(message: string, type: MmNotificationType = 'info', duration = 2800): void {
  mountMmNotificationHost()
  const host = document.querySelector(HOST_TAG) as MmNotificationHost | null
  host?.show(message, type, duration)
}
