import { NAV_GUARD_POLICY_MESSAGE_TYPE } from '@shared/launcher-constants'
import { NAV_GUARD_POLICY_STORAGE_KEY, type NavGuardPolicy, parseNavGuardPolicy } from '@shared/navigation-guard'

import { loadNavGuardPolicy } from '../shared/navigation-guard/storage'
import { BRIDGE_MESSAGE_SOURCE } from './constants'
import { getExtensionResourceUrl, getRuntimeId } from './extension-context'
import { isHtmlDocumentForInjection } from './injection-gate'

const NAV_GUARD_SCRIPT_PREFIX = 'vws-nav-guard-'

function isHttpPageUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://')
}

function injectNavigationGuardScript(): void {
  const runtimeId = getRuntimeId()
  if (!runtimeId) {
    return
  }
  const scriptId = `${NAV_GUARD_SCRIPT_PREFIX}${runtimeId}`
  if (document.getElementById(scriptId)) {
    return
  }
  const scriptUrl = getExtensionResourceUrl('navigation-guard.js')
  if (!scriptUrl) {
    return
  }
  const script = document.createElement('script')
  script.id = scriptId
  script.src = scriptUrl
  script.async = false
  ;(document.documentElement || document.head || document.body)?.appendChild(script)
}

function postPolicyToPage(policy: NavGuardPolicy): void {
  window.postMessage(
    {
      source: BRIDGE_MESSAGE_SOURCE,
      type: NAV_GUARD_POLICY_MESSAGE_TYPE,
      payload: policy,
    },
    '*'
  )
}

let storageListenerInstalled = false

function installPolicyStorageListener(): void {
  if (storageListenerInstalled) {
    return
  }
  storageListenerInstalled = true
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') {
      return
    }
    const change = changes[NAV_GUARD_POLICY_STORAGE_KEY]
    if (!change) {
      return
    }
    postPolicyToPage(parseNavGuardPolicy(change.newValue))
  })
}

/**
 * Inject page-world navigation guard at document_start and sync policy from storage.
 */
export async function bootstrapNavigationGuard(): Promise<void> {
  if (!getRuntimeId()) {
    return
  }
  const url = typeof location !== 'undefined' ? location.href : ''
  if (!isHttpPageUrl(url) || !isHtmlDocumentForInjection()) {
    return
  }

  injectNavigationGuardScript()
  installPolicyStorageListener()

  try {
    postPolicyToPage(await loadNavGuardPolicy())
  } catch {
    postPolicyToPage(parseNavGuardPolicy(undefined))
  }
}
