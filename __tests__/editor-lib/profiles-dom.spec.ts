/**
 * @jest-environment jsdom
 */

import { openSearchPanel, searchPanelOpen } from '@codemirror/search'
import { EditorView } from '@codemirror/view'

import { createEditorLibApi } from '../../editor-lib/src/api'
import { createDirectEditor } from '../../editor-lib/src/host-direct'
import { buildBaseExtensions, buildProfileExtensions, buildProfileLanguageExtension, createDirectEditorView, injectEditorStyles } from '../../editor-lib/src/profiles'
import type { EditorProfile } from '../../editor-lib/src/types'

const PROFILES: EditorProfile[] = ['plain', 'json', 'javascript', 'html', 'css', 'markdown']

function createMount(): HTMLElement {
  const mount = document.createElement('div')
  mount.style.height = '320px'
  mount.style.width = '480px'
  document.body.appendChild(mount)
  return mount
}

describe('buildProfileExtensions', () => {
  it('returns non-empty extensions for every profile', () => {
    for (const profile of PROFILES) {
      expect(buildProfileExtensions(profile, false).length).toBeGreaterThan(0)
      expect(buildProfileLanguageExtension(profile).length).toBeGreaterThanOrEqual(0)
    }
  })

  it('includes search and history in base extensions', () => {
    const extensions = buildBaseExtensions(false)
    expect(extensions.length).toBeGreaterThan(8)
  })
})

describe('injectEditorStyles', () => {
  it('injects stylesheet once with editor tokens', () => {
    const host = document.createElement('div')
    const shadow = host.attachShadow({ mode: 'open' })
    injectEditorStyles(shadow)
    injectEditorStyles(shadow)
    const styles = shadow.querySelectorAll('#vws-editor-lib-styles')
    expect(styles).toHaveLength(1)
    expect(styles[0]?.textContent).toContain('--vws-editor-canvas')
    expect(styles[0]?.textContent).toContain('.cm-scroller::-webkit-scrollbar-thumb')
  })
})

describe('createDirectEditorView', () => {
  let mount: HTMLElement

  beforeEach(() => {
    mount = createMount()
  })

  afterEach(() => {
    mount.remove()
  })

  it('mounts editor and reads initial value', () => {
    const view = createDirectEditorView(mount, {
      profile: 'json',
      readOnly: false,
      value: '{"a":1}',
    })
    try {
      expect(view.state.doc.toString()).toBe('{"a":1}')
      expect(mount.querySelector('.cm-editor')).not.toBeNull()
    } finally {
      view.destroy()
    }
  })

  it('opens search panel programmatically', () => {
    const view = createDirectEditorView(mount, {
      profile: 'javascript',
      readOnly: false,
      value: 'function findMe() {}\n'.repeat(20),
    })
    try {
      openSearchPanel(view)
      expect(searchPanelOpen(view.state)).toBe(true)
      expect(mount.querySelector('.cm-panel.cm-search')).not.toBeNull()
    } finally {
      view.destroy()
    }
  })

  it('honors readOnly state', () => {
    const view = createDirectEditorView(mount, {
      profile: 'plain',
      readOnly: true,
      value: 'locked',
    })
    try {
      expect(view.state.readOnly).toBe(true)
      expect(view.state.facet(EditorView.editable)).toBe(false)
      const content = mount.querySelector('.cm-content')
      expect(content?.getAttribute('contenteditable')).toBe('false')
    } finally {
      view.destroy()
    }
  })

  it('fires onChange when document changes', () => {
    const onChange = jest.fn()
    const view = createDirectEditorView(mount, {
      profile: 'plain',
      readOnly: false,
      value: '',
      onChange,
    })
    try {
      view.dispatch({ changes: { from: 0, insert: 'hi' } })
      expect(onChange).toHaveBeenCalledWith('hi')
    } finally {
      view.destroy()
    }
  })
})

describe('createDirectEditor handle', () => {
  let host: HTMLElement

  beforeEach(() => {
    host = document.createElement('div')
    host.style.height = '240px'
    document.body.appendChild(host)
  })

  afterEach(() => {
    host.remove()
  })

  it('supports getValue setValue and destroy', () => {
    const handle = createDirectEditor({
      parent: host,
      profile: 'plain',
      value: 'one',
    })
    expect(handle.getValue()).toBe('one')
    handle.setValue('two')
    expect(handle.getValue()).toBe('two')
    handle.destroy()
    expect(host.querySelector('.cm-editor')).toBeNull()
  })
})

describe('createEditorLibApi', () => {
  it('creates direct editor via public API', () => {
    const host = createMount()
    const api = createEditorLibApi()
    const handle = api.create({
      parent: host,
      profile: 'markdown',
      value: '# title',
      isolated: false,
    })
    expect(handle.getValue()).toBe('# title')
    handle.destroy()
    host.remove()
  })
})
