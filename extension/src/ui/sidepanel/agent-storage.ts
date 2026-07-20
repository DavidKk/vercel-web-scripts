import { isAgentLlmProviderId } from '@ext/shell/webmcp/agent-llm-providers'
import { normalizeProxyHeaders } from '@ext/shell/webmcp/agent-llm-proxy-headers'
import type { AgentLlmConfig, AgentPrefs } from '@ext/shell/webmcp/agent-types'
import { DEFAULT_AGENT_LLM_CONFIG, DEFAULT_AGENT_PREFS, syncActiveProviderIntoByProvider, VWS_AGENT_LLM_CONFIG_KEY, VWS_AGENT_PREFS_KEY } from '@ext/shell/webmcp/agent-types'

/** Serialize all LLM config writes to avoid load→mutate→save races. */
let agentLlmConfigWriteChain: Promise<unknown> = Promise.resolve()

/**
 * Normalize stored LLM config (legacy flat rows without byProvider / proxyHeaders).
 * @param raw Partial stored value
 * @returns Full config with active provider stashed in byProvider
 */
function normalizeAgentLlmConfig(raw: Partial<AgentLlmConfig> | undefined): AgentLlmConfig {
  const provider = raw?.provider && isAgentLlmProviderId(raw.provider) ? raw.provider : DEFAULT_AGENT_LLM_CONFIG.provider
  const merged: AgentLlmConfig = {
    ...DEFAULT_AGENT_LLM_CONFIG,
    ...raw,
    provider,
    proxyHeaders: normalizeProxyHeaders(raw?.proxyHeaders ?? DEFAULT_AGENT_LLM_CONFIG.proxyHeaders),
    byProvider: {
      ...DEFAULT_AGENT_LLM_CONFIG.byProvider,
      ...raw?.byProvider,
    },
  }
  return syncActiveProviderIntoByProvider(merged)
}

/**
 * Load agent LLM config from extension storage.
 */
export async function loadAgentLlmConfig(): Promise<AgentLlmConfig> {
  const stored = await chrome.storage.local.get(VWS_AGENT_LLM_CONFIG_KEY)
  const raw = stored[VWS_AGENT_LLM_CONFIG_KEY] as Partial<AgentLlmConfig> | undefined
  return normalizeAgentLlmConfig(raw)
}

/**
 * Persist agent LLM config.
 * @param config LLM config
 */
export async function saveAgentLlmConfig(config: AgentLlmConfig): Promise<void> {
  const normalized = normalizeAgentLlmConfig(config)
  await chrome.storage.local.set({
    [VWS_AGENT_LLM_CONFIG_KEY]: normalized,
  })
}

/**
 * Read-modify-write LLM config on a serialized queue.
 * Mutator runs after the latest load inside the queue — re-read form values inside mutator when needed.
 */
export async function updateAgentLlmConfig(mutator: (current: AgentLlmConfig) => AgentLlmConfig | Promise<AgentLlmConfig>): Promise<AgentLlmConfig> {
  const run = agentLlmConfigWriteChain.then(async () => {
    const current = await loadAgentLlmConfig()
    const next = await mutator(current)
    await saveAgentLlmConfig(next)
    return next
  })
  agentLlmConfigWriteChain = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

/** Test helper: wait until queued LLM writes settle. */
export async function flushAgentLlmConfigWritesForTests(): Promise<void> {
  await agentLlmConfigWriteChain
}

/**
 * Load agent preferences from extension storage.
 */
export async function loadAgentPrefs(): Promise<AgentPrefs> {
  const stored = await chrome.storage.local.get(VWS_AGENT_PREFS_KEY)
  const raw = stored[VWS_AGENT_PREFS_KEY] as AgentPrefs | undefined
  return {
    ...DEFAULT_AGENT_PREFS,
    ...raw,
    global: {
      ...DEFAULT_AGENT_PREFS.global,
      ...raw?.global,
    },
    byHost: raw?.byHost ?? {},
  }
}

/**
 * Persist agent preferences.
 * @param prefs Preferences object
 */
export async function saveAgentPrefs(prefs: AgentPrefs): Promise<void> {
  await chrome.storage.local.set({ [VWS_AGENT_PREFS_KEY]: prefs })
}
