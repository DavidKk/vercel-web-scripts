'use client'

import { useCallback } from 'react'

import { useFileState } from '@/components/ScriptEditor/context/FileStateContext'
import { useLayout } from '@/components/ScriptEditor/hooks/useLayout'
import { useTabBar } from '@/components/ScriptEditor/hooks/useTabBar'
import { FileStatus } from '@/components/ScriptEditor/types'
import { ENTRY_SCRIPT_RULES_FILE, EXCLUDED_FILES, SCRIPTS_FILE_EXTENSION } from '@/constants/file'
import type { RuleConfig } from '@/services/tampermonkey/types'
import type { ScriptOtaPolicy } from '@/shared/script-ota-policy'

import type { EditorTabSummary } from '../EditorPageHandle'
import { useEditorPageHandleContext, useEditorPageSlot } from '../editorPageHandleSystem'

/**
 * Mount session, publish, devMode, and rules slots from {@link EditorContent}.
 */
export function useEditorContentWebMcpSlots(options: {
  isEditorDevMode: boolean
  editorHostId: string | null
  activeScriptOta: ScriptOtaPolicy | null
  rules: RuleConfig[]
  onRulesChange: (rules: RuleConfig[]) => void
  onToggleEditorDevMode: () => void
  onPublishDebug: () => Promise<void>
  onPublishStable: () => Promise<void>
  onPushDevMode: () => Promise<void>
}): void {
  const { getHandle } = useEditorPageHandleContext()
  const fileState = useFileState()
  const tabBar = useTabBar()
  const layout = useLayout()

  const syncRulesToFileState = useCallback(
    (rules: RuleConfig[]) => {
      const content = JSON.stringify(rules, null, 2)
      const existing = fileState.getFile(ENTRY_SCRIPT_RULES_FILE)
      if (existing) {
        fileState.updateFile(ENTRY_SCRIPT_RULES_FILE, content)
      } else {
        fileState.createFile(ENTRY_SCRIPT_RULES_FILE, content)
      }
    },
    [fileState]
  )

  const buildTabSummaries = useCallback((): EditorTabSummary[] => {
    return tabBar.openTabs.map((path) => ({
      path,
      hasUnsavedChanges: fileState.hasUnsavedChanges(path),
      isActive: path === tabBar.activeTab,
    }))
  }, [fileState, tabBar.activeTab, tabBar.openTabs])

  const compileScripts = useCallback(
    async (filenames?: string[]): Promise<{ ok: boolean; message?: string }> => {
      const filesToCompile: Record<string, string> = {}
      const targets = filenames && filenames.length > 0 ? filenames : tabBar.activeTab ? [tabBar.activeTab] : []

      for (const path of targets) {
        if (EXCLUDED_FILES.includes(path)) {
          continue
        }
        const isScriptFile = SCRIPTS_FILE_EXTENSION.some((ext) => path.endsWith(ext))
        if (!isScriptFile) {
          continue
        }
        const file = fileState.getFile(path)
        if (!file || file.status === FileStatus.Deleted) {
          continue
        }
        filesToCompile[path] = file.content.modifiedContent
      }

      if (Object.keys(filesToCompile).length === 0) {
        return { ok: false, message: 'No script files to compile' }
      }

      const res = await fetch('/tampermonkey/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: filesToCompile }),
      })
      if (!res.ok) {
        return { ok: false, message: (await res.text()).trim() || 'Compile failed' }
      }
      return { ok: true }
    },
    [fileState, tabBar.activeTab]
  )

  useEditorPageSlot(
    'session',
    {
      getSnapshot: () => ({
        pageId: getHandle().meta.getPageId(),
        activeTab: tabBar.activeTab,
        mountedSlots: getHandle().meta.listMountedSlots(),
        openTabs: buildTabSummaries(),
        dirtyFiles: fileState.getUnsavedFiles(),
        rightPanel: (() => {
          const panel = layout.rightPanelType
          return panel === 'ai' || panel === 'rules' ? panel : null
        })(),
        devModeEnabled: options.isEditorDevMode,
      }),
      getActiveOta: () => ({
        filename: tabBar.activeTab,
        ota: options.activeScriptOta,
      }),
    },
    'EditorContent'
  )

  useEditorPageSlot(
    'publish',
    {
      compile: compileScripts,
      publishDebug: async () => {
        try {
          await options.onPublishDebug()
          return { ok: true as const }
        } catch (error) {
          return { ok: false as const, message: error instanceof Error ? error.message : 'Publish failed' }
        }
      },
      publishStable: async () => {
        try {
          await options.onPublishStable()
          return { ok: true as const }
        } catch (error) {
          return { ok: false as const, message: error instanceof Error ? error.message : 'Publish stable failed' }
        }
      },
    },
    'EditorContent'
  )

  useEditorPageSlot(
    'devMode',
    {
      isEnabled: () => options.isEditorDevMode,
      toggle: options.onToggleEditorDevMode,
      getStatus: () => ({
        enabled: options.isEditorDevMode,
        hostId: options.editorHostId,
      }),
      pushToPreset: async () => {
        try {
          await options.onPushDevMode()
          return { ok: true as const }
        } catch (error) {
          return { ok: false as const, message: error instanceof Error ? error.message : 'Dev mode push failed' }
        }
      },
    },
    'EditorContent'
  )

  useEditorPageSlot(
    'rules',
    {
      isAvailable: () => true,
      listForActiveScript: () => {
        const active = tabBar.activeTab
        if (!active) {
          return []
        }
        return options.rules.filter((rule) => rule.script === active).map((rule) => ({ id: rule.id, wildcard: rule.wildcard, script: rule.script }))
      },
      addRule: (wildcard: string) => {
        const active = tabBar.activeTab
        if (!active) {
          return { ok: false as const, error: 'No active script file' }
        }
        const isScript = SCRIPTS_FILE_EXTENSION.some((ext) => active.endsWith(ext))
        if (!isScript) {
          return { ok: false as const, error: 'Active file is not a script' }
        }
        const newRule: RuleConfig = { id: crypto.randomUUID(), wildcard, script: active }
        const next = [...options.rules, newRule]
        options.onRulesChange(next)
        syncRulesToFileState(next)
        return { ok: true as const, ruleId: newRule.id }
      },
      updateRule: (ruleId: string, wildcard: string) => {
        const index = options.rules.findIndex((rule) => rule.id === ruleId)
        if (index < 0) {
          return { ok: false as const, error: `Rule not found: ${ruleId}` }
        }
        const next = options.rules.map((rule) => (rule.id === ruleId ? { ...rule, wildcard } : rule))
        options.onRulesChange(next)
        syncRulesToFileState(next)
        return { ok: true as const }
      },
      deleteRule: (ruleId: string) => {
        const next = options.rules.filter((rule) => rule.id !== ruleId)
        if (next.length === options.rules.length) {
          return { ok: false as const, error: `Rule not found: ${ruleId}` }
        }
        options.onRulesChange(next)
        syncRulesToFileState(next)
        return { ok: true as const }
      },
    },
    'EditorContent'
  )
}
