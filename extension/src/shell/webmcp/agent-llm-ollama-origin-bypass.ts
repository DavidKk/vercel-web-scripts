/**
 * Ollama rejects requests whose Origin is `chrome-extension://…` (CORS/origins allow-list).
 * Chrome extension fetch always sends that Origin, so local Ollama returns 403
 * unless `OLLAMA_ORIGINS` includes chrome-extension://* — or we strip Origin via DNR.
 *
 * Scope the strip to this extension’s initiator so other pages’ traffic is untouched.
 * Covers any loopback port plus optional LAN Base URL host:port.
 */

import { createExtensionLogger } from '../../shared/logger'

const log = createExtensionLogger('OllamaDNR')

const OLLAMA_STRIP_ORIGIN_LOOPBACK_RULE_ID = 91_434
const OLLAMA_STRIP_ORIGIN_CUSTOM_RULE_ID = 91_435

const LOOPBACK_ANY_PORT_REGEX = '^https?://(127\\.0\\.0\\.1|localhost|\\[::1\\])(?::\\d+)?(?:/.*)?$'

/** Shared install queue so concurrent Base URL changes serialize and converge on the latest URL. */
let installTail: Promise<void> = Promise.resolve()
/** Latest Ollama Base URL requested for DNR (undefined = loopback-only rules). */
let latestBaseUrl: string | undefined
/** Last successfully installed rule key (regex filters joined). */
let installedKey: string | null = null
/** Last install failure message (SW context); cleared on success. */
let lastInstallError: string | null = null

function escapeRegexLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function hostnameForUrlRegex(hostname: string): string {
  // URL.hostname for IPv6 is bare (`::1`); wire form needs brackets.
  if (hostname.includes(':')) {
    return `\\[${escapeRegexLiteral(hostname)}\\]`
  }
  return escapeRegexLiteral(hostname)
}

function isLoopbackHostname(hostname: string): boolean {
  const host = hostname.toLowerCase()
  return host === 'localhost' || host === '127.0.0.1' || host === '::1'
}

/**
 * Only strip Origin for loopback / RFC1918 hosts — never for arbitrary public API domains.
 * @param hostname URL.hostname
 */
export function isOllamaOriginBypassHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  if (isLoopbackHostname(host)) {
    return true
  }
  if (/^10(?:\.\d{1,3}){3}$/.test(host)) {
    return true
  }
  if (/^192\.168(?:\.\d{1,3}){2}$/.test(host)) {
    return true
  }
  if (/^172\.(1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2}$/.test(host)) {
    return true
  }
  return false
}

function parseBaseUrl(baseUrl?: string): URL | null {
  const raw = String(baseUrl ?? '').trim()
  if (!raw) {
    return null
  }
  try {
    const url = new URL(raw)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null
    }
    return url
  } catch {
    return null
  }
}

function modifyHeadersAction(): chrome.declarativeNetRequest.Rule['action'] {
  return {
    type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
    requestHeaders: [
      { header: 'origin', operation: chrome.declarativeNetRequest.HeaderOperation.REMOVE },
      { header: 'referer', operation: chrome.declarativeNetRequest.HeaderOperation.REMOVE },
    ],
  }
}

function resourceTypes(): chrome.declarativeNetRequest.ResourceType[] {
  return [chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST, chrome.declarativeNetRequest.ResourceType.OTHER]
}

/**
 * Build DNR rules for this extension → Ollama (loopback any port + optional LAN host:port).
 * @param baseUrl Optional configured Ollama OpenAI-compatible root
 * @returns One or two rules
 */
export function buildOllamaOriginBypassRules(baseUrl?: string): chrome.declarativeNetRequest.Rule[] {
  const rules: chrome.declarativeNetRequest.Rule[] = [
    {
      id: OLLAMA_STRIP_ORIGIN_LOOPBACK_RULE_ID,
      priority: 1,
      action: modifyHeadersAction(),
      condition: {
        regexFilter: LOOPBACK_ANY_PORT_REGEX,
        initiatorDomains: [chrome.runtime.id],
        resourceTypes: resourceTypes(),
      },
    },
  ]

  const url = parseBaseUrl(baseUrl)
  if (url && isOllamaOriginBypassHost(url.hostname) && !isLoopbackHostname(url.hostname)) {
    // Request URLs omit default ports; require explicit non-default ports only.
    const portPart = url.port ? `:${escapeRegexLiteral(url.port)}` : `(?::${url.protocol === 'https:' ? '443' : '80'})?`
    rules.push({
      id: OLLAMA_STRIP_ORIGIN_CUSTOM_RULE_ID,
      priority: 1,
      action: modifyHeadersAction(),
      condition: {
        regexFilter: `^https?://${hostnameForUrlRegex(url.hostname)}${portPart}(?:/.*)?$`,
        initiatorDomains: [chrome.runtime.id],
        resourceTypes: resourceTypes(),
      },
    })
  }

  return rules
}

/** @deprecated Prefer {@link buildOllamaOriginBypassRules} */
export function buildOllamaOriginBypassRule(baseUrl?: string): chrome.declarativeNetRequest.Rule {
  return buildOllamaOriginBypassRules(baseUrl)[0]
}

function rulesKey(rules: chrome.declarativeNetRequest.Rule[]): string {
  return rules
    .map((rule) => `${rule.id}:${rule.condition.regexFilter ?? ''}`)
    .sort()
    .join('|')
}

/**
 * Last DNR install error in this JS context (service worker), or null after success.
 */
export function getOllamaOriginBypassInstallError(): string | null {
  return lastInstallError
}

/**
 * Short hint for 401/403 errors when Origin-strip DNR failed to install.
 */
export function formatOllamaOriginBypassFailureHint(): string {
  if (!lastInstallError) {
    return ''
  }
  return ` Origin-strip DNR failed (${lastInstallError}). ` + 'Start Ollama with OLLAMA_ORIGINS=chrome-extension://* or reload MagickMonkey.'
}

async function installOllamaOriginBypassRulesOnce(): Promise<void> {
  const targetBaseUrl = latestBaseUrl
  const rules = buildOllamaOriginBypassRules(targetBaseUrl)
  const key = rulesKey(rules)

  if (installedKey === key) {
    if (latestBaseUrl !== targetBaseUrl) {
      return installOllamaOriginBypassRulesOnce()
    }
    return
  }

  await chrome.declarativeNetRequest!.updateDynamicRules({
    removeRuleIds: [OLLAMA_STRIP_ORIGIN_LOOPBACK_RULE_ID, OLLAMA_STRIP_ORIGIN_CUSTOM_RULE_ID],
    addRules: rules,
  })

  installedKey = key
  lastInstallError = null

  if (latestBaseUrl !== targetBaseUrl) {
    return installOllamaOriginBypassRulesOnce()
  }
}

/**
 * Install declarativeNetRequest rules that remove Origin/Referer for local/LAN Ollama.
 * Concurrent calls queue behind one mutex and converge on the latest Base URL.
 * @param baseUrl Optional Ollama API root (drives LAN custom rule)
 */
export async function ensureOllamaOriginBypassRules(baseUrl?: string): Promise<void> {
  if (!chrome.declarativeNetRequest?.updateDynamicRules || !chrome.runtime?.id) {
    lastInstallError = 'declarativeNetRequest unavailable'
    log.warn('Ollama Origin bypass skipped:', lastInstallError)
    return
  }

  latestBaseUrl = baseUrl

  installTail = installTail.then(
    () => installOllamaOriginBypassRulesOnce(),
    () => installOllamaOriginBypassRulesOnce()
  )

  try {
    await installTail
  } catch (error: unknown) {
    installedKey = null
    lastInstallError = error instanceof Error ? error.message : String(error)
    log.warn('Ollama Origin bypass DNR install failed:', lastInstallError)
    throw error
  }
}

/** Stable loopback rule id for tests / cleanup. */
export function getOllamaOriginBypassRuleIdForTests(): number {
  return OLLAMA_STRIP_ORIGIN_LOOPBACK_RULE_ID
}

/** Custom LAN rule id for tests. */
export function getOllamaOriginBypassCustomRuleIdForTests(): number {
  return OLLAMA_STRIP_ORIGIN_CUSTOM_RULE_ID
}

/** Reset memoization between tests. */
export function resetOllamaOriginBypassInstallForTests(): void {
  installTail = Promise.resolve()
  latestBaseUrl = undefined
  installedKey = null
  lastInstallError = null
}
