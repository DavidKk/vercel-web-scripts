import type { DebugLogAppendInput, DebugLogLevel } from '@ext/shared/debug-log-types'
import { buildDebugLogMetaFromTab, truncateDebugLogMessage } from '@ext/shared/debug-log-utils'
import { shouldExtensionCollectDebugLogs } from '@ext/shared/shell-log-output-cache'
import { DEBUG_LOG_BOOT_FLUSH_MESSAGE_TYPE, DEBUG_LOG_MESSAGE_TYPE, EXTENSION_BRIDGE_MESSAGE_SOURCE, PAGE_TRACE_ID_MESSAGE_TYPE } from '@shared/launcher-constants'
import { normalizeTraceId } from '@shared/trace-id'

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
  traceId?: string
}

const VALID_LEVELS = new Set<DebugLogLevel>(['debug', 'info', 'ok', 'warn', 'error'])

/** Last TraceId published by page-host (content world); used to enrich bare page/Preset logs. */
let pageTraceIdForTab: string | undefined

/**
 * Remember the page TraceId announced by page-host.
 * @param raw TraceId from PAGE_TRACE_ID message
 */
export function setPageTraceIdFromBridge(raw: unknown): void {
  pageTraceIdForTab = normalizeTraceId(raw)
}

/**
 * Current page TraceId known to the content bridge.
 * @returns Normalized TraceId when set
 */
export function getPageTraceIdFromBridge(): string | undefined {
  return pageTraceIdForTab
}

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
  const meta = row.meta && typeof row.meta === 'object' ? { ...(row.meta as DebugLogAppendInput['meta']) } : {}
  if (!meta.traceId && pageTraceIdForTab) {
    meta.traceId = pageTraceIdForTab
  }
  return {
    source,
    scope,
    level: normalizeLevel(row.level),
    message,
    meta: Object.keys(meta).length > 0 ? meta : undefined,
  }
}

function relayDebugLogsToBackground(entries: DebugLogAppendInput[]): void {
  if (!shouldExtensionCollectDebugLogs() || entries.length === 0 || !getRuntimeId()) {
    return
  }
  const tabMeta = buildDebugLogMetaFromTab(window.location.href)
  const enriched = entries.map((entry) => {
    const meta = { ...tabMeta, ...entry.meta }
    if (!meta.traceId && pageTraceIdForTab) {
      meta.traceId = pageTraceIdForTab
    }
    return { ...entry, meta }
  })
  void chrome.runtime
    .sendMessage({
      type: 'APPEND_DEBUG_LOG',
      details: enriched.length === 1 ? enriched[0] : { entries: enriched },
    })
    .catch((error) => {
      isExtensionContextInvalidated(error)
    })
}

/**
 * Handle page → content debug log / boot flush / page TraceId messages.
 * @param type Bridge message type
 * @param payload Message payload
 */
export function handleDebugLogMessage(type: string, payload: unknown): void {
  if (type === PAGE_TRACE_ID_MESSAGE_TYPE) {
    const raw = payload && typeof payload === 'object' ? (payload as { traceId?: unknown }).traceId : undefined
    setPageTraceIdFromBridge(raw)
    return
  }
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
      const traceId = normalizeTraceId(row.traceId) ?? pageTraceIdForTab
      entries.push({
        source: 'inject',
        scope: 'Boot',
        level: normalizeLevel(row.level),
        message,
        meta: traceId ? { traceId } : undefined,
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
