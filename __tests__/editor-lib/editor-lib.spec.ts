import { isLikelyEditorLibBundle } from '@shared/preset-launcher-decls'

import { buildIframeSrcdoc, isEditorIframeMessage } from '../../editor-lib/src/iframe-protocol'

describe('editor-lib iframe protocol', () => {
  it('isEditorIframeMessage accepts vws-editor prefixed types', () => {
    expect(isEditorIframeMessage({ type: 'vws-editor-init', profile: 'plain', readOnly: false, value: '' })).toBe(true)
    expect(isEditorIframeMessage({ type: 'other' })).toBe(false)
  })

  it('buildIframeSrcdoc embeds script URL', () => {
    const doc = buildIframeSrcdoc('https://example.com/static/key/abc/editor-lib.js')
    expect(doc).toContain('__VWS_EDITOR_IFRAME_MODE__=true')
    expect(doc).toContain('editor-lib.js')
  })
})

describe('isLikelyEditorLibBundle', () => {
  it('detects register call for editor-lib', () => {
    const fake = 'x'.repeat(2000) + '.register("editor-lib",{version:1})'
    expect(isLikelyEditorLibBundle(fake)).toBe(true)
  })

  it('rejects short or unrelated content', () => {
    expect(isLikelyEditorLibBundle('short')).toBe(false)
    expect(isLikelyEditorLibBundle('x'.repeat(2000))).toBe(false)
  })
})
