import { normalizeShellLogOutputMode, SHELL_LOG_OUTPUT_MODE_KEY, type ShellLogOutputMode, shouldLogToConsoleForMode } from '@shared/shell-log-output'

import { getShellLogOutputMode } from './extension-storage/runtime-cache'

let cachedMode: ShellLogOutputMode = 'console'

type WindowWithGmStore = Window & { __VWS_GM_STORE__?: Record<string, unknown> }

/**
 * Read log output mode from the page-world GM mirror (injected before launcher runs).
 */
function readModeFromPageGmStore(): ShellLogOutputMode | null {
  if (typeof window === 'undefined') {
    return null
  }
  const store = (window as WindowWithGmStore).__VWS_GM_STORE__
  if (!store || !(SHELL_LOG_OUTPUT_MODE_KEY in store)) {
    return null
  }
  return normalizeShellLogOutputMode(store[SHELL_LOG_OUTPUT_MODE_KEY])
}

/**
 * Resolve mode for sync loggers: live page GM store wins over background-only cache.
 */
function resolveExtensionLogOutputMode(): ShellLogOutputMode {
  return readModeFromPageGmStore() ?? cachedMode
}

/**
 * Refresh in-memory cache from extension storage (call on startup and after mode changes).
 */
export async function refreshShellLogOutputModeCache(): Promise<void> {
  cachedMode = normalizeShellLogOutputMode(await getShellLogOutputMode())
}

/**
 * Seed cache from bootstrap GM payload (page launcher runs before background cache is visible here).
 * @param store Logical GM keys from content-bridge bootstrap
 */
export function syncShellLogOutputModeFromGmStore(store?: Record<string, unknown>): void {
  const source = store ?? (typeof window !== 'undefined' ? (window as WindowWithGmStore).__VWS_GM_STORE__ : undefined)
  if (!source || !(SHELL_LOG_OUTPUT_MODE_KEY in source)) {
    return
  }
  cachedMode = normalizeShellLogOutputMode(source[SHELL_LOG_OUTPUT_MODE_KEY])
}

/**
 * Update cache when GM storage changes in the page world.
 * @param mode Normalized shell log output mode
 */
export function setCachedShellLogOutputMode(mode: ShellLogOutputMode): void {
  cachedMode = mode
}

/**
 * Cached log output mode for sync extension loggers.
 */
export function getCachedShellLogOutputMode(): ShellLogOutputMode {
  return resolveExtensionLogOutputMode()
}

/**
 * Whether extension shell logs should write to the browser console.
 */
export function shouldExtensionLogToConsole(): boolean {
  return shouldLogToConsoleForMode(resolveExtensionLogOutputMode())
}
