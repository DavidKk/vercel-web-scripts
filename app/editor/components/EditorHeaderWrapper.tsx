'use client'

import { useLayout } from '@/components/ScriptEditor/hooks/useLayout'
import type { ScriptOtaPolicy } from '@/shared/script-ota-policy'

import EditorHeader from './EditorHeader'

interface EditorHeaderWrapperProps {
  scriptKey: string
  displayUsername: string
  onSave: () => void
  onPublishStable?: () => void
  canPublishStable?: boolean
  activeScriptFilename?: string | null
  activeScriptOta?: ScriptOtaPolicy | null
  onLockVersion?: () => void
  onUnlockVersion?: () => void
  isSaving: boolean
  isEditorDevMode: boolean
  onToggleEditorDevMode: () => void
  isCompiling: boolean
}

/**
 * Wrapper component that connects EditorHeader to ScriptEditor's layout context
 * This component must be rendered within ScriptEditor's provider tree
 */
export function EditorHeaderWrapper(props: EditorHeaderWrapperProps) {
  const layout = useLayout()

  return (
    <EditorHeader
      {...props}
      onToggleAI={() => layout.toggleRightPanel('ai')}
      isAIOpen={layout.rightPanelType === 'ai'}
      onToggleRules={() => layout.toggleRightPanel('rules')}
      isRulesOpen={layout.rightPanelType === 'rules'}
    />
  )
}
