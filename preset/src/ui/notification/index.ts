/**
 * Notification UI - show toast messages
 */

import { appendWhenBodyReady } from '@/helpers/dom'
import iconWarn from '~icons/mdi/alert?raw'
import iconSuccess from '~icons/mdi/check-circle?raw'
import iconError from '~icons/mdi/close-circle?raw'
import iconInfo from '~icons/mdi/information?raw'

import notificationCss from './index.css?raw'
import notificationHtml from './index.html?raw'

const TAG = 'vercel-web-script-notification'

const TYPE_ICONS: Record<'success' | 'error' | 'info' | 'warn', string> = {
  success: iconSuccess,
  error: iconError,
  info: iconInfo,
  warn: iconWarn,
}

export class NotificationUI extends HTMLElement {
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

    const node = document.createElement('div')
    node.className = `notification ${type}`

    const iconSpan = document.createElement('span')
    iconSpan.className = 'notification__icon'
    iconSpan.innerHTML = TYPE_ICONS[type]

    const messageSpan = document.createElement('span')
    messageSpan.className = 'notification__message'
    messageSpan.textContent = message

    node.appendChild(iconSpan)
    node.appendChild(messageSpan)
    wrapper.appendChild(node)

    requestAnimationFrame(() => node.classList.add('show'))
    setTimeout(() => this.#close(node), duration)
  }

  #close(node: HTMLElement) {
    node.classList.remove('show')
    node.addEventListener('transitionend', () => node.remove())
  }
}

if (typeof customElements !== 'undefined' && !customElements.get(TAG)) {
  customElements.define(TAG, NotificationUI)
}

if (typeof document !== 'undefined' && !document.querySelector(TAG)) {
  const container = document.createElement(TAG)
  container.innerHTML = `<template><style>${notificationCss}</style>${notificationHtml}</template>`
  requestAnimationFrame(() => appendWhenBodyReady(container))
}

export function GME_notification(message: string, type: 'success' | 'error' | 'info' | 'warn' = 'info', duration = 3000): void {
  const notification = document.querySelector(TAG) as NotificationUI | null
  notification?.show(message, type, duration)
}
