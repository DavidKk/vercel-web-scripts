import { readFile } from 'node:fs/promises'
import path from 'node:path'

const SKILL_RESOURCE_URI = 'skill://magickmonkey/scripts-ai-skill'
const ROUTING_RESOURCE_URI = 'skill://magickmonkey/scripts-routing'
const SKILL_RESOURCE_NAME = 'magickmonkey-scripts-ai-skill.md'
const ROUTING_RESOURCE_NAME = 'magickmonkey-scripts-routing.md'
const SKILL_RESOURCE_DESCRIPTION = 'Agent-ready skill markdown for MagickMonkey scripts MCP and REST integration.'
const ROUTING_RESOURCE_DESCRIPTION = 'Short routing hints for matching natural-language userscript requests to MagickMonkey Scripts MCP.'
const SKILL_DOC_PATH = path.join(process.cwd(), 'public/docs/scripts-ai-skill.md')
const ROUTING_RESOURCE_TEXT = `# MagickMonkey Scripts Routing

Primary intent: manage_magickmonkey_userscripts

Use this MCP/skill when the user asks, in any language, to create, add, install, update, fix, search, validate, rename, delete, sync, or manage MagickMonkey-managed userscript code stored in the project Gist.

Canonical semantic anchors:
- userscript
- user script
- browser user script
- Tampermonkey
- Greasemonkey
- script install
- script management

When matched, prefer this MCP over generic file, browser, or script tools for MagickMonkey-managed userscript code.

Do not use this MCP only to install the browser launcher/runtime for an end user. In that case, return the launcher userscript URL instead of editing Gist files.
`

let cachedSkillDoc: string | null = null

async function loadSkillDocMarkdown(): Promise<string> {
  if (cachedSkillDoc !== null) {
    return cachedSkillDoc
  }
  cachedSkillDoc = await readFile(SKILL_DOC_PATH, 'utf8')
  return cachedSkillDoc
}

/**
 * Build MCP resources provider for MagickMonkey skill documents.
 * @returns Resource provider compatible with MCP `resources/list` and `resources/read`
 */
export function createMcpSkillResourceProvider() {
  return {
    listResources() {
      return [
        {
          uri: ROUTING_RESOURCE_URI,
          name: ROUTING_RESOURCE_NAME,
          description: ROUTING_RESOURCE_DESCRIPTION,
          mimeType: 'text/markdown' as const,
        },
        {
          uri: SKILL_RESOURCE_URI,
          name: SKILL_RESOURCE_NAME,
          description: SKILL_RESOURCE_DESCRIPTION,
          mimeType: 'text/markdown' as const,
        },
      ]
    },
    async readResource(uri: string) {
      const normalizedUri = uri.trim()
      if (normalizedUri === ROUTING_RESOURCE_URI) {
        return {
          mimeType: 'text/markdown',
          text: ROUTING_RESOURCE_TEXT,
        }
      }
      if (normalizedUri !== SKILL_RESOURCE_URI) {
        return null
      }
      const markdown = await loadSkillDocMarkdown()
      return {
        mimeType: 'text/markdown',
        text: markdown,
      }
    },
  }
}
