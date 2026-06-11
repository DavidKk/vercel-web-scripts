import type { DebugLogAppendInput, DebugLogLevel } from '@ext/shared/debug-log-types'
import { buildDebugLogMetaFromTab, truncateDebugLogMessage } from '@ext/shared/debug-log-utils'
import { shouldExtensionCollectDebugLogs } from '@ext/shared/shell-log-output-cache'
import { DEBUG_LOG_BOOT_FLUSH_MESSAGE_TYPE, DEBUG_LOG_MESSAGE_TYPE, EXTENSION_BRIDGE_MESSAGE_SOURCE } from '@shared/launcher-constants'

import { getRuntimeId, isExtensionContextInvalidated } from './extension-context'

type PageDebugLogPayload = {
  level?: unknown
  source?: unknown
  scope?: unknown
  message?: unknown
  meta?: unknown
}

type BootLogRow = {
  t?: number
  level?: string
  message?: string
}

const VALID_LEVELS = new Set<DebugLogLevel>(['debug', 'info', 'ok', 'warn', 'error'])

function normalizeLevel(raw: unknown): DebugLogLevel {
  if (typeof raw === 'string' && VALID_LEVELS.has(raw as DebugLogLevel)) {
    return raw as DebugLogLevel
  }
  if (raw === 'fail') {
    return 'error'
  }
  return 'info'
}

function normalizePageDebugPayload(payload: unknown): DebugLogAppendInput | null {
  if (!payload || typeof payload !== 'object') {
    return null
  }
  const row = payload as PageDebugLogPayload
  const message = typeof row.message === 'string' ? truncateDebugLogMessage(row.message) : ''
  if (!message) {
    return null
  }
  const source = row.source === 'inject' || row.source === 'page' ? row.source : 'page'
  const scope = typeof row.scope === 'string' && row.scope.trim() ? row.scope.trim() : 'Page'
  return {
    source,
    scope,
    level: normalizeLevel(row.level),
    message,
    meta: row.meta && typeof row.meta === 'object' ? (row.meta as DebugLogAppendInput['meta']) : undefined,
  }
}

function relayDebugLogsToBackground(entries: DebugLogAppendInput[]): void {
  if (!shouldExtensionCollectDebugLogs() || entries.length === 0 || !getRuntimeId()) {
    return
  }
  const tabMeta = buildDebugLogMetaFromTab(window.location.href)
  const enriched = entries.map((entry) => ({
    ...entry,
    meta: { ...tabMeta, ...entry.meta },
  }))
  void chrome.runtime
    .sendMessage({
      type: 'APPEND_DEBUG_LOG',
      details: enriched.length === 1 ? enriched[0] : { entries: enriched },
    })
    .catch((error) => {
      isExtensionContextInvalidated(error)
    })
}

export function handleDebugLogMessage(type: string, payload: unknown): void {
  if (type === DEBUG_LOG_MESSAGE_TYPE) {
    const entry = normalizePageDebugPayload(payload)
    if (entry) {
      relayDebugLogsToBackground([entry])
    }
    return
  }
  if (type === DEBUG_LOG_BOOT_FLUSH_MESSAGE_TYPE) {
    if (!Array.isArray(payload)) {
      return
    }
    const entries: DebugLogAppendInput[] = []
    for (const row of payload as BootLogRow[]) {
      const message = typeof row.message === 'string' ? truncateDebugLogMessage(row.message) : ''
      if (!message) {
        continue
      }
      entries.push({
        source: 'inject',
        scope: 'Boot',
        level: normalizeLevel(row.level),
        message,
      })
    }
    relayDebugLogsToBackground(entries)
  }
}

/**
 * Post a page-world debug log line to the content bridge (page / inject contexts).
 * @param input Log row without tab meta (content relay adds host/tabId)
 */
export function postPageDebugLog(input: DebugLogAppendInput): void {
  if (!shouldExtensionCollectDebugLogs() || typeof window === 'undefined') {
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
 * Flush launcher boot buffer rows to the extension admin log store.
 * @param rows Boot log rows from globalThis.__VWS_BOOT_LOG__
 */
export function flushBootDebugLogs(rows: BootLogRow[]): void {
  if (!shouldExtensionCollectDebugLogs() || rows.length === 0 || typeof window === 'undefined') {
    return
  }
  try {
    window.postMessage(
      {
        source: EXTENSION_BRIDGE_MESSAGE_SOURCE,
        type: DEBUG_LOG_BOOT_FLUSH_MESSAGE_TYPE,
        payload: rows,
      },
      '*'
    )
  } catch {
    // ignore bridge errors
  }
}
