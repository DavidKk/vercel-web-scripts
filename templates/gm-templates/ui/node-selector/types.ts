/**
 * Type definitions for node-selector module
 * These interfaces are used in other files (NodeSelector.ts, index.ts) after files are merged at compile time
 * ESLint may report them as unused in this file, but they are required for the merged compilation
 */

/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * Node information displayed in tooltip
 */
interface NodeInfo {
  /** Primary information text */
  title: string
  /** Optional secondary information */
  subtitle?: string
  /** Optional additional details */
  details?: string[]
  /** Optional target element to highlight (defaults to the hovered node) */
  highlightTarget?: HTMLElement
}

/**
 * Marked node information
 */
interface MarkedNodeInfo {
  /** Unique mark ID */
  markId: string
  /** Node signature for identification */
  signature: string
  /** CSS selector for finding the node */
  selector: string
  /** Label text for the marker (auto-generated hash if not provided) */
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
 * Node selector configuration options
 */
interface NodeSelectorOptions {
  /** Whether to enable click selection */
  enableClickSelection?: boolean
  /** Callback when a node is selected by click */
  onSelect?: (node: HTMLElement) => void
  /** Callback to get node information for tooltip */
  getNodeInfo?: (node: HTMLElement) => NodeInfo
  /** Custom function to generate stable node signature (default: auto-generate) */
  generateNodeSignature?: (node: HTMLElement) => string
  /** Storage key for persisting marks (default: 'node-selector-marks') */
  storageKey?: string
  /** Whether to auto-restore marks on page load (default: true) */
  autoRestoreMarks?: boolean
  /** Custom function to check if a node should be excluded from selection/marking */
  shouldExcludeNode?: (node: HTMLElement) => boolean
  /** Custom color for marks (hex format, e.g., '#8b5cf6'). If not provided, a random unique color will be generated */
  markColor?: string
}
