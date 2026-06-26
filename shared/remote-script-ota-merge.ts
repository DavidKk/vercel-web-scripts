import { decideOtaModuleApply } from './ota-apply-policy'
import { joinRemoteBundleModules, type RemoteBundleModule, splitRemoteBundleModules } from './remote-script-bundle-modules'
import { resolveScriptOtaPolicy, type ScriptOtaPolicy } from './script-ota-policy'
export interface RemoteBundleOtaMergeInput {
  content: string
  scriptPolicies?: Record<string, ScriptOtaPolicy & { version?: string }>
  moduleCache?: Record<string, string>
  manualUpdate?: boolean
}

/** Result of merging a remote bundle with per-file OTA caches. */
export interface RemoteBundleOtaMergeResult {
  content: string
  /** Filenames whose blocks were taken from cache instead of the downloaded bundle. */
  pinnedFromCache: string[]
}

/**
 * Decide whether a downloaded per-file module block should replace the cached copy.
 * @param file Managed script filename
 * @param policy Resolved SERVER policy
 * @param hasLocalCache Whether a prior module body exists locally
 * @param manualUpdate Popup Update flag (bypasses autoUpgrade only)
 * @returns True when the downloaded block should be used
 */
export function shouldApplyRemoteScriptModuleUpgrade(file: string, policy: ScriptOtaPolicy & { version?: string }, hasLocalCache: boolean, manualUpdate: boolean): boolean {
  const decision = decideOtaModuleApply({
    moduleId: file,
    remoteHash: 'remote',
    localHash: 'local',
    hasLocalCache,
    scriptPolicy: policy,
    clientPrefs: { manualUpdate },
  })
  return decision.apply
}

/**
 * Merge a downloaded aggregate bundle with per-file caches for scripts blocked by OTA policy.
 * @param input Bundle body and policy context
 * @returns Merged bundle and list of files pinned from cache
 */
export function mergeRemoteBundleWithOtaPolicy(input: RemoteBundleOtaMergeInput): RemoteBundleOtaMergeResult {
  const modules = splitRemoteBundleModules(input.content)
  if (!modules.length) {
    return { content: input.content, pinnedFromCache: [] }
  }

  const cache = input.moduleCache ?? {}
  const policies = input.scriptPolicies ?? {}
  const manualUpdate = input.manualUpdate === true
  const pinnedFromCache: string[] = []
  const merged: RemoteBundleModule[] = []

  for (const module of modules) {
    const rawPolicy = policies[module.file]
    const resolvedPolicy: ScriptOtaPolicy & { version?: string } = {
      ...resolveScriptOtaPolicy(rawPolicy),
      ...(rawPolicy?.version ? { version: rawPolicy.version } : {}),
    }
    const cached = cache[module.file]
    const hasLocalCache = typeof cached === 'string' && cached.length > 0
    const applyRemote = shouldApplyRemoteScriptModuleUpgrade(module.file, resolvedPolicy, hasLocalCache, manualUpdate)

    if (!applyRemote && hasLocalCache) {
      merged.push({ file: module.file, content: cached })
      pinnedFromCache.push(module.file)
      continue
    }
    merged.push(module)
  }

  return {
    content: joinRemoteBundleModules(merged),
    pinnedFromCache,
  }
}

/**
 * Build a per-file cache map from an aggregate bundle body.
 * @param content Bundle body after merge/execute
 * @returns Filename → module block
 */
export function buildRemoteModuleCacheFromBundle(content: string): Record<string, string> {
  const cache: Record<string, string> = {}
  for (const module of splitRemoteBundleModules(content)) {
    cache[module.file] = module.content
  }
  return cache
}
