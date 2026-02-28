/**
 * Node Toolbar Module
 *
 * Provides a per-node toolbar (bottom tools, tooltip-like) for Tampermonkey userscripts.
 * The toolbar is only shown when the user hovers over a bound target node; it is never
 * displayed otherwise. On hover it appears below the node, clamped to viewport. For use
 * by third-party scripts (e.g. add "Open in new window" next to a link). Unlike
 * corner-widget, this is bound to specific nodes and can be registered in batch and dynamically.
 *
 * Registration can be by single element or by a query callback: the callback returns current
 * nodes that should have the toolbar; on DOM changes we re-run it and sync (bind new nodes,
 * unbind removed ones) so dynamic content is supported.
 *
 * @module node-toolbar
 */

import { registerNodeToolbarDebugDemo } from './debug-demo'
import { NodeToolbarManager } from './NodeToolbarManager'
import type { NodeToolbarOptions, NodeToolbarQuery } from './types'

export type { NodeToolbarButton, NodeToolbarOptions, NodeToolbarQuery } from './types'

const manager = new NodeToolbarManager()

/**
 * Register a toolbar for a single node. Toolbar appears on hover below the node,
 * clamped to viewport. For dynamic nodes use GME_registerNodeToolbarQuery instead.
 *
 * @param element Target node (e.g. a link or button)
 * @param options Toolbar options (buttons with id, text, optional icon, action)
 * @returns Unregister function to remove the toolbar from this node
 */
export function GME_registerNodeToolbar(element: HTMLElement | SVGElement, options: NodeToolbarOptions): () => void {
  return manager.register(element, options)
}

/**
 * Register toolbar by query: getElements() returns current nodes that should have the toolbar.
 * On DOM changes we re-run and sync: bind new nodes, unbind removed ones. Use for dynamic content.
 *
 * @param getElements Callback that returns current elements (e.g. () => document.querySelectorAll('.my-link'))
 * @param options Toolbar options (buttons)
 * @returns Unregister function; call it to stop watching and unbind all nodes for this registration
 */
export function GME_registerNodeToolbarQuery(getElements: NodeToolbarQuery, options: NodeToolbarOptions): () => void {
  return manager.registerQuery(getElements, options)
}

/**
 * Unregister the toolbar for a node (same as calling the return value of GME_registerNodeToolbar).
 *
 * @param element The node that was previously registered
 */
export function GME_unregisterNodeToolbar(element: HTMLElement | SVGElement): void {
  manager.unregister(element)
}

registerNodeToolbarDebugDemo(manager)
