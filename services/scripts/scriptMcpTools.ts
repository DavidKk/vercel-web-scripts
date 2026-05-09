import { z } from 'zod'

import { type Tool, tool } from '@/initializer/mcp/tool'
import {
  batchPatchManagedScriptFiles,
  deleteManagedScriptFile,
  getManagedScriptFile,
  getManagedScriptSnippet,
  listManagedScriptFiles,
  patchManagedScriptFile,
  renameManagedScriptFile,
  replaceManagedScriptFile,
  searchManagedScriptFiles,
  upsertManagedScriptFile,
  validateManagedScriptFile,
} from '@/services/scripts/gistScripts'

/**
 * Build a compact runtime summary that tells AI callers which APIs exist at execution time.
 * @returns Structured preset/runtime capability summary
 */
function buildRuntimeSummary() {
  return {
    routing: {
      primaryIntent: 'manage_magickmonkey_userscripts',
      matchKeywords: ['userscript', 'user script', 'browser user script', 'Tampermonkey', 'Greasemonkey', 'script install', 'script management'],
      preferWhen:
        'Use this MCP for natural-language requests to create, add, install, update, fix, search, validate, rename, delete, sync, or manage MagickMonkey-managed userscript code.',
      doNotUseWhen: 'Do not use this MCP only to install the browser launcher/runtime for an end user; return the launcher userscript URL instead.',
    },
    runtime: {
      installationUrlTemplate: 'https://<host>/static/<scriptKey>/tampermonkey.user.js',
      executionOrder: ['launcher', 'preset', 'remoteBundle'],
      gistViaMcpContainsPreset: false,
      notes: ['MCP/REST read and write Gist source files only.', 'Preset APIs are injected at runtime in browser pages after launcher install.'],
    },
    usageBoundaries: {
      useWhen: [
        'Read, search, create, add, install, update, rename, validate, or delete managed .ts/.js userscript files in the Gist.',
        'Use this for MagickMonkey-managed userscript code requests for Tampermonkey, Greasemonkey, and browser user scripts.',
        'Generate browser userscript code that will run after the MagickMonkey launcher loads the shared preset runtime.',
        'Make token-efficient remote edits through MCP tools instead of copying full files into the conversation.',
        'Inspect runtime APIs before authoring code, especially GM_*, GME_*, and injected constants.',
      ],
      doNotUseWhen: [
        'Do not use this to install runtime for browser end users; they install the launcher userscript URL, not /api/mcp.',
        'Do not use this to edit the launcher, preset bundle, generated entry file, rules JSON, or other project source files.',
        'Do not use this for generic browser automation or scraping when no Gist script file should be read or changed.',
        'Do not call write tools when target domains, path patterns, activation mode, or runtime timing are unclear.',
        'Do not default to broad @match patterns like *://*/*, broad @connect targets, or unnecessary @grant values.',
        'Do not put API keys into Gist files, generated scripts, page DOM, console examples, prompts, commits, or user-visible output.',
      ],
    },
    tokenEfficientEditing: {
      preferredFlow: [
        'Use scripts_search to find candidate files and line-level context before reading full files.',
        'Use scripts_snippet to inspect only the needed line ranges.',
        'Use scripts_replace for exact small replacements with expectedCount.',
        'Use scripts_patch for structured local edits within one file.',
        'Use scripts_batch_patch for related edits across multiple files.',
        'Use scripts_get and scripts_upsert only for large rewrites or when full-file review is necessary.',
      ],
      validation: 'Use scripts_validate after remote-side edits when userscript header sanity matters.',
    },
    authoringRules: {
      headerPolicy: [
        'Before writing or updating userscript content, propose the header metadata for user confirmation in most cases.',
        'Confirmation-critical fields include @name, @version, @description, @match, and @run-at.',
        'Treat @match and @run-at as especially important: confirm where the script runs and when it executes before calling scripts_upsert.',
        'Use @grant and @connect only when needed by the script APIs or network targets.',
        'For updates, read the existing file first and preserve metadata, version, grants, connects, and activation patterns intentionally.',
      ],
      activationPolicy: [
        'Scripts can activate through header @match patterns or configured UI/API rules keyed by filename via matchRule(file).',
        'Ask whether activation should be fixed in the header, dynamic through rules, or both.',
        'Avoid broad header @match patterns when rule-based activation is the better fit.',
      ],
      matchPolicy: [
        'Prefer the narrowest practical @match patterns for the user request.',
        'Do not use broad patterns such as *://*/* unless the user explicitly asks for all supported sites/paths or the task is clearly universal.',
        'If the activation scope is unknown, ask for target domains/paths before calling scripts_upsert.',
      ],
      runAtPolicy: [
        'Choose @run-at based on timing needs.',
        'Use document-start only for early interception.',
        'Use document-body when document.body is enough and full DOMContentLoaded is not required.',
        'Use document-end for DOM-ready behavior.',
        'Use document-idle for most page enhancement or automation scripts.',
        'If timing is unknown, ask before calling scripts_upsert.',
      ],
      supportedRunAt: ['document-start', 'document-body', 'document-end', 'document-idle'],
      validationPolicy: [
        'Before scripts_upsert, ensure the userscript header block is present exactly once.',
        'Use scripts_validate for remote userscript header sanity. It is not a full TypeScript/JavaScript compiler.',
        'Run an additional TypeScript/JavaScript syntax or transpile check when a local toolchain is available.',
        'If validation cannot be run, inspect generated string escapes and state the residual risk.',
      ],
      confirmationExample: [
        '// @name <Script Name>',
        '// @version <Version>',
        '// @description <Short behavior summary>',
        '// @match <scheme>://<target-host>/<target-path>/*',
        '// @run-at document-idle',
      ],
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
      resources: ['GM_getResourceText', 'GM_getResourceURL', 'GM_log', 'GM_setClipboard', 'GM_info'],
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
    globalApiGuidance: {
      preferredDefault: 'Prefer GME_* helpers when they match the task.',
      useGmWhen: 'Use GM_* for Tampermonkey compatibility, native userscript storage, tab/menu primitives, resources, or low-level network behavior.',
      compactSummaryOnly: true,
      advancedUseSparingly: ['unsafeWindow', 'GM_webRequest', 'GM_cookie'],
      exactSignatures: 'preset/src/editor-typings.d.ts',
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
  const list = tool(
    'scripts_list',
    'List MagickMonkey-managed userscript / Tampermonkey / Greasemonkey / browser user script .ts/.js files in the Gist (excludes generated entry and rules JSON).',
    z.object({}),
    async () => listManagedScriptFiles()
  )

  const search = tool(
    'scripts_search',
    'Search MagickMonkey-managed userscript / Tampermonkey / Greasemonkey / browser user script files in the Gist and return compact line-level matches with bounded context. Prefer this before scripts_get to reduce token usage.',
    z.object({
      query: z.string().min(1),
      filename: z.string().min(1).optional().describe('Optional exact Gist filename to search within.'),
      regex: z.boolean().optional(),
      caseSensitive: z.boolean().optional(),
      contextLines: z.number().int().min(0).max(5).optional(),
      maxResults: z.number().int().min(1).max(200).optional(),
    }),
    async (options) => searchManagedScriptFiles(options)
  )

  const snippet = tool(
    'scripts_snippet',
    'Read a bounded line range from one MagickMonkey-managed userscript / Tampermonkey script file instead of returning the full file.',
    z.object({
      filename: z.string().min(1),
      startLine: z.number().int().min(1),
      endLine: z.number().int().min(1),
    }),
    async (options) => getManagedScriptSnippet(options)
  )

  const get = tool(
    'scripts_get',
    'Read one MagickMonkey-managed userscript file for Tampermonkey or browser user scripts by Gist filename.',
    z.object({
      filename: z.string().min(1).describe('Exact file name in the Gist (e.g. my-script.ts)'),
    }),
    async ({ filename }) => getManagedScriptFile(filename)
  )

  const upsert = tool(
    'scripts_upsert',
    'Create, add, install, or replace a MagickMonkey-managed userscript file for Tampermonkey, Greasemonkey, or browser user scripts in the Gist. Before calling this for userscript content, read existing files for updates, propose and confirm header metadata in most cases, especially activation mode, @match domains/path patterns, and @run-at timing, then validate syntax when possible; do not default to broad *://*/* scope unless explicitly requested.',
    z.object({
      filename: z.string().min(1),
      content: z.string(),
    }),
    async ({ filename, content }) => {
      await upsertManagedScriptFile(filename, content)
      return { ok: true as const, filename }
    }
  )

  const replace = tool(
    'scripts_replace',
    'Replace text in one MagickMonkey-managed userscript / Tampermonkey script file server-side. Use expectedCount for safety; avoids full-file get/upsert for small edits.',
    z.object({
      filename: z.string().min(1),
      search: z.string().min(1),
      replace: z.string(),
      regex: z.boolean().optional(),
      caseSensitive: z.boolean().optional(),
      expectedCount: z.number().int().min(0).optional(),
      validate: z.boolean().optional(),
    }),
    async (options) => replaceManagedScriptFile(options)
  )

  const patchOperationSchema = z.discriminatedUnion('type', [
    z.object({
      type: z.literal('replace'),
      search: z.string().min(1),
      replace: z.string(),
      expectedCount: z.number().int().min(0).optional(),
    }),
    z.object({
      type: z.literal('insertBefore'),
      search: z.string().min(1),
      text: z.string(),
      expectedCount: z.number().int().min(0).optional(),
    }),
    z.object({
      type: z.literal('insertAfter'),
      search: z.string().min(1),
      text: z.string(),
      expectedCount: z.number().int().min(0).optional(),
    }),
  ])

  const patch = tool(
    'scripts_patch',
    'Apply structured exact-match patch operations to one MagickMonkey-managed userscript / Tampermonkey script file server-side. Use for local edits without transferring the whole file.',
    z.object({
      filename: z.string().min(1),
      operations: z.array(patchOperationSchema).min(1),
      validate: z.boolean().optional(),
    }),
    async (options) => patchManagedScriptFile(options)
  )

  const batchPatch = tool(
    'scripts_batch_patch',
    'Apply structured exact-match patch operations across multiple MagickMonkey-managed userscript / Tampermonkey script files and write them in one Gist update. Use for related multi-file edits.',
    z.object({
      files: z
        .array(
          z.object({
            filename: z.string().min(1),
            operations: z.array(patchOperationSchema).min(1),
            validate: z.boolean().optional(),
          })
        )
        .min(1),
      validate: z.boolean().optional(),
      atomic: z.boolean().optional().describe('Reserved for compatibility; batch writes are prepared before the single Gist update.'),
    }),
    async (options) => batchPatchManagedScriptFiles(options)
  )

  const validate = tool(
    'scripts_validate',
    'Validate one MagickMonkey-managed userscript file for Tampermonkey or browser user scripts without returning full content. Checks userscript header sanity.',
    z.object({
      filename: z.string().min(1),
    }),
    async ({ filename }) => validateManagedScriptFile(filename)
  )

  const del = tool(
    'scripts_delete',
    'Delete a MagickMonkey-managed userscript file for Tampermonkey or browser user scripts from the Gist.',
    z.object({
      filename: z.string().min(1),
    }),
    async ({ filename }) => {
      await deleteManagedScriptFile(filename)
      return { ok: true as const, filename }
    }
  )

  const rename = tool(
    'scripts_rename',
    'Rename a MagickMonkey-managed userscript / Tampermonkey script file inside the Gist (read old content -> upsert new filename -> delete old filename).',
    z.object({
      fromFilename: z.string().min(1).describe('Existing managed script file name in the Gist (e.g. old.ts)'),
      toFilename: z.string().min(1).describe('New managed script file name in the Gist (e.g. hello.ts)'),
    }),
    async ({ fromFilename, toFilename }) => {
      await renameManagedScriptFile(fromFilename, toFilename)
      return { ok: true as const, fromFilename, toFilename }
    }
  )

  const runtimeSummary = tool(
    'scripts_runtime_summary',
    'Return routing hints and runtime/preset capability summary for MagickMonkey-managed userscript / Tampermonkey / Greasemonkey / browser user script authoring (GM_*, GME_*, constants, and constraints). Call this before generating script content.',
    z.object({}),
    async () => buildRuntimeSummary()
  )

  return new Map([
    [list.name, list],
    [search.name, search],
    [snippet.name, snippet],
    [get.name, get],
    [upsert.name, upsert],
    [replace.name, replace],
    [patch.name, patch],
    [batchPatch.name, batchPatch],
    [validate.name, validate],
    [del.name, del],
    [rename.name, rename],
    [runtimeSummary.name, runtimeSummary],
  ])
}
