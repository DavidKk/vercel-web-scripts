'use client'

import { useRequest } from 'ahooks'
import { useRouter } from 'next/navigation'
import { useCallback, useMemo, useState } from 'react'

import { updateFiles } from '@/app/api/scripts/actions'
import { FileStateProvider } from '@/components/ScriptEditor/context/FileStateContext'
import { LayoutProvider } from '@/components/ScriptEditor/context/LayoutContext'
import { TabBarProvider } from '@/components/ScriptEditor/context/TabBarContext'
import { ScriptEditorContent } from '@/components/ScriptEditor/ScriptEditorContent'
import { ENTRY_SCRIPT_RULES_FILE } from '@/constants/file'
import type { RuleConfig } from '@/services/tampermonkey/types'

import { AIPanel } from './components/AIPanel'
import { EditorHeaderWrapper } from './components/EditorHeaderWrapper'
import { RulePanel } from './components/RulePanel'

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
  const router = useRouter()

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

  // Save files to server
  const { runAsync: saveToServer, loading: isSaving } = useRequest(
    async (path: string, content: string) => {
      if (!content.trim()) {
        alert(`File "${path}" cannot be empty.`)
        return
      }

      await updateFiles({ file: path, content })

      // If it's the rules file, update our local rules state
      if (path === ENTRY_SCRIPT_RULES_FILE) {
        try {
          const newRules = JSON.parse(content)
          if (Array.isArray(newRules)) {
            setRules(newRules)
          }
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error('Failed to update rules state after save:', e)
        }
      }

      router.refresh()
    },
    {
      manual: true,
    }
  )

  const handleSave = useCallback(
    async (path: string, content: string) => {
      await saveToServer(path, content)
    },
    [saveToServer]
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
    <FileStateProvider initialFiles={initialFiles}>
      <LayoutProvider storageKey={`${scriptKey}-layout`}>
        <TabBarProvider>
          <div className="w-full h-screen overflow-hidden flex flex-col">
            <EditorHeaderWrapper
              scriptKey={scriptKey}
              onSave={() => {
                // Trigger save for all files via ScriptEditor
                // This will be handled by Cmd+S in the editor
              }}
              isSaving={isSaving}
              isEditorDevMode={isEditorDevMode}
              onToggleEditorDevMode={handleToggleEditorDevMode}
              isCompiling={false}
            />
            <div className="flex-1 overflow-hidden">
              <ScriptEditorContent
                storageKey={scriptKey}
                layoutStorageKey={`${scriptKey}-layout`}
                initialFiles={initialFiles}
                hideHeader={true}
                hideFooter={true}
                extraLibs={[{ content: props.tampermonkeyTypings, filePath: 'file:///typings.d.ts' }]}
                onSave={handleSave}
                renderRightPanel={(panelType) => {
                  if (panelType === 'ai') {
                    return <AIPanel onApplyDiff={() => {}} tampermonkeyTypings={props.tampermonkeyTypings} />
                  }
                  if (panelType === 'rules') {
                    return <RulePanel allRules={rules} onRulesChange={handleRulesChange} />
                  }
                  return null
                }}
              />
            </div>
          </div>
        </TabBarProvider>
      </LayoutProvider>
    </FileStateProvider>
  )
}
