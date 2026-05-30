/** Extension options persisted in chrome.storage.local */
export interface ExtensionConfig {
  /** MagickMonkey origin, e.g. https://your-app.vercel.app */
  baseUrl: string
  /** Script key from Gist / editor (same as tampermonkey route key) */
  scriptKey: string
  /** Extension-only: watch build auto-reload (see dev-extension-reload.ts). Not passed to preset as __IS_DEVELOP_MODE__. */
  developMode: boolean
}

export const DEFAULT_CONFIG: ExtensionConfig = {
  baseUrl: 'http://localhost:3000',
  scriptKey: '',
  developMode: true,
}

export const CONFIG_STORAGE_KEY = 'vws_extension_config'

/** Injected on page before launcher runs */
export interface PageBootstrapConfig extends ExtensionConfig {
  extensionVersion: string
}
