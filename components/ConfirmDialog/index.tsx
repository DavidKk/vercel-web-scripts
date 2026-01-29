'use client'

import type { ReactNode } from 'react'

/**
 * Generic confirmation dialog (dark theme).
 * Supports custom message and multiple action buttons.
 */

export interface ConfirmDialogButton {
  /** Button label */
  label: string
  /** Value passed to onClose when this button is clicked */
  value: string
  /** Optional variant: primary (accent) or default */
  variant?: 'primary' | 'default'
}

export interface ConfirmDialogProps {
  /** Whether the dialog is open */
  open: boolean
  /** Called with the button value, or null if cancelled (e.g. overlay click) */
  onClose: (value: string | null) => void
  /** Optional title */
  title?: string
  /** Message content (plain text or ReactNode) */
  message: ReactNode
  /** Action buttons (e.g. Overwrite, Resolve conflict, Cancel) */
  buttons: ConfirmDialogButton[]
  /** Optional class name for the modal panel */
  className?: string
}

/**
 * Modal confirmation dialog with multiple buttons.
 * Styled with dark theme (#1e1e1e, #2d2d2d, #3e3e42, #007acc).
 */
export function ConfirmDialog({ open, onClose, title, message, buttons, className = '' }: ConfirmDialogProps) {
  if (!open) return null

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose(null)
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'confirm-dialog-title' : undefined}
    >
      <div className={`max-w-lg w-full mx-4 rounded border border-[#3e3e42] bg-[#1e1e1e] shadow-xl text-[#cccccc] ${className}`} onClick={(e) => e.stopPropagation()}>
        {title && (
          <div id="confirm-dialog-title" className="px-4 py-3 border-b border-[#2d2d2d] text-sm font-semibold">
            {title}
          </div>
        )}
        <div className="px-4 py-4 text-sm text-[#cccccc]">{message}</div>
        <div className="px-4 py-3 border-t border-[#2d2d2d] flex flex-wrap items-center justify-end gap-2">
          {buttons.map((btn) => (
            <button
              key={btn.value}
              type="button"
              onClick={() => onClose(btn.value)}
              className={
                btn.variant === 'primary'
                  ? 'px-3 py-1.5 rounded bg-[#007acc] text-white hover:bg-[#1a8ad4] transition-colors'
                  : 'px-3 py-1.5 rounded bg-[#3e3e42] text-[#cccccc] hover:bg-[#4e4e52] transition-colors'
              }
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
