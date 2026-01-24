/**
 * Cross-tab communication service using GM_setValue/GM_getValue and GM_addValueChangeListener
 * Provides broadcast, send/reply, and pattern-based message routing
 * Singleton pattern - automatically initializes on first use
 */

/**
 * Message types for cross-tab communication
 */
type MessageType = 'broadcast' | 'send' | 'reply' | 'register' | 'unregister'

/**
 * Message payload structure
 */
interface TabMessage {
  /** Message channel identifier (to distinguish from other GM_setValue calls) */
  _channel: string
  /** Message protocol version */
  _version: string
  /** Message type */
  type: MessageType
  /** Sender tab ID */
  from: string
  /** Sender tab information (full context) */
  sender?: TabInfo
  /** Target tab ID (for send/reply) or pattern (for pattern-based broadcast) */
  to?: string | string[]
  /** Message ID for reply matching */
  messageId?: string
  /** Message payload */
  data: any
  /** Timestamp */
  timestamp: number
  /** URL pattern filter (optional) */
  urlPattern?: string
}

/**
 * Tab registration information
 */
interface TabInfo {
  /** Tab ID */
  id: string
  /** Tab URL */
  url: string
  /** Tab hostname */
  hostname: string
  /** Tab pathname */
  pathname: string
  /** Tab title */
  title?: string
  /** Tab origin */
  origin?: string
  /** Tab search params */
  search?: string
  /** Tab hash */
  hash?: string
  /** Is tab active (has focus and not hidden) */
  isActive?: boolean
  /** Last heartbeat timestamp */
  lastHeartbeat: number
  /** Last activity timestamp (when tab was last active) */
  lastActivity?: number
  /** Custom metadata */
  metadata?: Record<string, any>
}

/**
 * Message handler function type
 */
type MessageHandler = (message: TabMessage, sender: TabInfo) => void | Promise<void>

/**
 * Reply handler function type
 * @param message Incoming message
 * @param sender Sender tab info
 * @returns Reply data (will be sent automatically) or void (for manual reply)
 */
type ReplyHandler = (message: TabMessage, sender: TabInfo) => any | Promise<any> | void | Promise<void>

/**
 * Tab communication service configuration
 */
interface TabCommunicationConfig {
  /** Service namespace (for storage keys, default: 'tab-comm') */
  namespace?: string
  /** Heartbeat interval in milliseconds (default: 5000) */
  heartbeatInterval?: number
  /** Tab timeout in milliseconds (default: 15000) */
  tabTimeout?: number
  /** Custom tab metadata */
  metadata?: Record<string, any>
}

/**
 * Pending reply handler
 */
interface PendingReply {
  messageId: string
  resolve: (value: any) => void
  reject: (error: Error) => void
  timeout: NodeJS.Timeout
}

/**
 * Cross-tab communication service
 * Singleton pattern - one instance per namespace
 */
class TabCommunication {
  private readonly namespace: string
  private readonly heartbeatInterval: number
  private readonly tabTimeout: number
  private readonly metadata: Record<string, any>

  private tabId: string
  private messageHandlers: Map<string, Set<MessageHandler>> = new Map()
  private replyHandlers: Set<{ id: string; handler: ReplyHandler }> = new Set()
  private pendingReplies: Map<string, PendingReply> = new Map()
  private heartbeatTimer: NodeJS.Timeout | null = null
  private valueChangeListenerId: string | null = null
  private isInitialized = false
  private initPromise: Promise<void> | null = null

  private readonly MESSAGE_KEY: string
  private readonly REGISTRY_KEY: string
  private readonly CHANNEL_ID: string
  private readonly PROTOCOL_VERSION = '1.0.0'

  /**
   * Create a new tab communication service instance
   * @param config Service configuration
   */
  constructor(config: TabCommunicationConfig = {}) {
    this.namespace = config.namespace || 'tab-comm'
    this.heartbeatInterval = config.heartbeatInterval || 5000
    this.tabTimeout = config.tabTimeout || 15000
    this.metadata = config.metadata || {}

    this.MESSAGE_KEY = `${this.namespace}@messages`
    this.REGISTRY_KEY = `${this.namespace}@registry`
    // Generate unique channel ID for this namespace
    this.CHANNEL_ID = `${this.namespace}-channel-v1`

    // Generate unique tab ID
    this.tabId = `${this.namespace}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`

    // Auto-initialize on construction
    this.initPromise = this.init()
  }

  /**
   * Ensure service is initialized
   * @returns Promise that resolves when initialization is complete
   */
  private async ensureInitialized(): Promise<void> {
    if (this.isInitialized) {
      return
    }

    if (this.initPromise) {
      await this.initPromise
    } else {
      this.initPromise = this.init()
      await this.initPromise
    }
  }

  /**
   * Initialize the service and register this tab
   * @returns Promise that resolves when initialization is complete
   */
  private async init(): Promise<void> {
    if (this.isInitialized) {
      GME_info(`[TabCommunication:${this.namespace}] Already initialized, skipping`)
      return
    }

    GME_info(`[TabCommunication:${this.namespace}] Initializing, tabId: ${this.tabId}, location: ${window.location.href}`)

    // Register this tab
    await this.register()

    // Set up heartbeat
    this.startHeartbeat()

    // Set up message listener
    this.setupMessageListener()

    // Clean up stale tabs
    this.cleanupStaleTabs()

    // Handle page unload
    this.setupUnloadHandler()

    this.isInitialized = true
    GME_info(`[TabCommunication:${this.namespace}] Initialization complete`)
  }

  /**
   * Destroy the service and unregister this tab
   */
  destroy(): void {
    if (!this.isInitialized) {
      return
    }

    // Stop heartbeat
    this.stopHeartbeat()

    // Unregister this tab
    this.unregister()

    // Remove message listener
    if (this.valueChangeListenerId && typeof GM_removeValueChangeListener !== 'undefined') {
      GM_removeValueChangeListener(this.valueChangeListenerId)
      this.valueChangeListenerId = null
    }

    // Clear all handlers
    this.messageHandlers.clear()
    this.replyHandlers.clear()

    // Reject all pending replies
    for (const pending of this.pendingReplies.values()) {
      clearTimeout(pending.timeout)
      pending.reject(new Error('Service destroyed'))
    }
    this.pendingReplies.clear()

    this.isInitialized = false
    this.initPromise = null
  }

  /**
   * Get current tab information
   */
  private getCurrentTabInfo(): TabInfo {
    const now = Date.now()
    const isActive = !document.hidden && document.hasFocus()

    return {
      id: this.tabId,
      url: window.location.href,
      hostname: window.location.hostname,
      pathname: window.location.pathname,
      title: document.title,
      origin: window.location.origin,
      search: window.location.search,
      hash: window.location.hash,
      isActive,
      lastHeartbeat: now,
      lastActivity: isActive ? now : undefined,
      metadata: this.metadata,
    }
  }

  /**
   * Register this tab in the registry
   */
  private async register(): Promise<void> {
    const registry = this.getRegistry()
    const tabInfo = this.getCurrentTabInfo()

    registry[this.tabId] = tabInfo
    this.setRegistry(registry)
    GME_info(`[TabCommunication:${this.namespace}] Tab registered, tabId: ${this.tabId}, url: ${tabInfo.url}, total tabs: ${Object.keys(registry).length + 1}`)

    // Broadcast registration
    await this.broadcastInternal({
      _channel: this.CHANNEL_ID,
      _version: this.PROTOCOL_VERSION,
      type: 'register',
      from: this.tabId,
      sender: tabInfo,
      data: tabInfo,
      timestamp: Date.now(),
    })
    GME_info(`[TabCommunication:${this.namespace}] Registration broadcast sent`)
  }

  /**
   * Unregister this tab from the registry
   */
  private unregister(): void {
    const registry = this.getRegistry()
    const tabInfo = registry[this.tabId]
    delete registry[this.tabId]
    this.setRegistry(registry)
    GME_info(`[TabCommunication:${this.namespace}] Tab unregistered, tabId: ${this.tabId}`)

    // Broadcast unregistration
    this.broadcastInternal({
      _channel: this.CHANNEL_ID,
      _version: this.PROTOCOL_VERSION,
      type: 'unregister',
      from: this.tabId,
      sender: tabInfo,
      data: { id: this.tabId },
      timestamp: Date.now(),
    }).catch(() => {
      // Ignore errors during unregister
    })
  }

  /**
   * Start heartbeat to keep this tab alive in the registry
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      const registry = this.getRegistry()
      if (registry[this.tabId]) {
        const now = Date.now()
        const isActive = !document.hidden && document.hasFocus()
        const tabInfo = registry[this.tabId]

        tabInfo.lastHeartbeat = now
        tabInfo.isActive = isActive
        tabInfo.title = document.title
        tabInfo.url = window.location.href
        tabInfo.pathname = window.location.pathname
        tabInfo.search = window.location.search
        tabInfo.hash = window.location.hash

        if (isActive) {
          tabInfo.lastActivity = now
        }

        this.setRegistry(registry)
      }
    }, this.heartbeatInterval)
  }

  /**
   * Stop heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  /**
   * Set up message listener using GM_addValueChangeListener
   */
  private setupMessageListener(): void {
    GME_info(`[TabCommunication:${this.namespace}] Setting up message listener, MESSAGE_KEY: ${this.MESSAGE_KEY}`)
    this.valueChangeListenerId = GM_addValueChangeListener(this.MESSAGE_KEY, (name, oldValue, newValue) => {
      GME_debug(`[TabCommunication:${this.namespace}] GM_addValueChangeListener triggered, name: ${name}, hasNewValue: ${!!newValue}, location: ${window.location.href}`)

      if (!newValue) {
        GME_debug(`[TabCommunication:${this.namespace}] No new value, ignoring`)
        return
      }

      // Validate message format - ensure it's from our channel
      if (!this.isValidMessage(newValue)) {
        // Not a message from our channel, ignore
        GME_debug(`[TabCommunication:${this.namespace}] Invalid message format, ignoring. Value: ${JSON.stringify(newValue).substring(0, 200)}`)
        return
      }

      // Ignore messages from this tab
      if (newValue.from === this.tabId) {
        GME_debug(`[TabCommunication:${this.namespace}] Message from self (${this.tabId}), ignoring`)
        return
      }

      GME_info(`[TabCommunication:${this.namespace}] Valid message received, type: ${newValue.type}, from: ${newValue.from}, to: ${newValue.to || 'all'}`)
      this.handleMessage(newValue as TabMessage)
    })
    GME_debug(`[TabCommunication:${this.namespace}] Message listener set up, listenerId: ${this.valueChangeListenerId}`)
  }

  /**
   * Validate if a value is a valid message from our channel
   * @param value Value to validate
   * @returns True if valid message
   */
  private isValidMessage(value: any): boolean {
    // Check if it's an object
    if (!value || typeof value !== 'object') {
      return false
    }

    // Check for channel identifier
    if (value._channel !== this.CHANNEL_ID) {
      return false
    }

    // Check for protocol version
    if (value._version !== this.PROTOCOL_VERSION) {
      return false
    }

    // Check for required message fields
    if (!value.type || !value.from || !value.timestamp) {
      return false
    }

    // Check message type is valid
    const validTypes: MessageType[] = ['broadcast', 'send', 'reply', 'register', 'unregister']
    if (!validTypes.includes(value.type)) {
      return false
    }

    return true
  }

  /**
   * Set up unload handler to clean up on page unload
   */
  private setupUnloadHandler(): void {
    const handleUnload = () => {
      this.destroy()
    }

    window.addEventListener('beforeunload', handleUnload)
    window.addEventListener('pagehide', handleUnload)
    document.addEventListener('visibilitychange', () => {
      const registry = this.getRegistry()
      if (registry[this.tabId]) {
        const now = Date.now()
        const isActive = !document.hidden && document.hasFocus()
        const tabInfo = registry[this.tabId]

        tabInfo.isActive = isActive
        tabInfo.lastHeartbeat = now
        if (isActive) {
          tabInfo.lastActivity = now
        }
        this.setRegistry(registry)
      }
    })
  }

  /**
   * Clean up stale tabs from the registry
   */
  private cleanupStaleTabs(): void {
    const registry = this.getRegistry()
    const now = Date.now()
    let hasChanges = false

    for (const [tabId, tabInfo] of Object.entries(registry)) {
      if (now - tabInfo.lastHeartbeat > this.tabTimeout) {
        delete registry[tabId]
        hasChanges = true
      }
    }

    if (hasChanges) {
      this.setRegistry(registry)
    }
  }

  /**
   * Get the tab registry
   */
  private getRegistry(): Record<string, TabInfo> {
    return GM_getValue(this.REGISTRY_KEY, {}) as Record<string, TabInfo>
  }

  /**
   * Set the tab registry
   */
  private setRegistry(registry: Record<string, TabInfo>): void {
    GM_setValue(this.REGISTRY_KEY, registry)
  }

  /**
   * Get all registered tabs
   */
  getRegisteredTabs(): TabInfo[] {
    this.cleanupStaleTabs()
    return Object.values(this.getRegistry())
  }

  /**
   * Get tab info by ID
   */
  getTabInfo(tabId: string): TabInfo | null {
    const registry = this.getRegistry()
    return registry[tabId] || null
  }

  /**
   * Broadcast a message to all tabs (or tabs matching a pattern)
   * @param data Message data
   * @param urlPattern Optional URL pattern to filter recipients
   * @returns Promise that resolves when message is sent
   */
  async broadcast(data: any, urlPattern?: string): Promise<void> {
    await this.ensureInitialized()
    const tabInfo = this.getCurrentTabInfo()
    GME_debug(`[TabCommunication:${this.namespace}] broadcast() called, data type: ${typeof data}, urlPattern: ${urlPattern || 'none'}`)
    await this.broadcastInternal({
      _channel: this.CHANNEL_ID,
      _version: this.PROTOCOL_VERSION,
      type: 'broadcast',
      from: this.tabId,
      sender: tabInfo,
      data,
      timestamp: Date.now(),
      urlPattern,
    })
  }

  /**
   * Internal broadcast method
   */
  private async broadcastInternal(message: TabMessage): Promise<void> {
    // Store message in GM_setValue (this will trigger GM_addValueChangeListener in all tabs)
    GME_debug(
      `[TabCommunication:${this.namespace}] Broadcasting message, type: ${message.type}, from: ${message.from}, to: ${message.to || 'all'}, MESSAGE_KEY: ${this.MESSAGE_KEY}`
    )
    GM_setValue(this.MESSAGE_KEY, message)
    GME_debug(`[TabCommunication:${this.namespace}] Message stored in GM_setValue, should trigger listeners in all tabs`)
  }

  /**
   * Send a message to a specific tab and wait for reply
   * @param toTabId Target tab ID
   * @param data Message data
   * @param timeout Timeout in milliseconds (default: 10000)
   * @returns Promise that resolves with the reply
   */
  async send(toTabId: string, data: any, timeout = 10000): Promise<any> {
    await this.ensureInitialized()
    const messageId = `${this.tabId}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
    GME_debug(`[TabCommunication:${this.namespace}] send() called, toTabId: ${toTabId}, messageId: ${messageId}, timeout: ${timeout}ms`)

    return new Promise((resolve, reject) => {
      // Set up timeout
      const timeoutId = setTimeout(() => {
        this.pendingReplies.delete(messageId)
        reject(new Error(`Message timeout: ${messageId}`))
      }, timeout)

      // Store pending reply
      this.pendingReplies.set(messageId, {
        messageId,
        resolve: (value) => {
          clearTimeout(timeoutId)
          resolve(value)
        },
        reject: (error) => {
          clearTimeout(timeoutId)
          reject(error)
        },
        timeout: timeoutId,
      })

      // Send message
      const tabInfo = this.getCurrentTabInfo()
      this.broadcastInternal({
        _channel: this.CHANNEL_ID,
        _version: this.PROTOCOL_VERSION,
        type: 'send',
        from: this.tabId,
        sender: tabInfo,
        to: toTabId,
        messageId,
        data,
        timestamp: Date.now(),
      }).catch((error) => {
        this.pendingReplies.delete(messageId)
        clearTimeout(timeoutId)
        reject(error)
      })
    })
  }

  /**
   * Reply to a message
   * @param messageId Original message ID
   * @param data Reply data
   * @param toTabId Target tab ID
   */
  async reply(messageId: string, data: any, toTabId: string): Promise<void> {
    await this.ensureInitialized()
    const tabInfo = this.getCurrentTabInfo()
    await this.broadcastInternal({
      _channel: this.CHANNEL_ID,
      _version: this.PROTOCOL_VERSION,
      type: 'reply',
      from: this.tabId,
      sender: tabInfo,
      to: toTabId,
      messageId,
      data,
      timestamp: Date.now(),
    })
  }

  /**
   * Register a message handler
   * @param messageType Message type to handle (or '*' for all types)
   * @param handler Handler function
   * @returns Handler ID for removal
   */
  onMessage(messageType: MessageType | '*', handler: MessageHandler): string {
    const handlerId = `${messageType}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`

    if (!this.messageHandlers.has(messageType)) {
      this.messageHandlers.set(messageType, new Set())
    }

    const handlerSet = this.messageHandlers.get(messageType)!

    // Store handler with ID
    const wrappedHandler: MessageHandler & { id?: string } = handler
    wrappedHandler.id = handlerId
    handlerSet.add(wrappedHandler)

    return handlerId
  }

  /**
   * Remove a message handler
   * @param handlerId Handler ID returned from onMessage
   */
  offMessage(handlerId: string): void {
    for (const [messageType, handlers] of this.messageHandlers.entries()) {
      for (const handler of handlers) {
        if ((handler as any).id === handlerId) {
          handlers.delete(handler)
          if (handlers.size === 0) {
            this.messageHandlers.delete(messageType)
          }
          return
        }
      }
    }
  }

  /**
   * Register a reply handler for send/reply pattern
   * When a 'send' message is received, all registered reply handlers will be called.
   * If a handler returns a value (not void), it will be automatically sent as a reply.
   * If a handler returns void, it means manual reply (call reply() manually).
   * @param handler Handler function that processes the message and optionally returns a reply
   * @returns Handler ID for removal
   */
  onReply(handler: ReplyHandler): string {
    const handlerId = `reply-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
    this.replyHandlers.add({ id: handlerId, handler })
    return handlerId
  }

  /**
   * Remove a reply handler
   * @param handlerId Handler ID returned from onReply
   */
  offReply(handlerId: string): void {
    for (const item of this.replyHandlers) {
      if (item.id === handlerId) {
        this.replyHandlers.delete(item)
        return
      }
    }
  }

  /**
   * Handle incoming message
   */
  private async handleMessage(message: TabMessage): Promise<void> {
    GME_debug(
      `[TabCommunication:${this.namespace}] Handling message, type: ${message.type}, from: ${message.from}, to: ${message.to || 'all'}, messageId: ${message.messageId || 'none'}`
    )

    // Use sender info from message if available, otherwise get from registry
    let sender: TabInfo | undefined = message.sender

    if (!sender) {
      // Fallback to registry if sender info not in message
      const registry = this.getRegistry()
      sender = registry[message.from]
      GME_debug(`[TabCommunication:${this.namespace}] Sender not in message, looked up in registry: ${sender ? 'found' : 'not found'}`)
    }

    if (!sender) {
      // Sender not in registry and not in message, ignore
      GME_debug(`[TabCommunication:${this.namespace}] Sender not found, ignoring message`)
      return
    }

    GME_debug(`[TabCommunication:${this.namespace}] Sender info: id=${sender.id}, url=${sender.url}, isActive=${sender.isActive}`)

    // Update sender info in registry if message has more recent info
    if (message.sender && message.sender.lastHeartbeat) {
      const registry = this.getRegistry()
      const existing = registry[message.from]
      if (!existing || message.sender.lastHeartbeat > existing.lastHeartbeat) {
        registry[message.from] = message.sender
        this.setRegistry(registry)
      }
    }

    // Check URL pattern filter
    if (message.urlPattern) {
      if (!this.matchUrlPattern(message.urlPattern, window.location.href)) {
        return
      }
    }

    // Handle different message types
    switch (message.type) {
      case 'broadcast':
        GME_debug(`[TabCommunication:${this.namespace}] Processing broadcast message, handler count: ${this.messageHandlers.get('broadcast')?.size || 0}`)
        // Call broadcast handlers
        await this.callHandlers('broadcast', message, sender)
        await this.callHandlers('*', message, sender)
        break

      case 'send':
        // Check if this message is for this tab
        const isForThisTab = message.to === this.tabId || (Array.isArray(message.to) && message.to.includes(this.tabId))
        GME_debug(`[TabCommunication:${this.namespace}] Processing send message, isForThisTab: ${isForThisTab}, this.tabId: ${this.tabId}, message.to: ${message.to}`)
        if (isForThisTab) {
          // Call send handlers (for manual processing)
          await this.callHandlers('send', message, sender)

          // Call all reply handlers
          // If a handler returns a value, automatically send it as reply
          // If a handler returns void, it means manual reply (user will call reply() manually)
          GME_debug(`[TabCommunication:${this.namespace}] Calling reply handlers, count: ${this.replyHandlers.size}`)
          for (const { handler } of this.replyHandlers) {
            try {
              const replyData = await handler(message, sender)
              // If handler returns a value, automatically send reply
              if (replyData !== undefined && replyData !== null) {
                GME_debug(`[TabCommunication:${this.namespace}] Handler returned reply data, sending reply`)
                await this.reply(message.messageId!, replyData, message.from)
                // Only send one reply per message (first handler that returns a value)
                break
              }
              // If handler returns void, it means manual reply - don't auto-reply
            } catch (error) {
              // Send error as reply if handler throws
              GME_fail(`[TabCommunication:${this.namespace}] Reply handler error: ${error}`)
              await this.reply(message.messageId!, { error: String(error) }, message.from)
              break
            }
          }
        }
        break

      case 'reply':
        // Check if this reply is for a pending message
        GME_debug(
          `[TabCommunication:${this.namespace}] Processing reply message, messageId: ${message.messageId}, hasPending: ${message.messageId ? this.pendingReplies.has(message.messageId) : false}`
        )
        if (message.messageId && this.pendingReplies.has(message.messageId)) {
          const pending = this.pendingReplies.get(message.messageId)!
          this.pendingReplies.delete(message.messageId)
          pending.resolve(message.data)
          GME_debug(`[TabCommunication:${this.namespace}] Reply resolved, pending replies remaining: ${this.pendingReplies.size}`)
        }
        break

      case 'register':
      case 'unregister':
        GME_debug(`[TabCommunication:${this.namespace}] Processing ${message.type} message`)
        // Update registry (already handled by GM_addValueChangeListener on REGISTRY_KEY)
        // Just call handlers if needed
        await this.callHandlers(message.type, message, sender)
        break
    }
  }

  /**
   * Call handlers for a specific message type
   */
  private async callHandlers(messageType: MessageType | '*', message: TabMessage, sender: TabInfo): Promise<void> {
    const handlers = this.messageHandlers.get(messageType)
    if (!handlers) {
      return
    }

    for (const handler of handlers) {
      try {
        await handler(message, sender)
      } catch (error) {
        // Log error but don't stop other handlers
        const errorMessage = error instanceof Error ? error.message : String(error)
        GME_fail(`[TabCommunication] Handler error: ${errorMessage}`)
      }
    }
  }

  /**
   * Match URL pattern
   * @param pattern URL pattern (supports wildcards)
   * @param url URL to match
   */
  private matchUrlPattern(pattern: string, url: string): boolean {
    // Simple wildcard matching
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$')
    return regex.test(url)
  }

  /**
   * Get this tab's ID
   */
  getTabId(): string {
    return this.tabId
  }
}

/**
 * Get or create a singleton instance of the tab communication service
 * @param config Service configuration (namespace determines the singleton instance)
 * @returns Service instance
 * @note This is a global factory function used by other modules, eslint-disable is needed
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const getTabCommunication = (() => {
  // Use closure to keep instances private (not in global scope)
  const instances: Map<string, TabCommunication> = new Map()

  return function getTabCommunication(config?: TabCommunicationConfig): TabCommunication {
    const namespace = config?.namespace || 'tab-comm'

    if (!instances.has(namespace)) {
      instances.set(namespace, new TabCommunication(config))
    }

    return instances.get(namespace)!
  }
})()
