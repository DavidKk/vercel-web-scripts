/**
 * Centralized keyboard shortcuts configuration for the editor page.
 * Used for both registration (Monaco) and the shortcuts help modal.
 */

/** Whether the platform uses Mac-style modifier (⌘) */
export function isMac(): boolean {
  if (typeof window === 'undefined') return false
  return /Mac|iPhone|iPod|iPad/i.test(navigator.platform) || /Mac/i.test(navigator.userAgent)
}

/** Modifier key label for display (⌘ on Mac, Ctrl on Windows/Linux) */
export function getModKey(): string {
  return isMac() ? '⌘' : 'Ctrl'
}

/** Single shortcut entry for display in help */
export interface ShortcutItem {
  /** Category (e.g. Editor, File list) */
  category: string
  /** Keys to show (e.g. '⌘ S' or '⌘ K then 1') */
  keys: string
  /** Human-readable description */
  description: string
}

/**
 * All shortcuts for the shortcuts help modal.
 * Keys use getModKey() at render time for platform-aware display.
 * @returns List of shortcut items grouped by category for display
 */
export function getShortcutsForHelp(): ShortcutItem[] {
  const mod = getModKey()
  return [
    { category: 'Editor', keys: `${mod} S`, description: 'Save' },
    { category: 'Editor', keys: `${mod} K then 1`, description: 'Fold to level 1' },
    { category: 'Editor', keys: `${mod} K then 2`, description: 'Fold to level 2' },
    { category: 'Editor', keys: `${mod} K then 3`, description: 'Fold to level 3' },
    { category: 'Editor', keys: `${mod} K then 4`, description: 'Fold to level 4' },
    { category: 'Editor', keys: `${mod} K then 5`, description: 'Fold to level 5' },
    { category: 'Editor', keys: `${mod} K then 6`, description: 'Fold to level 6' },
    { category: 'Editor', keys: `${mod} K then 7`, description: 'Fold to level 7' },
    { category: 'File list', keys: `${mod} F`, description: 'Open file search' },
    { category: 'File list', keys: 'Esc', description: 'Close file search' },
    { category: 'AI panel', keys: `${mod} Enter`, description: 'Submit instruction' },
  ]
}
