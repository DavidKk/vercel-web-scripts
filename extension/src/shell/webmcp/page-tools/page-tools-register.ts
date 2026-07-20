import { PageController } from '@page-agent/page-controller'
import { VWS_WEBMCP_PAGE_SCRIPT_KEY, VWS_WEBMCP_PAGE_TOOLS_SCRIPT_FILE, VWS_WEBMCP_TOOL_REGISTRY_KEY } from '@shared/webmcp/constants'
import { buildVwsWebMcpCanonicalName } from '@shared/webmcp/naming'
import { registerVwsWebMcpTool } from '@shared/webmcp/register-tool'
import { getOrCreateVwsWebMcpToolRegistry } from '@shared/webmcp/registry'

import { ensurePageAgentHighlightsHidden } from './page-agent-highlights'
import { createPageControllerAdapter } from './page-controller-adapter'
import { getPageToolDefinitions } from './page-tools-definitions'

const ENSURED_KEY = '__VWS_PAGE_TOOLS_ENSURED__'

/** Module-local controller — avoid exposing PageController (incl. executeJavascript) on page globals. */
let pageControllerSingleton: PageController | undefined

export interface EnsureVwsPageToolsResult {
  ok: boolean
  already?: boolean
  registered?: string[]
  reason?: string
  message?: string
}

/**
 * Names currently visible to Chromium WebMCP listTools (best-effort).
 */
async function listCurrentWebMcpToolNames(): Promise<string[] | null> {
  try {
    const testing = (navigator as Navigator & { modelContextTesting?: { listTools?: () => Promise<Array<{ name?: string }>> } }).modelContextTesting
    if (typeof testing?.listTools !== 'function') {
      return null
    }
    const tools = await testing.listTools()
    if (!Array.isArray(tools)) {
      return []
    }
    return tools.map((tool) => String(tool?.name ?? '').trim()).filter(Boolean)
  } catch {
    return null
  }
}

/**
 * Mirror MagickMonkey registry onto globalThis so listTools probes always find page-tool metadata
 * even when the primary registry lives on preset `__GLOBAL__`.
 */
function mirrorRegistryOntoGlobalThis(): void {
  const registry = getOrCreateVwsWebMcpToolRegistry()
  const root = globalThis as typeof globalThis & Record<string, unknown>
  if (root[VWS_WEBMCP_TOOL_REGISTRY_KEY] !== registry) {
    root[VWS_WEBMCP_TOOL_REGISTRY_KEY] = registry
  }
}

/**
 * Idempotently register builtin `vws.page.*` tools in the page MAIN world.
 * Reconciles when Chrome dropped tools but MagickMonkey still has ENSURED_KEY / registry rows.
 */
export async function ensureVwsPageToolsInMainWorld(): Promise<EnsureVwsPageToolsResult> {
  const root = globalThis as typeof globalThis & Record<string, unknown>
  // Always re-assert: page navigations / old injected controllers may still paint labels.
  ensurePageAgentHighlightsHidden(document)
  mirrorRegistryOntoGlobalThis()

  const definitions = getPageToolDefinitions()
  const expectedNames = definitions.map((def) => buildVwsWebMcpCanonicalName(VWS_WEBMCP_PAGE_SCRIPT_KEY, def.localName))
  const listedNames = await listCurrentWebMcpToolNames()
  const missingNames = listedNames == null ? expectedNames : expectedNames.filter((name) => !listedNames.includes(name))

  if (root[ENSURED_KEY] === true && missingNames.length === 0) {
    return { ok: true, already: true, registered: expectedNames }
  }

  try {
    if (!pageControllerSingleton) {
      // Indexing still works; overlays are CSS-hidden + cleaned after each tool.
      pageControllerSingleton = new PageController({
        enableMask: false,
        keepSemanticTags: true,
        highlightOpacity: 0,
        highlightLabelOpacity: 0,
      })
    }

    const adapter = createPageControllerAdapter(pageControllerSingleton)
    const registry = getOrCreateVwsWebMcpToolRegistry()
    const registered: string[] = []
    const missingSet = new Set(missingNames)

    for (const def of definitions) {
      const canonicalName = buildVwsWebMcpCanonicalName(VWS_WEBMCP_PAGE_SCRIPT_KEY, def.localName)
      // Chrome may have dropped the tool while MagickMonkey registry still blocks re-register.
      if (missingSet.has(canonicalName) && registry.has(canonicalName)) {
        registry.delete(canonicalName)
      }

      const result = await registerVwsWebMcpTool(
        {
          name: def.name,
          description: def.description,
          inputSchema: def.inputSchema,
          annotations: def.annotations,
          execute: (input) => def.execute(adapter, input),
        },
        {
          scriptKey: VWS_WEBMCP_PAGE_SCRIPT_KEY,
          scriptFile: VWS_WEBMCP_PAGE_TOOLS_SCRIPT_FILE,
          allowReservedPageScriptKey: true,
        }
      )
      if (result.ok && result.canonicalName) {
        registered.push(result.canonicalName)
        continue
      }
      if (result.reason === 'duplicate') {
        // Still present in MagickMonkey registry and (presumably) Chrome — count as success.
        registered.push(canonicalName)
        continue
      }
      if (!result.ok) {
        return {
          ok: false,
          reason: result.reason ?? 'register_failed',
          message: result.message ?? `Failed to register ${def.localName}`,
          registered,
        }
      }
    }

    mirrorRegistryOntoGlobalThis()
    root[ENSURED_KEY] = true
    return { ok: true, registered }
  } catch (error) {
    return {
      ok: false,
      reason: 'register_failed',
      message: error instanceof Error ? error.message : String(error),
    }
  }
}
