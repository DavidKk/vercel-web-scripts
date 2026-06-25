#!/usr/bin/env node
/**
 * One-off: migrate shopline-local-render-idb-editor.ts CM5 block → editor-lib.
 * Usage: node scripts/migrate-idb-editor-lib.mjs < scripts-get.json
 */

import fs from 'fs'

const input = fs.readFileSync(0, 'utf8')
const data = JSON.parse(input)
let src = data.content

const editorHelpers = `function guessEditorProfile(filePath) {
  const lang = guessLanguage(filePath)
  const map = {
    json: 'json',
    css: 'css',
    javascript: 'javascript',
    typescript: 'javascript',
    html: 'html',
    markdown: 'markdown',
    plaintext: 'plain',
  }
  return map[lang] || 'plain'
}

const editorBridge = {
  handle: /** @type {{ getValue: () => string; setValue: (v: string) => void; focus: () => void; destroy: () => void } | null} */ (null),
  profile: '',
  readOnly: true,
  loading: /** @type {Promise<{ getValue: () => string; setValue: (v: string) => void; focus: () => void; destroy: () => void } | null> | null} */ (null),
  ignoreChangesUntil: 0,
}

function getEditorWrap() {
  return getPanel().querySelector('[data-role="editor-wrap"]')
}

function getEditorHost() {
  const wrap = getEditorWrap()
  if (!wrap) return null
  let host = wrap.querySelector('[data-role="editor-host"]')
  if (!host) {
    host = document.createElement('div')
    host.setAttribute('data-role', 'editor-host')
    host.style.cssText = 'flex:1;display:flex;min-height:0;width:100%;'
    wrap.appendChild(host)
  }
  return host
}

function destroyEditorMount() {
  if (editorBridge.handle) {
    editorBridge.handle.destroy()
    editorBridge.handle = null
  }
  editorBridge.loading = null
  editorBridge.profile = ''
  const host = getEditorWrap()?.querySelector('[data-role="editor-host"]')
  if (host) host.innerHTML = ''
}

async function mountEditor({ content, filePath, readOnly, forceNew = false }) {
  const profile = guessEditorProfile(filePath)
  const nextReadOnly = readOnly ?? !filePath
  const needsRecreate =
    forceNew || !editorBridge.handle || editorBridge.profile !== profile || editorBridge.readOnly !== nextReadOnly

  if (needsRecreate) {
    destroyEditorMount()
  }

  const host = getEditorHost()
  if (!host) return null

  if (!editorBridge.handle) {
    if (!editorBridge.loading) {
      editorBridge.loading = (async () => {
        const api = await GME_ensureEditorLib()
        if (!api) throw new Error('editor-lib unavailable')
        return api.create({
          parent: host,
          profile,
          value: content ?? state.draftContent,
          readOnly: nextReadOnly,
          isolated: true,
          onChange: (value) => {
            if (Date.now() < editorBridge.ignoreChangesUntil) return
            if (state.loading || !state.selectedPath) return
            state.draftContent = String(value || '')
            state.dirty = true
            updateEditorUi()
          },
        })
      })()
    }
    try {
      editorBridge.handle = await editorBridge.loading
      editorBridge.profile = profile
      editorBridge.readOnly = nextReadOnly
    } catch (error) {
      editorBridge.loading = null
      GME_fail(LOG_NS, 'editor-lib load failed', error)
      setStatus('Editor unavailable — build editor-lib OTA and enable Shell network')
      return null
    }
  } else if (content !== undefined) {
    markIgnoreEditorChanges()
    editorBridge.handle.setValue(content == null ? '' : String(content))
  }

  return editorBridge.handle
}

function markIgnoreEditorChanges(ms = 500) {
  editorBridge.ignoreChangesUntil = Date.now() + ms
}

async function setEditorContent(content, filePath, readOnly) {
  state.draftContent = content
  markIgnoreEditorChanges()
  await mountEditor({ content, filePath, readOnly })
}

function getEditorContent() {
  return editorBridge.handle?.getValue() ?? state.draftContent
}

async function requestEditorContent() {
  if (editorBridge.handle) {
    return editorBridge.handle.getValue()
  }
  return state.draftContent
}

async function setEditorReadOnly(readOnly) {
  await mountEditor({
    content: state.draftContent,
    filePath: state.selectedPath,
    readOnly,
    forceNew: editorBridge.readOnly !== readOnly,
  })
}

function focusEditor() {
  editorBridge.handle?.focus()
}

function refreshEditorLayout() {
  focusEditor()
}

function destroyEditorIframe() {
  destroyEditorMount()
}

function ensureEditorIframe(forceNew = false) {
  void mountEditor({
    content: state.draftContent,
    filePath: state.selectedPath,
    readOnly: !state.selectedPath,
    forceNew,
  })
  return getEditorHost()
}
`

src = src.replace(
  /\/\/ @version\s+1\.3\.4\n\/\/ @description[^\n]*\n/,
  `// @version      1.4.0
// @description  Browse, search, and edit local-render theme files in IndexedDB (editor-lib OTA + VS Code-style tree)
`
)
src = src.replace(/\n\/\/ @connect\s+cdnjs\.cloudflare\.com\n/, '\n')
src = src.replace("const CM_BASE = 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.18'\n", '')
src = src.replace(
  "const DEFAULT_STATUS = 'IndexedDB only — Cmd/Ctrl+S save. Cmd/Ctrl+K then 0–6 fold levels.'",
  "const DEFAULT_STATUS = 'IndexedDB only — Cmd/Ctrl+S save. Editor: MagickMonkey editor-lib OTA.'"
)

src = src.replace(/const editorBridge = \{[\s\S]*?ignoreChangesUntil: 0,\n\}/, 'const __EDITOR_BRIDGE_PLACEHOLDER__ = true')

src = src.replace(/function guessCmMode\(filePath\) \{[\s\S]*?\n\}\n\n/, `${editorHelpers}\n\n`)

src = src.replace('const __EDITOR_BRIDGE_PLACEHOLDER__ = true\n\n', '')

const cm5Start = 'function buildCodeMirrorSrcdoc()'
const cm5End = "function refreshEditorLayout() {\n  postToEditor({ type: 'lr-cm-refresh' })\n}\n\n"
if (src.includes(cm5Start)) {
  const start = src.indexOf(cm5Start)
  const end = src.indexOf(cm5End) + cm5End.length
  src = src.slice(0, start) + src.slice(end)
}

src = src.replace('    setEditorContent(formatted, state.selectedPath, false)', '    await setEditorContent(formatted, state.selectedPath, false)')
src = src.replace('    setEditorContent(content, filePath, false)', '    await setEditorContent(content, filePath, false)')
src = src.replace('  setEditorReadOnly(!state.selectedPath)', '  void setEditorReadOnly(!state.selectedPath)')

src = src.replace(
  `function applyPanelChordDigit(digit) {
  clearPanelChord()
  postToEditor({ type: 'lr-cm-fold-level', level: digit })
  setChordStatus(digit === 0 ? '已全部展开' : \`已折叠至层级 \${digit}\`, false)
  setTimeout(() => setChordStatus('', false), 1200)
}`,
  `function applyPanelChordDigit(_digit) {
  clearPanelChord()
  setChordStatus('层级折叠在 editor-lib v1 中暂不可用', false)
  setTimeout(() => setChordStatus('', false), 1200)
}`
)

src = src.replace(
  `    #\${PANEL_ID} .lr-editor-wrap iframe {
      flex: 1;
      width: 100%;
      border: none;
      min-height: 0;
      background: #1e1e1e;
    }`,
  `    #\${PANEL_ID} .lr-editor-wrap [data-role="editor-host"] {
      flex: 1;
      width: 100%;
      min-height: 0;
      display: flex;
      background: #1e1e1e;
    }
    #\${PANEL_ID} .lr-editor-wrap [data-role="editor-host"] iframe {
      flex: 1;
      width: 100%;
      border: none;
      min-height: 0;
      background: #1e1e1e;
    }`
)

src = src.replace(
  `      if (!active || active.tagName !== 'IFRAME') {
        startPanelChord(event)
        return
      }`,
  `      const editorHost = getEditorHost()
      const inEditor = editorHost && active && (editorHost.contains(active) || active.tagName === 'IFRAME')
      if (!inEditor) {
        startPanelChord(event)
        return
      }`
)

src = src.replace(
  "GME_info(LOG_NS, 'installed v1.3.4; Cmd/Ctrl+K chord fold with status bar')",
  "GME_info(LOG_NS, 'installed v1.4.0; editor-lib OTA (fold chords deferred to v2)')"
)

if (src.includes('buildCodeMirrorSrcdoc') || src.includes('postToEditor')) {
  // eslint-disable-next-line no-console -- CLI migration guard
  console.error('Migration incomplete: CM5 remnants remain')
  process.exit(1)
}

process.stdout.write(src)
