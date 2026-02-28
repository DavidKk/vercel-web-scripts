/**
 * DEBUG command for node-toolbar: register in command-palette (dev only).
 * Creates floating demo node when page has no links, or registers toolbar on first links.
 */

import { GME_registerCommandPaletteCommand } from '@/ui/command-palette/index'
import { GME_notification } from '@/ui/notification/index'

import type { NodeToolbarManager } from './NodeToolbarManager'
import type { NodeToolbarButton } from './types'

const DEBUG_DEMO_UNREGISTERS: (() => void)[] = []
let DEBUG_DEMO_FLOATING_NODE: HTMLElement | null = null

function createFloatingDemoNode(): HTMLElement {
  const node = document.createElement('div')
  node.setAttribute('data-vws-node-toolbar-demo', '1')
  Object.assign(node.style, {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    zIndex: '2147483645',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '12px 16px',
    minWidth: '220px',
    background: 'rgba(30, 32, 36, 0.96)',
    color: '#fff',
    borderRadius: '10px',
    boxShadow: '0 4px 24px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.08)',
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    fontSize: '14px',
    boxSizing: 'border-box',
  })
  const textSpan = document.createElement('span')
  textSpan.textContent = 'Node Toolbar Demo — hover to see toolbar'
  Object.assign(textSpan.style, {
    flex: '1',
    textAlign: 'center',
    paddingRight: '28px',
    lineHeight: '1.4',
  })
  node.appendChild(textSpan)
  const closeBtn = document.createElement('button')
  closeBtn.type = 'button'
  closeBtn.setAttribute('aria-label', 'Close')
  closeBtn.textContent = '×'
  Object.assign(closeBtn.style, {
    position: 'absolute',
    top: '50%',
    right: '8px',
    width: '28px',
    height: '28px',
    marginTop: '-14px',
    padding: '0',
    border: 'none',
    background: 'transparent',
    color: 'rgba(255,255,255,0.85)',
    fontSize: '20px',
    lineHeight: '1',
    cursor: 'pointer',
    borderRadius: '6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: '0',
  })
  closeBtn.addEventListener('mouseenter', () => {
    closeBtn.style.background = 'rgba(255,255,255,0.2)'
    closeBtn.style.color = '#fff'
  })
  closeBtn.addEventListener('mouseleave', () => {
    closeBtn.style.background = 'transparent'
    closeBtn.style.color = 'rgba(255,255,255,0.85)'
  })
  closeBtn.addEventListener('click', () => {
    DEBUG_DEMO_UNREGISTERS.forEach((fn) => fn())
    DEBUG_DEMO_UNREGISTERS.length = 0
    node.remove()
    DEBUG_DEMO_FLOATING_NODE = null
  })
  node.appendChild(closeBtn)
  document.body.appendChild(node)
  return node
}

/**
 * Register the DEBUG Node Toolbar Demo command. Called from index.ts with the manager instance.
 */
export function registerNodeToolbarDebugDemo(manager: NodeToolbarManager): void {
  if (typeof __IS_DEVELOP_MODE__ === 'undefined' || !__IS_DEVELOP_MODE__) {
    return
  }
  GME_registerCommandPaletteCommand({
    id: 'node-toolbar-demo',
    keywords: ['node', 'toolbar', 'demo', 'debug', 'DEBUG'],
    title: 'DEBUG Node Toolbar Demo',
    icon: '▤',
    hint: 'Floating node or links: hover to see toolbar',
    action: () => {
      DEBUG_DEMO_UNREGISTERS.forEach((fn) => fn())
      DEBUG_DEMO_UNREGISTERS.length = 0
      if (DEBUG_DEMO_FLOATING_NODE?.parentNode) {
        DEBUG_DEMO_FLOATING_NODE.remove()
        DEBUG_DEMO_FLOATING_NODE = null
      }
      const links = document.querySelectorAll<HTMLAnchorElement>('a[href]')
      const max = Math.min(5, links.length)
      if (max === 0) {
        const floatingNode = createFloatingDemoNode()
        DEBUG_DEMO_FLOATING_NODE = floatingNode
        const buttons: NodeToolbarButton[] = [
          {
            id: 'demo-notify',
            text: 'Demo',
            icon: '◇',
            action: () => GME_notification('Node toolbar demo clicked', 'success', 1500),
          },
          {
            id: 'demo-close',
            text: 'Close',
            icon: '×',
            action: () => {
              floatingNode.remove()
              DEBUG_DEMO_FLOATING_NODE = null
              DEBUG_DEMO_UNREGISTERS.forEach((fn) => fn())
              DEBUG_DEMO_UNREGISTERS.length = 0
            },
          },
        ]
        const unreg = manager.register(floatingNode, { buttons })
        DEBUG_DEMO_UNREGISTERS.push(unreg)
        GME_notification('Floating demo node created — hover to see toolbar', 'info', 2500)
        return
      }
      for (let i = 0; i < max; i++) {
        const link = links[i]
        if (!link || !document.body.contains(link)) continue
        const buttons: NodeToolbarButton[] = [
          {
            id: 'demo-notify',
            text: 'Demo',
            icon: '◇',
            action: () => GME_notification('Node toolbar demo clicked', 'success', 1500),
          },
          {
            id: 'demo-new-tab',
            text: 'New tab',
            icon: '↗',
            action: () => {
              if (link instanceof HTMLAnchorElement && link.href) {
                window.open(link.href, '_blank')
              }
            },
          },
        ]
        const unreg = manager.register(link, { buttons })
        DEBUG_DEMO_UNREGISTERS.push(unreg)
      }
      GME_notification(`Node toolbar demo: hover over ${max} link(s) to see`, 'info', 2500)
    },
  })
}
