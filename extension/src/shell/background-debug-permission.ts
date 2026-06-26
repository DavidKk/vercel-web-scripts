import { ensureExtensionServicesState, getEnabledScriptKeys } from '@ext/shared/extension-storage'
import type { ShellMessage, ShellResponse } from '@ext/shared/messages'

import { getActiveTab } from './background-tab-utils'
import { executeInMainWorldScriptForTab } from './csp-user-script-executor'
import { clearSessionPermissionsForTab, ensureScriptPermissionForTab, setPermissionModalRelay } from './permission-manager'

/** Prefer focused http(s) tab for permission debug prompts (admin UI may be the active tab). */
export async function resolveDebugPermissionTargetTab(): Promise<chrome.tabs.Tab | undefined> {
  const active = await getActiveTab()
  if (active?.url?.startsWith('http://') || active?.url?.startsWith('https://')) {
    return active
  }
  const tabs = await chrome.tabs.query({ lastFocusedWindow: true })
  return tabs.find((t) => t.url?.startsWith('http://') || t.url?.startsWith('https://'))
}

export async function resolveDebugPermissionScriptKey(hint?: string): Promise<string> {
  const trimmed = hint?.trim()
  if (trimmed) {
    return trimmed
  }
  const enabled = getEnabledScriptKeys((await ensureExtensionServicesState()).services)
  if (enabled.length === 0) {
    throw new Error('Configure at least one enabled service (script key).')
  }
  return enabled[0]!
}

/** When debugging from admin, show permission modal on sender tab instead of background storefront tab. */
export function maybeRelayPermissionModalToSender(sender: chrome.runtime.MessageSender, targetTabId: number, focusTab?: boolean): void {
  if (focusTab) {
    return
  }
  const senderTabId = sender.tab?.id
  if (senderTabId == null || senderTabId === targetTabId) {
    return
  }
  setPermissionModalRelay(targetTabId, senderTabId)
}

export async function handleDebugPermissionPrompt(
  message: Extract<ShellMessage, { type: 'DEBUG_PERMISSION_PROMPT' }>,
  sender: chrome.runtime.MessageSender
): Promise<ShellResponse> {
  const target = message.details.target === 'sender' ? sender.tab : await resolveDebugPermissionTargetTab()
  if (target?.id == null) {
    return {
      ok: false,
      error: message.details.target === 'sender' ? 'No sender tab for prompt.' : 'No http(s) tab found. Open a storefront tab or use "Show modal here".',
    }
  }
  const focusTab = message.details.focusTab !== false
  if (focusTab) {
    await chrome.tabs.update(target.id, { active: true })
  } else {
    maybeRelayPermissionModalToSender(sender, target.id, false)
  }
  const forcePrompt = message.details.forcePrompt !== false
  const scriptKey = await resolveDebugPermissionScriptKey(message.details.scriptKey)
  const file = message.details.file ?? '__debug-permission-test__.ts'
  const resource = message.details.resource.trim() || 'example.com'
  const prompts = message.details.batch
    ? ([
        { capability: 'network' as const, resource },
        { capability: 'clipboard-write' as const, resource: '*' },
        { capability: 'open-tab' as const, resource },
      ] as const)
    : ([{ capability: message.details.capability, resource: message.details.resource }] as const)
  let lastAllowed = false
  for (const row of prompts) {
    lastAllowed = await ensureScriptPermissionForTab(
      target.id,
      {
        scriptKey,
        file,
        capability: row.capability,
        resource: row.resource,
      },
      { forcePrompt }
    )
  }
  const tabHint = target.title ? `"${target.title.slice(0, 48)}"` : `tab ${target.id}`
  const outcome = lastAllowed ? 'allowed' : 'denied/dismissed'
  return {
    ok: true,
    allowed: lastAllowed,
    message: message.details.batch
      ? `${focusTab ? `Switched to ${tabHint}. ` : ''}Batch prompt finished (last: ${outcome}).`
      : `${focusTab ? `Switched to ${tabHint}. ` : ''}Prompt finished (${outcome}).`,
  }
}

export async function handleDebugClearTabSessionPermissions(): Promise<ShellResponse> {
  const tab = await resolveDebugPermissionTargetTab()
  if (tab?.id == null) {
    return { ok: false, error: 'No http(s) tab found.' }
  }
  clearSessionPermissionsForTab(tab.id)
  return { ok: true, message: 'Tab session permissions cleared.' }
}

export async function handleDebugRunGmPermissionTest(
  message: Extract<ShellMessage, { type: 'DEBUG_RUN_GM_PERMISSION_TEST' }>,
  sender: chrome.runtime.MessageSender
): Promise<ShellResponse> {
  const tab = await resolveDebugPermissionTargetTab()
  if (tab?.id == null) {
    return { ok: false, error: 'No http(s) tab found.' }
  }
  if (message.details?.focusTab) {
    await chrome.tabs.update(tab.id, { active: true })
  } else {
    maybeRelayPermissionModalToSender(sender, tab.id, false)
  }
  const test = message.details?.test ?? 'xhr'
  const file = message.details?.file?.trim() || '__debug-permission-test__.ts'
  const relayedModal = !message.details?.focusTab && sender.tab?.id != null && sender.tab.id !== tab.id
  let withBody = ''
  let successMessage = ''

  if (test === 'clipboard-read') {
    withBody = `(function(){
  if (!navigator.clipboard || typeof navigator.clipboard.readText !== 'function') {
    throw new Error('navigator.clipboard.readText is unavailable on this page.');
  }
  void navigator.clipboard.readText().then(function(value) {
    console.log('[VWS debug] clipboard read:', value);
  }).catch(function(error) {
    console.error('[VWS debug] clipboard read failed', error);
  });
})();`
    successMessage = 'Read clipboard dispatched on target tab. Check DevTools console for the value (browser may prompt for clipboard-read).'
  } else if (test === 'clipboard-write') {
    const text = message.details?.text?.trim() || '[VWS debug] clipboard write test'
    withBody = `(function(){
  if (typeof enterScriptPermissionScope !== 'function' || typeof GM_setClipboard !== 'function') {
    throw new Error('GM APIs not available — open a page with MagickMonkey shell active.');
  }
  enterScriptPermissionScope(${JSON.stringify(file)}, 'debug');
  GM_setClipboard(${JSON.stringify(text)}, undefined, function() {
    console.log('[VWS debug] GM_setClipboard allowed:', ${JSON.stringify(text)});
    exitScriptPermissionScope();
  });
})();`
    successMessage = relayedModal
      ? 'GM_setClipboard test dispatched. Permission modal should appear on this tab.'
      : 'GM_setClipboard test dispatched. Check the target tab for the permission modal, then verify paste.'
  } else {
    const resource = message.details?.resource?.trim() || 'example.com'
    const url = resource.includes('://') ? resource : `https://${resource}/`
    withBody = `(function(){
  if (typeof enterScriptPermissionScope !== 'function' || typeof GM_xmlhttpRequest !== 'function') {
    throw new Error('GM APIs not available — open a page with MagickMonkey shell active.');
  }
  enterScriptPermissionScope(${JSON.stringify(file)}, 'debug');
  GM_xmlhttpRequest({
    method: 'GET',
    url: ${JSON.stringify(url)},
    onload: function(){ console.log('[VWS debug] GM_xmlhttpRequest allowed'); exitScriptPermissionScope(); },
    onerror: function(e){ console.error('[VWS debug] GM_xmlhttpRequest denied', e); exitScriptPermissionScope(); }
  });
})();`
    successMessage = relayedModal
      ? 'GM_xmlhttpRequest test dispatched. Permission modal should appear on this tab.'
      : 'GM_xmlhttpRequest test dispatched. Check the target tab for the permission modal.'
  }

  const result = await executeInMainWorldScriptForTab(tab.id, 'global', { withBody })
  if (!result.ok) {
    return { ok: false, error: result.message }
  }
  return { ok: true, message: successMessage }
}
