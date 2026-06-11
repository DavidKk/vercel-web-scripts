import type { DebugLogAppendInput } from '@ext/shared/debug-log-types'
import type { ShellMessage } from '@ext/shared/messages'
import { shouldExtensionCollectDebugLogs } from '@ext/shared/shell-log-output-cache'
import { appendDebugLog } from '@ext/shell/debug-log-store'
import { DEBUG_LOG_MESSAGE_TYPE, EXTENSION_BRIDGE_MESSAGE_SOURCE } from '@shared/launcher-constants'

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
  if (!shouldExtensionCollectDebugLogs()) {
    return
  }
  if (typeof window === 'undefined') {
    appendDebugLog(input)
    return
  }
  if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
    void chrome.runtime.sendMessage({ type: 'APPEND_DEBUG_LOG', details: input } satisfies ShellMessage).catch(() => undefined)
    return
  }
  postPageDebugLogViaBridge(input)
}

/**
 * Report a batch of debug log entries to the background session store.
 * @param entries Log rows without assigned id/t
 */
export function reportDebugLogBatch(entries: DebugLogAppendInput[]): void {
  if (!shouldExtensionCollectDebugLogs() || entries.length === 0) {
    return
  }
  if (typeof window === 'undefined') {
    appendDebugLog(entries)
    return
  }
  if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
    void chrome.runtime.sendMessage({ type: 'APPEND_DEBUG_LOG', details: { entries } } satisfies ShellMessage).catch(() => undefined)
    return
  }
  for (const entry of entries) {
    postPageDebugLogViaBridge(entry)
  }
}
