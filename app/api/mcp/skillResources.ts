import { readFile } from 'node:fs/promises'
import path from 'node:path'

const SKILL_RESOURCE_URI = 'skill://magickmonkey/scripts-ai-skill'
const SKILL_RESOURCE_NAME = 'magickmonkey-scripts-ai-skill.md'
const SKILL_RESOURCE_DESCRIPTION = 'Agent-ready skill markdown for MagickMonkey scripts MCP and REST integration.'
const SKILL_DOC_PATH = path.join(process.cwd(), 'public/docs/scripts-ai-skill.md')

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
          uri: SKILL_RESOURCE_URI,
          name: SKILL_RESOURCE_NAME,
          description: SKILL_RESOURCE_DESCRIPTION,
          mimeType: 'text/markdown' as const,
        },
      ]
    },
    async readResource(uri: string) {
      if (uri.trim() !== SKILL_RESOURCE_URI) {
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
