/**
 * Reference snippet — not a deployed Gist file.
 * Copy patterns into your userscript when exposing page tools for the extension WebMCP Agent.
 *
 * Requires: Chrome WebMCP flag, MagickMonkey extension shell, preset with GME_registerWebMcpTool.
 * Registered tool name: vws.{scriptKey}.toggle_danmaku
 */

// ==UserScript==
// @name         Example — WebMCP toggle danmaku
// @version      0.1.0
// @description  Registers a page WebMCP tool to show/hide a danmaku layer
// @match        https://example.com/*
// @run-at       document-idle
// ==/UserScript==

function findDanmakuLayer(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-danmaku-layer], .danmaku-layer')
}

void GME_registerWebMcpTool({
  name: 'toggle_danmaku',
  description: 'Show or hide the video danmaku overlay on this page.',
  inputSchema: {
    type: 'object',
    properties: {
      visible: { type: 'boolean', description: 'true to show danmaku, false to hide' },
    },
    required: ['visible'],
  },
  annotations: { readOnlyHint: false },
  execute: async ({ visible }) => {
    const layer = findDanmakuLayer()
    if (!layer) {
      return { ok: false, error: 'danmaku_layer_not_found' }
    }
    layer.style.display = visible ? '' : 'none'
    return { ok: true, visible }
  },
})
