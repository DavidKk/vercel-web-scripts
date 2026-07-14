import { getExtensionVersion } from '@ext/bridge/extension-context'
import { formatDebugLogMessage } from '@ext/shared/debug-log-utils'
import { buildQuickRuleScriptSelectOptions, loadExtensionConfig, loadGmScopeForScriptKey, readPresetProjectVersion, readRuntimeOtaStage } from '@ext/shared/extension-storage'
import { fetchExtensionUpdateInfo } from '@ext/shared/extension-update-check'
import { sendShellMessage } from '@ext/shared/messages'
import { reportDebugLog } from '@ext/shared/report-debug-log'
import { captureAdminPageForDevReload } from '@ext/shell/dev-admin-restore'
import { openAgentSidePanelFromUserGesture } from '@ext/shell/webmcp/webmcp-side-panel'
import type { ShellLogOutputMode } from '@shared/shell-log-output'

import { bindAdminNavIndicator, syncAdminNavIndicator } from '../admin/mm-admin-nav'
import { hydrateIconSlot, hydrateMmIcons, setIconSlotLoading } from '../mm-icons'
import { bindComboClickTrigger } from '../shared/combo-click-trigger'
import { formatPopupVersionFooter, POPUP_VERSION_FOOTER_COMBO_CLICKS } from './popup-version-footer'

type SearchSelectOption = { value: string; label: string }
type SearchSelectElement = HTMLElement & {
  setOptions: (options: SearchSelectOption[]) => void
  setValue: (value: string) => void
  getValue: () => string
}

/**
 * Popup controller — light DOM only. Markup lives in src/html/pages/popup.ejs.
 */
export class MmPopupApp extends HTMLElement {
  private bound = false
  private toastTimer: ReturnType<typeof setTimeout> | undefined
  private quickRuleLastSelected = ''
  private quickRuleCurrentUrl = ''
  private extensionDownloadUrl: string | null = null
  private shellDisableMenuOpen = false
  private shellDisableMenuOutsideListener: ((event: MouseEvent) => void) | null = null
  private shellEnabledOnActiveTab = true
  private versionFooterComboCleanup: (() => void) | null = null
  private versionFooterDownloadPending = false
  private static readonly QUICK_RULE_RECENT_SCRIPT_KEY = 'vws_popup_quick_rule_recent_script'
  private defaultPopupSize: { width: number; height: number } | null = null

  connectedCallback(): void {
    if (this.bound) {
      return
    }
    this.bound = true
    hydrateMmIcons(this)
    const logNav = this.querySelector('[data-ref="log-output-tabs"]')
    if (logNav instanceof HTMLElement) {
      bindAdminNavIndicator(logNav)
    }
    this.bindEvents()
    this.ensureVersionFooterInitial()
    void this.hydrateCachedPresetVersion()
    void (async () => {
      await this.refresh({ network: false })
      requestAnimationFrame(() => {
        this.captureDefaultPopupSize()
        this.applyDefaultPopupSize()
      })
      await this.refresh({ network: true })
    })()
  }

  disconnectedCallback(): void {
    if (this.toastTimer) {
      clearTimeout(this.toastTimer)
    }
    this.versionFooterComboCleanup?.()
    this.versionFooterComboCleanup = null
    this.closeShellDisableMenu()
  }

  private bindEvents(): void {
    this.querySelector('[data-action="options"]')?.addEventListener('click', () => {
      void sendShellMessage({ type: 'OPEN_OPTIONS' })
    })
    this.querySelector('[data-action="shell-master"]')?.addEventListener('click', (event) => {
      event.stopPropagation()
      this.handleShellMasterClick()
    })
    this.querySelector('[data-action="shell-disable-tab"]')?.addEventListener('click', (event) => {
      event.stopPropagation()
      this.closeShellDisableMenu()
      void this.run(() => sendShellMessage({ type: 'SET_SHELL_ENABLED', enabled: false, scope: 'tab' }), 'shell-master')
    })
    this.querySelector('[data-action="shell-disable-all"]')?.addEventListener('click', (event) => {
      event.stopPropagation()
      this.closeShellDisableMenu()
      void this.run(() => sendShellMessage({ type: 'SET_SHELL_ENABLED', enabled: false, scope: 'global' }), 'shell-master')
    })
    this.querySelector('[data-action="shell-reload"]')?.addEventListener('click', (event) => {
      event.stopPropagation()
      this.closeShellDisableMenu()
      void this.reloadExtension()
    })
    this.querySelector('[data-action="update"]')?.addEventListener('click', () => {
      void this.run(() => sendShellMessage({ type: 'UPDATE_RUNTIME' }), 'update')
    })
    this.querySelector('[data-action="reset"]')?.addEventListener('click', () => {
      if (!window.confirm('Reset runtime state and reload?')) {
        return
      }
      void this.run(() => sendShellMessage({ type: 'RESET_RUNTIME' }), 'reset')
    })
    this.querySelector('[data-action="scripts"]')?.addEventListener('click', () => {
      void sendShellMessage({ type: 'OPEN_SCRIPTS_PAGE' })
    })
    this.querySelector('[data-action="rules-page"]')?.addEventListener('click', () => {
      void sendShellMessage({ type: 'OPEN_RULES_PAGE' })
    })
    this.querySelector('[data-action="rules"]')?.addEventListener('click', () => {
      void this.openRulesView()
    })
    this.querySelector('[data-action="open-agent"]')?.addEventListener('click', () => {
      void openAgentSidePanelFromUserGesture()
        .then(() => window.close())
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : 'Failed to open Agent panel'
          this.showToast(message, true)
        })
    })
    this.querySelector('[data-action="rules-back"]')?.addEventListener('click', () => {
      this.openMainView()
    })
    this.querySelector('[data-action="sync-rules"]')?.addEventListener('click', () => {
      void this.run(() => sendShellMessage({ type: 'SYNC_RULES' }), 'sync-rules')
    })
    this.querySelector('[data-ref="extension-update"]')?.addEventListener('click', () => {
      void this.downloadExtensionUpdate()
    })
    this.bindVersionFooterComboDownload()
    this.querySelector('[data-ref="network"]')?.addEventListener('change', (e) => {
      const checked = (e.target as HTMLInputElement).checked
      void this.run(() => sendShellMessage({ type: 'SET_NETWORK', enabled: checked }), 'network')
    })
    this.querySelectorAll('[data-log-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = (btn as HTMLElement).dataset.logMode
        if (mode === 'console' || mode === 'logviewer' || mode === 'none') {
          void this.setLogOutputMode(mode)
        }
      })
    })
    this.querySelector('[data-action="quick-add-rule"]')?.addEventListener('click', () => {
      void this.submitQuickRule()
    })
    this.querySelector('[data-ref="quick-template"]')?.addEventListener('change', () => {
      this.applyQuickRuleTemplate()
    })
    this.querySelector('[data-ref="quick-pattern"]')?.addEventListener('input', () => {
      this.syncQuickTemplateFromPatternInput()
    })
  }

  private bindVersionFooterComboDownload(): void {
    const version = this.querySelector('[data-ref="version"]') as HTMLElement | null
    if (!version) {
      return
    }
    this.versionFooterComboCleanup?.()
    this.versionFooterComboCleanup = bindComboClickTrigger(version, {
      targetCount: POPUP_VERSION_FOOTER_COMBO_CLICKS,
      onTrigger: () => this.triggerExtensionDownloadFromVersionCombo(),
    })
  }

  /** Easter egg: rapid-click version footer to fetch and download the latest extension ZIP. */
  private async triggerExtensionDownloadFromVersionCombo(): Promise<void> {
    if (this.versionFooterDownloadPending) {
      return
    }
    this.versionFooterDownloadPending = true
    try {
      const config = await loadExtensionConfig()
      const baseUrl = config.baseUrl?.trim() ?? ''
      if (!baseUrl) {
        this.showToast('Configure server in Options first', true)
        return
      }
      const info = await fetchExtensionUpdateInfo(baseUrl, getExtensionVersion(), { skipCache: true })
      if (info.updateAvailable && info.downloadUrl) {
        try {
          await chrome.tabs.create({ url: info.downloadUrl })
        } catch {
          this.showToast('Failed to open download', true)
        }
        return
      }
      if (info.latestVersion) {
        this.showToast('插件已经是最新的')
        return
      }
      this.showToast('Could not check extension version', true)
    } finally {
      this.versionFooterDownloadPending = false
    }
  }

  private getActionIconSlot(action: string): HTMLElement | null {
    if (action === 'network') {
      return this.querySelector('.mm-switch-row [data-icon="network"]')
    }
    if (action === 'shell-master') {
      return this.querySelector('[data-ref="shell-master-icon"]')
    }
    return this.querySelector(`[data-action="${action}"] [data-icon]`)
  }

  private openRulesView(): void {
    const main = this.querySelector('[data-ref="main-view"]') as HTMLElement | null
    const rules = this.querySelector('[data-ref="rules-view"]') as HTMLElement | null
    if (!main || !rules) return
    main.classList.add('hidden')
    rules.classList.remove('hidden')
    this.syncPopupBottomLayout(true)
    this.applyDefaultPopupSize()
    this.applySubViewSizeFromDefault()
    void this.refreshQuickRuleContext()
  }

  private openMainView(): void {
    const main = this.querySelector('[data-ref="main-view"]') as HTMLElement | null
    const rules = this.querySelector('[data-ref="rules-view"]') as HTMLElement | null
    if (!main || !rules) return
    rules.classList.add('hidden')
    main.classList.remove('hidden')
    this.syncPopupBottomLayout(false)
    rules.style.removeProperty('height')
    this.applyDefaultPopupSize()
  }

  /** Footer visibility on rules sub-view; toast stays fixed to shell bottom. */
  private syncPopupBottomLayout(rulesOpen: boolean): void {
    const footer = this.querySelector('[data-ref="footer"]') as HTMLElement | null
    footer?.classList.toggle('hidden', rulesOpen)
  }

  private captureDefaultPopupSize(): void {
    if (this.defaultPopupSize) {
      return
    }
    const shell = this.querySelector('[data-ref="popup-shell"]') as HTMLElement | null
    if (!shell) {
      return
    }
    // Toast is absolute/out of flow — natural shell height excludes it (capture before applyDefaultPopupSize locks size).
    const rect = shell.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0) {
      this.defaultPopupSize = {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      }
    }
  }

  private applyDefaultPopupSize(): void {
    const shell = this.querySelector('[data-ref="popup-shell"]') as HTMLElement | null
    if (!shell) {
      return
    }
    if (!this.defaultPopupSize) {
      this.captureDefaultPopupSize()
    }
    if (!this.defaultPopupSize) {
      return
    }
    shell.style.width = `${this.defaultPopupSize.width}px`
    shell.style.height = `${this.defaultPopupSize.height}px`
  }

  private applySubViewSizeFromDefault(): void {
    if (!this.defaultPopupSize) {
      return
    }
    const rules = this.querySelector('[data-ref="rules-view"]') as HTMLElement | null
    if (!rules) {
      return
    }
    rules.style.height = `${this.defaultPopupSize.height}px`
  }

  private setActionLoading(action: string, loading: boolean): void {
    const iconSlot = this.getActionIconSlot(action)
    if (iconSlot) {
      setIconSlotLoading(iconSlot, loading)
    }

    if (action === 'network') {
      const input = this.querySelector('[data-ref="network"]') as HTMLInputElement | null
      if (input) {
        input.disabled = loading
      }
      return
    }

    if (action === 'shell-master') {
      const btn = this.querySelector('[data-action="shell-master"]') as HTMLButtonElement | null
      if (btn) {
        btn.disabled = loading
      }
      this.querySelectorAll('[data-action="shell-disable-tab"], [data-action="shell-disable-all"], [data-action="shell-reload"]').forEach((el) => {
        ;(el as HTMLButtonElement).disabled = loading
      })
      return
    }

    if (action === 'log-output') {
      this.querySelectorAll<HTMLButtonElement>('[data-log-mode]').forEach((btn) => {
        btn.disabled = loading
      })
      const logNav = this.querySelector('[data-ref="log-output-tabs"]')
      if (logNav instanceof HTMLElement) {
        logNav.style.pointerEvents = loading ? 'none' : ''
        logNav.style.opacity = loading ? '0.6' : ''
      }
      return
    }

    const btn = this.querySelector(`[data-action="${action}"]`) as HTMLButtonElement | null
    if (btn) {
      btn.disabled = loading
    }
  }

  /**
   * Popup status toast — opacity overlay only.
   * Keep mm-popup-toast / mm-toast base classes (use classList, not className =).
   * Layout rules: popup.ejs + .mm-popup-toast in tailwind.css.
   */
  private showToast(text: string, isError = false): void {
    const toast = this.querySelector('[data-ref="toast"]') as HTMLElement | null
    if (!toast) {
      return
    }
    toast.textContent = text
    toast.classList.remove('mm-toast-visible', 'mm-toast-success', 'mm-toast-error')
    toast.classList.add('mm-toast-visible', isError ? 'mm-toast-error' : 'mm-toast-success')
    if (this.toastTimer) {
      clearTimeout(this.toastTimer)
    }
    this.toastTimer = setTimeout(() => {
      toast.classList.remove('mm-toast-visible', 'mm-toast-success', 'mm-toast-error')
      toast.textContent = ''
    }, 2500)
  }

  private logPopupAction(action: string, level: 'info' | 'warn' | 'error' = 'info', ...args: unknown[]): void {
    reportDebugLog({
      source: 'popup',
      scope: 'Popup',
      level,
      message: formatDebugLogMessage(action, ...args),
    })
  }

  private async run(action: () => Promise<{ ok: boolean; error?: string; message?: string }>, loadingAction: string, options?: { refreshNetwork?: boolean }): Promise<void> {
    this.setActionLoading(loadingAction, true)
    try {
      const res = await action()
      if (!res.ok) {
        this.logPopupAction(loadingAction, 'error', res.error ?? 'Failed')
        this.showToast(res.error ?? 'Failed', true)
        return
      }
      if (res.message) {
        this.logPopupAction(loadingAction, 'info', res.message)
        this.showToast(res.message)
      } else {
        this.logPopupAction(loadingAction, 'info', 'OK')
      }
      await this.refresh({ network: options?.refreshNetwork })
    } finally {
      this.setActionLoading(loadingAction, false)
    }
  }

  private async refresh(options?: { network?: boolean }): Promise<void> {
    const res = await sendShellMessage({ type: 'GET_STATUS', network: options?.network })
    if (!res.ok) {
      this.showToast(res.error, true)
      return
    }
    if (!('status' in res) || !res.status) {
      this.showToast('No status', true)
      return
    }
    const s = res.status
    const configured = s.enabledServiceCount > 0

    const subtitle = this.querySelector('[data-ref="subtitle"]')
    if (subtitle) {
      if (!configured) {
        subtitle.textContent = 'Configure in Servers'
        subtitle.classList.remove('hidden')
      } else {
        subtitle.textContent = this.formatRuntimeSummary(s.enabledServiceCount, s.enabledScriptCount)
        subtitle.classList.remove('hidden')
      }
    }

    const network = this.querySelector('[data-ref="network"]') as HTMLInputElement | null
    if (network) {
      network.checked = s.networkEnabled
    }
    this.syncLogOutputTabs(s.logOutputMode)
    this.renderVersionFooter({ presetVersion: s.presetVersion, runtimeStage: s.runtimeStage, presetLoading: false })
    this.renderExtensionUpdateHint(s)
    this.syncShellMasterSwitch(s)
    this.quickRuleCurrentUrl = s.activeTabUrl || ''
  }

  private syncShellMasterSwitch(status: { shellEnabledOnActiveTab: boolean; shellGloballyEnabled: boolean }): void {
    const enabled = status.shellEnabledOnActiveTab
    this.shellEnabledOnActiveTab = enabled
    const icon = this.querySelector('[data-ref="shell-master-icon"]') as HTMLElement | null
    const btn = this.querySelector('[data-action="shell-master"]') as HTMLButtonElement | null
    if (icon) {
      icon.dataset.icon = enabled ? 'serviceOn' : 'serviceOff'
      hydrateIconSlot(icon)
      icon.classList.toggle('mm-icon-slot-danger', !enabled)
    }
    if (btn) {
      btn.title = enabled ? 'Disable extension' : 'Extension disabled — click to enable'
      btn.setAttribute('aria-expanded', this.shellDisableMenuOpen ? 'true' : 'false')
    }
    if (!enabled) {
      this.closeShellDisableMenu()
    }
  }

  private handleShellMasterClick(): void {
    if (!this.shellEnabledOnActiveTab) {
      void this.run(() => sendShellMessage({ type: 'SET_SHELL_ENABLED', enabled: true }), 'shell-master')
      return
    }
    if (this.shellDisableMenuOpen) {
      this.closeShellDisableMenu()
      return
    }
    this.openShellDisableMenu()
  }

  private openShellDisableMenu(): void {
    const menu = this.querySelector('[data-ref="shell-disable-menu"]') as HTMLElement | null
    const btn = this.querySelector('[data-action="shell-master"]') as HTMLButtonElement | null
    if (!menu) {
      return
    }
    menu.classList.remove('hidden')
    this.shellDisableMenuOpen = true
    btn?.setAttribute('aria-expanded', 'true')
    if (this.shellDisableMenuOutsideListener) {
      return
    }
    this.shellDisableMenuOutsideListener = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Node)) {
        return
      }
      if (menu.contains(target) || btn?.contains(target)) {
        return
      }
      this.closeShellDisableMenu()
    }
    window.setTimeout(() => {
      document.addEventListener('click', this.shellDisableMenuOutsideListener!)
    }, 0)
  }

  private closeShellDisableMenu(): void {
    const menu = this.querySelector('[data-ref="shell-disable-menu"]') as HTMLElement | null
    const btn = this.querySelector('[data-action="shell-master"]') as HTMLButtonElement | null
    menu?.classList.add('hidden')
    this.shellDisableMenuOpen = false
    btn?.setAttribute('aria-expanded', 'false')
    if (this.shellDisableMenuOutsideListener) {
      document.removeEventListener('click', this.shellDisableMenuOutsideListener)
      this.shellDisableMenuOutsideListener = null
    }
  }

  private async reloadExtension(): Promise<void> {
    this.closeShellDisableMenu()
    try {
      await captureAdminPageForDevReload()
    } catch {
      // ignore capture errors; reload should still proceed
    }
    try {
      await sendShellMessage({ type: 'RELOAD_ACTIVE_TAB' })
    } catch {
      // ignore tab reload errors (e.g. chrome://); extension reload should still proceed
    }
    chrome.runtime.reload()
  }

  private renderExtensionUpdateHint(status: { extensionUpdateAvailable: boolean; latestExtensionVersion: string | null; extensionDownloadUrl: string | null }): void {
    const button = this.querySelector('[data-ref="extension-update"]') as HTMLButtonElement | null
    if (!button) {
      return
    }
    const show = status.extensionUpdateAvailable && Boolean(status.extensionDownloadUrl)
    button.classList.toggle('hidden', !show)
    this.extensionDownloadUrl = show ? status.extensionDownloadUrl : null
    if (show && status.latestExtensionVersion) {
      button.title = `Download extension v${status.latestExtensionVersion}`
    } else {
      button.title = 'Download latest extension'
    }
  }

  private ensureVersionFooterInitial(): void {
    const version = this.querySelector('[data-ref="version"]') as HTMLElement | null
    if (!version?.textContent?.trim()) {
      this.renderVersionFooter({ presetLoading: true })
    }
  }

  private renderVersionFooter(options?: { presetVersion?: string | null; runtimeStage?: 'stable' | 'alpha' | null; presetLoading?: boolean }): void {
    const version = this.querySelector('[data-ref="version"]') as HTMLElement | null
    if (!version) {
      return
    }
    const presetVersion = options?.presetVersion
    const presetLoading = options?.presetLoading === true && !presetVersion?.trim()
    version.textContent = formatPopupVersionFooter(getExtensionVersion(), presetVersion, {
      presetLoading,
      runtimeStage: options?.runtimeStage ?? null,
    })
    version.classList.toggle('mm-popup-footer-version-loading', presetLoading)
  }

  /** Read last-known preset semver from local storage before background GET_STATUS returns. */
  private async hydrateCachedPresetVersion(): Promise<void> {
    try {
      const config = await loadExtensionConfig()
      const gmScope = config.scriptKey.trim() ? await loadGmScopeForScriptKey(config.scriptKey, config.baseUrl) : ''
      const [presetVersion, runtimeStage] = await Promise.all([readPresetProjectVersion(config, gmScope), readRuntimeOtaStage(config, gmScope)])
      if (presetVersion?.trim() || runtimeStage) {
        this.renderVersionFooter({ presetVersion, runtimeStage })
      }
    } catch {
      // Keep manifest + loading placeholder until refresh() resolves.
    }
  }

  private async downloadExtensionUpdate(): Promise<void> {
    const url = this.extensionDownloadUrl
    if (!url) {
      return
    }
    try {
      await chrome.tabs.create({ url })
    } catch {
      this.showToast('Failed to open download', true)
    }
  }

  private formatRuntimeSummary(serverCount: number, scriptCount: number): string {
    const servers = Math.max(0, Number.isFinite(serverCount) ? serverCount : 0)
    const scripts = Math.max(0, Number.isFinite(scriptCount) ? scriptCount : 0)
    const serversLabel = `${servers} servers`
    const scriptsLabel = `${scripts} scripts`
    return `${serversLabel} · ${scriptsLabel}`
  }

  private deriveWildcardByTemplate(url: string, template: 'host' | 'path' | 'exact'): string {
    if (!url.startsWith('http://') && !url.startsWith('https://')) return ''
    try {
      const parsed = new URL(url)
      if (template === 'exact') return parsed.href
      if (template === 'path') {
        const cleanPath = parsed.pathname.endsWith('/') ? parsed.pathname : `${parsed.pathname}/`
        return `${parsed.protocol}//${parsed.host}${cleanPath}*`
      }
      return `${parsed.protocol}//${parsed.host}/*`
    } catch {
      return ''
    }
  }

  private applyQuickRuleTemplate(): void {
    const patternInput = this.querySelector('[data-ref="quick-pattern"]') as HTMLInputElement | null
    const templateInput = this.querySelector('[data-ref="quick-template"]') as HTMLInputElement | null
    if (!patternInput || !templateInput) return
    if (templateInput.value === 'custom') {
      return
    }
    const template = (templateInput.value === 'path' || templateInput.value === 'exact' ? templateInput.value : 'host') as 'host' | 'path' | 'exact'
    const next = this.deriveWildcardByTemplate(this.quickRuleCurrentUrl, template)
    if (next) patternInput.value = next
  }

  private setQuickTemplateValue(value: 'host' | 'path' | 'exact' | 'custom'): void {
    const templateInput = this.querySelector('[data-ref="quick-template"]') as HTMLInputElement | null
    const templateSelect = templateInput?.closest('mm-select') as HTMLElement | null
    if (!templateInput || !templateSelect) {
      return
    }

    const labelMap: Record<'host' | 'path' | 'exact' | 'custom', string> = {
      host: 'Current Host',
      path: 'Current Path',
      exact: 'Exact URL',
      custom: 'Custom',
    }
    templateInput.value = value
    const valueEl = templateSelect.querySelector('[data-ref="select-value"]') as HTMLElement | null
    if (valueEl) {
      valueEl.textContent = labelMap[value]
    }
    templateSelect.querySelectorAll<HTMLElement>('.mm-select-menu [data-value]').forEach((option) => {
      const selected = option.dataset.value === value
      option.setAttribute('aria-selected', String(selected))
      option.removeAttribute('hidden')
    })
  }

  private syncQuickTemplateFromPatternInput(): void {
    const patternInput = this.querySelector('[data-ref="quick-pattern"]') as HTMLInputElement | null
    if (!patternInput) {
      return
    }
    const value = patternInput.value.trim()
    const hostPattern = this.deriveWildcardByTemplate(this.quickRuleCurrentUrl, 'host')
    const pathPattern = this.deriveWildcardByTemplate(this.quickRuleCurrentUrl, 'path')
    const exactPattern = this.deriveWildcardByTemplate(this.quickRuleCurrentUrl, 'exact')
    if (value && value === hostPattern) {
      this.setQuickTemplateValue('host')
      return
    }
    if (value && value === pathPattern) {
      this.setQuickTemplateValue('path')
      return
    }
    if (value && value === exactPattern) {
      this.setQuickTemplateValue('exact')
      return
    }
    this.setQuickTemplateValue('custom')
  }

  private async refreshQuickRuleContext(): Promise<void> {
    const res = await sendShellMessage({ type: 'GET_QUICK_ADD_RULE_CONTEXT' })
    if (!res.ok || !('quickAddRuleContext' in res) || !res.quickAddRuleContext) {
      return
    }
    this.quickRuleCurrentUrl = res.quickAddRuleContext.activeTabUrl || this.quickRuleCurrentUrl
    const scriptSelect = this.querySelector('[data-ref="quick-script"]') as SearchSelectElement | null
    if (!scriptSelect) return
    const options = buildQuickRuleScriptSelectOptions(res.quickAddRuleContext.items)
    options.sort((a, b) => Number(b.matched) - Number(a.matched) || a.label.localeCompare(b.label))
    scriptSelect.setOptions(options.map((opt) => ({ value: opt.value, label: opt.matched ? `${opt.label} [match]` : opt.label })))
    const recent = await chrome.storage.local.get(MmPopupApp.QUICK_RULE_RECENT_SCRIPT_KEY)
    const recentValue = typeof recent[MmPopupApp.QUICK_RULE_RECENT_SCRIPT_KEY] === 'string' ? (recent[MmPopupApp.QUICK_RULE_RECENT_SCRIPT_KEY] as string) : ''
    const chosen = this.quickRuleLastSelected || recentValue
    if (chosen) {
      scriptSelect.setValue(chosen)
    }
    const patternInput = this.querySelector('[data-ref="quick-pattern"]') as HTMLInputElement | null
    if (patternInput && !patternInput.value.trim()) {
      this.applyQuickRuleTemplate()
    }
  }

  private async addQuickRule(): Promise<{ ok: boolean; error?: string; message?: string }> {
    const scriptSelect = this.querySelector('[data-ref="quick-script"]') as SearchSelectElement | null
    const selected = scriptSelect?.getValue().trim() ?? ''
    const wildcard = (this.querySelector('[data-ref="quick-pattern"]') as HTMLInputElement | null)?.value.trim() ?? ''
    const mode = ((this.querySelector('[data-ref="quick-mode"]') as HTMLInputElement | null)?.value === 'exclude' ? 'exclude' : 'include') as 'include' | 'exclude'
    if (!selected || !wildcard) {
      return { ok: false, error: 'Select script and wildcard first.' }
    }
    const separator = selected.indexOf('|')
    if (separator <= 0) {
      return { ok: false, error: 'Invalid script selection.' }
    }
    const scriptKey = selected.slice(0, separator)
    const script = selected.slice(separator + 1)
    this.quickRuleLastSelected = selected
    await chrome.storage.local.set({ [MmPopupApp.QUICK_RULE_RECENT_SCRIPT_KEY]: selected })
    const res = await sendShellMessage({ type: 'ADD_LOCAL_RULE', details: { scriptKey, script, wildcard, mode } })
    if (!res.ok) {
      return { ok: false, error: res.error }
    }
    return { ok: true, message: 'message' in res ? (res.message ?? 'Local rule added.') : 'Local rule added.' }
  }

  private syncLogOutputTabs(mode: ShellLogOutputMode): void {
    const tabs = this.querySelectorAll<HTMLButtonElement>('[data-log-mode]')
    tabs.forEach((btn) => {
      if (btn.dataset.logMode === mode) {
        btn.setAttribute('aria-current', 'page')
      } else {
        btn.removeAttribute('aria-current')
      }
    })
    syncAdminNavIndicator(this)
  }

  private async setLogOutputMode(mode: ShellLogOutputMode): Promise<void> {
    this.syncLogOutputTabs(mode)
    this.setActionLoading('log-output', true)
    try {
      const res = await sendShellMessage({ type: 'SET_LOG_OUTPUT_MODE', mode })
      if (!res.ok) {
        this.showToast(res.error ?? 'Failed', true)
        await this.refresh({ network: false })
        return
      }
      this.logPopupAction('log-output', 'info', 'OK')
    } finally {
      this.setActionLoading('log-output', false)
    }
  }

  private async submitQuickRule(): Promise<void> {
    this.setActionLoading('quick-add-rule', true)
    try {
      const res = await this.addQuickRule()
      if (!res.ok) {
        this.showToast(res.error ?? 'Failed', true)
        return
      }
      if (res.message) {
        this.showToast(res.message)
      }
      await this.refresh({ network: false })
    } finally {
      this.setActionLoading('quick-add-rule', false)
    }
  }
}
