'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useState } from 'react'

import { updateFiles } from '@/app/api/scripts/actions'
import { useNotification } from '@/components/Notification'
import { useFileState } from '@/components/ScriptEditor/context/FileStateContext'
import { ScriptEditorContent } from '@/components/ScriptEditor/ScriptEditorContent'
import { FileStatus } from '@/components/ScriptEditor/types'
import { ENTRY_SCRIPT_RULES_FILE, EXCLUDED_FILES, SCRIPTS_FILE_EXTENSION } from '@/constants/file'
import type { RuleConfig } from '@/services/tampermonkey/types'

import { AIPanel } from './AIPanel'
import { EditorHeaderWrapper } from './EditorHeaderWrapper'
import { RulePanel } from './RulePanel'

/**
 * EditorContent component props
 */
export interface EditorContentProps {
  scriptKey: string
  initialFiles: Record<string, string>
  tampermonkeyTypings: string
  rules: RuleConfig[]
  onRulesChange: (rules: RuleConfig[]) => void
  isSaving: boolean
  isEditorDevMode: boolean
  onToggleEditorDevMode: () => void
}

/**
 * Internal component that has access to FileStateContext
 * Handles publish functionality
 */
export function EditorContent({ scriptKey, initialFiles, tampermonkeyTypings, rules, onRulesChange, isSaving, isEditorDevMode, onToggleEditorDevMode }: EditorContentProps) {
  const fileState = useFileState()
  const router = useRouter()
  const [isPublishing, setIsPublishing] = useState(false)
  const notification = useNotification()

  /**
   * Handle publish - save all files to Gist and compile
   */
  const handlePublish = useCallback(async () => {
    if (isPublishing || isSaving) {
      return
    }

    setIsPublishing(true)

    try {
      // Get all files (excluding deleted files and excluded files)
      const filesToPublish: Record<string, string> = {}

      Object.values(fileState.files).forEach((file) => {
        // Skip deleted files
        if (file.status === FileStatus.Deleted) {
          return
        }

        // Skip excluded files (rules file, entry script file)
        if (EXCLUDED_FILES.includes(file.path)) {
          return
        }

        // Only include script files (.ts, .js)
        const isScriptFile = SCRIPTS_FILE_EXTENSION.some((ext) => file.path.endsWith(ext))
        if (!isScriptFile) {
          return
        }

        filesToPublish[file.path] = file.content.modifiedContent
      })

      if (Object.keys(filesToPublish).length === 0) {
        notification.warning('No files to publish')
        setIsPublishing(false)
        return
      }

      // First, save all files to Gist
      const filesToSave = Object.entries(filesToPublish).map(([path, content]) => ({
        file: path,
        content,
      }))

      // Also save rules file if it exists
      const rulesFile = fileState.getFile(ENTRY_SCRIPT_RULES_FILE)
      if (rulesFile && rulesFile.status !== FileStatus.Deleted) {
        filesToSave.push({
          file: ENTRY_SCRIPT_RULES_FILE,
          content: rulesFile.content.modifiedContent,
        })
      }

      // Save all files to Gist
      await updateFiles(...filesToSave)

      // Mark all saved files as saved
      Object.keys(filesToPublish).forEach((path) => {
        fileState.markFileAsSaved(path)
      })
      if (rulesFile && rulesFile.status !== FileStatus.Deleted) {
        fileState.markFileAsSaved(ENTRY_SCRIPT_RULES_FILE)
      }

      // Compile and publish
      const compileUrl = `/tampermonkey/compile`
      const response = await fetch(compileUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ files: filesToPublish }),
      })

      if (!response.ok) {
        throw new Error('Failed to compile script')
      }

      // After successful publish, mark all published files as unchanged
      // This includes both script files and rules file
      Object.keys(filesToPublish).forEach((path) => {
        const file = fileState.getFile(path)
        if (file && (file.status === FileStatus.ModifiedSaved || file.status === FileStatus.NewSaved)) {
          fileState.markFileAsUnchanged(path)
        }
      })

      // Mark rules file as unchanged if it was published
      if (rulesFile && rulesFile.status !== FileStatus.Deleted) {
        const currentRulesFile = fileState.getFile(ENTRY_SCRIPT_RULES_FILE)
        if (currentRulesFile && (currentRulesFile.status === FileStatus.ModifiedSaved || currentRulesFile.status === FileStatus.NewSaved)) {
          fileState.markFileAsUnchanged(ENTRY_SCRIPT_RULES_FILE)
        }
      }

      // Refresh to get updated data
      router.refresh()

      notification.success('Published successfully!')
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Publish failed:', error)
      notification.error(`Publish failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsPublishing(false)
    }
  }, [fileState, router, isPublishing, isSaving, notification])

  return (
    <div className="w-full h-screen overflow-hidden flex flex-col">
      <EditorHeaderWrapper
        scriptKey={scriptKey}
        onSave={handlePublish}
        isSaving={isPublishing || isSaving}
        isEditorDevMode={isEditorDevMode}
        onToggleEditorDevMode={onToggleEditorDevMode}
        isCompiling={false}
      />
      <div className="flex-1 overflow-hidden">
        <ScriptEditorContent
          storageKey={scriptKey}
          layoutStorageKey={`${scriptKey}-layout`}
          initialFiles={initialFiles}
          hideHeader={true}
          hideFooter={true}
          extraLibs={[{ content: tampermonkeyTypings, filePath: 'file:///typings.d.ts' }]}
          typingsForLocal={tampermonkeyTypings}
          onLocalMapNotify={(type, message) => {
            if (type === 'success') notification.success(message)
            else if (type === 'error') notification.error(message)
            else notification.warning(message)
          }}
          renderRightPanel={(panelType) => {
            if (panelType === 'ai') {
              return <AIPanel onApplyDiff={() => {}} tampermonkeyTypings={tampermonkeyTypings} />
            }
            if (panelType === 'rules') {
              return <RulePanel allRules={rules} onRulesChange={onRulesChange} />
            }
            return null
          }}
        />
      </div>
    </div>
  )
}
