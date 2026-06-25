/**
 * Editor profile identifiers (v1).
 */
export type EditorProfile = 'plain' | 'json' | 'javascript' | 'html' | 'css' | 'markdown'

/**
 * Options for {@link EditorLibApi.create}.
 */
export interface EditorLibCreateOptions {
  /** Mount container (direct mode: CM parent; isolated mode: iframe wrapper). */
  parent: HTMLElement
  profile?: EditorProfile
  readOnly?: boolean
  value?: string
  /** Content change callback. */
  onChange?: (value: string) => void
  /**
   * true: iframe isolation (recommended for third-party admin pages).
   * false: mount CM6 directly inside parent.
   */
  isolated?: boolean
}

/**
 * Live editor instance handle.
 */
export interface EditorHandle {
  getValue(): string
  setValue(value: string): void
  focus(): void
  destroy(): void
}

/**
 * Public editor-lib module API (registered on runtime core).
 */
export interface EditorLibApi {
  version: 1
  ready: true
  create(options: EditorLibCreateOptions): EditorHandle
}

declare global {
  interface Window {
    /** Set by loader before executing editor-lib in an iframe context. */
    __VWS_EDITOR_IFRAME_MODE__?: boolean
    /** Absolute URL of the editor-lib.js bundle (for iframe re-load). */
    __VWS_EDITOR_LIB_SCRIPT_URL__?: string
  }
}

export {}
