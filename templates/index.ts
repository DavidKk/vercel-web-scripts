/**
 * Templates index - Unified template resource management
 * All template files are imported and exported here for centralized management
 * This allows adding new templates without modifying core logic code
 */

// ============================================================================
// Core Scripts
// ============================================================================
import helpersDomSource from './gm-templates/helpers/dom.ts?raw'
import helpersHttpSource from './gm-templates/helpers/http.ts?raw'
import helpersLoggerSource from './gm-templates/helpers/logger.ts?raw'
import helpersUtilsSource from './gm-templates/helpers/utils.ts?raw'
import mainSource from './gm-templates/main.ts?raw'
import rulesSource from './gm-templates/rules.ts?raw'
import scriptsSource from './gm-templates/scripts.ts?raw'
import cliServiceSource from './gm-templates/services/cli-service.ts?raw'
import devModeSource from './gm-templates/services/dev-mode.ts?raw'
import editorDevModeSource from './gm-templates/services/editor-dev-mode.ts?raw'
import localDevModeSource from './gm-templates/services/local-dev-mode.ts?raw'
import menuSource from './gm-templates/services/menu.ts?raw'
import scriptExecutionSource from './gm-templates/services/script-execution.ts?raw'
import scriptUpdateSource from './gm-templates/services/script-update.ts?raw'
import tabCommunicationSource from './gm-templates/services/tab-communication.ts?raw'

/**
 * Get core scripts from templates
 * @returns Array of core script file contents, in order
 */
export function getCoreScriptsSource(): string[] {
  // Load order:
  // 1. helpers/http - HTTP/Network functions
  // 2. helpers/utils - Utility functions (GME_sleep, GME_debounce, etc.)
  // 3. helpers/logger - Logging functions (GME_ok, GME_info, GME_debug, etc.)
  // 4. helpers/dom - DOM query and wait functions
  // 5. tab-communication - provides cross-tab communication (required by script-update)
  // 6. script-update - depends on tab-communication
  // 7. cli-service - CLI service
  // 8. dev-mode - dev mode constants and utility functions (required by other services)
  // 9. script-execution - script execution functions (depends on dev-mode)
  // 10. editor-dev-mode - editor dev mode handling (depends on dev-mode, script-execution)
  // 11. local-dev-mode - local dev mode handling (depends on dev-mode, script-execution)
  // 12. menu - menu registration (depends on dev-mode)
  // 13. rules - rule processing
  // 14. scripts - script loading utilities
  return [
    helpersHttpSource,
    helpersUtilsSource,
    helpersLoggerSource,
    helpersDomSource,
    tabCommunicationSource,
    scriptUpdateSource,
    cliServiceSource,
    devModeSource,
    scriptExecutionSource,
    editorDevModeSource,
    localDevModeSource,
    menuSource,
    rulesSource,
    scriptsSource,
  ]
}

/**
 * Get main script content from templates
 * @returns Main script content
 */
export function getMainScriptSource(): string {
  return mainSource
}

// ============================================================================
// Type Definitions
// ============================================================================
import editorTypingsSource from './gm-templates/editor-typings.d.ts?raw'

/**
 * Get editor type definitions from templates
 * @returns Type definitions as a string
 */
export function getEditorTypingsSource(): string {
  return editorTypingsSource
}

// ============================================================================
// UI Module Types
// ============================================================================
/**
 * UI module configuration interface
 * Each module defines its name, TypeScript source, CSS, HTML, and custom element name
 */
export interface UIModuleConfig {
  /** Module name used as key in the returned object */
  name: string
  /** TypeScript source code */
  ts: string
  /** CSS styles */
  css: string
  /** HTML template */
  html: string
  /** Custom element name for DOM insertion */
  elementName: string
}

// ============================================================================
// UI Modules - Corner Widget
// ============================================================================
import cornerWidgetCss from './gm-templates/ui/corner-widget/index.css?raw'
import cornerWidgetHtml from './gm-templates/ui/corner-widget/index.html?raw'
import cornerWidgetTs from './gm-templates/ui/corner-widget/index.ts?raw'

const cornerWidget: UIModuleConfig = {
  name: 'corner-widget',
  ts: cornerWidgetTs,
  css: cornerWidgetCss,
  html: cornerWidgetHtml,
  elementName: 'vercel-web-script-corner-widget',
}

// ============================================================================
// UI Modules - Notification
// ============================================================================
import notificationCss from './gm-templates/ui/notification/index.css?raw'
import notificationHtml from './gm-templates/ui/notification/index.html?raw'
import notificationTs from './gm-templates/ui/notification/index.ts?raw'

const notification: UIModuleConfig = {
  name: 'notification',
  ts: notificationTs,
  css: notificationCss,
  html: notificationHtml,
  elementName: 'vercel-web-script-notification',
}

// ============================================================================
// UI Modules - Node Selector
// ============================================================================
import nodeSelectorCss from './gm-templates/ui/node-selector/index.css?raw'
import nodeSelectorHtml from './gm-templates/ui/node-selector/index.html?raw'
import nodeSelectorTs from './gm-templates/ui/node-selector/index.ts?raw'
import nodeSelectorMarkerHighlightBoxTs from './gm-templates/ui/node-selector/MarkerHighlightBox.ts?raw'
import nodeSelectorNodeSelectorTs from './gm-templates/ui/node-selector/NodeSelector.ts?raw'
import nodeSelectorTypesTs from './gm-templates/ui/node-selector/types.ts?raw'

/**
 * Node Selector module with multiple TypeScript files
 * Files are merged in order: types, MarkerHighlightBox, NodeSelector, index
 */
const nodeSelector: UIModuleConfig = {
  name: 'node-selector',
  // Merge multiple TypeScript files in order: types, MarkerHighlightBox, NodeSelector, index
  ts: [nodeSelectorTypesTs, nodeSelectorMarkerHighlightBoxTs, nodeSelectorNodeSelectorTs, nodeSelectorTs].join('\n'),
  css: nodeSelectorCss,
  html: nodeSelectorHtml,
  elementName: 'vercel-web-script-node-selector',
}

// ============================================================================
// UI Modules Export
// ============================================================================
/**
 * Get all UI module configurations
 * @returns Array of UI module configurations
 */
export function getUIModules(): UIModuleConfig[] {
  return [cornerWidget, notification, nodeSelector]
}
