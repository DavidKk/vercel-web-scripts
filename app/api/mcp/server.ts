import { createMCPHttpServer } from '@/initializer/mcp'
import { buildScriptMcpToolsMap } from '@/services/scripts/scriptMcpTools'

/** MCP service name (stable for clients). */
const MCP_NAME = 'magickmonkey-scripts'
/** MCP service version */
const MCP_VERSION = '1.0.0'
/** MCP service description for manifest */
const MCP_DESCRIPTION = 'MagickMonkey Git-backed Tampermonkey script tools (runtime summary, list, get, upsert, delete).'

const { manifest, execute } = createMCPHttpServer(MCP_NAME, MCP_VERSION, MCP_DESCRIPTION, buildScriptMcpToolsMap())

export { execute, manifest }
