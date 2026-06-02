import { SCRIPT_FAILED_MESSAGE_TYPE, SCRIPT_TRIGGERED_MESSAGE_TYPE } from '@shared/launcher-constants'

import { getRuntimeId, isExtensionContextInvalidated } from './extension-context'

const scriptTriggerDedupe = new Set<string>()
let scriptTriggerPageUrl = ''

export function isScriptLifecycleDetail(value: unknown): value is { file: string; runAt: string; scriptKey?: string } {
  return !!value && typeof value === 'object' && typeof (value as { file?: unknown }).file === 'string' && typeof (value as { runAt?: unknown }).runAt === 'string'
}

function reportScriptFailed(file: string, runAt: string): void {
  if (!getRuntimeId()) {
    return
  }
  void chrome.runtime
    .sendMessage({
      type: 'SCRIPT_FAILED',
      details: {
        file,
        runAt,
        url: window.location.href,
      },
    })
    .catch((error) => {
      isExtensionContextInvalidated(error)
    })
}

function reportScriptTriggered(file: string, runAt: string, scriptKey?: string): void {
  const href = window.location.href
  if (href !== scriptTriggerPageUrl) {
    scriptTriggerPageUrl = href
    scriptTriggerDedupe.clear()
  }
  const dedupeKey = `${scriptKey ?? ''}|${file}|${runAt}`
  if (scriptTriggerDedupe.has(dedupeKey)) {
    return
  }
  scriptTriggerDedupe.add(dedupeKey)

  if (!getRuntimeId()) {
    return
  }
  void chrome.runtime
    .sendMessage({
      type: 'SCRIPT_TRIGGERED',
      details: {
        file,
        runAt,
        url: window.location.href,
        scriptKey,
      },
    })
    .catch((error) => {
      isExtensionContextInvalidated(error)
    })
}

export function handleScriptLifecycleMessage(type: string, payload: unknown): void {
  if (!isScriptLifecycleDetail(payload)) {
    return
  }
  if (type === SCRIPT_TRIGGERED_MESSAGE_TYPE) {
    reportScriptTriggered(payload.file, payload.runAt, payload.scriptKey)
    return
  }
  if (type === SCRIPT_FAILED_MESSAGE_TYPE) {
    reportScriptFailed(payload.file, payload.runAt)
  }
}
