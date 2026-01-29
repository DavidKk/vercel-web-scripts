'use client'

import { ConfirmDialog } from '@/components/ConfirmDialog'

import type { FileListConfirmState } from './types'

export interface FileListConfirmDialogsProps {
  /** Current confirm dialog state */
  confirmState: FileListConfirmState
  /** Called when dialog is closed; value is 'confirm' when user confirmed */
  onClose: (value: string | null) => void
}

/**
 * Renders the appropriate confirm dialog based on confirmState
 * (reset to online, delete, reset file).
 */
export function FileListConfirmDialogs({ confirmState, onClose }: FileListConfirmDialogsProps) {
  if (!confirmState.open) {
    return null
  }

  if (confirmState.type === 'resetToOnline') {
    return (
      <ConfirmDialog
        open
        onClose={onClose}
        title="Clear local cache"
        message="Clear local cache and reload from online? Unsaved changes will be lost."
        buttons={[
          { label: 'Cancel', value: 'cancel' },
          { label: 'Confirm', value: 'confirm', variant: 'primary' },
        ]}
      />
    )
  }

  if (confirmState.type === 'delete') {
    const message = confirmState.isDirectory
      ? `Are you sure you want to delete the folder "${confirmState.name}"? All files in this folder will be deleted.`
      : `Are you sure you want to delete ${confirmState.name}?`
    return (
      <ConfirmDialog
        open
        onClose={onClose}
        title="Delete"
        message={message}
        buttons={[
          { label: 'Cancel', value: 'cancel' },
          { label: 'Delete', value: 'confirm', variant: 'primary' },
        ]}
      />
    )
  }

  if (confirmState.type === 'resetFile') {
    return (
      <ConfirmDialog
        open
        onClose={onClose}
        title="Reset file"
        message={`Are you sure you want to reset ${confirmState.name} to its original content? All unsaved changes will be lost.`}
        buttons={[
          { label: 'Cancel', value: 'cancel' },
          { label: 'Reset', value: 'confirm', variant: 'primary' },
        ]}
      />
    )
  }

  return null
}
