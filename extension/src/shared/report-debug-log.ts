import type { DebugLogAppendInput } from '@ext/shared/debug-log-types'
import { isDebugLogViewerIncognito } from '@ext/shared/debug-log-utils'
import type { ShellMessage } from '@ext/shared/messages'
import { shouldExtensionCollectDebugLogs, shouldExtensionCollectIncognitoDebugLogs } from '@ext/shared/shell-log-output-cache'
import { appendDebugLog } from '@ext/shell/debug-log-store'
import { DEBUG_LOG_MESSAGE_TYPE, EXTENSION_BRIDGE_MESSAGE_SOURCE } from '@shared/launcher-constants'

function enrichDebugLogIncognito(input: DebugLogAppendInput): DebugLogAppendInput {
  if (input.meta?.incognito != null) {
    return input
  }
  if (isDebugLogViewerIncognito()) {
    return { ...input, meta: { ...input.meta, incognito: true } }
  }
  return input
}

function shouldReportDebugLog(input: DebugLogAppendInput): boolean {
  if (!shouldExtensionCollectDebugLogs()) {
    return false
  }
  const enriched = enrichDebugLogIncognito(input)
  if (enriched.meta?.incognito === true && !shouldExtensionCollectIncognitoDebugLogs()) {
    return false
  }
  return true
}

function postPageDebugLogViaBridge(input: DebugLogAppendInput): void {
  if (typeof window === 'undefined') {
    return
  }
  try {
    window.postMessage(
      {
        source: EXTENSION_BRIDGE_MESSAGE_SOURCE,
        type: DEBUG_LOG_MESSAGE_TYPE,
        payload: input,
      },
      '*'
    )
  } catch {
    // ignore bridge errors
  }
}

/**
 * Report a debug log entry to the background session store (non-background contexts).
 * @param input Log fields without assigned id/t
 */
export function reportDebugLog(input: DebugLogAppendInput): void {
  if (!shouldReportDebugLog(input)) {
    return
  }
  const enriched = enrichDebugLogIncognito(input)
  if (typeof window === 'undefined') {
    appendDebugLog(enriched)
    return
  }
  if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
    void chrome.runtime.sendMessage({ type: 'APPEND_DEBUG_LOG', details: enriched } satisfies ShellMessage).catch(() => undefined)
    return
  }
  postPageDebugLogViaBridge(enriched)
}

/**
 * Report a batch of debug log entries to the background session store.
 * @param entries Log rows without assigned id/t
 */
export function reportDebugLogBatch(entries: DebugLogAppendInput[]): void {
  if (!shouldExtensionCollectDebugLogs() || entries.length === 0) {
    return
  }
  const enriched = entries
    .map((entry) => enrichDebugLogIncognito(entry))
    .filter((entry) => {
      if (entry.meta?.incognito === true && !shouldExtensionCollectIncognitoDebugLogs()) {
        return false
      }
      return true
    })
  if (enriched.length === 0) {
    return
  }
  if (typeof window === 'undefined') {
    appendDebugLog(enriched)
    return
  }
  if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
    void chrome.runtime.sendMessage({ type: 'APPEND_DEBUG_LOG', details: { entries: enriched } } satisfies ShellMessage).catch(() => undefined)
    return
  }
  for (const entry of enriched) {
    postPageDebugLogViaBridge(entry)
  }
}
