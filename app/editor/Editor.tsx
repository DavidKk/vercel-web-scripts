'use client'

import { useRequest } from 'ahooks'
import { useCallback, useMemo, useState } from 'react'

import { NotificationProvider, NotificationStack } from '@/components/Notification'
import { FileStateProvider } from '@/components/ScriptEditor/context/FileStateContext'
import { LayoutProvider } from '@/components/ScriptEditor/context/LayoutContext'
import { TabBarProvider } from '@/components/ScriptEditor/context/TabBarContext'
import { ENTRY_SCRIPT_RULES_FILE } from '@/constants/file'
import type { RuleConfig } from '@/services/tampermonkey/types'

import { EditorContent } from './components/EditorContent'

export interface EditorProps {
  files: Record<
    string,
    {
      content: string
      rawUrl: string
    }
  >
  scriptKey: string
  updatedAt: number
  tampermonkeyTypings: string
  rules: RuleConfig[]
}

export default function Editor(props: EditorProps) {
  const { files: inFiles, scriptKey, rules: initialRules } = props

  // Rules state
  const [rules, setRules] = useState<RuleConfig[]>(initialRules)
  const [isEditorDevMode, setIsEditorDevMode] = useState(false)

  // Format initial files for ScriptEditor
  const initialFiles = useMemo(() => {
    const formatted: Record<string, string> = {}
    Object.entries(inFiles).forEach(([path, info]) => {
      formatted[path] = info.content
    })
    // Add rules file
    formatted[ENTRY_SCRIPT_RULES_FILE] = JSON.stringify(initialRules, null, 2)
    return formatted
  }, [inFiles, initialRules])

  // Save files to server (not used for CMD+S, but kept for potential future use)
  const { loading: isSaving } = useRequest(
    async () => {
      // This is not used anymore as CMD+S only saves locally
    },
    {
      manual: true,
    }
  )

  // Handle rules change from the Right Panel
  const handleRulesChange = useCallback((updatedRules: RuleConfig[]) => {
    setRules(updatedRules)
  }, [])

  const handleToggleEditorDevMode = useCallback(() => {
    setIsEditorDevMode((prev) => !prev)
    // TODO: Implement dev mode logic
  }, [])

  return (
    <NotificationProvider maxNotifications={10}>
      <FileStateProvider initialFiles={initialFiles}>
        <LayoutProvider storageKey={`${scriptKey}-layout`}>
          <TabBarProvider>
            <EditorContent
              scriptKey={scriptKey}
              initialFiles={initialFiles}
              tampermonkeyTypings={props.tampermonkeyTypings}
              rules={rules}
              onRulesChange={handleRulesChange}
              isSaving={isSaving}
              isEditorDevMode={isEditorDevMode}
              onToggleEditorDevMode={handleToggleEditorDevMode}
            />
            <NotificationStack />
          </TabBarProvider>
        </LayoutProvider>
      </FileStateProvider>
    </NotificationProvider>
  )
}
