/**
 * DEBUG command-palette: test optional OTA modules on the current injected page.
 * No separate dev harness route — uses GME_ensureEditorLib() in-page.
 */

import { GME_notification } from '@/ui/notification/index'

import type { CommandPaletteCommand } from './index'

const OVERLAY_ROOT_ID = 'vws-debug-editor-lib-overlay'

type EditorProfile = 'plain' | 'json' | 'javascript' | 'html' | 'css' | 'markdown'
type MountMode = 'direct' | 'isolated'

type RegisterCommand = (command: CommandPaletteCommand) => void

type EditorHandle = {
  destroy: () => void
}

interface OverlayState {
  profile: EditorProfile
  readOnly: boolean
  mode: MountMode
}

let overlayHandle: EditorHandle | null = null
let overlayState: OverlayState = { profile: 'javascript', readOnly: false, mode: 'isolated' }

const SAMPLE_BY_PROFILE: Record<EditorProfile, string> = {
  plain: 'Edit me.\n'.repeat(24),
  json: '{\n  "theme": "ota-dev",\n  "items": [1, 2, 3]\n}',
  javascript: 'function hello() {\n  // Cmd/Ctrl+F to search\n  console.log("editor-lib")\n}\n',
  html: '<!DOCTYPE html>\n<html><body><p>Hello</p></body></html>\n',
  css: '.box {\n  color: #60a5fa;\n  padding: 8px;\n}\n',
  markdown: '# OTA dev\n\nTry **search** with Cmd/Ctrl+F.\n',
}

const BTN_STYLE = 'border:1px solid #2a303a;border-radius:4px;background:#151820;color:#e6eaf0;padding:4px 8px;cursor:pointer;font-size:12px;'

/**
 * Tear down inline editor-lib overlay if present.
 */
function destroyEditorLibOverlay(): void {
  overlayHandle?.destroy()
  overlayHandle = null
  document.getElementById(OVERLAY_ROOT_ID)?.remove()
}

/**
 * Mount or remount editor-lib inside the overlay using current toolbar state.
 * @param mount Host element for the editor
 */
async function mountEditorInOverlay(mount: HTMLElement): Promise<void> {
  overlayHandle?.destroy()
  overlayHandle = null
  mount.innerHTML = ''

  if (typeof GME_ensureEditorLib !== 'function') {
    GME_notification('GME_ensureEditorLib unavailable', 'error', 3500)
    return
  }

  const api = await GME_ensureEditorLib()
  if (!api?.create) {
    GME_notification('editor-lib load failed — run pnpm dev so OTA manifest is served', 'error', 4500)
    return
  }

  try {
    overlayHandle = api.create({
      parent: mount,
      profile: overlayState.profile,
      readOnly: overlayState.readOnly,
      isolated: overlayState.mode === 'isolated',
      value: SAMPLE_BY_PROFILE[overlayState.profile],
      onChange: () => {
        /* manual visual testing only */
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    GME_notification(`editor-lib mount failed: ${message}`, 'error', 4000)
  }
}

/**
 * Open an in-page editor-lib test panel (profile / mode / readOnly controls).
 */
async function openEditorLibTestPanel(): Promise<void> {
  if (document.getElementById(OVERLAY_ROOT_ID)) {
    destroyEditorLibOverlay()
    return
  }

  const root = document.createElement('div')
  root.id = OVERLAY_ROOT_ID
  root.style.cssText =
    'position:fixed;inset:40px 16px 16px;z-index:2147483645;display:flex;flex-direction:column;overflow:hidden;border:1px solid #2a303a;border-radius:8px;background:#111318;box-shadow:0 12px 40px rgba(0,0,0,0.5);font-family:system-ui,sans-serif;'

  const toolbar = document.createElement('div')
  toolbar.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid #2a303a;color:#9aa4b2;font-size:12px;'

  const title = document.createElement('span')
  title.textContent = 'DEBUG editor-lib'
  title.style.cssText = 'font-weight:600;color:#e6eaf0;margin-right:4px;'

  const profileSelect = document.createElement('select')
  profileSelect.style.cssText = BTN_STYLE
  ;(['plain', 'json', 'javascript', 'html', 'css', 'markdown'] as const).forEach((p) => {
    const opt = document.createElement('option')
    opt.value = p
    opt.textContent = p
    if (p === overlayState.profile) opt.selected = true
    profileSelect.appendChild(opt)
  })

  const modeSelect = document.createElement('select')
  modeSelect.style.cssText = BTN_STYLE
  ;(
    [
      ['isolated', 'iframe'],
      ['direct', 'direct'],
    ] as const
  ).forEach(([value, label]) => {
    const opt = document.createElement('option')
    opt.value = value
    opt.textContent = label
    if (value === overlayState.mode) opt.selected = true
    modeSelect.appendChild(opt)
  })

  const readOnlyLabel = document.createElement('label')
  readOnlyLabel.style.cssText = 'display:inline-flex;align-items:center;gap:4px;cursor:pointer;'
  const readOnlyInput = document.createElement('input')
  readOnlyInput.type = 'checkbox'
  readOnlyInput.checked = overlayState.readOnly
  readOnlyLabel.append(readOnlyInput, document.createTextNode('readOnly'))

  const remountBtn = document.createElement('button')
  remountBtn.type = 'button'
  remountBtn.textContent = 'Remount'
  remountBtn.style.cssText = BTN_STYLE

  const closeBtn = document.createElement('button')
  closeBtn.type = 'button'
  closeBtn.textContent = 'Close'
  closeBtn.style.cssText = `${BTN_STYLE}margin-left:auto;`

  const mount = document.createElement('div')
  mount.style.cssText = 'flex:1;min-height:0;'

  const remount = () => {
    overlayState = {
      profile: profileSelect.value as EditorProfile,
      mode: modeSelect.value as MountMode,
      readOnly: readOnlyInput.checked,
    }
    void mountEditorInOverlay(mount)
  }

  profileSelect.addEventListener('change', remount)
  modeSelect.addEventListener('change', remount)
  readOnlyInput.addEventListener('change', remount)
  remountBtn.addEventListener('click', remount)
  closeBtn.addEventListener('click', () => destroyEditorLibOverlay())

  toolbar.append(title, profileSelect, modeSelect, readOnlyLabel, remountBtn, closeBtn)
  root.append(toolbar, mount)
  document.body.appendChild(root)

  await mountEditorInOverlay(mount)
  if (overlayHandle) {
    GME_notification('editor-lib on this page — Cmd/Ctrl+F to search', 'success', 2500)
  }
}

/**
 * Register dev-only OTA debug commands in the command palette.
 * @param register `GME_registerCommandPaletteCommand` from command-palette
 */
export function registerCommandPaletteOtaDebug(register: RegisterCommand): void {
  if (typeof __IS_DEVELOP_MODE__ === 'undefined' || !__IS_DEVELOP_MODE__) {
    return
  }

  register({
    id: 'debug-editor-lib-test',
    keywords: ['debug', 'ota', 'editor', 'editor-lib', 'codemirror', 'test', 'modules'],
    title: 'DEBUG OTA: Test editor-lib',
    icon: '✎',
    hint: 'Mount editor-lib on this page (profile / direct / iframe)',
    action: () => {
      void openEditorLibTestPanel()
    },
  })
}

/** @internal Test hook */
export function __destroyEditorLibTestPanelForTests(): void {
  destroyEditorLibOverlay()
}
