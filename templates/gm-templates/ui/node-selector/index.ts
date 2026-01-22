/**
 * Node Selector Module
 *
 * Provides a node selector UI component for selecting, highlighting, and marking DOM nodes.
 * All UI elements (highlight box, tooltip, markers) are managed within a single Shadow DOM.
 *
 * Features:
 * - Node detection and highlighting on hover
 * - Adjustable highlight target (support highlighting parent elements)
 * - Tooltip with custom information
 * - Click selection (optional)
 * - Persistent node marking with stable selectors
 * - Auto-restore marks on page load
 * - Plugin element exclusion (cannot select/mark plugin UI elements)
 *
 * @module node-selector
 */

// Types and classes are defined in separate files:
// - types.ts: Interface definitions (NodeInfo, MarkedNodeInfo, NodeSelectorOptions)
// - MarkerHighlightBox.ts: MarkerHighlightBox custom element class
// - NodeSelector.ts: NodeSelector custom element class
// These files are loaded separately and merged at compile time

/**
 * Enable node selector
 * @param options Node selector configuration options
 */
function GME_enableNodeSelector(options?: NodeSelectorOptions): void {
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
function GME_disableNodeSelector(): void {
  const selector = document.querySelector(NodeSelector.TAG_NAME) as NodeSelector
  if (selector) {
    selector.disable()
  }
}

/**
 * Get currently selected node
 * @returns Selected HTMLElement or null
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function GME_getSelectedNode(): HTMLElement | null {
  const selector = document.querySelector(NodeSelector.TAG_NAME) as NodeSelector
  return selector ? selector.getSelectedNode() : null
}

/**
 * Clear current selection
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function GME_clearSelection(): void {
  const selector = document.querySelector(NodeSelector.TAG_NAME) as NodeSelector
  if (selector) {
    selector.clearSelection()
  }
}

/**
 * Mark a node with a persistent marker
 * @param node Node to mark
 * @param label Optional label text for the marker (if not provided, a hash will be generated as default)
 * @param color Optional custom color for the marker (hex format, e.g., '#8b5cf6'). If not provided, a random unique color will be generated
 * @returns Mark ID or null if failed (will fail if node is a plugin element or excluded)
 */
function GME_markNode(node: HTMLElement, label?: string, color?: string): string | null {
  const selector = document.querySelector(NodeSelector.TAG_NAME) as NodeSelector
  return selector ? selector.markNode(node, label, color) : null
}

/**
 * Unmark a node by mark ID
 * @param markId Mark ID to remove
 * @returns Whether the mark was successfully removed
 */
function GME_unmarkNode(markId: string): boolean {
  const selector = document.querySelector(NodeSelector.TAG_NAME) as NodeSelector
  return selector ? selector.unmarkNode(markId) : false
}

/**
 * Clear all marks
 */
function GME_clearAllMarks(): void {
  const selector = document.querySelector(NodeSelector.TAG_NAME) as NodeSelector
  if (selector) {
    selector.clearAllMarks()
  }
}

/**
 * Get all marked nodes
 * @returns Array of marked node information
 */
function GME_getMarkedNodes(): MarkedNodeInfo[] {
  const selector = document.querySelector(NodeSelector.TAG_NAME) as NodeSelector
  if (!selector) return []
  // Use public method or access through storage
  // For now, we'll load from storage directly
  try {
    const storageKey = 'node-selector-marks'
    const marks = GM_getValue(storageKey, {}) as Record<string, MarkedNodeInfo>
    return Object.values(marks)
  } catch {
    return []
  }
}

/**
 * Clean up invalid marks (nodes that no longer exist)
 * @returns Number of marks cleaned up
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function GME_cleanupInvalidMarks(): number {
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

function GME_hideMarks(): void {
  const selector = document.querySelector(NodeSelector.TAG_NAME) as NodeSelector
  if (selector) {
    selector.hideMarks()
  }
}

/**
 * Show all marks (recreate Web Components and restart observers)
 */

function GME_showMarks(): void {
  const selector = document.querySelector(NodeSelector.TAG_NAME) as NodeSelector
  if (selector) {
    selector.showMarks()
  }
}

/**
 * Check if marks are currently hidden
 * @returns Whether marks are hidden
 */

function GME_areMarksHidden(): boolean {
  const selector = document.querySelector(NodeSelector.TAG_NAME) as NodeSelector
  return selector ? selector.areMarksHidden() : false
}

// ============================================================================
// DEBUG/TEST CODE - 测试代码，生产环境可移除
// ============================================================================
// 以下代码用于在浏览器控制台测试 node-selector 功能
// 通过 vws.nodeSelector.test.xxx() 方式调用
// 使用 vws.nodeSelector.help() 或 vws.help() 查看帮助

/**
 * Register node-selector CLI commands
 * This function is called automatically when the module loads
 */
function registerNodeSelectorCLI() {
  // Get unsafeWindow for accessing global functions
  // @ts-ignore
  const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window

  // Check if CLI service is available
  // @ts-ignore
  if (typeof win.registerCLIModule === 'undefined') {
    // CLI service not loaded, skip registration
    return
  }

  // @ts-ignore
  win.registerCLIModule({
    name: 'nodeSelector',
    description: 'Node selector module for selecting, highlighting, and marking DOM nodes',
    commands: [
      {
        name: 'enable',
        description: 'Enable node selector with basic configuration',
        category: 'Basic',
        usage: 'vws.nodeSelector.test.enable()',
        handler: function () {
          GME_enableNodeSelector({
            enableClickSelection: true,
            onSelect: (node) => {
              GME_info('Selected node:', node)
              const markId = GME_markNode(node, `Test Mark ${Date.now()}`)
              if (markId) {
                GME_info('Marked with ID:', markId)
                // @ts-ignore
                const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
                // @ts-ignore
                if (win.GME_notification) {
                  // @ts-ignore
                  win.GME_notification('Node marked successfully', 'success')
                }
              }
            },
            getNodeInfo: (node) => {
              return {
                title: node.tagName.toLowerCase(),
                subtitle: node.className || node.id || '',
                details: [`Tag: ${node.tagName}`, `Classes: ${node.className || 'none'}`, `ID: ${node.id || 'none'}`],
              }
            },
          })
          GME_info('Node selector enabled. Hover over elements and click to mark them.')
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
      {
        name: 'reactComponent',
        description: 'Test React component scenario',
        category: 'Advanced',
        usage: 'vws.nodeSelector.test.reactComponent()',
        handler: function () {
          GME_enableNodeSelector({
            enableClickSelection: true,
            onSelect: (node) => {
              GME_info('Selected component:', node)
              const markId = GME_markNode(node, 'React Component')
              if (markId) {
                GME_info('Component marked with ID:', markId)
              }
            },
            getNodeInfo: (hoveredNode) => {
              // Try to find React component root
              let componentRoot: HTMLElement = hoveredNode
              let current: HTMLElement | null = hoveredNode

              while (current && current !== document.body) {
                if (current.hasAttribute('data-react-component')) {
                  componentRoot = current
                  break
                }
                current = current.parentElement
              }

              if (componentRoot !== hoveredNode && componentRoot.hasAttribute('data-react-component')) {
                return {
                  title: 'React Component',
                  subtitle: componentRoot.getAttribute('data-react-component') || '',
                  details: [`Component: ${componentRoot.getAttribute('data-react-component')}`, `Hovered: ${hoveredNode.tagName.toLowerCase()}`],
                  highlightTarget: componentRoot,
                }
              }

              return {
                title: hoveredNode.tagName.toLowerCase(),
                subtitle: hoveredNode.className || '',
              }
            },
          })
          GME_info('React component selector enabled. Hover over elements to see component info.')
        },
      },
      {
        name: 'serviceColor',
        description: 'Test service-level color (all marks from same service use same color)',
        category: 'Color',
        usage: 'vws.nodeSelector.test.serviceColor()',
        handler: function () {
          // Test with a specific service color (e.g., blue for this service)
          GME_enableNodeSelector({
            enableClickSelection: true,
            markColor: '#3b82f6', // Blue color for this service
            onSelect: (node) => {
              GME_info('Selected node:', node)
              // All marks created by this service will use the same blue color
              const markId = GME_markNode(node, `Service Mark ${Date.now()}`)
              if (markId) {
                GME_info(`Marked with ID: ${markId} (using service color: #3b82f6)`)
              }
            },
          })
          GME_info('Service color test enabled. All marks will use the same blue color (#3b82f6).')
        },
      },
      {
        name: 'multipleServices',
        description: 'Show information about testing multiple services with different colors',
        category: 'Color',
        usage: 'vws.nodeSelector.test.multipleServices()',
        handler: function () {
          GME_info('Testing multiple services with different colors...')
          GME_info('Service 1: Blue (#3b82f6)')
          GME_info('Service 2: Green (#10b981)')
          GME_info('Service 3: Orange (#f59e0b)')
          GME_info('Note: Each service should register with its own color using markColor option in enable()')
          GME_info('Example: GME_enableNodeSelector({ markColor: "#3b82f6" })')
        },
      },
      {
        name: 'hideMarks',
        description: 'Hide all marks (remove Web Components and stop observers)',
        category: 'Marks',
        usage: 'vws.nodeSelector.test.hideMarks()',
        handler: function () {
          GME_hideMarks()
          const isHidden = GME_areMarksHidden()
          if (isHidden) {
            GME_info('All marks are now hidden. Web Components removed and observers stopped.')
          } else {
            GME_warn('Failed to hide marks.')
          }
        },
      },
      {
        name: 'showMarks',
        description: 'Show all marks (recreate Web Components and restart observers)',
        category: 'Marks',
        usage: 'vws.nodeSelector.test.showMarks()',
        handler: function () {
          GME_showMarks()
          const isHidden = GME_areMarksHidden()
          if (!isHidden) {
            GME_info('All marks are now visible. Web Components recreated and observers restarted.')
          } else {
            GME_warn('Failed to show marks.')
          }
        },
      },
      {
        name: 'areMarksHidden',
        description: 'Check if marks are currently hidden',
        category: 'Marks',
        usage: 'vws.nodeSelector.test.areMarksHidden()',
        handler: function () {
          const isHidden = GME_areMarksHidden()
          GME_info(`Marks are currently: ${isHidden ? 'HIDDEN' : 'VISIBLE'}`)
          return isHidden
        },
      },
      {
        name: 'hideShowWorkflow',
        description: 'Test hide/show marks workflow',
        category: 'Marks',
        usage: 'vws.nodeSelector.test.hideShowWorkflow()',
        handler: function () {
          GME_info('Testing hide/show marks workflow...')

          // First, create some marks if none exist
          const marks = GME_getMarkedNodes()
          if (marks.length === 0) {
            GME_info('No marks found. Please create some marks first using vws.nodeSelector.test.enable()')
            return
          }

          GME_info(`Found ${marks.length} marks.`)

          // Check initial state
          const initialHidden = GME_areMarksHidden()
          GME_info(`Initial state: ${initialHidden ? 'HIDDEN' : 'VISIBLE'}`)

          // Hide marks
          GME_info('Hiding marks...')
          GME_hideMarks()
          const afterHide = GME_areMarksHidden()
          GME_info(`After hide: ${afterHide ? 'HIDDEN' : 'VISIBLE'}`)

          // Wait a bit
          setTimeout(() => {
            // Show marks
            GME_info('Showing marks...')
            GME_showMarks()
            const afterShow = GME_areMarksHidden()
            GME_info(`After show: ${afterShow ? 'HIDDEN' : 'VISIBLE'}`)
            GME_info('Hide/show test completed.')
          }, 1000)
        },
      },
    ],
  })
}

// Auto-register when module loads
registerNodeSelectorCLI()

/**
 * Test function: Enable node selector with basic configuration
 * Usage: testNodeSelector() in browser console
 */
// @ts-ignore
getUnsafeWindow().testNodeSelector = function () {
  GME_enableNodeSelector({
    enableClickSelection: true,
    onSelect: (node) => {
      GME_info('Selected node:', node)
      const markId = GME_markNode(node, `Test Mark ${Date.now()}`)
      if (markId) {
        GME_info('Marked with ID:', markId)
        // @ts-ignore
        if (getUnsafeWindow().GME_notification) {
          // @ts-ignore
          getUnsafeWindow().GME_notification('Node marked successfully', 'success')
        }
      }
    },
    getNodeInfo: (node) => {
      return {
        title: node.tagName.toLowerCase(),
        subtitle: node.className || node.id || '',
        details: [`Tag: ${node.tagName}`, `Classes: ${node.className || 'none'}`, `ID: ${node.id || 'none'}`],
      }
    },
  })
  GME_info('Node selector enabled. Hover over elements and click to mark them.')
}

/**
 * Test function: Disable node selector
 * Usage: testDisableNodeSelector() in browser console
 */
// @ts-ignore
getUnsafeWindow().testDisableNodeSelector = function () {
  GME_disableNodeSelector()
  GME_info('Node selector disabled.')
}

/**
 * Test function: List all marked nodes
 * Usage: testListMarks() in browser console
 */
// @ts-ignore
getUnsafeWindow().testListMarks = function () {
  const marks = GME_getMarkedNodes()
  GME_info('Marked nodes:', marks)
  return marks
}

/**
 * Test function: Clear all marks
 * Usage: testClearMarks() in browser console
 */
// @ts-ignore
getUnsafeWindow().testClearMarks = function () {
  GME_clearAllMarks()
  GME_info('All marks cleared.')
}

/**
 * Test function: Test React component scenario
 * Usage: testReactComponentSelector() in browser console
 */
// @ts-ignore
getUnsafeWindow().testReactComponentSelector = function () {
  GME_enableNodeSelector({
    enableClickSelection: true,
    onSelect: (node) => {
      GME_info('Selected component:', node)
      const markId = GME_markNode(node, 'React Component')
      if (markId) {
        GME_info('Component marked with ID:', markId)
      }
    },
    getNodeInfo: (hoveredNode) => {
      // Try to find React component root
      let componentRoot: HTMLElement = hoveredNode
      let current: HTMLElement | null = hoveredNode

      while (current && current !== document.body) {
        if (current.hasAttribute('data-react-component')) {
          componentRoot = current
          break
        }
        current = current.parentElement
      }

      if (componentRoot !== hoveredNode && componentRoot.hasAttribute('data-react-component')) {
        return {
          title: 'React Component',
          subtitle: componentRoot.getAttribute('data-react-component') || '',
          details: [`Component: ${componentRoot.getAttribute('data-react-component')}`, `Hovered: ${hoveredNode.tagName.toLowerCase()}`],
          highlightTarget: componentRoot,
        }
      }

      return {
        title: hoveredNode.tagName.toLowerCase(),
        subtitle: hoveredNode.className || '',
      }
    },
  })
  GME_info('React component selector enabled. Hover over elements to see component info.')
}

/**
 * Test function: Test service-level color (all marks from same service use same color)
 * Usage: testServiceColor() in browser console
 */
// @ts-ignore
getUnsafeWindow().testServiceColor = function () {
  // Test with a specific service color (e.g., blue for this service)
  GME_enableNodeSelector({
    enableClickSelection: true,
    markColor: '#3b82f6', // Blue color for this service
    onSelect: (node) => {
      GME_info('Selected node:', node)
      // All marks created by this service will use the same blue color
      const markId = GME_markNode(node, `Service Mark ${Date.now()}`)
      if (markId) {
        GME_info(`Marked with ID: ${markId} (using service color: #3b82f6)`)
      }
    },
  })
  GME_info('Service color test enabled. All marks will use the same blue color (#3b82f6).')
}

/**
 * Test function: Test multiple services with different colors
 * Usage: testMultipleServices() in browser console
 */
// @ts-ignore
getUnsafeWindow().testMultipleServices = function () {
  GME_info('Testing multiple services with different colors...')
  GME_info('Service 1: Blue (#3b82f6)')
  GME_info('Service 2: Green (#10b981)')
  GME_info('Service 3: Orange (#f59e0b)')
  GME_info('Note: Each service should register with its own color using markColor option in enable()')
  GME_info('Example: GME_enableNodeSelector({ markColor: "#3b82f6" })')
}

/**
 * Test function: Hide all marks
 * Usage: testHideMarks() in browser console
 */
// @ts-ignore
getUnsafeWindow().testHideMarks = function () {
  GME_hideMarks()
  const isHidden = GME_areMarksHidden()
  if (isHidden) {
    GME_info('All marks are now hidden. Web Components removed and observers stopped.')
  } else {
    GME_warn('Failed to hide marks.')
  }
}

/**
 * Test function: Show all marks
 * Usage: testShowMarks() in browser console
 */
// @ts-ignore
getUnsafeWindow().testShowMarks = function () {
  GME_showMarks()
  const isHidden = GME_areMarksHidden()
  if (!isHidden) {
    GME_info('All marks are now visible. Web Components recreated and observers restarted.')
  } else {
    GME_warn('Failed to show marks.')
  }
}

/**
 * Test function: Check if marks are hidden
 * Usage: testAreMarksHidden() in browser console
 */
// @ts-ignore
getUnsafeWindow().testAreMarksHidden = function () {
  const isHidden = GME_areMarksHidden()
  GME_info(`Marks are currently: ${isHidden ? 'HIDDEN' : 'VISIBLE'}`)
  return isHidden
}

/**
 * Test function: Test hide/show marks workflow
 * Usage: testHideShowMarks() in browser console
 */
// @ts-ignore
getUnsafeWindow().testHideShowMarks = function () {
  GME_info('Testing hide/show marks workflow...')

  // First, create some marks if none exist
  const marks = GME_getMarkedNodes()
  if (marks.length === 0) {
    GME_info('No marks found. Please create some marks first using testNodeSelector()')
    return
  }

  GME_info(`Found ${marks.length} marks.`)

  // Check initial state
  const initialHidden = GME_areMarksHidden()
  GME_info(`Initial state: ${initialHidden ? 'HIDDEN' : 'VISIBLE'}`)

  // Hide marks
  GME_info('Hiding marks...')
  GME_hideMarks()
  const afterHide = GME_areMarksHidden()
  GME_info(`After hide: ${afterHide ? 'HIDDEN' : 'VISIBLE'}`)

  // Wait a bit
  setTimeout(() => {
    // Show marks
    GME_info('Showing marks...')
    GME_showMarks()
    const afterShow = GME_areMarksHidden()
    GME_info(`After show: ${afterShow ? 'HIDDEN' : 'VISIBLE'}`)
    GME_info('Hide/show test completed.')
  }, 1000)
}

// ============================================================================
// END OF DEBUG/TEST CODE
// ============================================================================
