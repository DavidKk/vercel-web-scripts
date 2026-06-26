import {
  loadScriptEnabledMapForScriptKey,
  loadScriptInstalledMapForScriptKey,
  loadScriptKeyScriptsGroupsFromCache,
  type ScriptKeyScriptsGroupView,
  syncScriptKeyScriptsListIfNeeded,
} from '@ext/shared/extension-storage'
import { readAcceptAlphaMapForScriptKey } from '@ext/shared/extension-storage/accept-alpha'
import { LEGACY_SCRIPT_OTA_DEFAULTS } from '@shared/script-ota-policy'

import type { ScriptKeyGroupView, ScriptRow } from './mm-scripts-types'
import { createMockScriptKeyScriptsGroups, getScriptsDebugOverrides } from './scripts-debug-state'

export interface MmScriptsListDataHost {
  reloadToken: number
  groups: ScriptKeyGroupView[]
  enabledByKey: Map<string, boolean>
  acceptAlphaByFile: Map<string, boolean>
  scriptTogglesIncognito: boolean
  enabledMapKey(scriptKey: string, file: string): string
  acceptAlphaMapKey(scriptKey: string, file: string): string
  syncServiceFilterOptions(): void
  setLoading(loading: boolean): void
  showLoadingShell(): void
  presentError(message: string): void
  presentEmpty(html: string): void
  setListVisible(visible: boolean): void
  renderGroups(filtered: Array<{ group: ScriptKeyGroupView; rows: ScriptRow[] }>): void
  applyFilters(): void
}

async function applyScriptGroups(host: MmScriptsListDataHost, root: HTMLElement, groups: ScriptKeyScriptsGroupView[], emptyEl: HTMLElement): Promise<void> {
  const debug = getScriptsDebugOverrides()
  const totalScripts = groups.reduce((sum, g) => sum + g.scripts.length, 0)
  if (totalScripts === 0) {
    host.groups = []
    host.syncServiceFilterOptions()
    host.setListVisible(false)
    host.renderGroups([])
    return
  }

  emptyEl.classList.add('hidden')
  const errorEl = root.querySelector('[data-ref="error"]') as HTMLElement | null
  errorEl?.classList.add('hidden')

  const nextGroups: ScriptKeyGroupView[] = []
  let globalSortIndex = 0
  for (const group of groups) {
    const groupActive = group.active && !debug.forceInactiveGroups
    const enabledByName = await loadScriptEnabledMapForScriptKey(
      group.scriptKey,
      group.scripts.map((s) => s.file),
      { incognito: host.scriptTogglesIncognito }
    )
    const installedByName = await loadScriptInstalledMapForScriptKey(
      group.scriptKey,
      group.scripts.map((s) => s.file),
      new Map(group.scripts.map((s) => [s.file, s.contentHash]))
    )
    const serviceLabel = group.primaryServiceLabel
    const serviceUrl = group.editorBaseUrl.trim().replace(/\/+$/, '')
    const acceptAlphaMap = await readAcceptAlphaMapForScriptKey(
      group.scriptKey,
      group.scripts.map((s) => s.file)
    )
    const rows: ScriptRow[] = group.scripts.map((s) => {
      const installed = installedByName.get(s.file) !== false
      const enabled = installed && enabledByName.get(s.file) !== false
      host.enabledByKey.set(host.enabledMapKey(group.scriptKey, s.file), enabled)
      const ota = s.ota ?? LEGACY_SCRIPT_OTA_DEFAULTS
      const acceptAlpha = acceptAlphaMap.get(s.file) === true
      host.acceptAlphaByFile.set(host.acceptAlphaMapKey(group.scriptKey, s.file), acceptAlpha)
      return {
        scriptKey: group.scriptKey,
        file: s.file,
        label: s.name,
        description: s.description,
        icon: s.icon,
        version: s.version,
        author: s.author,
        contentHash: s.contentHash,
        updatedAt: s.updatedAt,
        ota,
        acceptAlpha,
        serviceLabel,
        serviceUrl,
        installed,
        enabled,
        groupActive,
        sortIndex: globalSortIndex++,
      }
    })
    nextGroups.push({ ...group, rows })
  }

  host.groups = nextGroups
  host.syncServiceFilterOptions()
  host.setListVisible(true)
  host.applyFilters()
}

/** Load script groups from cache/storage and refresh the list UI. */
export async function reloadList(host: MmScriptsListDataHost, root: HTMLElement, options?: { showShell?: boolean }): Promise<void> {
  const token = ++host.reloadToken
  const emptyEl = root.querySelector('[data-ref="empty"]') as HTMLElement | null

  if (!emptyEl) {
    return
  }

  const debug = getScriptsDebugOverrides()

  if (debug.forceLoading) {
    host.showLoadingShell()
    return
  }

  if (token !== host.reloadToken) {
    return
  }

  if (debug.forceError !== null) {
    host.presentError(debug.forceError || debug.errorMessage)
    return
  }

  if (debug.mockSampleRows) {
    await applyScriptGroups(host, root, createMockScriptKeyScriptsGroups(), emptyEl)
    host.setLoading(false)
    return
  }

  const cachedGroups = await loadScriptKeyScriptsGroupsFromCache()
  if (token !== host.reloadToken) {
    return
  }

  if (debug.forceEmpty) {
    const hasServices = cachedGroups.length > 0
    const hint = hasServices
      ? 'No script files on the server. Add <code class="font-mono text-[11px]">.js</code> / <code class="font-mono text-[11px]">.ts</code> files in the editor (rules JSON is not listed here).'
      : 'Configure <strong class="font-medium text-mm-secondary">Servers</strong> (server URL and script key), then reload this page.'
    host.presentEmpty(hint)
    return
  }

  const hasAnyScripts = cachedGroups.some((g) => g.scripts.length > 0)
  if (cachedGroups.length > 0 && hasAnyScripts) {
    await applyScriptGroups(host, root, cachedGroups, emptyEl)
    host.setLoading(false)
  } else if (options?.showShell) {
    host.showLoadingShell()
  }

  for (const group of cachedGroups) {
    if (!group.active) {
      continue
    }
    const fresh = await syncScriptKeyScriptsListIfNeeded(group.scriptKey)
    if (token !== host.reloadToken) {
      return
    }
    if (fresh && fresh.length > 0) {
      const nextGroups = cachedGroups.map((g) => (g.scriptKey === group.scriptKey ? { ...g, scripts: fresh } : g))
      await applyScriptGroups(host, root, nextGroups, emptyEl)
      host.setLoading(false)
    }
  }

  if (cachedGroups.length === 0) {
    host.presentEmpty('Configure <strong class="font-medium text-mm-secondary">Servers</strong> (server URL and script key), then reload this page.')
    return
  }

  if (!hasAnyScripts) {
    host.presentEmpty(
      'No script files on the server. Add <code class="font-mono text-[11px]">.js</code> / <code class="font-mono text-[11px]">.ts</code> files in the editor (rules JSON is not listed here).'
    )
  }
}
