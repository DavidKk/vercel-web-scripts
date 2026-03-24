import { z } from 'zod'

import { type Tool, tool } from '@/initializer/mcp/tool'
import { deleteManagedScriptFile, getManagedScriptFile, listManagedScriptFiles, upsertManagedScriptFile } from '@/services/scripts/gistScripts'

/**
 * Build MCP tools for Gist script CRUD (names stable for clients).
 * @returns Map keyed by tool name
 */
export function buildScriptMcpToolsMap(): Map<string, Tool> {
  const list = tool('scripts_list', 'List .ts/.js script files in the Gist (excludes generated entry and rules JSON).', z.object({}), async () => listManagedScriptFiles())

  const get = tool(
    'scripts_get',
    'Read one script file by Gist filename.',
    z.object({
      filename: z.string().min(1).describe('Exact file name in the Gist (e.g. my-script.ts)'),
    }),
    async ({ filename }) => getManagedScriptFile(filename)
  )

  const upsert = tool(
    'scripts_upsert',
    'Create or replace a script file in the Gist.',
    z.object({
      filename: z.string().min(1),
      content: z.string(),
    }),
    async ({ filename, content }) => {
      await upsertManagedScriptFile(filename, content)
      return { ok: true as const, filename }
    }
  )

  const del = tool(
    'scripts_delete',
    'Delete a script file from the Gist.',
    z.object({
      filename: z.string().min(1),
    }),
    async ({ filename }) => {
      await deleteManagedScriptFile(filename)
      return { ok: true as const, filename }
    }
  )

  return new Map([
    [list.name, list],
    [get.name, get],
    [upsert.name, upsert],
    [del.name, del],
  ])
}
