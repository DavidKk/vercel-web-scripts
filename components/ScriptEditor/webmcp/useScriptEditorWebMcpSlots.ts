'use client'

import { useCallback } from 'react'

import type { EditorBufferSnapshot, EditorTabSummary } from '@/app/editor/webmcp/EditorPageHandle'
import { useOptionalEditorPageSlot } from '@/app/editor/webmcp/editorPageHandleSystem'
import { useFileState } from '@/components/ScriptEditor/context/FileStateContext'
import { useTabBar } from '@/components/ScriptEditor/hooks/useTabBar'

/**
 * Mount tabs and buffer WebMCP slots when an editor page handle provider is present.
 * @param options Optional save-local callback wired to IndexedDB + editor save hook
 */
export function useScriptEditorWebMcpSlots(options?: { onSaveLocal?: (filename: string) => Promise<void> }): void {
  const fileState = useFileState()
  const tabBar = useTabBar()

  const buildTabSummaries = useCallback((): EditorTabSummary[] => {
    return tabBar.openTabs.map((path) => ({
      path,
      hasUnsavedChanges: fileState.hasUnsavedChanges(path),
      isActive: path === tabBar.activeTab,
    }))
  }, [fileState, tabBar.activeTab, tabBar.openTabs])

  const toBufferSnapshot = useCallback(
    (path: string): EditorBufferSnapshot | null => {
      const file = fileState.getFile(path)
      if (!file) {
        return null
      }
      return {
        filename: path,
        content: file.content.modifiedContent,
        status: file.status,
        hasUnsavedChanges: fileState.hasUnsavedChanges(path),
      }
    },
    [fileState]
  )

  useOptionalEditorPageSlot(
    'tabs',
    {
      open: (filename: string) => {
        tabBar.openTab(filename)
      },
      switchTo: (filename: string) => {
        if (!tabBar.openTabs.includes(filename)) {
          throw new Error(`Tab is not open: ${filename}`)
        }
        tabBar.switchTab(filename)
      },
      list: buildTabSummaries,
      close: (filename: string) => {
        tabBar.closeTab(filename)
      },
      closeOthers: (keepFilename?: string) => {
        const keep = keepFilename ?? tabBar.activeTab
        if (!keep) {
          throw new Error('No tab to keep open')
        }
        tabBar.closeOtherTabs(keep)
      },
    },
    'ScriptEditorContent'
  )

  useOptionalEditorPageSlot(
    'buffer',
    {
      getActive: () => (tabBar.activeTab ? toBufferSnapshot(tabBar.activeTab) : null),
      get: (filename: string) => toBufferSnapshot(filename),
      apply: (filename: string, content: string) => {
        fileState.updateFile(filename, content)
      },
      listDirty: () => fileState.getUnsavedFiles(),
      applyPatch: (filename: string, search: string, replace: string, replaceAll = false) => {
        const file = fileState.getFile(filename)
        if (!file) {
          throw new Error(`File not found: ${filename}`)
        }
        const content = file.content.modifiedContent
        const next = replaceAll ? content.split(search).join(replace) : content.replace(search, replace)
        if (next === content) {
          throw new Error(`Pattern not found in ${filename}`)
        }
        fileState.updateFile(filename, next)
      },
      discard: (filename: string) => {
        fileState.resetFile(filename)
      },
      createFile: (filename: string, content = '') => {
        fileState.createFile(filename, content)
        tabBar.openTab(filename)
      },
      renameFile: (oldPath: string, newPath: string) => {
        fileState.renameFile(oldPath, newPath)
        if (tabBar.isTabOpen(oldPath)) {
          tabBar.closeTab(oldPath)
          tabBar.openTab(newPath)
        }
      },
      deleteFile: (filename: string) => {
        fileState.deleteFile(filename)
        if (tabBar.activeTab === filename) {
          tabBar.closeTab(filename)
        }
      },
      saveLocal: async (filename?: string) => {
        const target = filename ?? tabBar.activeTab
        if (!target) {
          throw new Error('No file to save')
        }
        if (options?.onSaveLocal) {
          await options.onSaveLocal(target)
          return
        }
        fileState.markFileAsSaved(target)
      },
    },
    'ScriptEditorContent'
  )
}
