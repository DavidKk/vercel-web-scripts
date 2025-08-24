class NotificationUI extends HTMLElement {
  /** Shadow DOM root */
  #shadowRoot: ShadowRoot | null = null

  connectedCallback() {
    const template = this.querySelector('template')
    const innerHTML = template ? template.innerHTML : ''
    template?.remove()

    this.#shadowRoot = this.attachShadow({ mode: 'open' })
    this.#shadowRoot.innerHTML = innerHTML
  }

  show(message: string, type: 'success' | 'error' | 'info' | 'warn' = 'info', duration = 3000) {
    const wrapper = this.#shadowRoot?.querySelector('.notifications')
    if (!wrapper) {
      throw new Error('Notifications wrapper not found')
    }

    const icon = (() => {
      switch (type) {
        case 'success':
          return '✔'
        case 'error':
          return '✖'
        case 'info':
          return 'ℹ'
        case 'warn':
          return '⚠'
      }
    })()

    const node = document.createElement('div')
    node.className = `notification ${type}`
    node.textContent = message
    wrapper.appendChild(node)

    requestAnimationFrame(() => node.classList.add('show'))
    setTimeout(() => this.#close(node), duration)
  }

  #close(node: HTMLElement) {
    node.classList.remove('show')
    node.addEventListener('transitionend', () => node.remove())
  }
}

if (!customElements.get('vercel-web-script-notification')) {
  customElements.define('vercel-web-script-notification', NotificationUI)
}

function GME_notification(message: string, type: 'success' | 'error' | 'info' | 'warn' = 'info', duration = 3000) {
  const notification = document.querySelector('vercel-web-script-notification') as NotificationUI
  notification.show(message, type, duration)
}
