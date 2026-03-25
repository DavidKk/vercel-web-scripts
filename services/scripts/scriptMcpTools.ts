import { z } from 'zod'

import { type Tool, tool } from '@/initializer/mcp/tool'
import { deleteManagedScriptFile, getManagedScriptFile, listManagedScriptFiles, upsertManagedScriptFile } from '@/services/scripts/gistScripts'

/**
 * Build a compact runtime summary that tells AI callers which APIs exist at execution time.
 * @returns Structured preset/runtime capability summary
 */
function buildRuntimeSummary() {
  return {
    runtime: {
      installationUrlTemplate: 'https://<host>/static/<scriptKey>/tampermonkey.user.js',
      executionOrder: ['launcher', 'preset', 'remoteBundle'],
      gistViaMcpContainsPreset: false,
      notes: ['MCP/REST read and write Gist source files only.', 'Preset APIs are injected at runtime in browser pages after launcher install.'],
    },
    constants: ['__BASE_URL__', '__RULE_API_URL__', '__EDITOR_URL__', '__PROJECT_VERSION__', '__SCRIPT_UPDATED_AT__', '__PRESET_BUILD_HASH__'],
    gmApis: {
      network: ['GM_xmlhttpRequest'],
      storage: [
        'GM_getValue',
        'GM_setValue',
        'GM_deleteValue',
        'GM_listValues',
        'GM_getValues',
        'GM_setValues',
        'GM_deleteValues',
        'GM_addValueChangeListener',
        'GM_removeValueChangeListener',
      ],
      uiAndPage: ['GM_addElement', 'GM_addStyle', 'GM_registerMenuCommand', 'GM_unregisterMenuCommand', 'GM_notification', 'GM_openInTab', 'GM_download'],
      resources: ['GM_getResourceText', 'GM_getResourceURL', 'GM_log', 'GM_setClipboard'],
      tabs: ['GM_getTab', 'GM_saveTab', 'GM_getTabs'],
      advanced: ['GM_webRequest', 'GM_cookie'],
    },
    gmeApis: {
      menu: ['GME_registerMenuCommand', 'GME_updateMenuCommand'],
      commandPalette: ['GME_registerCommandPaletteCommand', 'GME_openCommandPalette'],
      nodeToolbar: ['GME_registerNodeToolbar', 'GME_registerNodeToolbarQuery', 'GME_unregisterNodeToolbar'],
      networkAndTooling: ['GME_fetch', 'GME_curl', 'GME_preview'],
      domAndTiming: ['GME_waitFor', 'GME_watchFor', 'GME_watchForVisible', 'GME_pollFor', 'GME_sleep', 'GME_isVisible'],
      utilities: ['GME_debounce', 'GME_throttle', 'GME_sha1', 'GME_md5', 'GME_uuid'],
      notificationsAndLogs: ['GME_ok', 'GME_info', 'GME_warn', 'GME_fail', 'GME_group', 'GME_notification', 'GME_notification_update', 'GME_notification_close'],
    },
    references: {
      typingsSource: 'preset/src/editor-typings.d.ts',
      typingsGenerated: 'lib/tampermonkey-editor-typings.generated.ts',
      humanDocs: 'public/docs/scripts-ai-skill.md',
    },
  }
}

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

  const runtimeSummary = tool(
    'scripts_runtime_summary',
    'Return runtime/preset capability summary (GM_*, GME_*, constants, and authoring constraints). Call this before generating script content.',
    z.object({}),
    async () => buildRuntimeSummary()
  )

  return new Map([
    [list.name, list],
    [get.name, get],
    [upsert.name, upsert],
    [del.name, del],
    [runtimeSummary.name, runtimeSummary],
  ])
}
