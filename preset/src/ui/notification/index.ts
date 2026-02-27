/**
 * Notification UI - show toast messages with optional progress bar
 */

import { appendToDocumentElement } from '@/helpers/dom'
import { registerCLIModule } from '@/services/cli-service'
import iconWarn from '~icons/mdi/alert?raw'
import iconSuccess from '~icons/mdi/check-circle?raw'
import iconError from '~icons/mdi/close-circle?raw'
import iconInfo from '~icons/mdi/information?raw'

import notificationCss from './index.css?raw'
import notificationHtml from './index.html?raw'

const TAG = 'vercel-web-script-notification'

/** Notification display type */
export type NotificationType = 'success' | 'error' | 'info' | 'warn' | 'loading'

/** Options for loading notifications (progress bar) */
export interface NotificationLoadingOptions {
  /** Progress 0–100; omit or use with indeterminate for indeterminate bar */
  progress?: number
  /** Show indeterminate progress bar */
  indeterminate?: boolean
  /** Auto-close duration in ms; 0 = no auto-close */
  duration?: number
}

/** Updates that can be applied to an existing notification (e.g. loading → success) */
export interface NotificationUpdate {
  message?: string
  type?: NotificationType
  progress?: number
  indeterminate?: boolean
  /** Auto-close duration in ms when switching to non-loading (e.g. success/error). Default 3000. */
  duration?: number
}

const TYPE_ICONS: Record<Exclude<NotificationType, 'loading'>, string> = {
  success: iconSuccess,
  error: iconError,
  info: iconInfo,
  warn: iconWarn,
}

/** Generate a unique id for a notification */
function generateNotificationId(): string {
  return `n-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

export class NotificationUI extends HTMLElement {
  #shadowRoot: ShadowRoot | null = null

  /** Map notification id to { node, timeoutId } for update/close */
  #items = new Map<string, { node: HTMLElement; timeoutId: ReturnType<typeof setTimeout> | null }>()

  /** Default auto-close duration when switching from loading to success/error (ms) */
  static readonly DEFAULT_DONE_DURATION = 3000

  connectedCallback() {
    const template = this.querySelector('template')
    const innerHTML = template ? template.innerHTML : ''
    template?.remove()

    this.#shadowRoot = this.attachShadow({ mode: 'open' })
    this.#shadowRoot.innerHTML = innerHTML
  }

  /**
   * Show a notification.
   * @param message Message text
   * @param type Notification type; use 'loading' for progress bar
   * @param duration Auto-close duration in ms (0 = no auto-close). For 'loading', defaults to 0
   * @param options For type 'loading': progress, indeterminate, duration
   * @returns Notification id for update/close
   */
  show(message: string, type: NotificationType = 'info', duration?: number, options?: NotificationLoadingOptions): string {
    const wrapper = this.#shadowRoot?.querySelector('.notifications')
    if (!wrapper) {
      throw new Error('Notifications wrapper not found')
    }

    const id = generateNotificationId()
    const isLoading = type === 'loading'
    const effectiveDuration = options?.duration ?? (isLoading ? (duration ?? 0) : (duration ?? 3000))
    const progress = options?.progress
    const indeterminate = options?.indeterminate ?? (isLoading && progress == null)

    const node = document.createElement('div')
    node.className = `notification ${type}`
    node.dataset.notificationId = id

    const iconSpan = document.createElement('span')
    iconSpan.className = 'notification__icon'
    if (isLoading) {
      iconSpan.classList.add('notification__icon--spinner')
      iconSpan.innerHTML = ''
    } else {
      iconSpan.innerHTML = TYPE_ICONS[type]
    }

    const content = document.createElement('div')
    content.className = 'notification__content'

    const messageSpan = document.createElement('span')
    messageSpan.className = 'notification__message'
    messageSpan.textContent = message

    content.appendChild(messageSpan)

    const showProgressBar = isLoading && (indeterminate || progress != null)
    if (showProgressBar) {
      const progressWrap = document.createElement('div')
      progressWrap.className = 'notification__progress'
      const progressBar = document.createElement('div')
      progressBar.className = 'notification__progress-bar'
      if (indeterminate) {
        progressBar.classList.add('indeterminate')
      } else {
        progressBar.style.width = `${Math.min(100, Math.max(0, progress ?? 0))}%`
      }
      progressWrap.appendChild(progressBar)
      content.appendChild(progressWrap)
    }

    node.appendChild(iconSpan)
    node.appendChild(content)
    wrapper.appendChild(node)

    requestAnimationFrame(() => node.classList.add('show'))

    let timeoutId: ReturnType<typeof setTimeout> | null = null
    if (effectiveDuration > 0) {
      timeoutId = setTimeout(() => this.close(id), effectiveDuration)
    }
    this.#items.set(id, { node, timeoutId })
    return id
  }

  /**
   * Update an existing notification (e.g. loading → success with message).
   * @param id Notification id from show()
   * @param updates Message, type, progress, or indeterminate
   */
  update(id: string, updates: NotificationUpdate): void {
    const entry = this.#items.get(id)
    if (!entry) return

    const { node } = entry
    if (updates.message != null) {
      const msg = node.querySelector('.notification__message')
      if (msg) msg.textContent = updates.message
    }

    if (updates.type != null) {
      const types: NotificationType[] = ['success', 'error', 'info', 'warn', 'loading']
      types.forEach((t) => node.classList.remove(t))
      node.classList.add(updates.type)
      const iconSpan = node.querySelector('.notification__icon')
      if (iconSpan) {
        iconSpan.classList.toggle('notification__icon--spinner', updates.type === 'loading')
        if (updates.type === 'loading') {
          iconSpan.innerHTML = ''
        } else {
          iconSpan.innerHTML = TYPE_ICONS[updates.type]
        }
      }
      const isNowLoading = updates.type === 'loading'
      let progressWrap = node.querySelector('.notification__progress')
      const indeterminate = updates.indeterminate ?? (isNowLoading && updates.progress == null)
      const showProgress = isNowLoading && (indeterminate || updates.progress != null)

      if (showProgress && !progressWrap) {
        progressWrap = document.createElement('div')
        progressWrap.className = 'notification__progress'
        const progressBar = document.createElement('div')
        progressBar.className = 'notification__progress-bar'
        if (indeterminate) progressBar.classList.add('indeterminate')
        else progressBar.style.width = `${Math.min(100, Math.max(0, updates.progress ?? 0))}%`
        progressWrap.appendChild(progressBar)
        const content = node.querySelector('.notification__content')
        content?.appendChild(progressWrap)
      } else if (progressWrap) {
        const bar = progressWrap.querySelector('.notification__progress-bar') as HTMLElement | null
        if (bar) {
          bar.classList.toggle('indeterminate', indeterminate)
          bar.style.width = indeterminate ? '' : `${Math.min(100, Math.max(0, updates.progress ?? 0))}%`
        }
      }
      if (!showProgress && progressWrap) {
        progressWrap.remove()
      }

      if (updates.type !== 'loading') {
        if (entry.timeoutId != null) clearTimeout(entry.timeoutId)
        const duration = updates.duration ?? NotificationUI.DEFAULT_DONE_DURATION
        if (duration > 0) {
          entry.timeoutId = setTimeout(() => this.close(id), duration)
        }
      }
    } else if (updates.progress != null || updates.indeterminate != null) {
      const progressWrap = node.querySelector('.notification__progress')
      const bar = progressWrap?.querySelector('.notification__progress-bar') as HTMLElement | null
      if (bar) {
        const ind = updates.indeterminate ?? updates.progress == null
        bar.classList.toggle('indeterminate', ind)
        bar.style.width = ind ? '' : `${Math.min(100, Math.max(0, updates.progress ?? 0))}%`
      }
    }
  }

  /**
   * Close a notification by id.
   * @param id Notification id from show()
   */
  close(id: string): void {
    const entry = this.#items.get(id)
    if (!entry) return
    this.#items.delete(id)
    if (entry.timeoutId != null) clearTimeout(entry.timeoutId)
    this.#close(entry.node)
  }

  #close(node: HTMLElement): void {
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
  appendToDocumentElement(container)
}

/**
 * Show a notification.
 * @param message Message text
 * @param type Notification type; use 'loading' for progress bar
 * @param duration Auto-close duration in ms (0 = no auto-close)
 * @param options For type 'loading': progress, indeterminate, duration
 * @returns Notification id for update/close
 */
export function GME_notification(message: string, type: NotificationType = 'info', duration = 3000, options?: NotificationLoadingOptions): string | undefined {
  const notification = document.querySelector(TAG) as NotificationUI | null
  return notification?.show(message, type, duration, options)
}

/**
 * Update an existing notification (e.g. loading → success).
 * @param id Notification id from GME_notification
 * @param updates Message, type, progress, or indeterminate
 */
export function GME_notification_update(id: string, updates: NotificationUpdate): void {
  const notification = document.querySelector(TAG) as NotificationUI | null
  notification?.update(id, updates)
}

/**
 * Close a notification by id.
 * @param id Notification id from GME_notification
 */
export function GME_notification_close(id: string): void {
  const notification = document.querySelector(TAG) as NotificationUI | null
  notification?.close(id)
}

/** Register CLI module for notification debugging */
function registerNotificationCLI(): void {
  registerCLIModule({
    name: 'notification',
    description: 'Notification UI - toast messages for debugging',
    commands: [
      {
        name: 'showInfo',
        description: 'Show an info notification',
        category: 'Debug',
        usage: 'vws.notification.test.showInfo("Hello")',
        handler: (message = 'Info message') => {
          GME_notification(String(message), 'info')
          return `Shown info: ${message}`
        },
      },
      {
        name: 'showSuccess',
        description: 'Show a success notification',
        category: 'Debug',
        usage: 'vws.notification.test.showSuccess("Done")',
        handler: (message = 'Success') => {
          GME_notification(String(message), 'success')
          return `Shown success: ${message}`
        },
      },
      {
        name: 'showError',
        description: 'Show an error notification',
        category: 'Debug',
        usage: 'vws.notification.test.showError("Error")',
        handler: (message = 'Error message') => {
          GME_notification(String(message), 'error')
          return `Shown error: ${message}`
        },
      },
      {
        name: 'showWarn',
        description: 'Show a warning notification',
        category: 'Debug',
        usage: 'vws.notification.test.showWarn("Warning")',
        handler: (message = 'Warning') => {
          GME_notification(String(message), 'warn')
          return `Shown warn: ${message}`
        },
      },
      {
        name: 'showLoading',
        description: 'Show a loading notification (indeterminate)',
        category: 'Debug',
        usage: 'vws.notification.test.showLoading("Loading...")',
        handler: (message = 'Loading...') => {
          const id = GME_notification(String(message), 'loading', 0, { indeterminate: true })
          if (!id) return null

          // 返回对象，便于在 CLI 中继续写入进度 / 完成态
          return {
            id,
            message: `Shown loading: ${message}`,
            setProgress(progress: number): void {
              GME_notification_update(id, { type: 'loading', progress, indeterminate: false })
            },
            done(doneMessage = 'Done'): void {
              GME_notification_update(id, { type: 'success', message: doneMessage })
            },
            fail(errorMessage = 'Failed'): void {
              GME_notification_update(id, { type: 'error', message: errorMessage })
            },
          }
        },
      },
      {
        name: 'showTest',
        description: 'Show one of each type (info, success, error, warn, loading)',
        category: 'Debug',
        usage: 'vws.notification.test.showTest()',
        handler: () => {
          GME_notification('Info sample', 'info')
          GME_notification('Success sample', 'success')
          GME_notification('Error sample', 'error')
          GME_notification('Warn sample', 'warn')
          GME_notification('Loading sample', 'loading', 0, { indeterminate: true })
          return 'Shown 5 test notifications'
        },
      },
    ],
  })
}

registerNotificationCLI()
