'use client'

import { getShortcutsForHelp } from '@/app/editor/config/shortcuts'

export interface ShortcutsHelpModalProps {
  /** Whether the modal is open */
  open: boolean
  /** Called when the modal should close */
  onClose: () => void
}

/**
 * Modal that displays all keyboard shortcuts for the editor page.
 * Content is scrollable when the list is long.
 */
export function ShortcutsHelpModal({ open, onClose }: ShortcutsHelpModalProps) {
  if (!open) return null

  const shortcuts = getShortcutsForHelp()
  const byCategory = shortcuts.reduce<Record<string, { keys: string; description: string }[]>>((acc, item) => {
    if (!acc[item.category]) acc[item.category] = []
    acc[item.category].push({ keys: item.keys, description: item.description })
    return acc
  }, {})
  const categories = Object.keys(byCategory)

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-help-title"
    >
      <div className="max-w-md w-full mx-4 rounded border border-[#3a4352] bg-[#111318] shadow-xl text-[#cbd5e1] flex flex-col max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
        <div id="shortcuts-help-title" className="px-4 py-3 border-b border-[#2a303a] text-sm font-semibold flex-shrink-0">
          Keyboard shortcuts
        </div>
        <div className="px-4 py-3 overflow-y-auto flex-1 min-h-0">
          {categories.map((category) => (
            <div key={category} className="mb-4 last:mb-0">
              <div className="text-xs font-medium text-[#6f7a8a] uppercase tracking-wide mb-2">{category}</div>
              <ul className="space-y-2">
                {byCategory[category].map((item, idx) => (
                  <li key={`${category}-${idx}`} className="flex items-baseline justify-between gap-4 text-sm">
                    <span className="text-[#e6eaf0]">{item.description}</span>
                    <kbd className="flex-shrink-0 px-2 py-0.5 rounded bg-[#2a303a] border border-[#3a4352] text-[#cbd5e1] font-mono text-xs">{item.keys}</kbd>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="px-4 py-3 border-t border-[#2a303a] flex justify-end flex-shrink-0">
          <button type="button" onClick={onClose} className="px-3 py-1.5 rounded bg-[#3a4352] text-[#cbd5e1] hover:bg-[#3a4352] transition-colors text-sm">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
