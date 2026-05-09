import { createMCPHttpServer } from '@/initializer/mcp'
import { buildScriptMcpToolsMap } from '@/services/scripts/scriptMcpTools'

import { createMcpSkillResourceProvider } from './skillResources'

/** MCP service name (stable for clients). */
const MCP_NAME = 'magickmonkey-scripts'
/** MCP service version */
const MCP_VERSION = '1.0.0'
/** MCP service description for manifest */
const MCP_DESCRIPTION =
  'MagickMonkey MCP for creating, adding, installing, editing, searching, validating, and managing userscript code for Tampermonkey, Greasemonkey, and browser user scripts stored in the project Gist.'

const { manifest, execute } = createMCPHttpServer(MCP_NAME, MCP_VERSION, MCP_DESCRIPTION, buildScriptMcpToolsMap(), createMcpSkillResourceProvider())

export { execute, manifest }
