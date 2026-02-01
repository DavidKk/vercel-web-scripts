/**
 * Script update service using tab communication
 * HOST tab validates and broadcasts update, other tabs receive and execute remote script
 */

import type { TabCommunication, TabInfo, TabMessage } from './tab-communication'
import { getTabCommunication } from './tab-communication'

/**
 * Script update status enum
 */
enum ScriptUpdateStatus {
  VALIDATING = 'validating',
  SUCCESS = 'success',
  FAILED = 'failed',
}

/**
 * Script update message type enum
 */
enum ScriptUpdateMessageType {
  SCRIPT_UPDATE = 'script-update',
}

/**
 * Script update namespace constant
 */
const SCRIPT_UPDATE_NAMESPACE = 'script-update'

/**
 * Update message data
 */
interface UpdateMessage {
  /** Script URL to update */
  scriptUrl: string
  /** Validated script URL (after validation) */
  validatedUrl: string | null
  /** Update timestamp */
  timestamp: number
  /** HOST tab ID */
  host: string
  /** Update status */
  status: ScriptUpdateStatus
  /** Error message if validation failed */
  error?: string
}

/**
 * Script update service configuration
 */
interface ScriptUpdateConfig {
  /** Default script URL */
  defaultScriptUrl?: string
  /** Namespace for tab communication (default: 'script-update') */
  namespace?: string
}

/**
 * Script update service
 * Singleton pattern - automatically initializes on first use
 */
class ScriptUpdate {
  private readonly tabComm: TabCommunication
  private readonly defaultScriptUrl: string
  private readonly HOST_KEY: string
  private isHost = false
  private hostTabId: string | null = null
  private updateHandlerId: string | null = null

  /**
   * Create a new script update service instance
   * @param config Service configuration
   */
  constructor(config: ScriptUpdateConfig = {}) {
    this.tabComm = getTabCommunication({ namespace: SCRIPT_UPDATE_NAMESPACE })
    this.defaultScriptUrl = config.defaultScriptUrl || __SCRIPT_URL__
    const namespace = config.namespace || SCRIPT_UPDATE_NAMESPACE
    this.HOST_KEY = `${namespace}@host`
    this.setupUpdateHandler()
    this.setupHostListener()
  }

  /**
   * Set up update message handler
   */
  private setupUpdateHandler(): void {
    // Listen for update messages
    this.updateHandlerId = this.tabComm.onMessage('broadcast', async (message: TabMessage, sender: TabInfo) => {
      if (message.data?.type === ScriptUpdateMessageType.SCRIPT_UPDATE) {
        await this.handleUpdateMessage(message.data as UpdateMessage, sender)
      }
    })
  }

  /**
   * Set up HOST listener to track HOST changes
   */
  private setupHostListener(): void {
    // Check current HOST
    const currentHost = GM_getValue(this.HOST_KEY, null) as string | null
    if (currentHost) {
      this.hostTabId = currentHost
      this.isHost = currentHost === this.tabComm.getTabId()
    }

    // Listen for HOST changes
    GM_addValueChangeListener(this.HOST_KEY, (name, oldValue, newValue) => {
      const host = newValue as string | null
      this.hostTabId = host
      this.isHost = host === this.tabComm.getTabId()

      if (host && host !== this.tabComm.getTabId()) {
        GME_info(`[Script Update] HOST changed to: ${host}`)
      } else if (!host) {
        GME_info('[Script Update] HOST cleared')
      }
    })
  }

  /**
   * Try to become HOST
   * @returns True if this tab became HOST, false if another tab is already HOST
   */
  private tryBecomeHost(): boolean {
    const currentHost = GM_getValue(this.HOST_KEY, null) as string | null

    if (currentHost) {
      // Another tab is already HOST
      this.hostTabId = currentHost
      this.isHost = false
      return false
    }

    // Set this tab as HOST
    const tabId = this.tabComm.getTabId()
    GM_setValue(this.HOST_KEY, tabId)
    this.hostTabId = tabId
    this.isHost = true
    GME_info(`[Script Update] This tab is now HOST (${tabId})`)
    return true
  }

  /**
   * Clear HOST (when update is complete)
   */
  private clearHost(): void {
    const currentHost = GM_getValue(this.HOST_KEY, null) as string | null
    if (currentHost === this.tabComm.getTabId()) {
      GM_setValue(this.HOST_KEY, null)
      this.isHost = false
      this.hostTabId = null
      GME_info('[Script Update] HOST cleared after update completion')
    }
  }

  /**
   * Handle update message from HOST
   * Editor page also applies update (executeRemoteScript only evals, no page refresh).
   */
  private async handleUpdateMessage(update: UpdateMessage, sender: TabInfo): Promise<void> {
    // Ignore if this tab is the HOST
    if (this.isHost && this.tabComm.getTabId() === update.host) {
      return
    }

    // Only process updates from the active HOST
    if (update.host !== this.hostTabId && this.hostTabId !== null) {
      return
    }

    // Update HOST tab ID
    this.hostTabId = update.host

    // Handle different update statuses
    if (update.status === ScriptUpdateStatus.VALIDATING) {
      GME_info(`[Script Update] HOST (${sender.url}) is validating script update...`)
      return
    }

    if (update.status === ScriptUpdateStatus.FAILED) {
      GME_fail(`[Script Update] Script validation failed: ${update.error || 'Unknown error'}`)
      if (update.error) {
        GME_notification(`Script update failed: ${update.error}`, 'error', 5000)
      }
      return
    }

    if (update.status === ScriptUpdateStatus.SUCCESS && update.validatedUrl) {
      GME_info(`[Script Update] Received update from HOST (${sender.url}), executing remote script...`)
      await this.executeRemoteScript(update.validatedUrl)
    }
  }

  /**
   * Validate script URL
   * @param scriptUrl Script URL to validate
   * @returns Object with isValid flag and the URL to use
   */
  private async validateScript(scriptUrl: string): Promise<{ isValid: boolean; url: string | null }> {
    try {
      GME_info('[Script Update] Validating script compilation...')

      // Extract key from script URL (e.g., /static/{key}/tampermonkey.user.js)
      const urlObj = new URL(scriptUrl, window.location.origin)
      const pathParts = urlObj.pathname.split('/')
      const keyIndex = pathParts.indexOf('static')
      if (keyIndex === -1 || keyIndex + 1 >= pathParts.length) {
        GME_fail('Invalid script URL format')
        GME_notification('Invalid script URL format', 'error')
        return { isValid: false, url: null }
      }

      const key = pathParts[keyIndex + 1]
      const baseUrl = `${urlObj.protocol}//${urlObj.host}`
      const userUrl = `${baseUrl}/static/${key}/tampermonkey.user.js`

      // Check if tampermonkey.user.js exists (HEAD request)
      try {
        const userResponse = await GME_fetch(userUrl, { method: 'HEAD' })
        if (userResponse.ok) {
          GME_ok('[Script Update] Script validation passed (tampermonkey.user.js found)')
          return { isValid: true, url: userUrl }
        }
      } catch (error) {
        // HEAD request failed
      }

      GME_fail('[Script Update] Script validation failed: tampermonkey.user.js is not available')
      GME_fail('[Script Update] This usually means script compilation failed. Please check for errors.')
      GME_notification('Script compilation failed. Please check for errors in the editor.', 'error', 5000)
      return { isValid: false, url: null }
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      GME_fail(`[Script Update] Script validation failed: ${errorMessage}`)
      GME_notification(`Script validation failed: ${errorMessage}`, 'error', 5000)
      return { isValid: false, url: null }
    }
  }

  /**
   * Execute remote script from URL
   * @param url Script URL to fetch and execute
   */
  private async executeRemoteScript(url: string): Promise<void> {
    try {
      const content = await fetchScript(url)
      if (!content) {
        GME_fail('[Script Update] Failed to fetch script content')
        return
      }

      GME_ok('[Script Update] Remote script fetched successfully, executing...')

      // Execute with real global; merge GM_* from script scope onto it so content sees them
      const execute = new Function('global', `with(global){${content}}`)
      const g = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : ({} as any)
      const grants = eval(`({ ${__GRANTS_STRING__} })`) as Record<string, unknown>
      const prev = (g as any).__IS_REMOTE_EXECUTE__
      try {
        Object.assign(g, grants, { __IS_REMOTE_EXECUTE__: true })
        execute(g)
      } finally {
        ;(g as any).__IS_REMOTE_EXECUTE__ = prev
      }

      GME_ok('[Script Update] Script updated and executed successfully')
      GME_notification('Script updated successfully', 'success', 3000)
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      GME_fail(`[Script Update] Failed to execute remote script: ${errorMessage}`)
      GME_notification(`Script update execution failed: ${errorMessage}`, 'error', 5000)
    }
  }

  /**
   * Update script - HOST validates and broadcasts, other tabs execute
   * @param scriptUrl Optional script URL (defaults to __SCRIPT_URL__)
   * @returns Promise that resolves when update is complete
   */
  async update(scriptUrl?: string): Promise<void> {
    const url = scriptUrl || this.defaultScriptUrl
    if (!url) {
      GME_fail('[Script Update] Script URL is not available')
      GME_notification('Script URL is not available', 'error')
      return
    }

    // Try to become HOST
    this.tryBecomeHost()

    // If this tab is not HOST, wait for HOST to send update
    if (!this.isHost) {
      GME_info(`[Script Update] Waiting for HOST (${this.hostTabId}) to validate and send update...`)
      return
    }

    // This tab is HOST - validate and broadcast
    GME_info(`[Script Update] HOST validating script: ${url}`)

    try {
      // Broadcast validating status
      await this.broadcastUpdate({
        scriptUrl: url,
        validatedUrl: null,
        timestamp: Date.now(),
        host: this.tabComm.getTabId(),
        status: ScriptUpdateStatus.VALIDATING,
      })

      // Validate script
      const validation = await this.validateScript(url)

      if (!validation.isValid || !validation.url) {
        // Broadcast failure
        await this.broadcastUpdate({
          scriptUrl: url,
          validatedUrl: null,
          timestamp: Date.now(),
          host: this.tabComm.getTabId(),
          status: ScriptUpdateStatus.FAILED,
          error: 'Script validation failed',
        })
        // Clear HOST after failure
        this.clearHost()
        return
      }

      // Broadcast success with validated URL
      await this.broadcastUpdate({
        scriptUrl: url,
        validatedUrl: validation.url,
        timestamp: Date.now(),
        host: this.tabComm.getTabId(),
        status: ScriptUpdateStatus.SUCCESS,
      })

      // HOST also executes the script
      GME_info('[Script Update] HOST executing updated script...')
      await this.executeRemoteScript(validation.url)

      // Clear HOST after successful update
      this.clearHost()
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      GME_fail(`[Script Update] Update failed: ${errorMessage}`)

      // Broadcast failure
      await this.broadcastUpdate({
        scriptUrl: url,
        validatedUrl: null,
        timestamp: Date.now(),
        host: this.tabComm.getTabId(),
        status: ScriptUpdateStatus.FAILED,
        error: errorMessage,
      })

      // Clear HOST after error
      this.clearHost()
    }
  }

  /**
   * Broadcast update message to all tabs
   */
  private async broadcastUpdate(update: UpdateMessage): Promise<void> {
    await this.tabComm.broadcast({
      type: ScriptUpdateMessageType.SCRIPT_UPDATE,
      ...update,
    })
  }

  /**
   * Check if this tab is the HOST
   */
  isHostTab(): boolean {
    return this.isHost
  }

  /**
   * Get current HOST tab ID
   */
  getHostTabId(): string | null {
    return this.hostTabId
  }

  /**
   * Destroy the service
   */
  destroy(): void {
    if (this.updateHandlerId) {
      this.tabComm.offMessage(this.updateHandlerId)
      this.updateHandlerId = null
    }

    // Clear HOST if this tab is HOST
    if (this.isHost) {
      this.clearHost()
    }

    this.isHost = false
    this.hostTabId = null
  }
}

/**
 * Get or create a singleton instance of the script update service
 * @param config Service configuration
 * @returns Service instance
 * @note This is a global factory function used by other modules, eslint-disable is needed
 */

const getScriptUpdate = (() => {
  // Use closure to keep instances private (not in global scope)
  const instances: Map<string, ScriptUpdate> = new Map()

  return function getScriptUpdate(config?: ScriptUpdateConfig): ScriptUpdate {
    const namespace = config?.namespace || SCRIPT_UPDATE_NAMESPACE
    const instanceKey = `${namespace}-${config?.defaultScriptUrl || 'default'}`

    if (!instances.has(instanceKey)) {
      instances.set(instanceKey, new ScriptUpdate(config))
    }

    return instances.get(instanceKey)!
  }
})()

export { getScriptUpdate }
