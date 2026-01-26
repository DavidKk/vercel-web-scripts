'use client'

import { useLayout } from '@/components/ScriptEditor/hooks/useLayout'

import EditorHeader from './EditorHeader'

interface EditorHeaderWrapperProps {
  scriptKey: string
  onSave: () => void
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
