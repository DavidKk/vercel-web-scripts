import { buildQuickRuleScriptSelectOptions, countEnabledScriptsForEnabledScriptKeys } from '@ext/shared/extension-storage'
import { sendShellMessage } from '@ext/shared/messages'
import type { ShellLogOutputMode } from '@shared/shell-log-output'

import { bindAdminNavIndicator, syncAdminNavIndicator } from './mm-admin-nav'
import { hydrateIconSlot, hydrateMmIcons, setIconSlotLoading } from './mm-icons'

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
    void this.refresh().then(() => {
      requestAnimationFrame(() => {
        this.captureDefaultPopupSize()
        this.applyDefaultPopupSize()
      })
    })
  }

  disconnectedCallback(): void {
    if (this.toastTimer) {
      clearTimeout(this.toastTimer)
    }
    this.closeShellDisableMenu()
  }

  private bindEvents(): void {
    this.querySelector('[data-action="options"]')?.addEventListener('click', () => {
      void sendShellMessage({ type: 'OPEN_OPTIONS' })
    })
    this.querySelector('[data-action="shell-master"]')?.addEventListener('click', (event) => {
      event.stopPropagation()
      void this.handleShellMasterClick()
    })
    this.querySelector('[data-action="shell-disable-tab"]')?.addEventListener('click', () => {
      this.closeShellDisableMenu()
      void this.run(() => sendShellMessage({ type: 'SET_SHELL_ENABLED', enabled: false, scope: 'tab' }), 'shell-master')
    })
    this.querySelector('[data-action="shell-disable-all"]')?.addEventListener('click', () => {
      this.closeShellDisableMenu()
      void this.run(() => sendShellMessage({ type: 'SET_SHELL_ENABLED', enabled: false, scope: 'global' }), 'shell-master')
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
    this.querySelector('[data-action="rules-back"]')?.addEventListener('click', () => {
      this.openMainView()
    })
    this.querySelector('[data-action="sync-rules"]')?.addEventListener('click', () => {
      void this.run(() => sendShellMessage({ type: 'SYNC_RULES' }), 'sync-rules')
    })
    this.querySelector('[data-ref="extension-update"]')?.addEventListener('click', () => {
      void this.downloadExtensionUpdate()
    })
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
      this.querySelectorAll('[data-action="shell-disable-tab"], [data-action="shell-disable-all"]').forEach((el) => {
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

  private async run(action: () => Promise<{ ok: boolean; error?: string; message?: string }>, loadingAction: string): Promise<void> {
    this.setActionLoading(loadingAction, true)
    try {
      const res = await action()
      if (!res.ok) {
        this.showToast(res.error ?? 'Failed', true)
        return
      }
      if (res.message) {
        this.showToast(res.message)
      }
      await this.refresh()
    } finally {
      this.setActionLoading(loadingAction, false)
    }
  }

  private async refresh(): Promise<void> {
    const [res, scriptTotals] = await Promise.all([sendShellMessage({ type: 'GET_STATUS' }), countEnabledScriptsForEnabledScriptKeys()])
    if (!res.ok) {
      this.showToast(res.error, true)
      return
    }
    if (!('status' in res) || !res.status) {
      this.showToast('No status', true)
      return
    }
    const s = res.status
    const configured = scriptTotals.serverCount > 0

    const subtitle = this.querySelector('[data-ref="subtitle"]')
    if (subtitle) {
      if (!configured) {
        subtitle.textContent = 'Configure in Servers'
        subtitle.classList.remove('hidden')
      } else {
        subtitle.textContent = this.formatRuntimeSummary(scriptTotals.serverCount, scriptTotals.enabledScriptCount)
        subtitle.classList.remove('hidden')
      }
    }

    const network = this.querySelector('[data-ref="network"]') as HTMLInputElement | null
    if (network) {
      network.checked = s.networkEnabled
    }
    this.syncLogOutputTabs(s.logOutputMode)
    const version = this.querySelector('[data-ref="version"]')
    if (version) {
      version.textContent = this.formatVersionFooter(s.extensionVersion, s.presetVersion)
    }
    this.renderExtensionUpdateHint(s)
    this.syncShellMasterSwitch(s)
    this.quickRuleCurrentUrl = s.activeTabUrl || ''
  }

  private syncShellMasterSwitch(status: { shellEnabledOnActiveTab: boolean; shellGloballyEnabled: boolean }): void {
    const enabled = status.shellEnabledOnActiveTab
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

  private async handleShellMasterClick(): Promise<void> {
    const res = await sendShellMessage({ type: 'GET_STATUS' })
    if (!res.ok || !('status' in res) || !res.status) {
      return
    }
    if (!res.status.shellEnabledOnActiveTab) {
      await this.run(() => sendShellMessage({ type: 'SET_SHELL_ENABLED', enabled: true }), 'shell-master')
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
      document.addEventListener('click', this.shellDisableMenuOutsideListener!, true)
    }, 0)
  }

  private closeShellDisableMenu(): void {
    const menu = this.querySelector('[data-ref="shell-disable-menu"]') as HTMLElement | null
    const btn = this.querySelector('[data-action="shell-master"]') as HTMLButtonElement | null
    menu?.classList.add('hidden')
    this.shellDisableMenuOpen = false
    btn?.setAttribute('aria-expanded', 'false')
    if (this.shellDisableMenuOutsideListener) {
      document.removeEventListener('click', this.shellDisableMenuOutsideListener, true)
      this.shellDisableMenuOutsideListener = null
    }
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

  private formatVersionFooter(extensionVersion: string, presetVersion: string | null): string {
    const ext = extensionVersion.trim() || '0.0.0'
    const preset = presetVersion?.trim() || '—'
    return `Preset v${preset} · Extension v${ext}`
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
    templateSelect.querySelectorAll<HTMLElement>('[data-value]').forEach((option) => {
      const selected = option.dataset.value === value
      option.setAttribute('aria-selected', String(selected))
      option.hidden = selected
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
    await this.run(() => sendShellMessage({ type: 'SET_LOG_OUTPUT_MODE', mode }), 'log-output')
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
      await this.refresh()
    } finally {
      this.setActionLoading('quick-add-rule', false)
    }
  }
}
