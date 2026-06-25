/** Minimal shape for palette sort helpers (avoids circular import with index.ts). */
export type CommandPaletteContextScope = 'page' | 'domain'

export type CommandPaletteSortable = {
  title?: string
  text?: string
  hint?: string
  keywords?: string[]
  contextScope?: CommandPaletteContextScope
  onShown?: (input: string) => boolean
  onShow?: (input: string) => boolean
}

/** Known DEBUG subgroup order — lower sorts earlier within the DEBUG tail block. */
const DEBUG_GROUP_RANK: Record<string, number> = {
  Permission: 0,
  OTA: 1,
}

const DEBUG_OTHER_GROUP_RANK = 2

/** @internal Exported for tests */
export const TIER_PAGE = 0
/** @internal Exported for tests */
export const TIER_DEFAULT = 1
/** @internal Exported for tests */
export const TIER_DEBUG = 2

const PAGE_SCOPE_TEXT_RE = /本页|当前页|此页|this page|current page|exact url|current path/i

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
 * Whether a non-DEBUG command should be boosted to the top (本页).
 * @param cmd Command palette entry
 */
export function isPageScopedPaletteCommand(cmd: CommandPaletteSortable): boolean {
  if (isDebugCommandPaletteCommand(cmd)) {
    return false
  }
  if (cmd.contextScope === 'page') {
    return true
  }
  if (cmd.contextScope === 'domain') {
    return false
  }
  const titleText = [cmd.title, cmd.text].filter(Boolean).join(' ')
  return PAGE_SCOPE_TEXT_RE.test(titleText)
}

/**
 * @param cmd Command palette entry
 */
export function getCommandPaletteSortTier(cmd: CommandPaletteSortable): number {
  if (isDebugCommandPaletteCommand(cmd)) {
    return TIER_DEBUG
  }
  if (isPageScopedPaletteCommand(cmd)) {
    return TIER_PAGE
  }
  return TIER_DEFAULT
}

function sortDebugBlock<T extends CommandPaletteSortable>(entries: Array<{ cmd: T; index: number }>): T[] {
  return [...entries]
    .sort((a, b) => {
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
      return a.index - b.index
    })
    .map(({ cmd }) => cmd)
}

/**
 * Sort palette commands:
 * 1. Non-DEBUG **page** commands first (registration order within page bucket)
 * 2. Other non-DEBUG commands in original registration order
 * 3. DEBUG block last, clustered by `DEBUG <Group>:` prefix (Permission, OTA, …)
 * @param commands Commands in registration order
 */
export function sortCommandPaletteCommands<T extends CommandPaletteSortable>(commands: T[]): T[] {
  const pageBucket: T[] = []
  const defaultBucket: T[] = []
  const debugEntries: Array<{ cmd: T; index: number }> = []

  commands.forEach((cmd, index) => {
    if (isDebugCommandPaletteCommand(cmd)) {
      debugEntries.push({ cmd, index })
      return
    }
    if (isPageScopedPaletteCommand(cmd)) {
      pageBucket.push(cmd)
      return
    }
    defaultBucket.push(cmd)
  })

  return [...pageBucket, ...defaultBucket, ...sortDebugBlock(debugEntries)]
}
