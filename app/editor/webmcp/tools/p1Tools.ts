import type { WebMcpToolDefinition } from '@/initializer/webmcp'

import type { EditorPageHandle } from '../EditorPageHandle'
import { toSlotUnavailableResult } from './slotUnavailableResult'

type GetHandle = () => EditorPageHandle

function resolveFilename(handle: EditorPageHandle, filename?: string): string | null {
  return filename?.trim() || handle.session.getSnapshot().activeTab
}

/**
 * Build P1 editor WebMCP tools (layout, file ops, publish, dev mode, AI, rules).
 * @param getHandle Resolver for the aggregated page handle
 * @returns Tool definitions for WebMCP registration
 */
export function buildEditorP1Tools(getHandle: GetHandle): WebMcpToolDefinition[] {
  return [
    {
      name: 'editor_get_layout',
      description: 'Return editor layout: left/right panel widths and open right panel type.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: async () => {
        try {
          return { ok: true as const, layout: getHandle().layout.getLayout() }
        } catch (error) {
          return toSlotUnavailableResult(error)
        }
      },
    },
    {
      name: 'editor_get_active_ota',
      description: 'Return OTA policy for the active managed script file.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: async () => {
        try {
          return { ok: true as const, activeOta: getHandle().session.getActiveOta() }
        } catch (error) {
          return toSlotUnavailableResult(error)
        }
      },
    },
    {
      name: 'editor_close_tab',
      description: 'Close an open editor tab.',
      inputSchema: {
        type: 'object',
        properties: { filename: { type: 'string', description: 'Tab path to close' } },
        required: ['filename'],
        additionalProperties: false,
      },
      execute: async (input: { filename?: string }) => {
        const filename = input.filename?.trim()
        if (!filename) {
          return { ok: false as const, error: 'invalid_input', message: 'filename is required' }
        }
        try {
          getHandle().tabs.close(filename)
          return { ok: true as const, closed: filename }
        } catch (error) {
          return toSlotUnavailableResult(error)
        }
      },
    },
    {
      name: 'editor_apply_patch',
      description: 'Search/replace within a file buffer without publishing to Gist.',
      inputSchema: {
        type: 'object',
        properties: {
          filename: { type: 'string', description: 'Target file; omit for active tab' },
          search: { type: 'string', description: 'Text to find' },
          replace: { type: 'string', description: 'Replacement text' },
          replaceAll: { type: 'boolean', description: 'Replace all occurrences' },
        },
        required: ['search', 'replace'],
        additionalProperties: false,
      },
      execute: async (input: { filename?: string; search?: string; replace?: string; replaceAll?: boolean }) => {
        if (!input.search || input.replace === undefined) {
          return { ok: false as const, error: 'invalid_input', message: 'search and replace are required' }
        }
        try {
          const handle = getHandle()
          const filename = resolveFilename(handle, input.filename)
          if (!filename) {
            return { ok: false as const, error: 'no_active_tab', message: 'No target file' }
          }
          handle.buffer.applyPatch(filename, input.search, input.replace, Boolean(input.replaceAll))
          return { ok: true as const, filename }
        } catch (error) {
          if (error instanceof Error && error.message.includes('not found')) {
            return { ok: false as const, error: 'pattern_not_found', message: error.message }
          }
          return toSlotUnavailableResult(error)
        }
      },
    },
    {
      name: 'editor_discard_changes',
      description: 'Revert a file buffer to its last saved/original content.',
      inputSchema: {
        type: 'object',
        properties: { filename: { type: 'string', description: 'Target file; omit for active tab' } },
        additionalProperties: false,
      },
      execute: async (input: { filename?: string }) => {
        try {
          const handle = getHandle()
          const filename = resolveFilename(handle, input.filename)
          if (!filename) {
            return { ok: false as const, error: 'no_active_tab', message: 'No target file' }
          }
          handle.buffer.discard(filename)
          return { ok: true as const, filename }
        } catch (error) {
          return toSlotUnavailableResult(error)
        }
      },
    },
    {
      name: 'editor_navigate_to_line',
      description: 'Move the Monaco cursor to a line in the active editor.',
      inputSchema: {
        type: 'object',
        properties: { line: { type: 'number', description: '1-based line number' } },
        required: ['line'],
        additionalProperties: false,
      },
      execute: async (input: { line?: number }) => {
        if (!input.line || input.line < 1) {
          return { ok: false as const, error: 'invalid_input', message: 'line must be >= 1' }
        }
        try {
          getHandle().monaco.navigateToLine(Math.floor(input.line))
          return { ok: true as const, line: Math.floor(input.line) }
        } catch (error) {
          return toSlotUnavailableResult(error)
        }
      },
    },
    {
      name: 'editor_create_file',
      description: 'Create a new file in the editor buffer and open its tab.',
      inputSchema: {
        type: 'object',
        properties: {
          filename: { type: 'string', description: 'New file path' },
          content: { type: 'string', description: 'Initial content' },
        },
        required: ['filename'],
        additionalProperties: false,
      },
      execute: async (input: { filename?: string; content?: string }) => {
        const filename = input.filename?.trim()
        if (!filename) {
          return { ok: false as const, error: 'invalid_input', message: 'filename is required' }
        }
        try {
          getHandle().buffer.createFile(filename, input.content ?? '')
          return { ok: true as const, filename }
        } catch (error) {
          return toSlotUnavailableResult(error)
        }
      },
    },
    {
      name: 'editor_rename_file',
      description: 'Rename a file in the editor buffer and update tabs.',
      inputSchema: {
        type: 'object',
        properties: {
          oldPath: { type: 'string', description: 'Current file path' },
          newPath: { type: 'string', description: 'New file path' },
        },
        required: ['oldPath', 'newPath'],
        additionalProperties: false,
      },
      execute: async (input: { oldPath?: string; newPath?: string }) => {
        const oldPath = input.oldPath?.trim()
        const newPath = input.newPath?.trim()
        if (!oldPath || !newPath) {
          return { ok: false as const, error: 'invalid_input', message: 'oldPath and newPath are required' }
        }
        try {
          getHandle().buffer.renameFile(oldPath, newPath)
          return { ok: true as const, oldPath, newPath }
        } catch (error) {
          return toSlotUnavailableResult(error)
        }
      },
    },
    {
      name: 'editor_delete_file',
      description: 'Mark a file deleted in the editor buffer (does not publish to Gist).',
      inputSchema: {
        type: 'object',
        properties: { filename: { type: 'string', description: 'File path to delete' } },
        required: ['filename'],
        additionalProperties: false,
      },
      execute: async (input: { filename?: string }) => {
        const filename = input.filename?.trim()
        if (!filename) {
          return { ok: false as const, error: 'invalid_input', message: 'filename is required' }
        }
        try {
          getHandle().buffer.deleteFile(filename)
          return { ok: true as const, filename }
        } catch (error) {
          return toSlotUnavailableResult(error)
        }
      },
    },
    {
      name: 'editor_save_local',
      description: 'Save a file locally to IndexedDB (Cmd+S path). Does not publish to Gist.',
      inputSchema: {
        type: 'object',
        properties: { filename: { type: 'string', description: 'Target file; omit for active tab' } },
        additionalProperties: false,
      },
      execute: async (input: { filename?: string }) => {
        try {
          const handle = getHandle()
          const filename = resolveFilename(handle, input.filename)
          if (!filename) {
            return { ok: false as const, error: 'no_active_tab', message: 'No target file' }
          }
          await handle.buffer.saveLocal(filename)
          return { ok: true as const, filename }
        } catch (error) {
          return toSlotUnavailableResult(error)
        }
      },
    },
    {
      name: 'editor_compile_active',
      description: 'Compile the active script (or specified files) without publishing to Gist.',
      inputSchema: {
        type: 'object',
        properties: {
          filenames: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional script filenames; defaults to active tab',
          },
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute: async (input: { filenames?: string[] }) => {
        try {
          const result = await getHandle().publish.compile(input.filenames)
          return { ok: result.ok, message: result.message }
        } catch (error) {
          return toSlotUnavailableResult(error)
        }
      },
    },
    {
      name: 'editor_publish_debug',
      description: 'Save changed scripts to Gist as ALPHA debug builds.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      execute: async () => {
        try {
          const result = await getHandle().publish.publishDebug()
          return result
        } catch (error) {
          return toSlotUnavailableResult(error)
        }
      },
    },
    {
      name: 'editor_publish_stable',
      description: 'Publish the active managed script to stable (releases snapshot).',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      execute: async () => {
        try {
          const result = await getHandle().publish.publishStable()
          return result
        } catch (error) {
          return toSlotUnavailableResult(error)
        }
      },
    },
    {
      name: 'editor_get_dev_mode',
      description: 'Return editor dev mode status and host id.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: async () => {
        try {
          return { ok: true as const, devMode: getHandle().devMode.getStatus() }
        } catch (error) {
          return toSlotUnavailableResult(error)
        }
      },
    },
    {
      name: 'editor_toggle_dev_mode',
      description: 'Toggle editor dev mode on or off.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      execute: async () => {
        try {
          getHandle().devMode.toggle()
          return { ok: true as const, devMode: getHandle().devMode.getStatus() }
        } catch (error) {
          return toSlotUnavailableResult(error)
        }
      },
    },
    {
      name: 'editor_push_dev_mode',
      description: 'Compile current scripts and push to Tampermonkey preset via dev mode.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      execute: async () => {
        try {
          const result = await getHandle().devMode.pushToPreset()
          return result
        } catch (error) {
          return toSlotUnavailableResult(error)
        }
      },
    },
    {
      name: 'editor_toggle_ai_panel',
      description: 'Toggle the AI rewrite side panel.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      execute: async () => {
        try {
          getHandle().layout.togglePanel('ai')
          return { ok: true as const, rightPanel: getHandle().layout.getRightPanel() }
        } catch (error) {
          return toSlotUnavailableResult(error)
        }
      },
    },
    {
      name: 'editor_toggle_rules_panel',
      description: 'Toggle the URL rules side panel.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      execute: async () => {
        try {
          getHandle().layout.togglePanel('rules')
          return { ok: true as const, rightPanel: getHandle().layout.getRightPanel() }
        } catch (error) {
          return toSlotUnavailableResult(error)
        }
      },
    },
    {
      name: 'editor_get_rules_for_script',
      description: 'List URL rules for the active script file.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: async () => {
        try {
          return { ok: true as const, rules: getHandle().rules.listForActiveScript() }
        } catch (error) {
          return toSlotUnavailableResult(error)
        }
      },
    },
    {
      name: 'editor_add_rule',
      description: 'Add a wildcard URL rule for the active script file.',
      inputSchema: {
        type: 'object',
        properties: { wildcard: { type: 'string', description: 'URL wildcard pattern' } },
        required: ['wildcard'],
        additionalProperties: false,
      },
      execute: async (input: { wildcard?: string }) => {
        const wildcard = input.wildcard?.trim()
        if (!wildcard) {
          return { ok: false as const, error: 'invalid_input', message: 'wildcard is required' }
        }
        try {
          return getHandle().rules.addRule(wildcard)
        } catch (error) {
          return toSlotUnavailableResult(error)
        }
      },
    },
    {
      name: 'editor_update_rule',
      description: 'Update a rule wildcard by rule id.',
      inputSchema: {
        type: 'object',
        properties: {
          ruleId: { type: 'string', description: 'Rule id' },
          wildcard: { type: 'string', description: 'New wildcard pattern' },
        },
        required: ['ruleId', 'wildcard'],
        additionalProperties: false,
      },
      execute: async (input: { ruleId?: string; wildcard?: string }) => {
        const ruleId = input.ruleId?.trim()
        const wildcard = input.wildcard?.trim()
        if (!ruleId || !wildcard) {
          return { ok: false as const, error: 'invalid_input', message: 'ruleId and wildcard are required' }
        }
        try {
          return getHandle().rules.updateRule(ruleId, wildcard)
        } catch (error) {
          return toSlotUnavailableResult(error)
        }
      },
    },
    {
      name: 'editor_delete_rule',
      description: 'Delete a URL rule by rule id.',
      inputSchema: {
        type: 'object',
        properties: { ruleId: { type: 'string', description: 'Rule id' } },
        required: ['ruleId'],
        additionalProperties: false,
      },
      execute: async (input: { ruleId?: string }) => {
        const ruleId = input.ruleId?.trim()
        if (!ruleId) {
          return { ok: false as const, error: 'invalid_input', message: 'ruleId is required' }
        }
        try {
          return getHandle().rules.deleteRule(ruleId)
        } catch (error) {
          return toSlotUnavailableResult(error)
        }
      },
    },
    {
      name: 'editor_ai_rewrite',
      description: 'Run Gemini rewrite on the active file. Open the AI panel first.',
      inputSchema: {
        type: 'object',
        properties: { instruction: { type: 'string', description: 'Rewrite instruction for the active file' } },
        required: ['instruction'],
        additionalProperties: false,
      },
      execute: async (input: { instruction?: string }) => {
        const instruction = input.instruction?.trim()
        if (!instruction) {
          return { ok: false as const, error: 'invalid_input', message: 'instruction is required' }
        }
        try {
          if (!getHandle().ai.isAvailable()) {
            return { ok: false as const, error: 'ai_panel_closed', message: 'Open AI panel with editor_toggle_ai_panel first' }
          }
          return await getHandle().ai.rewrite(instruction)
        } catch (error) {
          return toSlotUnavailableResult(error)
        }
      },
    },
    {
      name: 'editor_ai_get_pending_diff',
      description: 'Get the latest pending AI rewrite diff for the active file.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: async () => {
        try {
          if (!getHandle().ai.isAvailable()) {
            return { ok: false as const, error: 'ai_panel_closed', message: 'Open AI panel with editor_toggle_ai_panel first' }
          }
          return { ok: true as const, diff: getHandle().ai.getPendingDiff() }
        } catch (error) {
          return toSlotUnavailableResult(error)
        }
      },
    },
    {
      name: 'editor_ai_apply_diff',
      description: 'Apply the pending AI rewrite result to the active file buffer.',
      inputSchema: {
        type: 'object',
        properties: { messageId: { type: 'string', description: 'Optional AI message id' } },
        additionalProperties: false,
      },
      execute: async (input: { messageId?: string }) => {
        try {
          if (!getHandle().ai.isAvailable()) {
            return { ok: false as const, error: 'ai_panel_closed', message: 'Open AI panel with editor_toggle_ai_panel first' }
          }
          return getHandle().ai.applyDiff(input.messageId)
        } catch (error) {
          return toSlotUnavailableResult(error)
        }
      },
    },
    {
      name: 'editor_ai_reject_diff',
      description: 'Discard the pending AI rewrite result.',
      inputSchema: {
        type: 'object',
        properties: { messageId: { type: 'string', description: 'Optional AI message id' } },
        additionalProperties: false,
      },
      execute: async (input: { messageId?: string }) => {
        try {
          if (!getHandle().ai.isAvailable()) {
            return { ok: false as const, error: 'ai_panel_closed', message: 'Open AI panel with editor_toggle_ai_panel first' }
          }
          return getHandle().ai.rejectDiff(input.messageId)
        } catch (error) {
          return toSlotUnavailableResult(error)
        }
      },
    },
  ]
}
