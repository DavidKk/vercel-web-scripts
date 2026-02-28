/**
 * Node toolbar manager: one shared floating toolbar.
 * Rule: hover on target node → show; move away (leave node or leave toolbar) → hide. Non-hover = hidden.
 */

import { appendToDocumentElement } from '@/helpers/dom'

import nodeToolbarCss from './index.css?raw'
import nodeToolbarHtml from './index.html?raw'
import type { NodeToolbarOptions, NodeToolbarQuery, QueryRegistration, RegisteredEntry } from './types'

/** Vertical gap between target node and toolbar (px) */
const GAP = 6
/** Delay before hiding when mouse leaves node, so user can move to toolbar (ms) */
const HIDE_DELAY_MS = 120
/** Debounce ms for DOM mutation → sync bindings */
const SYNC_DEBOUNCE_MS = 80
/** Default outline color for target node (distinct from node-selector) */
const DEFAULT_OUTLINE_COLOR = 'rgba(59, 130, 246, 0.75)'

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export class NodeToolbarManager {
  #host: HTMLElement | null = null
  #bar: HTMLElement | null = null
  #registry = new Map<Element, RegisteredEntry>()
  #queryRegistrations: QueryRegistration[] = []
  #currentTarget: Element | null = null
  #hideTimer: ReturnType<typeof setTimeout> | null = null
  #observer: MutationObserver | null = null
  #syncDebounceId: ReturnType<typeof setTimeout> | null = null

  #getHost(): HTMLElement {
    if (this.#host) return this.#host
    this.#host = document.createElement('div')
    this.#host.className = 'nt-host'
    this.#host.innerHTML = `<style>${nodeToolbarCss}</style>${nodeToolbarHtml}`
    this.#bar = this.#host.querySelector('.nt-bar')
    if (this.#bar) this.#bar.setAttribute('role', 'toolbar')
    this.#host.addEventListener('mouseenter', this.#onToolbarMouseEnter)
    this.#host.addEventListener('mouseleave', this.#onToolbarMouseLeave)
    appendToDocumentElement(this.#host)
    return this.#host
  }

  /** Mouse entered toolbar: cancel pending hide so user can click (stay visible while on toolbar). */
  #onToolbarMouseEnter = (): void => {
    if (this.#hideTimer != null) {
      clearTimeout(this.#hideTimer)
      this.#hideTimer = null
    }
  }

  /** Mouse left toolbar: hide immediately (移开隐藏). */
  #onToolbarMouseLeave = (): void => {
    if (this.#hideTimer != null) {
      clearTimeout(this.#hideTimer)
      this.#hideTimer = null
    }
    this.#hide()
  }

  /** Mouse left node: schedule hide after short delay so user can move to toolbar; otherwise 移开隐藏. */
  #scheduleHide(): void {
    if (this.#hideTimer != null) return
    this.#hideTimer = setTimeout(() => {
      this.#hideTimer = null
      this.#hide()
    }, HIDE_DELAY_MS)
  }

  /**
   * Show toolbar for this node. Only ever called from node mouseenter — toolbar is never shown without hover.
   */
  #showFor(node: Element): void {
    const entry = this.#registry.get(node)
    if (!entry || !entry.options.buttons.length) return
    if (!document.body.contains(node)) {
      this.#registry.delete(node)
      return
    }
    const host = this.#getHost()
    const bar = this.#bar!
    bar.innerHTML = ''
    entry.options.buttons.forEach((btn) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'nt-btn'
      button.dataset.btnId = btn.id
      if (btn.icon) {
        const iconSpan = document.createElement('span')
        iconSpan.className = 'nt-btn__icon'
        iconSpan.textContent = btn.icon
        button.appendChild(iconSpan)
      }
      const textSpan = document.createElement('span')
      textSpan.className = 'nt-btn__text'
      textSpan.textContent = btn.text
      button.appendChild(textSpan)
      button.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        if (btn.action.length >= 1) {
          ;(btn.action as (element: HTMLElement | SVGElement) => void)(node as HTMLElement | SVGElement)
        } else {
          ;(btn.action as () => void)()
        }
      })
      bar.appendChild(button)
    })
    this.#currentTarget = node
    host.classList.add('nt-host--visible')
    requestAnimationFrame(() => this.#updatePosition())
    this.#addScrollResizeListeners()
  }

  #updatePosition(): void {
    const host = this.#host
    const node = this.#currentTarget
    if (!host || !node) return
    if (!document.body.contains(node)) {
      this.#hide()
      return
    }
    const rect = node.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const barRect = this.#bar!.getBoundingClientRect()
    const barW = barRect.width
    const barH = barRect.height
    let left = rect.left
    let top = rect.bottom + GAP
    left = clamp(left, 0, vw - barW)
    top = clamp(top, 0, vh - barH)
    host.style.left = `${left}px`
    host.style.top = `${top}px`
  }

  #scrollResizeHandler = (): void => {
    if (this.#currentTarget) this.#updatePosition()
  }

  #scrollResizeListenersAdded = false

  #addScrollResizeListeners(): void {
    if (this.#scrollResizeListenersAdded) return
    this.#scrollResizeListenersAdded = true
    window.addEventListener('scroll', this.#scrollResizeHandler, true)
    window.addEventListener('resize', this.#scrollResizeHandler)
  }

  #removeScrollResizeListeners(): void {
    if (!this.#scrollResizeListenersAdded) return
    this.#scrollResizeListenersAdded = false
    window.removeEventListener('scroll', this.#scrollResizeHandler, true)
    window.removeEventListener('resize', this.#scrollResizeHandler)
  }

  #hide(): void {
    this.#currentTarget = null
    if (this.#host) {
      this.#host.classList.remove('nt-host--visible')
    }
    if (this.#bar) {
      this.#bar.innerHTML = ''
    }
    this.#removeScrollResizeListeners()
  }

  /**
   * Apply outline and optional label to the target node. Independent from node-selector (clearAllMarks does not touch this).
   * Returns partial entry with labelEl and original style values for restore on unbind.
   */
  #applyOutlineAndLabel(
    el: HTMLElement | SVGElement,
    options: NodeToolbarOptions
  ): Pick<RegisteredEntry, 'labelEl' | 'originalOutline' | 'originalOutlineOffset' | 'originalPosition'> {
    const out: Pick<RegisteredEntry, 'labelEl' | 'originalOutline' | 'originalOutlineOffset' | 'originalPosition'> = {}
    const showOutline = options.outline !== false
    const color = options.outlineColor ?? DEFAULT_OUTLINE_COLOR
    if (showOutline && el instanceof HTMLElement) {
      out.originalOutline = el.style.outline || ''
      out.originalOutlineOffset = el.style.outlineOffset || ''
      el.style.outline = `2px solid ${color}`
      el.style.outlineOffset = '2px'
    }
    if (options.label && typeof options.label === 'string' && options.label.trim() && el instanceof HTMLElement) {
      out.originalPosition = el.style.position || ''
      const pos = window.getComputedStyle(el).position
      if (pos === 'static' || !pos) {
        el.style.position = 'relative'
      }
      const labelEl = document.createElement('span')
      labelEl.setAttribute('data-nt-label', '1')
      labelEl.textContent = options.label.trim().slice(0, 24)
      Object.assign(labelEl.style, {
        position: 'absolute',
        top: '0',
        right: '0',
        transform: 'translate(0, -100%)',
        padding: '2px 6px',
        fontSize: '10px',
        lineHeight: '1.2',
        background: color,
        color: '#fff',
        borderRadius: '4px',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        maxWidth: '120px',
        pointerEvents: 'none',
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      })
      el.appendChild(labelEl)
      out.labelEl = labelEl
    }
    return out
  }

  #removeOutlineAndLabel(el: Element, entry: Pick<RegisteredEntry, 'labelEl' | 'originalOutline' | 'originalOutlineOffset' | 'originalPosition'>): void {
    if (el instanceof HTMLElement) {
      if (entry.originalOutline !== undefined) {
        el.style.outline = entry.originalOutline ?? ''
        el.style.outlineOffset = entry.originalOutlineOffset ?? ''
      }
      if (entry.originalPosition !== undefined) {
        el.style.position = entry.originalPosition ?? ''
      }
    }
    if (entry.labelEl && entry.labelEl.parentNode === el) {
      entry.labelEl.remove()
    }
  }

  #bind(element: HTMLElement | SVGElement, options: NodeToolbarOptions): void {
    if (!options.buttons?.length) return
    const el = element as Element
    if (this.#registry.has(el)) return
    const mouseEnter = (): void => {
      if (this.#hideTimer != null) {
        clearTimeout(this.#hideTimer)
        this.#hideTimer = null
      }
      this.#showFor(el)
    }
    const mouseLeave = (): void => {
      this.#scheduleHide()
    }
    const outlineAndLabel = this.#applyOutlineAndLabel(element, options)
    this.#registry.set(el, {
      options,
      mouseEnterHandler: mouseEnter,
      mouseLeaveHandler: mouseLeave,
      ...outlineAndLabel,
    })
    el.addEventListener('mouseenter', mouseEnter)
    el.addEventListener('mouseleave', mouseLeave)
  }

  #unbind(element: Element): void {
    const entry = this.#registry.get(element)
    if (!entry) return
    this.#removeOutlineAndLabel(element, entry)
    element.removeEventListener('mouseenter', entry.mouseEnterHandler)
    element.removeEventListener('mouseleave', entry.mouseLeaveHandler)
    this.#registry.delete(element)
    if (this.#currentTarget === element) {
      this.#hide()
    }
  }

  #syncQueryRegistration(reg: QueryRegistration): void {
    if (!document.body) return
    let elements: (HTMLElement | SVGElement)[]
    try {
      elements = reg.getElements()
    } catch {
      return
    }
    const current = new Set<Element>((Array.isArray(elements) ? elements : [elements]).filter((el) => el && document.body.contains(el)))
    for (const el of reg.bound) {
      if (!current.has(el)) {
        this.#unbind(el)
        reg.bound.delete(el)
      }
    }
    for (const el of current) {
      if (!reg.bound.has(el)) {
        this.#bind(el as HTMLElement | SVGElement, reg.options)
        reg.bound.add(el)
      }
    }
  }

  #scheduleSync(): void {
    if (this.#syncDebounceId != null) return
    this.#syncDebounceId = setTimeout(() => {
      this.#syncDebounceId = null
      for (const reg of this.#queryRegistrations) {
        this.#syncQueryRegistration(reg)
      }
    }, SYNC_DEBOUNCE_MS)
  }

  #startObserver(): void {
    if (this.#observer) return
    this.#observer = new MutationObserver(() => this.#scheduleSync())
    this.#observer.observe(document.body, { childList: true, subtree: true })
  }

  registerQuery(getElements: NodeToolbarQuery, options: NodeToolbarOptions): () => void {
    if (!options.buttons?.length) return () => {}
    const reg: QueryRegistration = { getElements, options, bound: new Set() }
    this.#queryRegistrations.push(reg)
    this.#startObserver()
    // 初始化时立即执行一次，节点可能已渲染且后续不再变化
    this.#syncQueryRegistration(reg)
    setTimeout(() => this.#syncQueryRegistration(reg), 0)
    return () => {
      const idx = this.#queryRegistrations.indexOf(reg)
      if (idx >= 0) this.#queryRegistrations.splice(idx, 1)
      for (const el of reg.bound) {
        this.#unbind(el)
      }
      reg.bound.clear()
    }
  }

  register(element: HTMLElement | SVGElement, options: NodeToolbarOptions): () => void {
    return this.registerQuery(() => (document.body.contains(element) ? [element] : []), options)
  }

  unregister(element: HTMLElement | SVGElement): void {
    this.#unbind(element as Element)
    for (const reg of this.#queryRegistrations) {
      reg.bound.delete(element as Element)
    }
  }
}
