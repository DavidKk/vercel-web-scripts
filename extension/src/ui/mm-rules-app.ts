import { buildQuickRuleScriptSelectOptions } from '@ext/shared/extension-storage'
import { sendShellMessage } from '@ext/shared/messages'

import { buildAdminHash, parseAdminHash } from './mm-admin-hash'
import { hydrateMmIcons } from './mm-icons'
import { type RulesHashRoute } from './mm-rules-hash'
import { MmToast } from './mm-toast'
import { initMmTooltipDelegation } from './mm-tooltip'

type SearchSelectOption = { value: string; label: string }

type SearchSelectElement = HTMLElement & {
  setOptions: (options: SearchSelectOption[]) => void
  setValue: (value: string) => void
  getValue: () => string
}

type DetailMode = 'empty' | 'create' | 'edit'

type LocalRuleRow = {
  id: string
  scriptKey: string
  script: string
  scriptName: string
  scriptFile: string
  wildcard: string
  mode: 'include' | 'exclude'
}

type RulesEditorRule = Pick<LocalRuleRow, 'id' | 'scriptKey' | 'script' | 'wildcard' | 'mode'>

export class MmRulesApp extends HTMLElement {
  private static readonly QUICK_RULE_RECENT_SCRIPT_KEY = 'vws_popup_quick_rule_recent_script'
  private currentUrl = ''
  private createMode = false
  private editingRule: RulesEditorRule | null = null
  private lastRulesList: LocalRuleRow[] = []
  private scriptSelectOptions: SearchSelectOption[] = []
  private suppressHashRoute = false
  private readonly toast = new MmToast(document)
  private readonly onHashChange = (): void => {
    if (this.suppressHashRoute) {
      return
    }
    void this.applyRouteFromHash()
  }

  connectedCallback(): void {
    initMmTooltipDelegation(this)
    hydrateMmIcons(this)
    this.bindEvents()
    void this.reload()
  }

  disconnectedCallback(): void {
    window.removeEventListener('hashchange', this.onHashChange)
  }

  private bindEvents(): void {
    window.addEventListener('hashchange', this.onHashChange)
    this.querySelector('[data-ref="script-select"]')?.addEventListener('mm-search-select-change', (event) => {
      const value = (event as CustomEvent<{ value: string }>).detail?.value?.trim() ?? ''
      if (!value || this.editingRule) {
        return
      }
      this.syncHashRoute({ kind: 'script', scriptValue: value })
    })
    this.querySelector('[data-action="add-rule"]')?.addEventListener('click', () => {
      void this.addRule()
    })
    this.querySelector('[data-action="start-add-rule"]')?.addEventListener('click', () => {
      this.enterCreateMode()
    })
    this.querySelector('[data-ref="template"]')?.addEventListener('change', () => {
      this.applyTemplate()
    })
    this.querySelector('[data-ref="pattern"]')?.addEventListener('input', () => {
      this.syncTemplateFromPatternInput()
    })
    this.querySelector('[data-action="reset-edit"]')?.addEventListener('click', () => {
      this.resetEditorByMode()
    })
    this.querySelector('[data-action="delete-rule"]')?.addEventListener('click', () => {
      void this.deleteCurrentRule()
    })
  }

  private getScriptSelect(): SearchSelectElement | null {
    return this.querySelector('[data-ref="script-select"]') as SearchSelectElement | null
  }

  private scriptOptionExists(value: string): boolean {
    return this.scriptSelectOptions.some((option) => option.value === value)
  }

  private setScriptSelectValue(value: string): void {
    if (!value || !this.scriptOptionExists(value)) {
      return
    }
    this.getScriptSelect()?.setValue(value)
  }

  private syncHashRoute(route: RulesHashRoute): void {
    const nextHash = buildAdminHash({ tab: 'rules', rules: route })
    if (location.hash === nextHash) {
      return
    }
    this.suppressHashRoute = true
    history.replaceState(null, '', nextHash)
    queueMicrotask(() => {
      this.suppressHashRoute = false
    })
  }

  private syncHashRouteFromState(): void {
    if (this.editingRule) {
      this.syncHashRoute({ kind: 'rule', ruleId: this.editingRule.id })
      return
    }
    if (this.createMode) {
      const scriptValue = this.getScriptSelect()?.getValue().trim() ?? ''
      this.syncHashRoute(scriptValue ? { kind: 'script', scriptValue } : { kind: 'new' })
      return
    }
    this.syncHashRoute({ kind: 'empty' })
  }

  private async applyRouteFromHash(): Promise<void> {
    const adminRoute = parseAdminHash(location.hash)
    if (adminRoute.tab !== 'rules') {
      return
    }
    const route = adminRoute.rules
    if (route.kind === 'empty') {
      if (this.createMode || this.editingRule) {
        this.enterEmptyMode({ syncHash: false })
      }
      return
    }

    if (route.kind === 'rule') {
      const row = this.lastRulesList.find((item) => item.id === route.ruleId)
      if (!row) {
        this.toast.show('Local rule not found.', 'error')
        this.enterEmptyMode({ syncHash: false })
        return
      }
      this.enterEditMode(row, { syncHash: false })
      return
    }

    this.enterCreateMode({ syncHash: false })
    if (route.kind === 'script') {
      this.setScriptSelectValue(route.scriptValue)
    }
  }

  private deriveWildcard(url: string, template: 'host' | 'path' | 'exact'): string {
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

  private applyTemplate(): void {
    const input = this.querySelector('[data-ref="pattern"]') as HTMLInputElement | null
    const templateInput = this.querySelector('[data-ref="template"]') as HTMLInputElement | null
    if (!input || !templateInput) return
    if (templateInput.value === 'custom') return
    const template = (templateInput.value === 'path' || templateInput.value === 'exact' ? templateInput.value : 'host') as 'host' | 'path' | 'exact'
    const next = this.deriveWildcard(this.currentUrl, template)
    if (next) input.value = next
  }

  private setTemplateValue(value: 'host' | 'path' | 'exact' | 'custom'): void {
    const templateInput = this.querySelector('[data-ref="template"]') as HTMLInputElement | null
    const templateSelect = templateInput?.closest('mm-select') as HTMLElement | null
    if (!templateInput || !templateSelect) return
    templateInput.value = value
    const labelMap: Record<'host' | 'path' | 'exact' | 'custom', string> = {
      host: 'Current Host',
      path: 'Current Path',
      exact: 'Exact URL',
      custom: 'Custom',
    }
    const valueEl = templateSelect.querySelector('[data-ref="select-value"]') as HTMLElement | null
    if (valueEl) valueEl.textContent = labelMap[value]
    templateSelect.querySelectorAll<HTMLElement>('[data-value]').forEach((option) => {
      const selected = option.dataset.value === value
      option.setAttribute('aria-selected', String(selected))
      option.hidden = selected
    })
  }

  private setModeValue(value: 'include' | 'exclude'): void {
    const modeInput = this.querySelector('[data-ref="mode"]') as HTMLInputElement | null
    const modeSelect = modeInput?.closest('mm-select') as HTMLElement | null
    if (!modeInput || !modeSelect) return
    modeInput.value = value
    const valueEl = modeSelect.querySelector('[data-ref="select-value"]') as HTMLElement | null
    if (valueEl) valueEl.textContent = value === 'exclude' ? 'Exclude' : 'Include'
    modeSelect.querySelectorAll<HTMLElement>('[data-value]').forEach((option) => {
      const selected = option.dataset.value === value
      option.setAttribute('aria-selected', String(selected))
      option.hidden = selected
    })
  }

  private syncTemplateFromPatternInput(): void {
    const input = this.querySelector('[data-ref="pattern"]') as HTMLInputElement | null
    if (!input) return
    const value = input.value.trim()
    const host = this.deriveWildcard(this.currentUrl, 'host')
    const path = this.deriveWildcard(this.currentUrl, 'path')
    const exact = this.deriveWildcard(this.currentUrl, 'exact')
    if (value && value === host) return this.setTemplateValue('host')
    if (value && value === path) return this.setTemplateValue('path')
    if (value && value === exact) return this.setTemplateValue('exact')
    this.setTemplateValue('custom')
  }

  private renderPatternAutocomplete(): void {
    const datalist = this.querySelector('#rule-pattern-suggestions') as HTMLDataListElement | null
    if (!datalist) return
    const values = [this.deriveWildcard(this.currentUrl, 'host'), this.deriveWildcard(this.currentUrl, 'path'), this.deriveWildcard(this.currentUrl, 'exact')].filter(
      (value, index, array): value is string => Boolean(value) && array.indexOf(value) === index
    )
    datalist.replaceChildren(
      ...values.map((value) => {
        const option = document.createElement('option')
        option.value = value
        return option
      })
    )
  }

  private async reload(): Promise<void> {
    const res = await sendShellMessage({ type: 'GET_QUICK_ADD_RULE_CONTEXT' })
    if (!res.ok || !('quickAddRuleContext' in res) || !res.quickAddRuleContext) {
      this.toast.show('Failed to load rule context.', 'error')
      return
    }

    this.currentUrl = res.quickAddRuleContext.activeTabUrl || ''
    this.renderPatternAutocomplete()
    const scriptSelect = this.getScriptSelect()
    if (!scriptSelect) return

    const options = buildQuickRuleScriptSelectOptions(res.quickAddRuleContext.items)
    options.sort((a, b) => Number(b.matched) - Number(a.matched) || a.label.localeCompare(b.label))
    this.scriptSelectOptions = options.map((opt) => ({ value: opt.value, label: opt.matched ? `${opt.label} [match]` : opt.label }))
    scriptSelect.setOptions(this.scriptSelectOptions)

    await this.reloadRulesList()

    const adminRoute = parseAdminHash(location.hash)
    if (adminRoute.tab === 'rules' && adminRoute.rules.kind !== 'empty') {
      await this.applyRouteFromHash()
    } else {
      const recent = await chrome.storage.local.get(MmRulesApp.QUICK_RULE_RECENT_SCRIPT_KEY)
      const recentValue = typeof recent[MmRulesApp.QUICK_RULE_RECENT_SCRIPT_KEY] === 'string' ? (recent[MmRulesApp.QUICK_RULE_RECENT_SCRIPT_KEY] as string) : ''
      if (recentValue) {
        scriptSelect.setValue(recentValue)
      }
    }

    const patternInput = this.querySelector('[data-ref="pattern"]') as HTMLInputElement | null
    if (patternInput && !patternInput.value.trim()) this.applyTemplate()
    this.syncDetailModeUi()
  }

  private async addRule(): Promise<void> {
    const scriptSelect = this.querySelector('[data-ref="script-select"]') as SearchSelectElement | null
    const selected = scriptSelect?.getValue().trim() ?? ''
    const wildcard = (this.querySelector('[data-ref="pattern"]') as HTMLInputElement | null)?.value.trim() ?? ''
    const mode = ((this.querySelector('[data-ref="mode"]') as HTMLInputElement | null)?.value === 'exclude' ? 'exclude' : 'include') as 'include' | 'exclude'
    if (!selected || !wildcard) {
      this.toast.show('Please choose script and pattern.', 'error')
      return
    }
    const separator = selected.indexOf('|')
    if (separator <= 0) {
      this.toast.show('Invalid script selection.', 'error')
      return
    }
    const scriptKey = selected.slice(0, separator)
    const script = selected.slice(separator + 1)

    if (this.editingRule) {
      const old = this.editingRule
      if (old.scriptKey !== scriptKey || old.script !== script || old.wildcard !== wildcard || old.mode !== mode) {
        await sendShellMessage({ type: 'REMOVE_LOCAL_RULE', details: { scriptKey: old.scriptKey, script: old.script, wildcard: old.wildcard, mode: old.mode } })
      }
    }
    await chrome.storage.local.set({ [MmRulesApp.QUICK_RULE_RECENT_SCRIPT_KEY]: selected })
    const res = await sendShellMessage({ type: 'ADD_LOCAL_RULE', details: { scriptKey, script, wildcard, mode } })
    if (!res.ok) {
      this.toast.show(res.error, 'error')
      return
    }
    this.enterEmptyMode()
    this.toast.show('message' in res ? (res.message ?? 'Local rule added.') : 'Local rule added.', 'success')
    await this.reload()
  }

  private enterEmptyMode(options: { syncHash?: boolean } = {}): void {
    this.createMode = false
    this.editingRule = null
    this.setDetailMode('empty')
    void this.reloadRulesList()
    if (options.syncHash !== false) {
      this.syncHashRouteFromState()
    }
  }

  private enterCreateMode(options: { syncHash?: boolean } = {}): void {
    this.createMode = true
    this.editingRule = null
    this.resetEditorForm()
    this.setDetailMode('create')
    void this.reloadRulesList()
    if (options.syncHash !== false) {
      this.syncHashRouteFromState()
    }
  }

  private enterEditMode(rule: RulesEditorRule, options: { syncHash?: boolean } = {}): void {
    this.createMode = false
    this.editingRule = rule
    const input = this.querySelector('[data-ref="pattern"]') as HTMLInputElement | null
    if (input) input.value = rule.wildcard
    this.setTemplateValue('custom')
    this.setModeValue(rule.mode)
    this.getScriptSelect()?.setValue(`${rule.scriptKey}|${rule.script}`)
    this.setDetailMode('edit')
    void this.reloadRulesList()
    if (options.syncHash !== false) {
      this.syncHashRouteFromState()
    }
  }

  private resetEditorForm(): void {
    this.editingRule = null
    this.setModeValue('include')
    this.setTemplateValue('host')
    const patternInput = this.querySelector('[data-ref="pattern"]') as HTMLInputElement | null
    if (patternInput) {
      patternInput.value = this.deriveWildcard(this.currentUrl, 'host')
    }
    const adminRoute = parseAdminHash(location.hash)
    const scriptValue = adminRoute.tab === 'rules' && adminRoute.rules.kind === 'script' ? adminRoute.rules.scriptValue : ''
    this.getScriptSelect()?.setValue(scriptValue)
  }

  private confirmResetEditor(): boolean {
    if (this.editingRule) {
      const row = this.editingRule
      return window.confirm(`Reset form to last saved values for this rule?\n\n[${row.mode}] ${row.script}\n${row.wildcard}\n\nUnsaved changes will be discarded.`)
    }
    if (this.createMode) {
      return window.confirm('Reset this form? Unsaved entries will be discarded.')
    }
    return false
  }

  private resetEditorByMode(): void {
    if (!this.confirmResetEditor()) {
      return
    }
    if (this.editingRule) {
      this.enterEditMode(this.editingRule)
      return
    }
    if (this.createMode) {
      this.resetEditorForm()
      return
    }
    this.enterEmptyMode()
  }

  private async deleteCurrentRule(): Promise<void> {
    if (!this.editingRule) {
      return
    }
    const row = this.editingRule
    const confirmed = window.confirm(`Delete this local rule?\n\n[${row.mode}] ${row.script}\n${row.wildcard}\n\nThis cannot be undone.`)
    if (!confirmed) {
      return
    }
    const rm = await sendShellMessage({ type: 'REMOVE_LOCAL_RULE', details: { scriptKey: row.scriptKey, script: row.script, wildcard: row.wildcard, mode: row.mode } })
    if (!rm.ok) {
      this.toast.show(rm.error, 'error')
      return
    }
    this.toast.show('message' in rm ? (rm.message ?? 'Local rule removed.') : 'Local rule removed.', 'success')
    this.enterEmptyMode()
    await this.reloadRulesList()
  }

  private renderListEmptyState(mode: 'empty' | 'error'): void {
    const emptyEl = this.querySelector('[data-ref="rules-empty"]') as HTMLElement | null
    if (!emptyEl) return
    emptyEl.replaceChildren()
    const icon = document.createElement('span')
    icon.className = 'mm-nodata-icon'
    icon.setAttribute('data-icon', 'nodata')
    icon.setAttribute('aria-hidden', 'true')

    const title = document.createElement('p')
    title.className = 'mm-nodata-title'
    title.textContent = mode === 'error' ? 'Failed to load local rules' : 'No local rules'

    const hint = document.createElement('p')
    hint.className = 'mm-nodata-hint'
    hint.textContent = mode === 'error' ? 'Please try again or refresh this page.' : 'Use + to create your first local include/exclude rule.'

    emptyEl.append(icon, title, hint)
    hydrateMmIcons(emptyEl)
  }

  private async reloadRulesList(): Promise<void> {
    const listEl = this.querySelector('[data-ref="rules-list"]') as HTMLElement | null
    const emptyEl = this.querySelector('[data-ref="rules-empty"]') as HTMLElement | null
    const scrollEl = this.querySelector('[data-ref="list-scroll"]') as HTMLElement | null
    if (!listEl || !emptyEl || !scrollEl) return
    const res = await sendShellMessage({ type: 'GET_LOCAL_RULES' })
    if (!res.ok || !('localRules' in res) || !res.localRules) {
      listEl.replaceChildren()
      listEl.classList.add('hidden')
      emptyEl.classList.remove('hidden')
      scrollEl.classList.add('is-empty')
      this.renderListEmptyState('error')
      this.toast.show('Failed to load local rules.', 'error')
      return
    }
    const rows = res.localRules
    this.lastRulesList = rows
    if (rows.length === 0) {
      listEl.replaceChildren()
      listEl.classList.add('hidden')
      emptyEl.classList.remove('hidden')
      scrollEl.classList.add('is-empty')
      this.renderListEmptyState('empty')
      if (!this.createMode) {
        this.setDetailMode('empty')
      }
      return
    }
    listEl.className = 'mm-rules-list mm-options-service-items'
    scrollEl.classList.remove('is-empty')
    emptyEl.classList.add('hidden')
    listEl.classList.remove('hidden')
    if (this.editingRule && !rows.some((row) => row.id === this.editingRule?.id)) {
      this.enterEmptyMode()
      return
    }
    listEl.replaceChildren(
      ...rows.map((row) => {
        const item = document.createElement('li')
        item.className = 'mm-options-service-row'
        item.dataset.ruleId = row.id

        const card = document.createElement('div')
        card.className = 'mm-options-service-card'
        card.setAttribute('role', 'option')
        card.dataset.ruleId = row.id
        card.dataset.ruleMode = row.mode
        card.setAttribute('aria-selected', String(!this.createMode && row.id === this.editingRule?.id))

        const body = document.createElement('button')
        body.type = 'button'
        body.className = 'mm-options-service-item-body'
        body.addEventListener('click', () => {
          if (!this.createMode && this.editingRule?.id === row.id) {
            this.enterEmptyMode()
            return
          }
          this.enterEditMode(row)
        })

        const modeIconWrap = document.createElement('span')
        modeIconWrap.className = `mm-rules-mode-icon ${row.mode === 'exclude' ? 'is-exclude' : 'is-include'}`
        modeIconWrap.setAttribute('aria-hidden', 'true')
        const modeIcon = document.createElement('span')
        modeIcon.className = 'mm-icon-slot'
        modeIcon.setAttribute('data-icon', row.mode === 'exclude' ? 'minus' : 'plus')
        modeIconWrap.append(modeIcon)

        const content = document.createElement('span')
        content.className = 'mm-rules-item-content'

        const label = document.createElement('span')
        label.className = 'mm-options-service-item-label mm-rules-item-label'

        const scriptText = document.createElement('span')
        scriptText.className = 'mm-rules-script-text'
        scriptText.textContent = row.scriptName || row.script

        const fileText = document.createElement('span')
        fileText.className = 'mm-rules-file-text'
        fileText.textContent = row.scriptFile || row.script

        label.append(scriptText, fileText)

        const meta = document.createElement('span')
        meta.className = 'mm-options-service-item-meta mm-rules-item-meta'
        const patternIcon = document.createElement('span')
        patternIcon.className = 'mm-rules-pattern-icon mm-icon-slot'
        patternIcon.setAttribute('data-icon', 'wildcard')
        patternIcon.setAttribute('aria-hidden', 'true')

        const patternText = document.createElement('span')
        patternText.className = 'mm-rules-pattern-text'
        patternText.textContent = row.wildcard

        meta.append(patternIcon, patternText)

        content.append(label, meta)
        body.append(modeIconWrap, content)

        const del = document.createElement('button')
        del.type = 'button'
        del.className = 'mm-servers-item-action'
        del.setAttribute('aria-label', 'Delete rule')
        del.setAttribute('data-mm-tooltip', 'Delete')
        del.setAttribute('data-mm-tooltip-placement', 'bottom')
        const deleteIcon = document.createElement('span')
        deleteIcon.className = 'mm-icon-slot'
        deleteIcon.setAttribute('data-icon', 'delete')
        del.append(deleteIcon)
        del.addEventListener('click', () => {
          void (async () => {
            const confirmed = window.confirm(`Delete this local rule?\n\n[${row.mode}] ${row.script}\n${row.wildcard}\n\nThis cannot be undone.`)
            if (!confirmed) {
              return
            }
            const rm = await sendShellMessage({ type: 'REMOVE_LOCAL_RULE', details: { scriptKey: row.scriptKey, script: row.script, wildcard: row.wildcard, mode: row.mode } })
            if (!rm.ok) {
              this.toast.show(rm.error, 'error')
              return
            }
            this.toast.show('message' in rm ? (rm.message ?? 'Local rule removed.') : 'Local rule removed.', 'success')
            if (this.editingRule?.id === row.id) {
              this.enterEmptyMode()
            }
            await this.reloadRulesList()
          })()
        })
        card.append(body, del)
        item.append(card)
        return item
      })
    )
    hydrateMmIcons(listEl)
  }

  private syncDetailModeUi(): void {
    if (this.createMode) {
      this.setDetailMode('create')
      return
    }
    if (this.editingRule) {
      this.setDetailMode('edit')
      return
    }
    this.setDetailMode('empty')
  }

  private setDetailMode(mode: DetailMode): void {
    const emptyEl = this.querySelector('[data-ref="detail-empty"]') as HTMLElement | null
    const formEl = this.querySelector('[data-ref="detail-form"]') as HTMLElement | null
    const bodyEl = this.querySelector('[data-ref="detail-body"]') as HTMLElement | null
    const deleteBtn = this.querySelector('[data-action="delete-rule"]') as HTMLButtonElement | null
    const resetBtn = this.querySelector('[data-action="reset-edit"]') as HTMLButtonElement | null
    emptyEl?.classList.toggle('hidden', mode !== 'empty')
    formEl?.classList.toggle('hidden', mode === 'empty')
    bodyEl?.classList.toggle('is-empty', mode === 'empty')
    if (deleteBtn) {
      deleteBtn.closest('mm-button')?.classList.toggle('hidden', mode !== 'edit')
      deleteBtn.disabled = mode !== 'edit'
    }
    if (resetBtn) {
      resetBtn.closest('mm-button')?.classList.toggle('hidden', mode === 'empty')
      resetBtn.disabled = mode === 'empty'
    }
  }
}
