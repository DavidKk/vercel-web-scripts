/**
 * Type definitions for node-selector module
 * These interfaces are used in other files (NodeSelector.ts, index.ts) after files are merged at compile time
 * ESLint may report them as unused in this file, but they are required for the merged compilation
 */

/**
 * Node information for highlight target resolution (no tooltip UI)
 */
export interface NodeInfo {
  /** Optional target element to highlight (defaults to the hovered node) */
  highlightTarget?: HTMLElement
}

/**
 * Marked node information
 */
export interface MarkedNodeInfo {
  /** Unique mark ID */
  markId: string
  /** Node signature for identification */
  signature: string
  /** CSS selector for finding the node (used when persistMarks is enabled) */
  selector: string
  /** XPath for finding the node (optional, used when persistMarks is enabled) */
  xpath?: string
  /** XPath array for finding the node (used when persistMarks is enabled) */
  xpaths: string[]
  /** Label text for the marker (internal use) */
  label: string
  /** Timestamp when marked */
  timestamp: number
  /** Whether the mark is still valid (node exists) */
  isValid?: boolean
  /** Optional custom data */
  data?: Record<string, unknown>
  /** Marker color (hex format, e.g., '#8b5cf6') */
  color?: string
}

/**
 * Click interaction mode for node selector
 * - mark: click marks only (no onSelect / selectedNode)
 * - select: click selects and invokes onSelect (no mark)
 * - selectAndMark: click selects, invokes onSelect, and marks
 */
export type NodeSelectorClickMode = 'mark' | 'select' | 'selectAndMark'

/**
 * Node selector configuration options
 */
export interface NodeSelectorOptions {
  /**
   * Click behavior (preferred over enableClickSelection).
   * When omitted: enableClickSelection + onSelect → select; enableClickSelection alone → mark.
   */
  clickMode?: NodeSelectorClickMode
  /** @deprecated Use clickMode. Enables click handling when clickMode is omitted. */
  enableClickSelection?: boolean
  /** Callback when a node is selected by click (select / selectAndMark modes) */
  onSelect?: (node: HTMLElement) => void
  /** Callback after a node is marked by click (mark / selectAndMark modes) */
  onMark?: (node: HTMLElement, markId: string | null) => void
  /** Callback to resolve highlight target (no tooltip is shown) */
  getNodeInfo?: (node: HTMLElement) => NodeInfo | null
  /** Custom function to generate stable node signature (default: auto-generate) */
  generateNodeSignature?: (node: HTMLElement) => string
  /** Storage key for persisting marks (only used when persistMarks is true) */
  storageKey?: string
  /** Whether to persist marks to GM storage (default: false, session-only) */
  persistMarks?: boolean
  /** Whether to auto-restore marks on enable (default: false; requires persistMarks) */
  autoRestoreMarks?: boolean
  /** Custom function to check if a node should be excluded from selection/marking */
  shouldExcludeNode?: (node: HTMLElement) => boolean
  /** Custom color for marks (hex format, e.g., '#8b5cf6'). If not provided, a random unique color will be generated */
  markColor?: string
}
