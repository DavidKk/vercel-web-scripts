import { sendShellMessage } from '@ext/shared/messages'
import { isValidApiBaseUrl, normalizeApiBaseUrl } from '@ext/shell/webmcp/agent-llm-api-root'
import { type AgentLlmProviderId, getAgentLlmProviderMeta, isAgentLlmProviderId } from '@ext/shell/webmcp/agent-llm-providers'
import { formatProxyHeadersJson, parseProxyHeadersJson } from '@ext/shell/webmcp/agent-llm-proxy-headers'
import { type AgentLlmConfig, type AgentLlmModelInfo, type AgentPrefs, switchAgentLlmProvider } from '@ext/shell/webmcp/agent-types'
import { hydrateIconSlot, hydrateMmIcons } from '@ext/ui/mm-icons'
import { showMmNotification } from '@ext/ui/mm-notification'
import { formatAbsoluteTime24h, formatRelativeTime } from '@shared/format-relative-time'

import { type AgentUiMessage, runAgentLoop } from './agent-loop'
import { type AgentChatSession, type AgentChatSessionStore, createEmptySession, loadAgentSessionStore, saveAgentSessionStore } from './agent-session-storage'
import { loadAgentLlmConfig, loadAgentPrefs, saveAgentLlmConfig, saveAgentPrefs } from './agent-storage'

/**
 * Side panel controller — Agent chat for the active browser tab.
 */
export class MmSidepanelApp extends HTMLElement {
  private bound = false
  private activeTabId: number | null = null
  private activeTabUrl = ''
  private chatAbort: AbortController | null = null
  private chatMessageCount = 0
  private sessionStore: AgentChatSessionStore | null = null
  /** In-memory empty draft until the first message creates a persisted session. */
  private draftSession: AgentChatSession | null = null
  private modelsLoading = false
  private preferredModelId = ''
  private modelOptions: AgentLlmModelInfo[] = []
  private modelsLoaded = false

  private onTabActivated = (): void => {
    void this.refreshActiveTab()
  }

  private onTabUpdated = (tabId: number, changeInfo: chrome.tabs.TabChangeInfo): void => {
    if (tabId !== this.activeTabId) {
      return
    }
    if (changeInfo.status === 'complete' || changeInfo.url) {
      void this.refreshActiveTab()
    }
  }

  connectedCallback(): void {
    if (this.bound) {
      return
    }
    this.bound = true
    hydrateMmIcons(this)
    this.bindEvents()
    this.syncComposerSendState()
    chrome.tabs.onActivated.addListener(this.onTabActivated)
    chrome.tabs.onUpdated.addListener(this.onTabUpdated)
    void this.bootstrap()
  }

  disconnectedCallback(): void {
    this.chatAbort?.abort()
    chrome.tabs.onActivated.removeListener(this.onTabActivated)
    chrome.tabs.onUpdated.removeListener(this.onTabUpdated)
  }

  private bindEvents(): void {
    this.querySelector('[data-action="send-chat"]')?.addEventListener('click', () => {
      void this.sendChat()
    })
    this.querySelector('[data-action="stop-chat"]')?.addEventListener('click', () => {
      this.chatAbort?.abort()
    })
    this.querySelector('[data-action="new-session"]')?.addEventListener('click', () => {
      void this.newSession()
    })
    this.querySelector('[data-action="open-settings"]')?.addEventListener('click', () => {
      this.showSettings(true)
    })
    this.querySelector('[data-action="close-settings"]')?.addEventListener('click', () => {
      this.showSettings(false)
    })
    this.querySelector('[data-action="save-llm"]')?.addEventListener('click', () => {
      void this.saveLlmSettings()
    })
    this.querySelector('[data-action="save-prefs"]')?.addEventListener('click', () => {
      void this.savePrefsSettings()
    })
    this.querySelector('[data-ref="tool-scope"]')?.addEventListener('change', () => {
      this.syncToolScopeIntoPrefsJson()
    })
    this.querySelector('[data-ref="model-trigger"]')?.addEventListener('click', (event) => {
      event.stopPropagation()
      void this.toggleModelMenu()
    })
    this.querySelector('[data-ref="model-menu"]')?.addEventListener('click', (event) => {
      event.stopPropagation()
      const option = (event.target as HTMLElement).closest<HTMLElement>('[data-model-id]')
      if (!option) {
        return
      }
      const modelId = option.getAttribute('data-model-id')
      if (modelId) {
        void this.selectModel(modelId)
      }
    })
    document.addEventListener('click', (event) => {
      const target = event.target as Node | null
      const sessionPicker = this.querySelector('[data-ref="session-picker"]')
      const modelPicker = this.querySelector('[data-ref="model-picker"]')
      if (!sessionPicker?.contains(target)) {
        this.hideSessionMenu()
      }
      if (!modelPicker?.contains(target)) {
        this.hideModelMenu()
      }
    })
    this.querySelector('[data-ref="llm-api-key"]')?.addEventListener('change', () => {
      this.modelsLoaded = false
    })
    this.querySelector('[data-ref="llm-provider"]')?.addEventListener('change', () => {
      void this.onProviderChange()
    })
    this.querySelector('[data-ref="llm-proxy-enabled"]')?.addEventListener('change', () => {
      this.syncProxyFieldsVisibility()
      this.modelsLoaded = false
    })
    this.querySelector('[data-ref="llm-base-url"]')?.addEventListener('change', () => {
      this.modelsLoaded = false
    })
    this.querySelector('[data-ref="llm-proxy-headers"]')?.addEventListener('change', () => {
      this.modelsLoaded = false
    })

    this.querySelector('[data-ref="session-trigger"]')?.addEventListener('click', (event) => {
      event.stopPropagation()
      this.toggleSessionMenu()
    })
    this.querySelector('[data-ref="session-menu"]')?.addEventListener('click', (event) => {
      event.stopPropagation()
      const target = event.target as HTMLElement
      const deleteBtn = target.closest<HTMLElement>('[data-action="delete-session"]')
      if (deleteBtn) {
        const sessionId = deleteBtn.getAttribute('data-session-id')
        if (sessionId) {
          void this.deleteSession(sessionId)
        }
        return
      }
      const option = target.closest<HTMLElement>('[data-session-id][data-action="switch-session"]')
      if (option) {
        const sessionId = option.getAttribute('data-session-id')
        if (sessionId) {
          void this.switchSession(sessionId)
        }
      }
    })

    this.querySelector('[data-ref="chat-input"]')?.addEventListener('keydown', (event) => {
      if (event instanceof KeyboardEvent && event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        void this.sendChat()
      }
    })
    this.querySelector('[data-ref="chat-input"]')?.addEventListener('input', () => {
      this.syncComposerSendState()
    })
  }

  private syncComposerSendState(): void {
    const input = this.querySelector('[data-ref="chat-input"]') as HTMLTextAreaElement | null
    const send = this.querySelector('[data-action="send-chat"]') as HTMLButtonElement | null
    if (!send) {
      return
    }
    const running = send.classList.contains('hidden')
    const tabOk = this.isAgentCompatibleTab()
    send.disabled = running || !tabOk || !input?.value.trim()
    send.title = !tabOk ? this.describeUnsupportedTab() : 'Send'
  }

  private isAgentCompatibleTab(): boolean {
    return this.activeTabUrl.startsWith('http://') || this.activeTabUrl.startsWith('https://')
  }

  private describeUnsupportedTab(): string {
    const url = this.activeTabUrl
    if (!url) {
      return 'No active page. Open an http(s) tab first.'
    }
    if (url.startsWith('chrome-extension://') || url.startsWith('moz-extension://')) {
      return 'Current tab is an extension page. Switch to an http(s) site to use Agent.'
    }
    if (url.startsWith('chrome://') || url.startsWith('edge://') || url.startsWith('about:') || url.startsWith('devtools:')) {
      return 'Current tab is a browser page. Switch to an http(s) site to use Agent.'
    }
    if (url.startsWith('file:')) {
      return 'Local file tabs are not supported. Open an http(s) site.'
    }
    return 'Agent only works on http(s) pages. Switch to a website tab.'
  }

  private syncComposerTabGate(): void {
    const tabOk = this.isAgentCompatibleTab()
    const input = this.querySelector('[data-ref="chat-input"]') as HTMLTextAreaElement | null
    const modelTrigger = this.querySelector('[data-ref="model-trigger"]') as HTMLButtonElement | null
    if (input && input.getAttribute('aria-busy') !== 'true') {
      input.placeholder = tabOk ? 'Message Agent…' : 'Switch to an http(s) tab to chat…'
    }
    if (modelTrigger) {
      modelTrigger.disabled = !tabOk
    }
    if (!tabOk) {
      this.hideModelMenu()
    }
    this.syncComposerSendState()
  }

  private async bootstrap(): Promise<void> {
    this.sessionStore = await loadAgentSessionStore()
    await this.loadSettingsForm()
    this.syncModelLabel()
    await this.refreshActiveTab()
    this.renderSessionMenu()
    this.renderChatLog()
    void this.refreshGeminiModels()
  }

  private getActiveSession(): AgentChatSession | null {
    if (!this.sessionStore) {
      return null
    }
    if (this.sessionStore.activeSessionId) {
      const found = this.sessionStore.sessions.find((session) => session.id === this.sessionStore?.activeSessionId)
      if (found) {
        return found
      }
    }
    if (!this.draftSession) {
      this.draftSession = createEmptySession()
    }
    return this.draftSession
  }

  /** Promote a draft with content into the persisted session list. */
  private commitDraftIfNeeded(): void {
    if (!this.sessionStore || !this.draftSession || this.draftSession.messages.length === 0) {
      return
    }
    const draft = this.draftSession
    if (!this.sessionStore.sessions.some((session) => session.id === draft.id)) {
      this.sessionStore.sessions.unshift(draft)
    }
    this.sessionStore.activeSessionId = draft.id
    this.draftSession = null
  }

  private async persistSessionStore(): Promise<void> {
    if (!this.sessionStore) {
      return
    }
    this.commitDraftIfNeeded()
    await saveAgentSessionStore(this.sessionStore)
    this.renderSessionMenu()
  }

  private hideSessionMenu(): void {
    const picker = this.querySelector('[data-ref="session-picker"]') as HTMLElement | null
    const menu = this.querySelector('[data-ref="session-menu"]') as HTMLElement | null
    const trigger = this.querySelector('[data-ref="session-trigger"]') as HTMLButtonElement | null
    if (!picker || !menu || !trigger) {
      return
    }
    picker.removeAttribute('open')
    menu.hidden = true
    trigger.setAttribute('aria-expanded', 'false')
  }

  private toggleSessionMenu(): void {
    const picker = this.querySelector('[data-ref="session-picker"]') as HTMLElement | null
    const menu = this.querySelector('[data-ref="session-menu"]') as HTMLElement | null
    const trigger = this.querySelector('[data-ref="session-trigger"]') as HTMLButtonElement | null
    if (!picker || !menu || !trigger) {
      return
    }
    const open = menu.hidden
    this.hideModelMenu()
    if (open) {
      this.renderSessionMenu()
      picker.setAttribute('open', '')
      menu.hidden = false
      trigger.setAttribute('aria-expanded', 'true')
    } else {
      this.hideSessionMenu()
    }
  }

  private renderSessionMenu(): void {
    const labelEl = this.querySelector('[data-ref="session-label"]') as HTMLElement | null
    const menu = this.querySelector('[data-ref="session-menu"]') as HTMLElement | null
    if (!labelEl || !menu || !this.sessionStore) {
      return
    }

    const active = this.getActiveSession()
    labelEl.textContent = active?.messages.length ? active.title : 'New chat'

    menu.replaceChildren()
    const sessions = this.sessionStore.sessions
    if (!sessions.length) {
      const empty = document.createElement('div')
      empty.className = 'mm-sidepanel-session-empty'
      empty.dataset.ref = 'session-empty'
      empty.textContent = 'No chats yet'
      menu.append(empty)
      return
    }

    const activeId = this.sessionStore.activeSessionId
    for (const session of sessions) {
      const row = document.createElement('div')
      row.className = 'mm-sidepanel-session-item'
      row.setAttribute('role', 'none')

      const option = document.createElement('button')
      option.type = 'button'
      option.className = 'mm-sidepanel-session-option'
      option.dataset.action = 'switch-session'
      option.dataset.sessionId = session.id
      option.setAttribute('role', 'menuitem')
      if (session.id === activeId) {
        option.setAttribute('aria-current', 'true')
      }

      const title = document.createElement('span')
      title.className = 'mm-sidepanel-session-option-label'
      title.textContent = session.title
      option.append(title)

      const deleteBtn = document.createElement('button')
      deleteBtn.type = 'button'
      deleteBtn.className = 'mm-sidepanel-session-delete'
      deleteBtn.dataset.action = 'delete-session'
      deleteBtn.dataset.sessionId = session.id
      deleteBtn.title = 'Delete chat'
      deleteBtn.setAttribute('aria-label', `Delete ${session.title}`)
      const deleteIcon = document.createElement('span')
      deleteIcon.className = 'mm-icon-slot'
      deleteIcon.setAttribute('data-icon', 'delete')
      deleteBtn.append(deleteIcon)
      hydrateIconSlot(deleteIcon)

      row.append(option, deleteBtn)
      menu.append(row)
    }
  }

  private async newSession(): Promise<void> {
    if (!this.sessionStore) {
      return
    }

    this.chatAbort?.abort()
    this.hideSessionMenu()

    const active = this.getActiveSession()
    if (!this.sessionStore.activeSessionId && active && active.messages.length === 0) {
      this.renderChatLog()
      this.setChatStatus('')
      this.querySelector<HTMLTextAreaElement>('[data-ref="chat-input"]')?.focus()
      return
    }

    this.sessionStore.activeSessionId = null
    this.draftSession = createEmptySession()
    await this.persistSessionStore()
    this.renderChatLog()
    this.setChatStatus('')
    this.querySelector<HTMLTextAreaElement>('[data-ref="chat-input"]')?.focus()
  }

  private async switchSession(sessionId: string): Promise<void> {
    if (!this.sessionStore || sessionId === this.sessionStore.activeSessionId) {
      this.hideSessionMenu()
      return
    }

    this.chatAbort?.abort()
    this.draftSession = null
    this.sessionStore.activeSessionId = sessionId
    await this.persistSessionStore()
    this.hideSessionMenu()
    this.renderChatLog()
    this.setChatStatus('')
  }

  private async deleteSession(sessionId: string): Promise<void> {
    if (!this.sessionStore) {
      return
    }

    this.chatAbort?.abort()
    this.sessionStore.sessions = this.sessionStore.sessions.filter((session) => session.id !== sessionId)
    if (this.sessionStore.activeSessionId === sessionId) {
      this.sessionStore.activeSessionId = null
      this.draftSession = createEmptySession()
    }
    await this.persistSessionStore()
    this.renderChatLog()
    this.setChatStatus('')
  }

  private showSettings(open: boolean): void {
    this.querySelector('[data-ref="header-chat"]')?.toggleAttribute('hidden', open)
    this.querySelector('[data-ref="header-settings"]')?.toggleAttribute('hidden', !open)
    this.querySelector('[data-ref="chat-main"]')?.toggleAttribute('hidden', open)
    this.querySelector('[data-ref="settings-panel"]')?.toggleAttribute('hidden', !open)
    if (open) {
      void this.openSettingsPanel()
    }
  }

  private async openSettingsPanel(): Promise<void> {
    this.hideModelMenu()
    this.hideSessionMenu()
    await this.loadSettingsForm()
  }

  private shortModelLabel(modelId: string): string {
    const known = this.modelOptions.find((model) => model.id === modelId)
    const raw = known?.displayName || modelId || 'Model'
    return raw.replace(/^(Gemini|Claude|GPT)\s+/i, '').trim() || modelId || 'Model'
  }

  private syncModelLabel(): void {
    const label = this.querySelector('[data-ref="model-label"]')
    if (label) {
      label.textContent = this.shortModelLabel(this.preferredModelId)
    }
    const trigger = this.querySelector('[data-ref="model-trigger"]') as HTMLButtonElement | null
    if (trigger) {
      trigger.title = this.preferredModelId ? `Model: ${this.preferredModelId}` : 'Select model'
    }
  }

  private hideModelMenu(): void {
    const picker = this.querySelector('[data-ref="model-picker"]')
    const menu = this.querySelector('[data-ref="model-menu"]') as HTMLElement | null
    const trigger = this.querySelector('[data-ref="model-trigger"]') as HTMLButtonElement | null
    picker?.removeAttribute('open')
    if (menu) {
      menu.hidden = true
    }
    trigger?.setAttribute('aria-expanded', 'false')
  }

  private async toggleModelMenu(): Promise<void> {
    const picker = this.querySelector('[data-ref="model-picker"]')
    const menu = this.querySelector('[data-ref="model-menu"]') as HTMLElement | null
    const trigger = this.querySelector('[data-ref="model-trigger"]') as HTMLButtonElement | null
    if (!picker || !menu || !trigger || trigger.disabled) {
      return
    }

    const willOpen = menu.hidden
    if (!willOpen) {
      this.hideModelMenu()
      return
    }

    if (!this.modelsLoaded && !this.modelsLoading) {
      await this.refreshGeminiModels()
    }
    this.renderModelMenu()
    picker.setAttribute('open', '')
    menu.hidden = false
    trigger.setAttribute('aria-expanded', 'true')
  }

  private renderModelMenu(): void {
    const menu = this.querySelector('[data-ref="model-menu"]') as HTMLElement | null
    if (!menu) {
      return
    }

    menu.replaceChildren()

    if (!this.modelOptions.length) {
      const empty = document.createElement('div')
      empty.className = 'mm-sidepanel-model-empty'
      empty.dataset.ref = 'model-empty'
      empty.textContent = this.modelsLoading ? 'Loading models…' : 'Configure API key in Settings, then reopen.'
      menu.append(empty)
      return
    }

    for (const model of this.modelOptions) {
      const option = document.createElement('button')
      option.type = 'button'
      option.className = 'mm-sidepanel-model-option'
      option.dataset.modelId = model.id
      option.setAttribute('role', 'option')
      option.setAttribute('aria-selected', String(model.id === this.preferredModelId))
      option.title = model.id
      option.textContent = model.displayName || model.id
      menu.append(option)
    }
  }

  private async selectModel(modelId: string): Promise<void> {
    this.hideModelMenu()
    if (!modelId || modelId === this.preferredModelId) {
      return
    }

    this.preferredModelId = modelId
    this.syncModelLabel()
    this.renderModelMenu()

    const llm = await loadAgentLlmConfig()
    await saveAgentLlmConfig({ ...llm, model: modelId })
  }

  private syncProxyFieldsVisibility(): void {
    const apiProxyEnabled = (this.querySelector('[data-ref="llm-proxy-enabled"]') as HTMLInputElement | null)?.checked ?? false
    this.querySelector('[data-ref="llm-proxy-fields"]')?.toggleAttribute('hidden', !apiProxyEnabled)
  }

  private readProviderFromForm(): AgentLlmProviderId {
    const raw = (this.querySelector('[data-ref="llm-provider"]') as HTMLSelectElement | null)?.value ?? 'gemini'
    return isAgentLlmProviderId(raw) ? raw : 'gemini'
  }

  private readProxyFormState(): { proxyEnabled: boolean; baseUrl: string; proxyHeaders: Record<string, string> } {
    const proxyEnabled = (this.querySelector('[data-ref="llm-proxy-enabled"]') as HTMLInputElement | null)?.checked ?? false
    const baseUrl = (this.querySelector('[data-ref="llm-base-url"]') as HTMLInputElement | null)?.value.trim() ?? ''
    const headersRaw = (this.querySelector('[data-ref="llm-proxy-headers"]') as HTMLTextAreaElement | null)?.value ?? ''
    return {
      proxyEnabled,
      baseUrl,
      proxyHeaders: parseProxyHeadersJson(headersRaw),
    }
  }

  private tryReadProxyFormState(): { ok: true; value: { proxyEnabled: boolean; baseUrl: string; proxyHeaders: Record<string, string> } } | { ok: false; error: string } {
    try {
      return { ok: true, value: this.readProxyFormState() }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  private applyProviderCopy(provider: AgentLlmProviderId): void {
    const meta = getAgentLlmProviderMeta(provider)
    const apiKeyInput = this.querySelector('[data-ref="llm-api-key"]') as HTMLInputElement | null
    const baseUrlInput = this.querySelector('[data-ref="llm-base-url"]') as HTMLInputElement | null
    const proxyToggleText = this.querySelector('[data-ref="llm-proxy-toggle-text"]')
    const baseUrlHint = this.querySelector('[data-ref="llm-base-url-hint"]')
    if (apiKeyInput) {
      apiKeyInput.placeholder = meta.apiKeyPlaceholder
    }
    if (baseUrlInput) {
      baseUrlInput.placeholder = meta.defaultBaseUrl
    }
    if (proxyToggleText) {
      proxyToggleText.textContent = meta.proxyToggleText
    }
    if (baseUrlHint) {
      baseUrlHint.textContent = meta.baseUrlHint
    }
  }

  private fillLlmFormFields(config: AgentLlmConfig): void {
    const providerSelect = this.querySelector('[data-ref="llm-provider"]') as HTMLSelectElement | null
    const apiKeyInput = this.querySelector('[data-ref="llm-api-key"]') as HTMLInputElement | null
    const proxyEnabledInput = this.querySelector('[data-ref="llm-proxy-enabled"]') as HTMLInputElement | null
    const baseUrlInput = this.querySelector('[data-ref="llm-base-url"]') as HTMLInputElement | null
    const proxyHeadersInput = this.querySelector('[data-ref="llm-proxy-headers"]') as HTMLTextAreaElement | null
    if (providerSelect) {
      providerSelect.value = config.provider
    }
    if (apiKeyInput) {
      apiKeyInput.value = config.apiKey
    }
    if (proxyEnabledInput) {
      proxyEnabledInput.checked = config.proxyEnabled
    }
    if (baseUrlInput) {
      baseUrlInput.value = config.baseUrl
    }
    if (proxyHeadersInput) {
      proxyHeadersInput.value = formatProxyHeadersJson(config.proxyHeaders)
    }
    this.preferredModelId = config.model
    this.applyProviderCopy(config.provider)
    this.syncProxyFieldsVisibility()
    this.syncModelLabel()
  }

  private async onProviderChange(): Promise<void> {
    const nextProvider = this.readProviderFromForm()
    const current = await loadAgentLlmConfig()
    const apiKey = (this.querySelector('[data-ref="llm-api-key"]') as HTMLInputElement | null)?.value ?? ''
    const proxyState = this.tryReadProxyFormState()
    if (!proxyState.ok) {
      showMmNotification(proxyState.error, 'error')
      const providerSelect = this.querySelector('[data-ref="llm-provider"]') as HTMLSelectElement | null
      if (providerSelect) {
        providerSelect.value = current.provider
      }
      return
    }
    const { proxyEnabled, baseUrl, proxyHeaders } = proxyState.value
    const draft: AgentLlmConfig = {
      ...current,
      provider: current.provider,
      apiKey,
      model: this.preferredModelId || current.model,
      proxyEnabled,
      baseUrl,
      proxyHeaders,
    }
    const switched = switchAgentLlmProvider(draft, nextProvider)
    await saveAgentLlmConfig(switched)
    this.fillLlmFormFields(switched)
    this.modelsLoaded = false
    void this.refreshGeminiModels()
  }

  private async resolveApiKey(): Promise<string> {
    const typed = (this.querySelector('[data-ref="llm-api-key"]') as HTMLInputElement | null)?.value.trim() ?? ''
    if (typed) {
      return typed
    }
    const stored = await loadAgentLlmConfig()
    return stored.apiKey.trim()
  }

  private async refreshGeminiModels(): Promise<void> {
    if (this.modelsLoading) {
      return
    }

    const apiKey = await this.resolveApiKey()
    if (!apiKey) {
      this.modelOptions = []
      this.modelsLoaded = false
      this.syncModelLabel()
      return
    }

    const proxyState = this.tryReadProxyFormState()
    if (!proxyState.ok) {
      this.modelsLoaded = false
      this.syncModelLabel()
      return
    }
    const { proxyEnabled, baseUrl, proxyHeaders } = proxyState.value
    this.modelsLoading = true
    try {
      const response = await sendShellMessage({
        type: 'AGENT_LLM_LIST_MODELS',
        apiKey,
        proxyEnabled,
        baseUrl,
        proxyHeaders,
        provider: this.readProviderFromForm(),
      })
      if (!response.ok || !('agentLlmModels' in response) || !response.agentLlmModels) {
        throw new Error(!response.ok ? response.error : 'Failed to load Gemini models.')
      }

      this.modelOptions = response.agentLlmModels
      this.modelsLoaded = true

      const preferred = this.preferredModelId
      const nextValue = this.modelOptions.some((model) => model.id === preferred) ? preferred : (this.modelOptions[0]?.id ?? preferred)
      if (nextValue && nextValue !== this.preferredModelId) {
        this.preferredModelId = nextValue
        const llm = await loadAgentLlmConfig()
        await saveAgentLlmConfig({ ...llm, model: nextValue })
      }
      this.syncModelLabel()
    } catch {
      this.modelsLoaded = false
      if (this.preferredModelId) {
        this.modelOptions = [{ id: this.preferredModelId, displayName: this.preferredModelId }]
      }
      this.syncModelLabel()
    } finally {
      this.modelsLoading = false
      const menu = this.querySelector('[data-ref="model-menu"]') as HTMLElement | null
      if (menu && !menu.hidden) {
        this.renderModelMenu()
      }
    }
  }

  private syncToolScopeIntoPrefsJson(): void {
    const prefsInput = this.querySelector('[data-ref="prefs-json"]') as HTMLTextAreaElement | null
    const toolScope = (this.querySelector('[data-ref="tool-scope"]') as HTMLSelectElement | null)?.value
    if (!prefsInput) {
      return
    }
    try {
      const parsed = JSON.parse(prefsInput.value || '{}') as AgentPrefs
      const scope = toolScope === 'all' ? 'all' : 'magickmonkey_only'
      prefsInput.value = JSON.stringify(
        {
          ...parsed,
          global: {
            ...parsed.global,
            toolProviderScope: scope,
          },
        },
        null,
        2
      )
    } catch {
      // Keep textarea as-is; save path validates JSON.
    }
  }

  private async loadSettingsForm(): Promise<void> {
    const llm = await loadAgentLlmConfig()
    const prefs = await loadAgentPrefs()
    const prefsInput = this.querySelector('[data-ref="prefs-json"]') as HTMLTextAreaElement | null
    const toolScope = this.querySelector('[data-ref="tool-scope"]') as HTMLSelectElement | null
    this.fillLlmFormFields(llm)
    if (toolScope) {
      toolScope.value = prefs.global?.toolProviderScope === 'all' ? 'all' : 'magickmonkey_only'
    }
    if (prefsInput) {
      prefsInput.value = JSON.stringify(prefs, null, 2)
    }
  }

  private async saveLlmSettings(): Promise<void> {
    const provider = this.readProviderFromForm()
    const apiKey = (this.querySelector('[data-ref="llm-api-key"]') as HTMLInputElement | null)?.value ?? ''
    const meta = getAgentLlmProviderMeta(provider)
    const model = this.preferredModelId || meta.defaultModel
    const proxyState = this.tryReadProxyFormState()
    if (!proxyState.ok) {
      showMmNotification(proxyState.error, 'error')
      return
    }
    const { proxyEnabled, baseUrl, proxyHeaders } = proxyState.value
    const current = await loadAgentLlmConfig()
    const nextBase: AgentLlmConfig = {
      ...current,
      provider,
      apiKey,
      model,
      proxyHeaders,
    }

    try {
      if (proxyEnabled) {
        const normalized = normalizeApiBaseUrl(baseUrl)
        if (!isValidApiBaseUrl(normalized)) {
          showMmNotification('Proxy Base URL must be a valid http(s) URL.', 'error')
          return
        }
        await saveAgentLlmConfig({
          ...nextBase,
          proxyEnabled: true,
          baseUrl: normalized,
        })
      } else {
        await saveAgentLlmConfig({
          ...nextBase,
          proxyEnabled: false,
          baseUrl,
        })
      }
    } catch (error) {
      showMmNotification(error instanceof Error ? error.message : String(error), 'error')
      return
    }
    this.modelsLoaded = false
    showMmNotification('LLM settings saved.', 'success')
    void this.refreshGeminiModels()
  }

  private async savePrefsSettings(): Promise<void> {
    const raw = (this.querySelector('[data-ref="prefs-json"]') as HTMLTextAreaElement | null)?.value ?? ''
    const toolScope = (this.querySelector('[data-ref="tool-scope"]') as HTMLSelectElement | null)?.value
    try {
      const parsed = JSON.parse(raw) as AgentPrefs
      const scope = toolScope === 'all' ? 'all' : 'magickmonkey_only'
      const next: AgentPrefs = {
        ...parsed,
        global: {
          ...parsed.global,
          toolProviderScope: scope,
        },
      }
      await saveAgentPrefs(next)
      const prefsInput = this.querySelector('[data-ref="prefs-json"]') as HTMLTextAreaElement | null
      if (prefsInput) {
        prefsInput.value = JSON.stringify(next, null, 2)
      }
      showMmNotification('Agent preferences saved.', 'success')
    } catch {
      showMmNotification('Invalid preferences JSON.', 'error')
    }
  }

  private async refreshActiveTab(): Promise<void> {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
    if (!tab?.id) {
      this.activeTabId = null
      this.activeTabUrl = ''
      this.syncComposerTabGate()
      return
    }

    this.activeTabId = tab.id
    this.activeTabUrl = tab.url ?? ''
    this.syncComposerTabGate()
  }

  private renderChatLog(): void {
    const log = this.querySelector('[data-ref="chat-log"]')
    if (!log) {
      return
    }

    const session = this.getActiveSession()
    const messages = session?.messages ?? []
    for (const message of messages) {
      if (!message.createdAt) {
        message.createdAt = session?.updatedAt ?? Date.now()
      }
    }

    log.replaceChildren()
    this.chatMessageCount = messages.length
    for (const message of messages) {
      log.appendChild(this.createMessageElement(message))
    }

    this.syncChatEmptyState()
    if (log instanceof HTMLElement) {
      log.scrollTop = log.scrollHeight
    }
  }

  private syncChatEmptyState(): void {
    const stage = this.querySelector('[data-ref="chat-stage"]') as HTMLElement | null
    const empty = this.querySelector('[data-ref="chat-empty"]') as HTMLElement | null
    if (!stage) {
      return
    }
    const isEmpty = this.chatMessageCount === 0
    stage.dataset.empty = isEmpty ? 'true' : 'false'
    if (empty && isEmpty) {
      hydrateMmIcons(empty)
    }
  }

  private appendChatMessage(message: AgentUiMessage): void {
    const log = this.querySelector('[data-ref="chat-log"]')
    const session = this.getActiveSession()
    if (!log || !session) {
      return
    }

    session.messages.push(message)
    session.updatedAt = Date.now()
    if (message.kind === 'user' && session.title === 'New chat') {
      session.title = message.text.length > 48 ? `${message.text.slice(0, 48)}…` : message.text
    }
    void this.persistSessionStore()

    this.chatMessageCount += 1
    this.syncChatEmptyState()
    log.appendChild(this.createMessageElement(message))
    if (log instanceof HTMLElement) {
      log.scrollTop = log.scrollHeight
    }
  }

  private createMessageElement(message: AgentUiMessage): HTMLElement {
    const el = document.createElement('div')
    el.dataset.messageId = message.id

    if (message.kind === 'tool') {
      el.className = 'mm-sidepanel-message mm-sidepanel-message--tool'
      el.append(this.buildToolCallCard(message))
      return el
    }

    const isUser = message.kind === 'user'
    el.className = isUser ? 'mm-sidepanel-message mm-sidepanel-message--user' : 'mm-sidepanel-message mm-sidepanel-message--assistant'

    const bubble = document.createElement('div')
    bubble.className = isUser ? 'mm-sidepanel-bubble mm-sidepanel-bubble--user' : 'mm-sidepanel-bubble mm-sidepanel-bubble--assistant'
    bubble.dataset.role = 'message-body'
    bubble.textContent = message.text

    const meta = document.createElement('div')
    meta.className = 'mm-sidepanel-message-meta'

    const time = document.createElement('time')
    time.className = 'mm-sidepanel-message-time'
    time.dateTime = new Date(message.createdAt || Date.now()).toISOString()
    time.textContent = formatRelativeTime(message.createdAt)
    time.title = formatAbsoluteTime24h(message.createdAt)

    meta.append(time)

    if (isUser) {
      const editBtn = document.createElement('button')
      editBtn.type = 'button'
      editBtn.className = 'mm-sidepanel-message-action'
      editBtn.dataset.action = 'edit-message'
      editBtn.setAttribute('aria-label', 'Edit')
      editBtn.setAttribute('data-mm-tooltip', 'Edit')
      editBtn.setAttribute('data-mm-tooltip-placement', 'top')
      const editIcon = document.createElement('span')
      editIcon.className = 'mm-icon-slot'
      editIcon.setAttribute('data-icon', 'editor')
      editIcon.setAttribute('aria-hidden', 'true')
      editBtn.append(editIcon)
      hydrateIconSlot(editIcon)
      editBtn.addEventListener('click', () => this.beginEditMessage(message.id))

      const copyBtn = document.createElement('button')
      copyBtn.type = 'button'
      copyBtn.className = 'mm-sidepanel-message-action'
      copyBtn.dataset.action = 'copy-message'
      copyBtn.setAttribute('aria-label', 'Copy')
      copyBtn.setAttribute('data-mm-tooltip', 'Copy')
      copyBtn.setAttribute('data-mm-tooltip-placement', 'top')
      const copyIcon = document.createElement('span')
      copyIcon.className = 'mm-icon-slot'
      copyIcon.setAttribute('data-icon', 'copy')
      copyIcon.setAttribute('aria-hidden', 'true')
      copyBtn.append(copyIcon)
      hydrateIconSlot(copyIcon)
      copyBtn.addEventListener('click', () => {
        void this.copyMessageText(message.id)
      })

      meta.append(editBtn, copyBtn)
    } else {
      const copyBtn = document.createElement('button')
      copyBtn.type = 'button'
      copyBtn.className = 'mm-sidepanel-message-action'
      copyBtn.setAttribute('aria-label', 'Copy')
      copyBtn.setAttribute('data-mm-tooltip', 'Copy')
      copyBtn.setAttribute('data-mm-tooltip-placement', 'top')
      const copyIcon = document.createElement('span')
      copyIcon.className = 'mm-icon-slot'
      copyIcon.setAttribute('data-icon', 'copy')
      copyIcon.setAttribute('aria-hidden', 'true')
      copyBtn.append(copyIcon)
      hydrateIconSlot(copyIcon)
      copyBtn.addEventListener('click', () => {
        void this.copyMessageText(message.id)
      })
      meta.append(copyBtn)
    }

    el.append(bubble, meta)
    return el
  }

  private findMessageElement(messageId: string): HTMLElement | null {
    return this.querySelector(`[data-message-id="${CSS.escape(messageId)}"]`) as HTMLElement | null
  }

  private async copyMessageText(messageId: string): Promise<void> {
    const session = this.getActiveSession()
    const message = session?.messages.find((item) => item.id === messageId)
    const text = message && 'text' in message ? message.text : ''
    if (!text) {
      return
    }
    try {
      await navigator.clipboard.writeText(text)
      showMmNotification('Copied.', 'success')
    } catch {
      showMmNotification('Copy failed.', 'error')
    }
  }

  private beginEditMessage(messageId: string): void {
    if (this.chatAbort) {
      showMmNotification('Stop the current reply before editing.', 'warn')
      return
    }

    const session = this.getActiveSession()
    const message = session?.messages.find((item) => item.id === messageId)
    if (!message || message.kind !== 'user') {
      return
    }

    const root = this.findMessageElement(messageId)
    const body = root?.querySelector('[data-role="message-body"]') as HTMLElement | null
    const editBtn = root?.querySelector('[data-action="edit-message"]') as HTMLButtonElement | null
    if (!root || !body) {
      return
    }

    body.contentEditable = 'true'
    body.focus()
    const selection = window.getSelection()
    const range = document.createRange()
    range.selectNodeContents(body)
    range.collapse(false)
    selection?.removeAllRanges()
    selection?.addRange(range)

    if (editBtn) {
      editBtn.disabled = true
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        body.textContent = message.text
        cleanup()
        return
      }
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        const next = (body.textContent ?? '').trim()
        cleanup()
        if (!next) {
          body.textContent = message.text
          showMmNotification('Message cannot be empty.', 'warn')
          return
        }
        void this.resendEditedMessage(messageId, next)
      }
    }

    const cleanup = (): void => {
      body.contentEditable = 'false'
      body.removeEventListener('keydown', onKeyDown)
      if (editBtn) {
        editBtn.disabled = false
      }
    }

    body.addEventListener('keydown', onKeyDown)
  }

  private async resendEditedMessage(messageId: string, text: string): Promise<void> {
    const session = this.getActiveSession()
    if (!session) {
      return
    }

    const index = session.messages.findIndex((item) => item.id === messageId && item.kind === 'user')
    if (index < 0) {
      return
    }

    const userMessage = session.messages[index]
    if (userMessage.kind !== 'user') {
      return
    }

    userMessage.text = text
    userMessage.createdAt = Date.now()
    session.messages = session.messages.slice(0, index + 1)
    session.updatedAt = Date.now()
    if (session.title === 'New chat' || index === 0) {
      session.title = text.length > 48 ? `${text.slice(0, 48)}…` : text
    }
    await this.persistSessionStore()
    this.renderChatLog()
    await this.runChatTurn(text, { skipUserMessageEvent: true })
  }

  private buildToolCallCard(message: Extract<AgentUiMessage, { kind: 'tool' }>): HTMLElement {
    const card = document.createElement('div')
    card.className = 'mm-sidepanel-tool-call'
    if (!message.ok) {
      card.classList.add('mm-sidepanel-tool-call--error')
    }

    const toggle = document.createElement('button')
    toggle.type = 'button'
    toggle.className = 'mm-sidepanel-tool-call-toggle'
    toggle.setAttribute('aria-expanded', 'false')

    const icon = document.createElement('span')
    icon.className = 'mm-sidepanel-tool-call-icon'
    icon.setAttribute('data-icon', 'tool')
    icon.setAttribute('aria-hidden', 'true')
    hydrateIconSlot(icon)

    const name = document.createElement('span')
    name.className = 'mm-sidepanel-tool-call-name'
    name.textContent = message.name

    const status = document.createElement('span')
    status.className = `mm-sidepanel-tool-call-status ${message.ok ? 'mm-sidepanel-tool-call-status--ok' : 'mm-sidepanel-tool-call-status--error'}`
    status.textContent = message.ok ? 'ok' : 'error'

    toggle.append(icon, name, status)

    const body = document.createElement('pre')
    body.className = 'mm-sidepanel-tool-call-body'
    body.hidden = true
    body.textContent = message.summary

    toggle.addEventListener('click', () => {
      const expanded = body.hidden
      body.hidden = !expanded
      toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false')
    })

    card.append(toggle, body)
    return card
  }

  private setChatStatus(text: string): void {
    const status = this.querySelector('[data-ref="chat-status"]')
    if (status) {
      status.textContent = text
    }
  }

  private formatUserFacingError(raw: string): string {
    const text = String(raw || '')
      .replace(/\s+/g, ' ')
      .trim()
    if (/429/.test(text)) {
      return 'Gemini rate limit reached (429). Please wait and try again.'
    }
    if (/401|403|API[_ ]?key|PERMISSION_DENIED/i.test(text)) {
      return 'Gemini API key is invalid or unauthorized. Check Settings.'
    }
    if (/Failed to list WebMCP|WebMCP/i.test(text)) {
      return text.length > 140 ? `${text.slice(0, 137)}…` : text
    }
    return text.length > 140 ? `${text.slice(0, 137)}…` : text || 'Something went wrong.'
  }

  private reportError(raw: string): void {
    this.setChatStatus('')
    showMmNotification(this.formatUserFacingError(raw), 'error')
  }

  private setChatRunning(running: boolean): void {
    this.querySelector('[data-action="stop-chat"]')?.classList.toggle('hidden', !running)
    this.querySelector('[data-action="send-chat"]')?.classList.toggle('hidden', running)
    const send = this.querySelector('[data-action="send-chat"]') as HTMLButtonElement | null
    if (send) {
      send.disabled = running
    }
    const input = this.querySelector('[data-ref="chat-input"]') as HTMLTextAreaElement | null
    if (input) {
      input.disabled = running
      input.setAttribute('aria-busy', running ? 'true' : 'false')
    }
    if (!running) {
      this.syncComposerSendState()
    }
  }

  private async sendChat(): Promise<void> {
    const input = this.querySelector('[data-ref="chat-input"]') as HTMLTextAreaElement | null
    const text = input?.value.trim() ?? ''
    if (!text) {
      return
    }
    if (input) {
      input.value = ''
      this.syncComposerSendState()
    }
    await this.runChatTurn(text)
  }

  private async runChatTurn(text: string, options?: { skipUserMessageEvent?: boolean }): Promise<void> {
    await this.refreshActiveTab()

    if (this.activeTabId == null) {
      showMmNotification('No active tab.', 'warn')
      this.syncComposerTabGate()
      return
    }

    if (!this.isAgentCompatibleTab()) {
      const message = this.describeUnsupportedTab()
      showMmNotification(message, 'warn')
      this.syncComposerTabGate()
      return
    }

    const llm = await loadAgentLlmConfig()
    if (!llm.apiKey.trim()) {
      showMmNotification('Configure Gemini API key in Settings.', 'warn')
      this.showSettings(true)
      return
    }

    this.chatAbort?.abort()
    this.chatAbort = new AbortController()
    this.setChatRunning(true)

    try {
      await runAgentLoop({
        tabId: this.activeTabId,
        tabUrl: this.activeTabUrl,
        userText: text,
        skipUserMessageEvent: options?.skipUserMessageEvent,
        signal: this.chatAbort.signal,
        onEvent: (event) => {
          if (event.type === 'message') {
            this.appendChatMessage(event.message)
          } else if (event.type === 'status') {
            this.setChatStatus(event.text)
          } else if (event.type === 'error') {
            this.reportError(event.message)
          } else if (event.type === 'done') {
            this.setChatStatus('')
          }
        },
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        this.setChatStatus('Stopped.')
      } else {
        const message = error instanceof Error ? error.message : String(error)
        this.reportError(message)
      }
    } finally {
      this.setChatRunning(false)
      this.chatAbort = null
    }
  }
}
