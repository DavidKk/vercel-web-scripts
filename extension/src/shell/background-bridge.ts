import { defaultDevelopModeForBaseUrl } from '@ext/shared/extension-services'
import { syncRulesFromServer, upsertService } from '@ext/shared/extension-storage'
import type { ShellMessage, ShellResponse } from '@ext/shared/messages'
import type { ExtensionConfig } from '@ext/types'
import { PERMISSION_DENIED_CODE, permissionResourceMatchesUrl } from '@shared/script-permission'

import type { DebugLogAppendInput } from '../shared/debug-log-types'
import { buildDebugLogMetaFromTab } from '../shared/debug-log-utils'
import { buildStatus } from './background-status'
import { getActiveTab, reloadTab } from './background-tab-utils'
import { captureVisibleTabThrottled } from './capture-visible-tab-throttle'
import { ensureScriptPermissionForTab } from './permission-manager'

export function enrichDebugLogFromSender(entry: DebugLogAppendInput, sender: chrome.runtime.MessageSender): DebugLogAppendInput {
  const tab = sender.tab
  if (!tab) {
    if (entry.meta?.incognito != null) {
      return entry
    }
    try {
      if (typeof chrome.extension?.inIncognitoContext === 'boolean') {
        return { ...entry, meta: { ...entry.meta, incognito: chrome.extension.inIncognitoContext } }
      }
    } catch {
      // ignore
    }
    return entry
  }
  const tabMeta = buildDebugLogMetaFromTab(tab.url, tab.id, tab.incognito)
  return {
    ...entry,
    meta: {
      ...tabMeta,
      ...entry.meta,
      incognito: entry.meta?.incognito ?? tab.incognito,
    },
  }
}

export async function handleBridgeXhr(details: Extract<ShellMessage, { type: 'GM_XHR' }>['details'], tabId?: number): Promise<ShellResponse> {
  const method = (details.method ?? 'GET').toUpperCase()
  const url = details.url?.trim()
  if (!url) {
    throw new Error('GM_XHR missing URL')
  }
  if (tabId != null && details.permission) {
    if (!permissionResourceMatchesUrl(details.permission.resource, url)) {
      throw new Error(PERMISSION_DENIED_CODE)
    }
    const allowed = await ensureScriptPermissionForTab(tabId, details.permission)
    if (!allowed) {
      throw new Error(PERMISSION_DENIED_CODE)
    }
  }
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined
  const timeout = typeof details.timeout === 'number' && details.timeout > 0 ? details.timeout : 0
  const timer = timeout && controller ? setTimeout(() => controller.abort(), timeout) : undefined
  let res: Response
  try {
    res = await fetch(url, {
      method,
      headers: details.headers,
      body: method === 'GET' || method === 'HEAD' ? undefined : details.data,
      credentials: 'omit',
      signal: controller?.signal,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`GM_XHR fetch failed: ${message} url=${url.slice(0, 180)}`)
  } finally {
    if (timer) {
      clearTimeout(timer)
    }
  }
  const responseText = await res.text()
  const responseHeaders = Array.from(res.headers.entries())
    .map(([k, v]) => `${k}: ${v}`)
    .join('\r\n')

  return {
    ok: true,
    xhr: {
      status: res.status,
      statusText: res.statusText,
      responseText,
      responseHeaders,
      finalUrl: res.url || url,
    },
  }
}

export async function handleCaptureVisibleTab(
  message: Extract<ShellMessage, { type: 'CAPTURE_VISIBLE_TAB' }>,
  tabId: number | undefined,
  windowId: number | undefined,
  tabUrl: string | undefined
): Promise<ShellResponse> {
  if (tabId == null || windowId == null) {
    throw new Error('CAPTURE_VISIBLE_TAB missing tab')
  }
  if (message.permission) {
    if (!tabUrl || !permissionResourceMatchesUrl(message.permission.resource, tabUrl)) {
      throw new Error(PERMISSION_DENIED_CODE)
    }
    const allowed = await ensureScriptPermissionForTab(tabId, message.permission)
    if (!allowed) {
      throw new Error(PERMISSION_DENIED_CODE)
    }
  }
  const format = message.options.format === 'jpeg' ? 'jpeg' : 'png'
  const quality = typeof message.options.quality === 'number' ? message.options.quality : undefined
  const dataUrl = await captureVisibleTabThrottled(windowId, { format, quality })
  return { ok: true, dataUrl }
}

export function normalizeWebConnectConfig(details: Extract<ShellMessage, { type: 'WEB_CONNECT_EXTENSION' }>['details']): ExtensionConfig {
  const baseUrl = details.baseUrl.trim().replace(/\/+$/, '')
  return {
    baseUrl,
    scriptKey: details.scriptKey.trim(),
    developMode: defaultDevelopModeForBaseUrl(baseUrl),
  }
}

export async function handleWebConnect(details: Extract<ShellMessage, { type: 'WEB_CONNECT_EXTENSION' }>['details']): Promise<ShellResponse> {
  const nextConfig = normalizeWebConnectConfig(details)
  if (!nextConfig.baseUrl || !nextConfig.scriptKey) {
    return { ok: false, error: 'Missing Server URL or Script Key.' }
  }

  const { created, service } = await upsertService({
    baseUrl: nextConfig.baseUrl,
    scriptKey: nextConfig.scriptKey,
    developMode: nextConfig.developMode,
    enabled: true,
  })

  if (created) {
    try {
      await syncRulesFromServer({ baseUrl: service.baseUrl, scriptKey: service.scriptKey, developMode: nextConfig.developMode })
    } catch {
      // Connected; user can sync manually.
    }
    await reloadTab(await getActiveTab())
  }

  return {
    ok: true,
    status: await buildStatus(),
    message: created ? 'Extension connected.' : 'Service updated.',
  }
}
