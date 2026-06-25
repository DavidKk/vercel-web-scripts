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

/** Empty legacy config when no enabled service is available (avoids falling back to localhost). */
export const UNCONFIGURED_CONFIG: ExtensionConfig = {
  baseUrl: '',
  scriptKey: '',
  developMode: false,
}

/** @deprecated Legacy single-service config; migrated to {@link SERVICES_STORAGE_KEY}. */
export const CONFIG_STORAGE_KEY = 'vws_extension_config'

/** Multi-service connection entry (Options list row). */
export interface ServiceProfile {
  id: string
  label: string
  baseUrl: string
  scriptKey: string
  enabled: boolean
  /** Dev flag: first enabled row with developMode drives SSE reload (see multi-service-tasks §10.2). */
  developMode?: boolean
  createdAt: number
  updatedAt: number
}

import type { ScriptPermissionMode } from '@shared/script-permission'

/** Per scriptKey metadata shared by all Services with the same scriptKey. */
export interface ScriptKeyMeta {
  scriptKey: string
  /** GM namespace prefix; unique across the extension. */
  gmScope: string
  /** Full trust auto-allows gated APIs; ask prompts (default). */
  permissionMode?: ScriptPermissionMode
}

/** Persisted multi-service state. */
export interface ExtensionServicesState {
  services: ServiceProfile[]
  scriptKeyMeta: ScriptKeyMeta[]
  /** Options UI: currently selected serviceId */
  activeServiceId?: string
}

export const SERVICES_STORAGE_KEY = 'vws_extension_services'

export const SERVICES_MIGRATION_FLAG_KEY = 'vws_extension_services_migrated_v1'

/** Injected on page before launcher runs */
export interface ScriptKeyBootstrapEntry {
  scriptKey: string
  /** OTA representative baseUrl for this scriptKey. */
  baseUrl: string
  /** GM namespace prefix for `{gmScope}_{key}` storage. */
  gmScope: string
  /** Extension develop flag on the OTA representative Service row. */
  developMode: boolean
  /** Per-file enable toggles (`vws_script_enabled:{scriptKey}:{file}`). */
  enabledScripts: Record<string, boolean>
  /** Per-file alpha bundle subscription (`vws_accept_alpha:{scriptKey}:{file}`). */
  acceptAlphaByFile?: Record<string, boolean>
  /** @deprecated Use {@link acceptAlphaByFile}. */
  acceptAlpha?: boolean
  /** Content hashes for permission registry invalidation. */
  contentHashByFile?: Record<string, string>
}

/** Injected on page before launcher runs */
export interface PageBootstrapConfig {
  extensionVersion: string
  /** Whether the host tab is incognito (for GM_info and debug log routing). */
  incognito?: boolean
  /** One entry per enabled unique scriptKey (deduped). */
  scriptKeys: ScriptKeyBootstrapEntry[]
  /** Script keys with Servers → Permission mode = Full trust (page-world sync seed). */
  permissionTrustScriptKeys?: string[]
  /** @deprecated Legacy single-service mirror of the first scriptKey entry. */
  baseUrl?: string
  scriptKey?: string
  developMode?: boolean
}
