/** Supported Agent LLM providers (add adapters as they ship). */
export type AgentLlmProviderId = 'gemini' | 'openai' | 'anthropic'

/** Per-provider credentials and endpoint settings. */
export interface AgentLlmProviderSettings {
  apiKey: string
  model: string
  proxyEnabled: boolean
  baseUrl: string
  /** Extra HTTP headers when proxy is enabled (e.g. Authorization). */
  proxyHeaders: Record<string, string>
}

/** UI + default copy for a provider option. */
export interface AgentLlmProviderMeta {
  id: AgentLlmProviderId
  label: string
  apiKeyPlaceholder: string
  defaultModel: string
  defaultBaseUrl: string
  proxyToggleText: string
  baseUrlHint: string
}

export const AGENT_LLM_PROVIDER_META: readonly AgentLlmProviderMeta[] = [
  {
    id: 'gemini',
    label: 'Gemini',
    apiKeyPlaceholder: 'Paste Gemini API key',
    defaultModel: 'gemini-2.0-flash',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com',
    proxyToggleText: 'Route requests through a custom Base URL (Gemini protocol). Off by default.',
    baseUrlHint: 'Gemini protocol only. Paste the proxy root; paths still use /v1beta/models/…',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    apiKeyPlaceholder: 'Paste OpenAI API key',
    defaultModel: 'gpt-4o-mini',
    defaultBaseUrl: 'https://api.openai.com/v1',
    proxyToggleText: 'Route requests through a custom Base URL (OpenAI Chat Completions). Off by default.',
    baseUrlHint: 'OpenAI protocol. Prefer a root that includes /v1 (e.g. https://api.openai.com/v1).',
  },
  {
    id: 'anthropic',
    label: 'Claude',
    apiKeyPlaceholder: 'Paste Anthropic API key',
    defaultModel: 'claude-sonnet-4-5',
    defaultBaseUrl: 'https://api.anthropic.com',
    proxyToggleText: 'Route requests through a custom Base URL (Anthropic Messages API). Off by default.',
    baseUrlHint: 'Anthropic protocol. Paste the proxy root; paths still use /v1/messages and /v1/models.',
  },
] as const

const META_BY_ID = Object.fromEntries(AGENT_LLM_PROVIDER_META.map((meta) => [meta.id, meta])) as Record<AgentLlmProviderId, AgentLlmProviderMeta>

/**
 * Look up provider UI metadata.
 * @param id Provider id
 * @returns Meta for the provider (falls back to Gemini)
 */
export function getAgentLlmProviderMeta(id: string): AgentLlmProviderMeta {
  if (id in META_BY_ID) {
    return META_BY_ID[id as AgentLlmProviderId]
  }
  return META_BY_ID.gemini
}

/**
 * Default settings for a provider (empty key, proxy off).
 * @param id Provider id
 * @returns Default per-provider settings
 */
export function defaultAgentLlmProviderSettings(id: AgentLlmProviderId): AgentLlmProviderSettings {
  const meta = getAgentLlmProviderMeta(id)
  return {
    apiKey: '',
    model: meta.defaultModel,
    proxyEnabled: false,
    baseUrl: '',
    proxyHeaders: {},
  }
}

/**
 * Whether a string is a known Agent LLM provider id.
 * @param value Candidate id
 * @returns True when supported
 */
export function isAgentLlmProviderId(value: string): value is AgentLlmProviderId {
  return value === 'gemini' || value === 'openai' || value === 'anthropic'
}
