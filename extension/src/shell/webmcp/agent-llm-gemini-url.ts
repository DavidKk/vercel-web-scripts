import { isValidApiBaseUrl, normalizeApiBaseUrl, resolveProviderApiRoot } from './agent-llm-api-root'
import type { AgentLlmConfig } from './agent-types'

/** Official Gemini Generative Language API host (no path). */
export const OFFICIAL_GEMINI_API_ROOT = 'https://generativelanguage.googleapis.com'

export type GeminiApiRootInput = Pick<AgentLlmConfig, 'proxyEnabled' | 'baseUrl'>

/** @deprecated Prefer {@link normalizeApiBaseUrl} */
export function normalizeGeminiBaseUrl(raw: string): string {
  return normalizeApiBaseUrl(raw)
}

/** @deprecated Prefer {@link isValidApiBaseUrl} */
export function isValidGeminiBaseUrl(normalized: string): boolean {
  return isValidApiBaseUrl(normalized)
}

/**
 * Resolve the Gemini API root from config (official vs custom proxy).
 * @param config Proxy flags from agent LLM config
 * @returns API root without trailing slash
 */
export function resolveGeminiApiRoot(config: GeminiApiRootInput): string {
  return resolveProviderApiRoot(config, OFFICIAL_GEMINI_API_ROOT, 'Gemini')
}

/**
 * Build Gemini generateContent URL.
 * @param root API root from {@link resolveGeminiApiRoot}
 * @param model Model id (e.g. gemini-2.0-flash)
 * @param apiKey API key query parameter
 * @returns Full request URL
 */
export function buildGeminiGenerateContentUrl(root: string, model: string, apiKey: string): string {
  const params = new URLSearchParams({ key: apiKey })
  return `${root}/v1beta/models/${encodeURIComponent(model)}:generateContent?${params.toString()}`
}

/**
 * Build Gemini models.list URL (optional page token).
 * @param root API root from {@link resolveGeminiApiRoot}
 * @param apiKey API key query parameter
 * @param pageToken Optional pagination token
 * @returns Full request URL
 */
export function buildGeminiListModelsUrl(root: string, apiKey: string, pageToken?: string): string {
  const params = new URLSearchParams({ key: apiKey, pageSize: '100' })
  const token = pageToken?.trim()
  if (token) {
    params.set('pageToken', token)
  }
  return `${root}/v1beta/models?${params.toString()}`
}
