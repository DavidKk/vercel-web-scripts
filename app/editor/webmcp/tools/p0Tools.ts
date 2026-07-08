import type { WebMcpToolDefinition } from '@/initializer/webmcp'

import type { EditorPageHandle } from '../EditorPageHandle'
import { toSlotUnavailableResult } from './slotUnavailableResult'

type GetHandle = () => EditorPageHandle

/**
 * Build P0 editor WebMCP tools (session read + tab/buffer navigation).
 * @param getHandle Resolver for the aggregated page handle
 * @returns Tool definitions for WebMCP registration
 */
export function buildEditorP0Tools(getHandle: GetHandle): WebMcpToolDefinition[] {
  return [
    {
      name: 'editor_webmcp_ping',
      description: 'MagickMonkey editor WebMCP registry smoke test. Returns page id and mounted slots.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: async () => {
        const handle = getHandle()
        return {
          ok: true as const,
          pageId: handle.meta.getPageId(),
          mountedSlots: handle.meta.listMountedSlots(),
        }
      },
    },
    {
      name: 'editor_get_session',
      description: 'Return editor session snapshot: open tabs, active tab, dirty files, layout, and dev mode.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: async () => {
        try {
          return { ok: true as const, session: getHandle().session.getSnapshot() }
        } catch (error) {
          return toSlotUnavailableResult(error)
        }
      },
    },
    {
      name: 'editor_list_open_tabs',
      description: 'List open editor tabs with unsaved-change markers.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: async () => {
        try {
          return { ok: true as const, tabs: getHandle().tabs.list() }
        } catch (error) {
          return toSlotUnavailableResult(error)
        }
      },
    },
    {
      name: 'editor_get_active_buffer',
      description: 'Read the active file buffer (modified content and status).',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: async () => {
        try {
          const buffer = getHandle().buffer.getActive()
          return { ok: true as const, buffer }
        } catch (error) {
          return toSlotUnavailableResult(error)
        }
      },
    },
    {
      name: 'editor_get_file_buffer',
      description: 'Read a file buffer by path.',
      inputSchema: {
        type: 'object',
        properties: {
          filename: { type: 'string', description: 'Gist filename (e.g. example.user.ts)' },
        },
        required: ['filename'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute: async (input: { filename?: string }) => {
        const filename = input.filename?.trim()
        if (!filename) {
          return { ok: false as const, error: 'invalid_input', message: 'filename is required' }
        }
        try {
          const buffer = getHandle().buffer.get(filename)
          return { ok: true as const, buffer }
        } catch (error) {
          return toSlotUnavailableResult(error)
        }
      },
    },
    {
      name: 'editor_list_dirty_files',
      description: 'List filenames with unsaved buffer changes.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: async () => {
        try {
          return { ok: true as const, dirtyFiles: getHandle().buffer.listDirty() }
        } catch (error) {
          return toSlotUnavailableResult(error)
        }
      },
    },
    {
      name: 'editor_open_tab',
      description: 'Open a file tab and focus it.',
      inputSchema: {
        type: 'object',
        properties: {
          filename: { type: 'string', description: 'Gist filename to open' },
        },
        required: ['filename'],
        additionalProperties: false,
      },
      execute: async (input: { filename?: string }) => {
        const filename = input.filename?.trim()
        if (!filename) {
          return { ok: false as const, error: 'invalid_input', message: 'filename is required' }
        }
        try {
          getHandle().tabs.open(filename)
          return { ok: true as const, activeTab: filename }
        } catch (error) {
          return toSlotUnavailableResult(error)
        }
      },
    },
    {
      name: 'editor_switch_tab',
      description: 'Switch to an already-open tab.',
      inputSchema: {
        type: 'object',
        properties: {
          filename: { type: 'string', description: 'Open tab path' },
        },
        required: ['filename'],
        additionalProperties: false,
      },
      execute: async (input: { filename?: string }) => {
        const filename = input.filename?.trim()
        if (!filename) {
          return { ok: false as const, error: 'invalid_input', message: 'filename is required' }
        }
        try {
          getHandle().tabs.switchTo(filename)
          return { ok: true as const, activeTab: filename }
        } catch (error) {
          return toSlotUnavailableResult(error)
        }
      },
    },
    {
      name: 'editor_apply_buffer',
      description: 'Write content to a file buffer without publishing to Gist. Defaults to the active tab.',
      inputSchema: {
        type: 'object',
        properties: {
          filename: { type: 'string', description: 'Target file; omit to use active tab' },
          content: { type: 'string', description: 'New buffer content' },
        },
        required: ['content'],
        additionalProperties: false,
      },
      execute: async (input: { filename?: string; content?: string }) => {
        if (input.content === undefined) {
          return { ok: false as const, error: 'invalid_input', message: 'content is required' }
        }
        try {
          const handle = getHandle()
          const filename = input.filename?.trim() || handle.session.getSnapshot().activeTab
          if (!filename) {
            return { ok: false as const, error: 'no_active_tab', message: 'No active tab and filename was not provided' }
          }
          handle.buffer.apply(filename, input.content)
          return { ok: true as const, filename, hasUnsavedChanges: true }
        } catch (error) {
          return toSlotUnavailableResult(error)
        }
      },
    },
  ]
}
