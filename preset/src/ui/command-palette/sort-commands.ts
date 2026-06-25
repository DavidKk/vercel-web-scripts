/** Minimal shape for palette sort helpers (avoids circular import with index.ts). */
export type CommandPaletteSortable = {
  title?: string
  text?: string
}

/** DEBUG subgroup rank — lower sorts earlier within the DEBUG block. */
const DEBUG_GROUP_RANK: Record<string, number> = {
  Permission: 0,
  OTA: 1,
}

const DEBUG_OTHER_GROUP_RANK = 2

/**
 * Whether a palette command is a DEBUG entry (title starts with "DEBUG").
 * @param cmd Command palette entry
 */
export function isDebugCommandPaletteCommand(cmd: CommandPaletteSortable): boolean {
  const titleText = cmd.title ?? cmd.text ?? ''
  return titleText.trim().toUpperCase().startsWith('DEBUG')
}

/**
 * Parse `DEBUG <Group>:` title prefix for subgroup sorting.
 * @param cmd Command palette entry
 * @returns Group label (e.g. "OTA", "Permission") or null
 */
export function getDebugCommandGroup(cmd: CommandPaletteSortable): string | null {
  const titleText = (cmd.title ?? cmd.text ?? '').trim()
  const match = titleText.match(/^DEBUG\s+([^:]+):/i)
  return match ? match[1].trim() : null
}

function debugGroupRank(group: string | null): number {
  if (!group) {
    return DEBUG_OTHER_GROUP_RANK
  }
  return DEBUG_GROUP_RANK[group] ?? DEBUG_OTHER_GROUP_RANK
}

/**
 * Sort palette commands: non-DEBUG first, then DEBUG block grouped by title prefix
 * (`DEBUG Permission:`, `DEBUG OTA:`, …) with stable order inside each group.
 * @param commands Commands in registration order
 */
export function sortCommandPaletteCommands<T extends CommandPaletteSortable>(commands: T[]): T[] {
  return commands
    .map((cmd, index) => ({ cmd, index }))
    .sort((a, b) => {
      const aDebug = isDebugCommandPaletteCommand(a.cmd)
      const bDebug = isDebugCommandPaletteCommand(b.cmd)
      if (aDebug !== bDebug) {
        return aDebug ? 1 : -1
      }

      if (aDebug && bDebug) {
        const aGroup = getDebugCommandGroup(a.cmd)
        const bGroup = getDebugCommandGroup(b.cmd)
        const aRank = debugGroupRank(aGroup)
        const bRank = debugGroupRank(bGroup)
        if (aRank !== bRank) {
          return aRank - bRank
        }
        if (aGroup !== bGroup) {
          return (aGroup ?? '').localeCompare(bGroup ?? '')
        }
      }

      return a.index - b.index
    })
    .map(({ cmd }) => cmd)
}
