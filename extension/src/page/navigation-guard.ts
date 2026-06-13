/**
 * Page-world navigation guard: hook window.open + capture-phase clicks,
 * evaluate policy, log to extension Logs tab, optionally block outbound navigations.
 */

import { DEBUG_LOG_MESSAGE_TYPE, EXTENSION_BRIDGE_MESSAGE_SOURCE, NAV_GUARD_POLICY_MESSAGE_TYPE } from '@shared/launcher-constants'
import { DEFAULT_NAV_GUARD_POLICY, evaluateNavigation, type NavGuardChannel, type NavGuardEvaluation, type NavGuardPolicy, parseNavGuardPolicy } from '@shared/navigation-guard'

const STACK_MAX_LINES = 8
const STACK_MAX_CHARS = 1200

let policy: NavGuardPolicy = { ...DEFAULT_NAV_GUARD_POLICY }
let hooksInstalled = false

function captureStack(): string {
  try {
    const stack = new Error().stack ?? ''
    return stack
      .split('\n')
      .slice(2, 2 + STACK_MAX_LINES)
      .join('\n')
      .slice(0, STACK_MAX_CHARS)
  } catch {
    return ''
  }
}

function describeElement(el: Element | null): string {
  if (!el) {
    return ''
  }
  const parts: string[] = []
  let current: Element | null = el
  for (let depth = 0; depth < 5 && current; depth += 1) {
    let label = current.tagName.toLowerCase()
    if (current.id) {
      label += `#${current.id}`
    } else if (typeof current.className === 'string' && current.className.trim()) {
      label += `.${current.className.trim().split(/\s+/).slice(0, 2).join('.')}`
    }
    parts.unshift(label)
    current = current.parentElement
  }
  return parts.join(' > ')
}

function reportNavEvent(channel: NavGuardChannel, targetUrl: string, evaluation: NavGuardEvaluation, details: { trusted: boolean; element?: string; stack?: string }): void {
  const blocked = evaluation.action === 'block'
  const level = blocked ? 'warn' : 'info'
  const status = blocked ? 'BLOCKED' : evaluation.action === 'log' ? 'logged' : 'allowed'
  const parts = [`[${channel}] ${status}`, `target=${targetUrl}`, `reason=${evaluation.reason}`, `trusted=${details.trusted ? 'yes' : 'no'}`]
  if (details.element) {
    parts.push(`element=${details.element}`)
  }
  if (details.stack) {
    parts.push(`stack=${details.stack}`)
  }
  window.postMessage(
    {
      source: EXTENSION_BRIDGE_MESSAGE_SOURCE,
      type: DEBUG_LOG_MESSAGE_TYPE,
      payload: {
        level,
        source: 'page',
        scope: 'NavGuard',
        message: parts.join(' | '),
      },
    },
    '*'
  )
}

function handleNavigation(channel: NavGuardChannel, targetRaw: string, context: { trusted: boolean; element?: Element | null; stack?: string }): boolean {
  const evaluation = evaluateNavigation(window.location.href, targetRaw, policy)
  reportNavEvent(channel, targetRaw, evaluation, {
    trusted: context.trusted,
    element: context.element ? describeElement(context.element) : undefined,
    stack: context.stack ?? captureStack(),
  })
  return evaluation.action !== 'block'
}

function findClickAnchor(target: EventTarget | null): HTMLAnchorElement | null {
  let node = target instanceof Element ? target : null
  while (node) {
    if (node instanceof HTMLAnchorElement && node.href) {
      return node
    }
    node = node.parentElement
  }
  return null
}

function isModifiedNavigationClick(event: MouseEvent): boolean {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button === 1
}

function onDocumentClickCapture(event: MouseEvent): void {
  if (!policy.enabled || policy.mode === 'off') {
    return
  }
  const anchor = findClickAnchor(event.target)
  if (!anchor) {
    return
  }
  const opensNewTab = anchor.target === '_blank' || isModifiedNavigationClick(event)
  if (!opensNewTab) {
    return
  }
  const allowed = handleNavigation('click', anchor.href, {
    trusted: event.isTrusted,
    element: anchor,
  })
  if (!allowed) {
    event.preventDefault()
    event.stopImmediatePropagation()
  }
}

function installHooks(): void {
  if (hooksInstalled) {
    return
  }
  hooksInstalled = true

  const nativeOpen = window.open.bind(window)
  window.open = function openWithNavGuard(url?: string | URL, target?: string, features?: string): Window | null {
    const raw = url == null ? '' : String(url)
    const allowed = handleNavigation('window.open', raw, { trusted: true })
    if (!allowed) {
      return null
    }
    return nativeOpen(url, target, features)
  }

  document.addEventListener('click', onDocumentClickCapture, true)
}

function applyPolicy(next: NavGuardPolicy): void {
  policy = next
  if (policy.enabled && policy.mode !== 'off') {
    installHooks()
  }
}

window.addEventListener('message', (event: MessageEvent) => {
  if (event.source !== window || event.origin !== window.location.origin || !event.data || typeof event.data !== 'object') {
    return
  }
  const data = event.data as { source?: unknown; type?: unknown; payload?: unknown }
  if (data.source !== EXTENSION_BRIDGE_MESSAGE_SOURCE || data.type !== NAV_GUARD_POLICY_MESSAGE_TYPE) {
    return
  }
  applyPolicy(parseNavGuardPolicy(data.payload))
})

applyPolicy(policy)
