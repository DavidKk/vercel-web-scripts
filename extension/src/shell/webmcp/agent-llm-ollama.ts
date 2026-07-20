import { isValidApiBaseUrl, normalizeApiBaseUrl } from './agent-llm-api-root'
import { ensureOllamaOriginBypassRules, formatOllamaOriginBypassFailureHint } from './agent-llm-ollama-origin-bypass'
import { generateOpenAiAgentLlmResponse } from './agent-llm-openai'
import { buildAgentLlmFetchHeaders, normalizeProxyHeaders } from './agent-llm-proxy-headers'
import type { AgentLlmConfig, AgentLlmGenerateResult, AgentLlmMessage, AgentLlmModelInfo, AgentLlmToolDefinition } from './agent-types'

/** Default OpenAI-compatible root for a local Ollama daemon. */
export const OLLAMA_DEFAULT_API_ROOT = 'http://127.0.0.1:11434/v1'

/**
 * Force OpenAI-compatible proxy settings for Ollama (local daemon, optional key).
 * @param config Active provider config
 * @returns Config safe for the OpenAI chat.completions adapter
 */
export function withOllamaOpenAiCompatConfig(config: AgentLlmConfig): AgentLlmConfig {
  const baseUrl = normalizeApiBaseUrl(config.baseUrl) || OLLAMA_DEFAULT_API_ROOT
  if (!isValidApiBaseUrl(baseUrl)) {
    throw new Error('Ollama Base URL must be a valid http(s) URL (e.g. http://127.0.0.1:11434/v1).')
  }
  // Drop inherited Authorization from other providers — local Ollama rarely needs auth,
  // and a leftover Bearer token can surface as a confusing 401.
  const proxyHeaders = { ...normalizeProxyHeaders(config.proxyHeaders) }
  delete proxyHeaders.Authorization
  delete proxyHeaders.authorization
  return {
    ...config,
    proxyEnabled: true,
    baseUrl,
    apiKey: config.apiKey.trim(),
    proxyHeaders,
  }
}

async function prepareOllamaOriginBypass(baseUrl: string): Promise<void> {
  // Await Origin-strip DNR so cold-start does not race a bare chrome-extension Origin → 403.
  // Failures are recorded for 401/403 hints; the request still proceeds.
  await ensureOllamaOriginBypassRules(baseUrl).catch(() => undefined)
}

function enrichOllamaHttpError(root: string, status: number, errorText: string): Error {
  let message = `Ollama API error (${root}): ${status} ${errorText}`
  if (status === 401 || status === 403) {
    message += formatOllamaOriginBypassFailureHint()
  }
  return new Error(message)
}

/**
 * Chat via Ollama’s OpenAI-compatible `/v1/chat/completions`.
 * @param input Request payload + active config
 * @returns Normalized generate result
 */
export async function generateOllamaAgentLlmResponse(input: {
  requestId: string
  messages: AgentLlmMessage[]
  tools?: AgentLlmToolDefinition[]
  config: AgentLlmConfig
}): Promise<AgentLlmGenerateResult> {
  const config = withOllamaOpenAiCompatConfig(input.config)
  await prepareOllamaOriginBypass(config.baseUrl)
  try {
    return await generateOpenAiAgentLlmResponse({
      ...input,
      config,
    })
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error)
    const match = raw.match(/OpenAI API error \(([^)]+)\): (401|403)\b([\s\S]*)$/)
    if (match) {
      throw enrichOllamaHttpError(match[1], Number(match[2]), match[3].trim())
    }
    throw error
  }
}

/**
 * List locally installed Ollama models via OpenAI-compatible `/v1/models`.
 * @param config Active / override config slice
 * @returns Model options for the picker
 */
export async function listOllamaAgentModels(config: Pick<AgentLlmConfig, 'apiKey' | 'proxyEnabled' | 'baseUrl' | 'proxyHeaders'>): Promise<AgentLlmModelInfo[]> {
  const resolved = withOllamaOpenAiCompatConfig({
    provider: 'ollama',
    model: '',
    byProvider: {},
    ...config,
  } as AgentLlmConfig)
  await prepareOllamaOriginBypass(resolved.baseUrl)
  const root = normalizeApiBaseUrl(resolved.baseUrl)
  const response = await fetch(`${root}/models`, {
    headers: buildAgentLlmFetchHeaders({
      proxyEnabled: true,
      proxyHeaders: resolved.proxyHeaders,
      authHeaders: resolved.apiKey.trim() ? { Authorization: `Bearer ${resolved.apiKey.trim()}` } : undefined,
    }),
  })
  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText)
    throw enrichOllamaHttpError(root, response.status, errorText)
  }

  const data = (await response.json()) as { data?: Array<{ id?: string }>; error?: { message?: string } }
  if (data.error?.message) {
    throw new Error(data.error.message)
  }

  const models: AgentLlmModelInfo[] = []
  for (const item of data.data ?? []) {
    const id = String(item.id ?? '').trim()
    if (!id) {
      continue
    }
    models.push({ id, displayName: id })
  }

  models.sort((a, b) => a.displayName.localeCompare(b.displayName) || a.id.localeCompare(b.id))
  return models
}
