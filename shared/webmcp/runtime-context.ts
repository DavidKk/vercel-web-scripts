import { readWebMcpGlobalHosts } from './registry'

/**
 * Parse Tampermonkey static route script key from a script URL.
 * @param scriptUrl Launcher or remote script URL
 * @returns Script key segment or null
 */
export function parseScriptKeyFromScriptUrl(scriptUrl: string): string | null {
  const remote = scriptUrl.match(/\/static\/([^/]+)\/(?:[a-f0-9]{40}\/)?tampermonkey-remote\.js(?:$|[?#])/i)
  if (remote?.[1]) {
    return remote[1]
  }
  const launcher = scriptUrl.match(/\/static\/([^/]+)\/tampermonkey\.user\.js(?:$|[?#])/i)
  if (launcher?.[1]) {
    return launcher[1]
  }
  const generic = scriptUrl.match(/\/static\/([^/]+)\//)
  return generic?.[1] ?? null
}

function readScriptUrlFromHost(host: Record<string, unknown>): string {
  const value = host.__SCRIPT_URL__
  if (typeof value === 'string' && value.trim()) {
    return value.trim()
  }
  return ''
}

/**
 * Resolve active scriptKey for WebMCP canonical naming.
 * @returns Trimmed script key or empty string
 */
export function resolveWebMcpScriptKey(): string {
  for (const host of readWebMcpGlobalHosts()) {
    const runtimeKey = host.__VWS_SCRIPT_KEY__
    if (typeof runtimeKey === 'string' && runtimeKey.trim()) {
      return runtimeKey.trim()
    }
  }

  if (typeof window !== 'undefined') {
    const pageConfig = (window as Window & { __VWS_PAGE_CONFIG__?: { scriptKey?: string } }).__VWS_PAGE_CONFIG__
    if (typeof pageConfig?.scriptKey === 'string' && pageConfig.scriptKey.trim()) {
      return pageConfig.scriptKey.trim()
    }
  }

  for (const host of readWebMcpGlobalHosts()) {
    const scriptUrl = readScriptUrlFromHost(host)
    if (scriptUrl) {
      const parsed = parseScriptKeyFromScriptUrl(scriptUrl)
      if (parsed) {
        return parsed
      }
    }
  }

  try {
    const scriptUrlDecl = (globalThis as { __SCRIPT_URL__?: unknown }).__SCRIPT_URL__
    if (typeof scriptUrlDecl === 'string' && scriptUrlDecl.trim()) {
      const parsed = parseScriptKeyFromScriptUrl(scriptUrlDecl.trim())
      if (parsed) {
        return parsed
      }
    }
  } catch {
    // undeclared in some bundles
  }

  return ''
}

/**
 * Resolve Gist script file label for registry metadata.
 * @returns Script file/name label
 */
export function resolveWebMcpScriptFile(): string {
  try {
    const gmInfo = (globalThis as { GM_info?: { script?: { name?: string } } }).GM_info
    if (gmInfo?.script?.name) {
      return String(gmInfo.script.name)
    }
  } catch {
    // GM_info may be undeclared
  }
  return 'unknown'
}
