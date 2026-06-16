import type { ScriptKeyGroupMeta } from '../extension-multi-service-pure'

export interface UpsertServiceInput {
  label?: string
  baseUrl: string
  scriptKey: string
  enabled?: boolean
  developMode?: boolean
}

export interface ManagedScriptListEntry {
  file: string
  name: string
  /** Userscript @description when available */
  description?: string
  /** Userscript @icon URL when available */
  icon?: string
  /** Userscript @version when available */
  version?: string
  /** Userscript @author when available */
  author?: string
  /** Last content change time (epoch ms) when provided by the scripts API */
  updatedAt?: number
  /** SHA-256 from script index when available (used to confirm uninstall blacklist identity). */
  contentHash?: string
}

export interface ScriptListCache {
  /** `${baseUrl}|${scriptKey}` — invalidates cache when Options change */
  scope: string
  gistUpdatedAt: number
  /** Bumped when list entry shape gains new display fields (description, version, etc.). */
  metaSchema?: number
  scripts: ManagedScriptListEntry[]
}

export interface ExtensionRuleEntry {
  id: string
  wildcard: string
  script: string
  enabled: boolean
  mode?: 'include' | 'exclude' | 'script'
}

export interface QuickAddRuleContextItem {
  scriptKey: string
  serviceLabels: string[]
  scripts: Array<ManagedScriptListEntry & { matchedOnActiveTab?: boolean }>
}

export interface ScriptKeyScriptsGroupView extends ScriptKeyGroupMeta {
  scripts: ManagedScriptListEntry[]
}

export interface SaveOptionsServiceInput {
  serviceId: string
  label: string
  baseUrl: string
  scriptKey: string
  enabled: boolean
  developMode: boolean
  gmScope?: string
}
