import type { AgentLlmProviderId, AgentLlmProviderSettings } from './agent-llm-providers'
import { defaultAgentLlmProviderSettings } from './agent-llm-providers'

export type { AgentLlmProviderId, AgentLlmProviderSettings }

/** Stored in `chrome.storage.local` under `vws_agent_llm_config`. */
export interface AgentLlmConfig {
  /** Active provider (UI dropdown + background router). */
  provider: AgentLlmProviderId
  apiKey: string
  model: string
  /** When false, always use the official host for the active provider (ignore baseUrl). */
  proxyEnabled: boolean
  /**
   * Custom API root for the active provider (no trailing slash required).
   * Used only when `proxyEnabled` is true.
   */
  baseUrl: string
  /** Extra HTTP headers for the active provider; used only when `proxyEnabled` is true. */
  proxyHeaders: Record<string, string>
  /** Saved settings per provider so switching the dropdown can restore keys. */
  byProvider: Partial<Record<AgentLlmProviderId, AgentLlmProviderSettings>>
}

/** Chat turn sent to background LLM proxy. */
export interface AgentLlmMessage {
  role: 'user' | 'model' | 'system'
  text?: string
  toolCalls?: AgentLlmToolCall[]
  toolResults?: AgentLlmToolResult[]
}

export interface AgentLlmToolDefinition {
  name: string
  description?: string
  parameters?: Record<string, unknown>
}

export interface AgentLlmToolCall {
  name: string
  args: Record<string, unknown>
  /**
   * Gemini thinking models attach this to functionCall parts.
   * Must be echoed back on the next generateContent turn or the API returns 400.
   */
  thoughtSignature?: string
}

export interface AgentLlmToolResult {
  name: string
  result: unknown
}

export interface AgentLlmGenerateResult {
  requestId: string
  content?: string
  toolCalls?: AgentLlmToolCall[]
}

/** Model option returned by provider models.list for the settings picker. */
export interface AgentLlmModelInfo {
  id: string
  displayName: string
}

/** Site / global agent preferences (`vws_agent_prefs`). */
export interface AgentPrefs {
  byHost?: Record<string, Record<string, unknown>>
  global?: {
    confirmBeforeWriteTools?: boolean
    toolProviderScope?: 'magickmonkey_only' | 'all'
  }
}

export const VWS_AGENT_LLM_CONFIG_KEY = 'vws_agent_llm_config'
export const VWS_AGENT_PREFS_KEY = 'vws_agent_prefs'

const DEFAULT_GEMINI = defaultAgentLlmProviderSettings('gemini')

export const DEFAULT_AGENT_LLM_CONFIG: AgentLlmConfig = {
  provider: 'gemini',
  apiKey: DEFAULT_GEMINI.apiKey,
  model: DEFAULT_GEMINI.model,
  proxyEnabled: DEFAULT_GEMINI.proxyEnabled,
  baseUrl: DEFAULT_GEMINI.baseUrl,
  proxyHeaders: { ...DEFAULT_GEMINI.proxyHeaders },
  byProvider: {
    gemini: { ...DEFAULT_GEMINI, proxyHeaders: { ...DEFAULT_GEMINI.proxyHeaders } },
  },
}

export const DEFAULT_AGENT_PREFS: AgentPrefs = {
  byHost: {},
  global: {
    confirmBeforeWriteTools: true,
    toolProviderScope: 'magickmonkey_only',
  },
}

/**
 * Snapshot active flat fields into a per-provider settings object.
 * @param config Full LLM config
 * @returns Provider settings slice
 */
export function snapshotActiveProviderSettings(config: AgentLlmConfig): AgentLlmProviderSettings {
  return {
    apiKey: config.apiKey,
    model: config.model,
    proxyEnabled: config.proxyEnabled,
    baseUrl: config.baseUrl,
    proxyHeaders: { ...config.proxyHeaders },
  }
}

/**
 * Merge active provider snapshot into `byProvider` and keep flat fields in sync.
 * @param config Draft config (flat fields already updated for the active provider)
 * @returns Config with `byProvider[config.provider]` updated
 */
export function syncActiveProviderIntoByProvider(config: AgentLlmConfig): AgentLlmConfig {
  return {
    ...config,
    byProvider: {
      ...config.byProvider,
      [config.provider]: snapshotActiveProviderSettings(config),
    },
  }
}

/**
 * Switch active provider, stashing the previous active settings and loading the target stash.
 * @param config Current config
 * @param nextProvider Provider to activate
 * @returns Config with flat fields loaded from `byProvider[nextProvider]` (or defaults)
 */
export function switchAgentLlmProvider(config: AgentLlmConfig, nextProvider: AgentLlmProviderId): AgentLlmConfig {
  if (config.provider === nextProvider) {
    return syncActiveProviderIntoByProvider(config)
  }

  const withStash = syncActiveProviderIntoByProvider(config)
  const loaded = withStash.byProvider[nextProvider] ?? defaultAgentLlmProviderSettings(nextProvider)
  return syncActiveProviderIntoByProvider({
    ...withStash,
    provider: nextProvider,
    apiKey: loaded.apiKey,
    model: loaded.model,
    proxyEnabled: loaded.proxyEnabled,
    baseUrl: loaded.baseUrl,
    proxyHeaders: { ...(loaded.proxyHeaders ?? {}) },
  })
}
