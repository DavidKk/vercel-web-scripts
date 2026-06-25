/**
 * Node Selector Module
 *
 * Temporary DOM selection for third-party integrations.
 * Session-only by default; callers opt in to marking and persistence.
 *
 * @module node-selector
 */

import { appendToDocumentElement } from '@/helpers/dom'
import { GME_info, GME_warn } from '@/helpers/logger'
import { mountUiTemplateShell } from '@/helpers/safe-inner-html'
import { getUnsafeWindow } from '@/services/cli-service'

import { wrapUiStyles } from '../shared/wrap-ui-styles'
import nodeSelectorCss from './index.css?raw'
import nodeSelectorHtml from './index.html?raw'
import { NodeSelector } from './NodeSelector'
import type { MarkedNodeInfo, NodeSelectorOptions } from './types'

export type { MarkedNodeInfo, NodeSelectorClickMode, NodeSelectorOptions } from './types'

/**
 * Enable node selector
 * @param options Node selector configuration options
 */
export function GME_enableNodeSelector(options?: NodeSelectorOptions): void {
  let selector = document.querySelector(NodeSelector.TAG_NAME) as NodeSelector
  if (!selector) {
    selector = document.createElement(NodeSelector.TAG_NAME) as NodeSelector
    document.body.appendChild(selector)
  }
  selector.enable(options || {})
}

/**
 * Disable node selector
 */
export function GME_disableNodeSelector(): void {
  const selector = document.querySelector(NodeSelector.TAG_NAME) as NodeSelector
  if (selector) {
    selector.disable()
  }
}

/**
 * Get currently selected node
 * @returns Selected HTMLElement or null
 */
export function GME_getSelectedNode(): HTMLElement | null {
  const selector = document.querySelector(NodeSelector.TAG_NAME) as NodeSelector
  return selector ? selector.getSelectedNode() : null
}

/**
 * Clear current selection
 */
export function GME_clearSelection(): void {
  const selector = document.querySelector(NodeSelector.TAG_NAME) as NodeSelector
  if (selector) {
    selector.clearSelection()
  }
}

/**
 * Mark a node (caller decides when to mark; not automatic on select)
 * @param node Node to mark
 * @param label Optional internal label
 * @param color Optional custom color (hex format)
 * @returns Mark ID or null if failed
 */
export function GME_markNode(node: HTMLElement, label?: string, color?: string): string | null {
  const selector = document.querySelector(NodeSelector.TAG_NAME) as NodeSelector
  return selector ? selector.markNode(node, label, color) : null
}

/**
 * Unmark a node by mark ID
 * @param markId Mark ID to remove
 * @returns Whether the mark was successfully removed
 */
export function GME_unmarkNode(markId: string): boolean {
  const selector = document.querySelector(NodeSelector.TAG_NAME) as NodeSelector
  return selector ? selector.unmarkNode(markId) : false
}

/**
 * Clear all marks
 */
export function GME_clearAllMarks(): void {
  const selector = document.querySelector(NodeSelector.TAG_NAME) as NodeSelector
  if (selector) {
    selector.clearAllMarks()
  }
}

/**
 * Get all marked nodes (current session; includes persisted marks when enabled)
 * @returns Array of marked node information
 */
export function GME_getMarkedNodes(): MarkedNodeInfo[] {
  const selector = document.querySelector(NodeSelector.TAG_NAME) as NodeSelector
  if (!selector) return []
  try {
    return selector.getMarkedNodes()
  } catch (e) {
    GME_warn('[node-selector] GME_getMarkedNodes failed:', e instanceof Error ? e.message : String(e))
    return []
  }
}

/**
 * Clean up invalid marks (nodes that no longer exist)
 * @returns Number of marks cleaned up
 */
export function GME_cleanupInvalidMarks(): number {
  const selector = document.querySelector(NodeSelector.TAG_NAME) as NodeSelector
  if (!selector) return 0
  const marks = GME_getMarkedNodes()
  let cleaned = 0
  marks.forEach((mark) => {
    if (mark.isValid === false) {
      GME_unmarkNode(mark.markId)
      cleaned++
    }
  })
  return cleaned
}

/**
 * Hide all marks (remove Web Components and stop observers to save resources)
 */
export function GME_hideMarks(): void {
  const selector = document.querySelector(NodeSelector.TAG_NAME) as NodeSelector
  if (selector) {
    selector.hideMarks()
  }
}

/**
 * Show all marks (recreate Web Components and restart observers)
 */
export function GME_showMarks(): void {
  const selector = document.querySelector(NodeSelector.TAG_NAME) as NodeSelector
  if (selector) {
    selector.showMarks()
  }
}

/**
 * Check if marks are currently hidden
 * @returns Whether marks are hidden
 */
export function GME_areMarksHidden(): boolean {
  const selector = document.querySelector(NodeSelector.TAG_NAME) as NodeSelector
  return selector ? selector.areMarksHidden() : false
}

/**
 * Check if node selector is currently enabled
 * @returns Whether the node selector is enabled
 */
export function GME_isNodeSelectorEnabled(): boolean {
  const selector = document.querySelector(NodeSelector.TAG_NAME) as NodeSelector
  return selector ? selector.isEnabled() : false
}

if (typeof document !== 'undefined' && !document.querySelector(NodeSelector.TAG_NAME)) {
  const container = document.createElement(NodeSelector.TAG_NAME)
  mountUiTemplateShell(container, wrapUiStyles(nodeSelectorCss), nodeSelectorHtml)
  appendToDocumentElement(container)
}

// ============================================================================
// DEBUG/TEST CODE - for development only
// ============================================================================

function registerNodeSelectorCLI() {
  // @ts-ignore
  const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window

  // @ts-ignore
  if (typeof win.registerCLIModule === 'undefined') {
    return
  }

  // @ts-ignore
  win.registerCLIModule({
    name: 'nodeSelector',
    description: 'Node selector module for temporary DOM selection (third-party initiated)',
    commands: [
      {
        name: 'enableMark',
        description: 'Enable mark-only mode (click marks, no onSelect)',
        category: 'Basic',
        usage: 'vws.nodeSelector.test.enableMark()',
        handler: function () {
          GME_enableNodeSelector({
            clickMode: 'mark',
            onMark: (node: HTMLElement, markId: string | null) => {
              GME_info('Marked node:', node, 'markId:', markId)
            },
          })
          GME_info('Node selector enabled in mark-only mode.')
        },
      },
      {
        name: 'enable',
        description: 'Enable select-only mode (click invokes onSelect, no mark)',
        category: 'Basic',
        usage: 'vws.nodeSelector.test.enable()',
        handler: function () {
          GME_enableNodeSelector({
            clickMode: 'select',
            onSelect: (node: HTMLElement) => {
              GME_info('Selected node:', node)
            },
          })
          GME_info('Node selector enabled in select-only mode.')
        },
      },
      {
        name: 'enableSelectAndMark',
        description: 'Enable select-and-mark mode',
        category: 'Basic',
        usage: 'vws.nodeSelector.test.enableSelectAndMark()',
        handler: function () {
          GME_enableNodeSelector({
            clickMode: 'selectAndMark',
            onSelect: (node: HTMLElement) => {
              GME_info('Selected node:', node)
            },
            onMark: (node: HTMLElement, markId: string | null) => {
              GME_info('Marked node:', node, 'markId:', markId)
            },
          })
          GME_info('Node selector enabled in select-and-mark mode.')
        },
      },
      {
        name: 'disable',
        description: 'Disable node selector',
        category: 'Basic',
        usage: 'vws.nodeSelector.test.disable()',
        handler: function () {
          GME_disableNodeSelector()
          GME_info('Node selector disabled.')
        },
      },
      {
        name: 'listMarks',
        description: 'List all marked nodes',
        category: 'Marks',
        usage: 'vws.nodeSelector.test.listMarks()',
        handler: function () {
          const marks = GME_getMarkedNodes()
          GME_info('Marked nodes:', marks)
          return marks
        },
      },
      {
        name: 'clearMarks',
        description: 'Clear all marks',
        category: 'Marks',
        usage: 'vws.nodeSelector.test.clearMarks()',
        handler: function () {
          GME_clearAllMarks()
          GME_info('All marks cleared.')
        },
      },
    ],
  })
}

registerNodeSelectorCLI()

// @ts-ignore
getUnsafeWindow().testNodeSelector = function () {
  GME_enableNodeSelector({
    clickMode: 'select',
    onSelect: (node: HTMLElement) => {
      GME_info('Selected node:', node)
    },
  })
  GME_info('Node selector enabled in select-only mode.')
}

// @ts-ignore
getUnsafeWindow().testDisableNodeSelector = function () {
  GME_disableNodeSelector()
  GME_info('Node selector disabled.')
}

// @ts-ignore
getUnsafeWindow().testListMarks = function () {
  const marks = GME_getMarkedNodes()
  GME_info('Marked nodes:', marks)
  return marks
}

// @ts-ignore
getUnsafeWindow().testClearMarks = function () {
  GME_clearAllMarks()
  GME_info('All marks cleared.')
}
