/**
 * Type definitions for node-toolbar module
 */

/**
 * Button action: no-arg or receive current node (for query registration so action can use the hovered element).
 */
export type NodeToolbarButtonAction = (() => void) | ((element: HTMLElement | SVGElement) => void)

/**
 * Button definition for the node toolbar
 */
export interface NodeToolbarButton {
  /** Unique id for this button within the toolbar */
  id: string
  /** Label text */
  text: string
  /** Optional icon (emoji or character) */
  icon?: string
  /** Called when the button is clicked; may receive the current node (e.g. to open link) */
  action: NodeToolbarButtonAction
}

/**
 * Options when registering a node toolbar
 */
export interface NodeToolbarOptions {
  /** Buttons to show in the toolbar */
  buttons: NodeToolbarButton[]
  /** Show outline on the target node (default true). Independent from node-selector; clearAllMarks does not affect this. */
  outline?: boolean
  /** Outline color (default: blue-ish). Ignored if outline is false. */
  outlineColor?: string
  /** Optional short label shown on the node (e.g. badge). Ignored if empty. */
  label?: string
}

/** Callback that returns current elements that should have the toolbar (e.g. query or static list). */
export type NodeToolbarQuery = () => (HTMLElement | SVGElement)[]

/** Internal: per-element binding entry */
export interface RegisteredEntry {
  options: NodeToolbarOptions
  mouseEnterHandler: () => void
  mouseLeaveHandler: () => void
  /** Label element we injected (if any), for cleanup */
  labelEl?: HTMLElement
  /** Original inline styles we overwrote, for restore on unbind */
  originalOutline?: string
  originalOutlineOffset?: string
  originalPosition?: string
}

/** Internal: one query-based registration */
export interface QueryRegistration {
  getElements: NodeToolbarQuery
  options: NodeToolbarOptions
  bound: Set<Element>
}
