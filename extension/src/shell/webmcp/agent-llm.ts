import { generateAnthropicAgentLlmResponse, listAnthropicAgentModels } from './agent-llm-anthropic'
import { parseGeminiResponse, toGeminiContents, toGeminiToolDeclarations } from './agent-llm-gemini-messages'
import { buildGeminiGenerateContentUrl, buildGeminiListModelsUrl, resolveGeminiApiRoot } from './agent-llm-gemini-url'
import { generateOpenAiAgentLlmResponse, listOpenAiAgentModels } from './agent-llm-openai'
import { isAgentLlmProviderId } from './agent-llm-providers'
import { buildAgentLlmFetchHeaders, normalizeProxyHeaders } from './agent-llm-proxy-headers'
import type { AgentLlmConfig, AgentLlmGenerateResult, AgentLlmMessage, AgentLlmModelInfo, AgentLlmToolDefinition } from './agent-types'
import { DEFAULT_AGENT_LLM_CONFIG, VWS_AGENT_LLM_CONFIG_KEY } from './agent-types'

/** Optional unsaved form overrides for models.list. */
export type AgentLlmListModelsOverrides = {
  apiKey?: string
  proxyEnabled?: boolean
  baseUrl?: string
  proxyHeaders?: Record<string, string>
  provider?: AgentLlmConfig['provider']
}

async function loadAgentLlmConfig(): Promise<AgentLlmConfig> {
  const stored = await chrome.storage.local.get(VWS_AGENT_LLM_CONFIG_KEY)
  const raw = stored[VWS_AGENT_LLM_CONFIG_KEY] as Partial<AgentLlmConfig> | undefined
  const provider = raw?.provider && isAgentLlmProviderId(raw.provider) ? raw.provider : DEFAULT_AGENT_LLM_CONFIG.provider
  return {
    ...DEFAULT_AGENT_LLM_CONFIG,
    ...raw,
    provider,
    proxyHeaders: normalizeProxyHeaders(raw?.proxyHeaders ?? DEFAULT_AGENT_LLM_CONFIG.proxyHeaders),
    byProvider: {
      ...DEFAULT_AGENT_LLM_CONFIG.byProvider,
      ...raw?.byProvider,
    },
  }
}

type GeminiListModelsResponse = {
  models?: Array<{
    name?: string
    displayName?: string
    supportedGenerationMethods?: string[]
  }>
  nextPageToken?: string
  error?: { message?: string }
}

function normalizeGeminiModelId(name: string): string {
  return name.replace(/^models\//, '').trim()
}

function readProviderApiErrorMessage(errorText: string): string | undefined {
  const trimmed = errorText.trim()
  if (!trimmed) {
    return undefined
  }
  const jsonStart = trimmed.indexOf('{')
  if (jsonStart < 0) {
    return undefined
  }
  try {
    const parsed = JSON.parse(trimmed.slice(jsonStart)) as { error?: { message?: string }; message?: string }
    const message = String(parsed.error?.message ?? parsed.message ?? '').trim()
    return message || undefined
  } catch {
    return undefined
  }
}

async function generateGeminiAgentLlmResponse(input: {
  requestId: string
  messages: AgentLlmMessage[]
  tools?: AgentLlmToolDefinition[]
  config: AgentLlmConfig
}): Promise<AgentLlmGenerateResult> {
  if (!input.config.apiKey.trim()) {
    throw new Error('Gemini API key is not configured. Open Agent settings in the side panel.')
  }

  const body: Record<string, unknown> = {
    contents: toGeminiContents(input.messages),
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 4096,
    },
  }

  if (input.tools && input.tools.length > 0) {
    body.tools = [{ functionDeclarations: toGeminiToolDeclarations(input.tools) }]
    body.toolConfig = { functionCallingConfig: { mode: 'AUTO' } }
  }

  const model = input.config.model.trim()
  if (!model) {
    throw new Error('Select a model next to Send before chatting.')
  }
  const root = resolveGeminiApiRoot(input.config)
  const response = await fetch(buildGeminiGenerateContentUrl(root, model, input.config.apiKey), {
    method: 'POST',
    headers: buildAgentLlmFetchHeaders({
      proxyEnabled: input.config.proxyEnabled,
      proxyHeaders: input.config.proxyHeaders,
      contentType: 'application/json',
    }),
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText)
    throw new Error(readProviderApiErrorMessage(errorText) ?? `Gemini API error: ${response.status} ${errorText}`)
  }

  const data = (await response.json()) as Parameters<typeof parseGeminiResponse>[0]
  const parsed = parseGeminiResponse(data)
  return { ...parsed, requestId: input.requestId }
}

async function listGeminiAgentModels(config: Pick<AgentLlmConfig, 'apiKey' | 'proxyEnabled' | 'baseUrl' | 'proxyHeaders'>): Promise<AgentLlmModelInfo[]> {
  const apiKey = config.apiKey.trim()
  if (!apiKey) {
    throw new Error('Gemini API key is not configured.')
  }

  const root = resolveGeminiApiRoot(config)
  const requestHeaders = buildAgentLlmFetchHeaders({
    proxyEnabled: config.proxyEnabled,
    proxyHeaders: normalizeProxyHeaders(config.proxyHeaders),
  })

  const models: AgentLlmModelInfo[] = []
  let pageToken = ''

  for (let page = 0; page < 10; page += 1) {
    const response = await fetch(buildGeminiListModelsUrl(root, apiKey, pageToken || undefined), {
      headers: requestHeaders,
    })
    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText)
      throw new Error(readProviderApiErrorMessage(errorText) ?? `Gemini models.list failed: ${response.status} ${errorText}`)
    }

    const data = (await response.json()) as GeminiListModelsResponse
    if (data.error?.message) {
      throw new Error(data.error.message)
    }

    for (const model of data.models ?? []) {
      const methods = model.supportedGenerationMethods ?? []
      if (!methods.includes('generateContent')) {
        continue
      }
      const rawName = String(model.name ?? '').trim()
      if (!rawName) {
        continue
      }
      const id = normalizeGeminiModelId(rawName)
      if (!id.startsWith('gemini')) {
        continue
      }
      models.push({
        id,
        displayName: String(model.displayName ?? id).trim() || id,
      })
    }

    pageToken = String(data.nextPageToken ?? '').trim()
    if (!pageToken) {
      break
    }
  }

  models.sort((a, b) => a.displayName.localeCompare(b.displayName) || a.id.localeCompare(b.id))
  return models
}

function resolveConfigWithOverrides(config: AgentLlmConfig, overrides?: AgentLlmListModelsOverrides): AgentLlmConfig {
  return {
    ...config,
    provider: overrides?.provider && isAgentLlmProviderId(overrides.provider) ? overrides.provider : config.provider,
    apiKey: overrides?.apiKey ?? config.apiKey,
    proxyEnabled: overrides?.proxyEnabled ?? config.proxyEnabled,
    baseUrl: overrides?.baseUrl ?? config.baseUrl,
    proxyHeaders: normalizeProxyHeaders(overrides?.proxyHeaders ?? config.proxyHeaders),
  }
}

/**
 * Call the active provider generate API from the extension background.
 * @param input Request id, chat turns, optional tools
 * @returns Normalized generate result
 */
export async function generateAgentLlmResponse(input: { requestId: string; messages: AgentLlmMessage[]; tools?: AgentLlmToolDefinition[] }): Promise<AgentLlmGenerateResult> {
  const config = await loadAgentLlmConfig()
  switch (config.provider) {
    case 'openai':
      return generateOpenAiAgentLlmResponse({ ...input, config })
    case 'anthropic':
      return generateAnthropicAgentLlmResponse({ ...input, config })
    case 'gemini':
    default:
      return generateGeminiAgentLlmResponse({ ...input, config })
  }
}

/**
 * List models for the active (or overridden) provider.
 * @param overrides Optional unsaved settings from the side-panel form
 * @returns Model options for the side-panel picker
 */
export async function listAgentLlmModels(overrides?: AgentLlmListModelsOverrides): Promise<AgentLlmModelInfo[]> {
  const config = resolveConfigWithOverrides(await loadAgentLlmConfig(), overrides)
  switch (config.provider) {
    case 'openai':
      return listOpenAiAgentModels(config)
    case 'anthropic':
      return listAnthropicAgentModels(config)
    case 'gemini':
    default:
      return listGeminiAgentModels(config)
  }
}

/** @deprecated Prefer {@link listAgentLlmModels} */
export async function listAgentGeminiModels(overrides?: AgentLlmListModelsOverrides): Promise<AgentLlmModelInfo[]> {
  return listAgentLlmModels(overrides)
}
