import type { RuntimeScriptModuleCatalogEntry } from '@shared/runtime-script-modules'
import type { ScriptOtaPolicy } from '@shared/script-ota-policy'

/** One scriptKey load request from content bootstrap. */
export interface RuntimeLoadEntry {
  scriptKey: string
  baseUrl: string
  gmScope: string
  developMode: boolean
  enabledScripts: Record<string, boolean>
  acceptAlphaByFile?: Record<string, boolean>
  acceptAlpha?: boolean
  contentHashByFile?: Record<string, string>
}

/** Background module-loader input. */
export interface RuntimeEnsureLoadRequest {
  tabId: number
  pageUrl: string
  entries: RuntimeLoadEntry[]
}

/** Manifest subset used by the native loader. */
export interface LoaderModuleManifest {
  modules?: Array<{
    id?: string
    url?: string
    hash?: { algorithm?: string; value?: string }
  }>
  projectVersion?: string
  runtime?: {
    stage?: string
    autoUpgrade?: boolean
    lockedVersion?: string | null
    scriptLoadMode?: 'aggregate' | 'match-fallback'
  }
  scriptPolicies?: Record<string, ScriptOtaPolicy & { version?: string }>
  scriptModules?: RuntimeScriptModuleCatalogEntry[]
}

/** Payload relayed to page world when preset is ready. */
export interface RuntimePresetReadyPayload {
  scriptKey: string
  gmScope: string
  globals: Record<string, string | boolean>
  runtimeScriptUrl: string
  scriptPolicies: Record<string, ScriptOtaPolicy & { version?: string }>
  otaManualUpdate: boolean
  enabledScripts: Record<string, boolean>
  contentHashByFile: Record<string, string>
  scriptLoadMode: 'aggregate' | 'match-fallback'
  /** Preset body (avoids storage propagation race on first load). */
  presetText?: string
  /** True when background upgraded preset while a prior revision may already be running. */
  presetContentChanged?: boolean
}

export interface RuntimeLoadFailedPayload {
  scriptKey: string
  gmScope: string
  rollbackTried: boolean
}

export type RuntimeLoadResult = ({ type: 'ready' } & RuntimePresetReadyPayload) | ({ type: 'failed' } & RuntimeLoadFailedPayload)
