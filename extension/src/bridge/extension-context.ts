/** Set after first invalidated chrome.* call — old content script survives extension reload until tab refresh. */
let extensionContextDead = false

export function markExtensionContextDead(): void {
  extensionContextDead = true
}

export function isExtensionContextInvalidated(error: unknown): boolean {
  if (error instanceof Error && error.message.includes('Extension context invalidated')) {
    markExtensionContextDead()
    return true
  }
  return false
}

export function getRuntimeId(): string | null {
  if (extensionContextDead) {
    return null
  }
  try {
    const id = chrome.runtime?.id ?? null
    if (!id) {
      return null
    }
    // `runtime.id` alone can still be truthy after reload; getManifest confirms the context.
    chrome.runtime.getManifest()
    return id
  } catch {
    markExtensionContextDead()
    return null
  }
}

export function getExtensionVersion(): string {
  if (extensionContextDead) {
    return '0.0.0'
  }
  try {
    return chrome.runtime.getManifest().version ?? '0.0.0'
  } catch {
    markExtensionContextDead()
    return '0.0.0'
  }
}

export function getExtensionResourceUrl(path: string): string | null {
  try {
    if (!getRuntimeId()) {
      return null
    }
    return chrome.runtime.getURL(path)
  } catch {
    return null
  }
}
