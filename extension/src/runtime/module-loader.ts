import { buildLauncherUrls } from '@ext/page/config'
import { getShellNetworkEnabled } from '@ext/shared/extension-storage'
import { extensionLogger } from '@ext/shared/logger'
import {
  MODULE_MANIFEST_ETAG_KEY,
  OTA_MANUAL_UPDATE_KEY,
  PRESET_ACTIVATED_HASH_KEY,
  PRESET_CACHE_KEY,
  PRESET_ETAG_KEY,
  PRESET_PREVIOUS_HASH_KEY,
  PRESET_PROJECT_VERSION_KEY,
  RUNTIME_OTA_STAGE_KEY,
  RUNTIME_SCRIPT_LOAD_MODE_KEY,
  RUNTIME_SCRIPT_MODULES_KEY,
  RUNTIME_SCRIPT_POLICIES_KEY,
  SCRIPT_BUNDLE_URL_KEY,
} from '@shared/launcher-constants'
import { decideOtaModuleApply } from '@shared/ota-apply-policy'
import type { ScriptOtaPolicy } from '@shared/script-ota-policy'

import type { LoaderModuleManifest, RuntimeEnsureLoadRequest, RuntimeLoadEntry, RuntimeLoadResult, RuntimePresetReadyPayload } from './loader-types'
import { getResponseHeader, normalizeEtag, readScopedGmValue, writeScopedGmValue } from './runtime-storage'

interface FetchResult {
  status: number
  responseText: string
  responseHeaders: string
}

interface LoadContext {
  logPrefix: string
  entry: RuntimeLoadEntry
  acceptAlpha: boolean
  urls: ReturnType<typeof buildLauncherUrls>
  scopedKeys: {
    scopedPresetCacheKey: string
    scopedPresetEtagKey: string
    scopedPresetActivatedHashKey: string
    scopedPresetPreviousHashKey: string
    scopedModuleManifestEtagKey: string
  }
  scopedScriptBundleUrlKey: string
  cacheScope: string
  otaManualUpdate: boolean
}

async function backgroundFetch(url: string, headers: Record<string, string> = {}): Promise<FetchResult> {
  const res = await fetch(url, { method: 'GET', headers, credentials: 'omit' })
  const responseHeaders = Array.from(res.headers.entries())
    .map(([k, v]) => `${k}: ${v}`)
    .join('\r\n')
  const responseText = await res.text()
  return { status: res.status, responseText, responseHeaders }
}

function logPrefixForEntry(entry: RuntimeLoadEntry): string {
  const shortKey = entry.scriptKey.length > 8 ? `${entry.scriptKey.slice(0, 8)}…` : entry.scriptKey
  return `[ModuleLoad][${shortKey}]`
}

function resolveAcceptAlpha(entry: RuntimeLoadEntry): boolean {
  if (entry.acceptAlpha === true) {
    return true
  }
  return Object.entries(entry.enabledScripts).some(([file, enabled]) => enabled !== false && entry.acceptAlphaByFile?.[file] === true)
}

function extractPresetCoreModule(data: LoaderModuleManifest | null) {
  return data?.modules?.find((m) => m?.id === 'preset-core') ?? null
}

function hashFromPresetCoreModule(mod: ReturnType<typeof extractPresetCoreModule>): string {
  if (!mod?.hash || mod.hash.algorithm !== 'sha1' || typeof mod.hash.value !== 'string') {
    return ''
  }
  return normalizeEtag(mod.hash.value)
}

function extractScriptBundleModule(data: LoaderModuleManifest | null, acceptAlpha: boolean) {
  if (!data?.modules) {
    return null
  }
  const preferredId = acceptAlpha ? 'script-bundle-alpha' : 'script-bundle'
  const preferred = data.modules.find((m) => m?.id === preferredId)
  if (preferred?.url) {
    return preferred
  }
  return data.modules.find((m) => m?.id === 'script-bundle') ?? null
}

async function consumeManualUpdateFlag(cacheScope: string): Promise<boolean> {
  const scoped = `${OTA_MANUAL_UPDATE_KEY}:${cacheScope}`
  const flag = await readScopedGmValue(scoped, OTA_MANUAL_UPDATE_KEY, '')
  if (flag) {
    await writeScopedGmValue(scoped, OTA_MANUAL_UPDATE_KEY, '')
    return true
  }
  return false
}

async function persistManifestEtag(scopedKey: string, etag: string): Promise<void> {
  if (etag) {
    await writeScopedGmValue(scopedKey, MODULE_MANIFEST_ETAG_KEY, etag)
  }
}

async function readCachedScriptPolicies(cacheScope: string): Promise<Record<string, ScriptOtaPolicy & { version?: string }>> {
  const raw = (await readScopedGmValue(`${RUNTIME_SCRIPT_POLICIES_KEY}:${cacheScope}`, RUNTIME_SCRIPT_POLICIES_KEY, '')) as string
  if (typeof raw !== 'string' || !raw.trim()) {
    return {}
  }
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }
    return parsed as Record<string, ScriptOtaPolicy & { version?: string }>
  } catch {
    return {}
  }
}

async function persistProjectVersionFromManifest(data: LoaderModuleManifest | null | undefined, cacheScope: string): Promise<void> {
  const version = data?.projectVersion
  if (typeof version === 'string' && version.trim()) {
    await writeScopedGmValue(`${PRESET_PROJECT_VERSION_KEY}:${cacheScope}`, PRESET_PROJECT_VERSION_KEY, version.trim())
  }
  const stage = data?.runtime?.stage === 'alpha' ? 'alpha' : 'stable'
  await writeScopedGmValue(`${RUNTIME_OTA_STAGE_KEY}:${cacheScope}`, RUNTIME_OTA_STAGE_KEY, stage)
  const scriptLoadMode = data?.runtime?.scriptLoadMode === 'match-fallback' ? 'match-fallback' : 'aggregate'
  await writeScopedGmValue(`${RUNTIME_SCRIPT_LOAD_MODE_KEY}:${cacheScope}`, RUNTIME_SCRIPT_LOAD_MODE_KEY, scriptLoadMode)
  if (data?.scriptPolicies && typeof data.scriptPolicies === 'object' && !Array.isArray(data.scriptPolicies)) {
    await writeScopedGmValue(`${RUNTIME_SCRIPT_POLICIES_KEY}:${cacheScope}`, RUNTIME_SCRIPT_POLICIES_KEY, JSON.stringify(data.scriptPolicies))
  }
  if (Array.isArray(data?.scriptModules)) {
    await writeScopedGmValue(`${RUNTIME_SCRIPT_MODULES_KEY}:${cacheScope}`, RUNTIME_SCRIPT_MODULES_KEY, JSON.stringify(data.scriptModules))
  }
}

async function applyScriptBundleUrlFromManifest(
  data: LoaderModuleManifest | null,
  manifestNotModified: boolean,
  acceptAlpha: boolean,
  scopedScriptBundleUrlKey: string,
  cachedUrl: string
): Promise<string> {
  if (manifestNotModified) {
    return cachedUrl
  }
  const sb = extractScriptBundleModule(data, acceptAlpha)
  if (sb?.url) {
    await writeScopedGmValue(scopedScriptBundleUrlKey, SCRIPT_BUNDLE_URL_KEY, sb.url)
    return sb.url
  }
  return cachedUrl
}

async function persistPresetCache(scopedKeys: LoadContext['scopedKeys'], presetText: string, normalizedHash: string, pendingManifestEtag: string): Promise<boolean> {
  const activeHash = normalizeEtag((await readScopedGmValue(scopedKeys.scopedPresetActivatedHashKey, PRESET_ACTIVATED_HASH_KEY, '')) as string)
  const contentChanged = Boolean(activeHash && normalizedHash && activeHash !== normalizedHash)
  if (activeHash && normalizedHash && activeHash !== normalizedHash) {
    await writeScopedGmValue(scopedKeys.scopedPresetPreviousHashKey, PRESET_PREVIOUS_HASH_KEY, activeHash)
  }
  if (normalizedHash) {
    await writeScopedGmValue(scopedKeys.scopedPresetActivatedHashKey, PRESET_ACTIVATED_HASH_KEY, normalizedHash)
    await writeScopedGmValue(scopedKeys.scopedPresetEtagKey, PRESET_ETAG_KEY, normalizedHash)
  }
  await writeScopedGmValue(scopedKeys.scopedPresetCacheKey, PRESET_CACHE_KEY, presetText)
  if (pendingManifestEtag) {
    await persistManifestEtag(scopedKeys.scopedModuleManifestEtagKey, pendingManifestEtag)
  }
  return contentChanged
}

function shouldApplyPresetCoreUpgrade(
  remoteHash: string,
  localHash: string,
  hasLocalCache: boolean,
  manifest: LoaderModuleManifest | null,
  acceptAlpha: boolean,
  manualUpdate: boolean
): boolean {
  const decision = decideOtaModuleApply({
    moduleId: 'preset-core',
    remoteHash,
    localHash,
    hasLocalCache,
    runtimePolicy: manifest?.runtime
      ? {
          stage: manifest.runtime.stage === 'alpha' ? 'alpha' : 'stable',
          autoUpgrade: manifest.runtime.autoUpgrade !== false,
          lockedVersion: manifest.runtime.lockedVersion ?? null,
          projectVersion: manifest.projectVersion,
        }
      : undefined,
    clientPrefs: { acceptAlpha, manualUpdate },
  })
  return decision.apply
}

async function fetchModuleManifestWithConditional(
  moduleManifestUrl: string,
  ifNoneMatch: string,
  skipConditional: boolean,
  logPrefix: string
): Promise<{ notModified: true } | { notModified: false; data: LoaderModuleManifest; etag: string }> {
  const headers: Record<string, string> = {}
  if (!skipConditional && ifNoneMatch) {
    headers['If-None-Match'] = ifNoneMatch
  }
  const res = await backgroundFetch(moduleManifestUrl, headers)
  if (res.status === 304) {
    extensionLogger.info(`${logPrefix} manifest:not-modified (304)`)
    return { notModified: true as const }
  }
  if (res.status === 200 && res.responseText) {
    const data = JSON.parse(res.responseText) as LoaderModuleManifest
    const etag = normalizeEtag(getResponseHeader(res.responseHeaders, 'etag'))
    return { notModified: false as const, data, etag }
  }
  throw new Error(`manifest HTTP ${res.status}`)
}

async function requestPresetFetch(
  fetchUrl: string,
  expectedHash: string,
  forceFullFetch: boolean,
  localPresetHash: string,
  skipConditionalRequest: boolean,
  ctx: LoadContext,
  manifest: LoaderModuleManifest | null,
  pendingManifestEtag: string
): Promise<{ ok: true; presetText: string; hash: string; contentChanged: boolean } | { ok: false }> {
  const hdrs: Record<string, string> = {}
  if (!forceFullFetch && !skipConditionalRequest && localPresetHash) {
    hdrs['If-None-Match'] = localPresetHash
  }
  const res = await backgroundFetch(fetchUrl, hdrs)
  if (res.status === 304) {
    const cached = (await readScopedGmValue(ctx.scopedKeys.scopedPresetCacheKey, PRESET_CACHE_KEY, '')) as string
    return { ok: true, presetText: cached, hash: localPresetHash, contentChanged: false }
  }
  if (res.status === 404) {
    extensionLogger.warn(`${ctx.logPrefix} preset-core:fetch:404 url=${fetchUrl.slice(0, 120)}`)
    return { ok: false }
  }
  if (res.status === 200 && res.responseText) {
    const normalizedEtag = normalizeEtag(getResponseHeader(res.responseHeaders, 'etag'))
    if (expectedHash && normalizedEtag && expectedHash !== normalizedEtag) {
      extensionLogger.warn(`${ctx.logPrefix} preset-core:hash-mismatch expected=${expectedHash.slice(0, 12)} got=${normalizedEtag.slice(0, 12)}`)
      return { ok: false }
    }
    const remoteHash = normalizedEtag || expectedHash || ''
    const activeHash = normalizeEtag((await readScopedGmValue(ctx.scopedKeys.scopedPresetActivatedHashKey, PRESET_ACTIVATED_HASH_KEY, '')) as string)
    const presetCode = (await readScopedGmValue(ctx.scopedKeys.scopedPresetCacheKey, PRESET_CACHE_KEY, '')) as string
    const hasLocalCache = Boolean(presetCode || activeHash)
    if (!shouldApplyPresetCoreUpgrade(remoteHash, localPresetHash || activeHash, hasLocalCache, manifest, ctx.acceptAlpha, ctx.otaManualUpdate)) {
      return { ok: true, presetText: presetCode || res.responseText, hash: localPresetHash || remoteHash, contentChanged: false }
    }
    const contentChanged = await persistPresetCache(ctx.scopedKeys, res.responseText, remoteHash, pendingManifestEtag)
    return { ok: true, presetText: res.responseText, hash: remoteHash, contentChanged }
  }
  return { ok: false }
}

async function buildReadyPayload(
  ctx: LoadContext,
  runtimeScriptUrl: string,
  manifest: LoaderModuleManifest | null,
  scriptLoadMode: 'aggregate' | 'match-fallback',
  options?: { presetText?: string; presetContentChanged?: boolean }
): Promise<RuntimePresetReadyPayload> {
  const presetFromCache = (await readScopedGmValue(ctx.scopedKeys.scopedPresetCacheKey, PRESET_CACHE_KEY, '')) as string
  const presetText = options?.presetText || presetFromCache || undefined
  const g = { ...ctx.urls.globals }
  if (runtimeScriptUrl) {
    g.__SCRIPT_URL__ = runtimeScriptUrl
  }
  const scriptPolicies = manifest?.scriptPolicies ?? (await readCachedScriptPolicies(ctx.cacheScope))
  return {
    scriptKey: ctx.entry.scriptKey,
    gmScope: ctx.entry.gmScope,
    globals: g,
    runtimeScriptUrl: runtimeScriptUrl || String(ctx.urls.globals.__SCRIPT_URL__ || ''),
    scriptPolicies,
    otaManualUpdate: ctx.otaManualUpdate,
    enabledScripts: ctx.entry.enabledScripts,
    contentHashByFile: ctx.entry.contentHashByFile ?? {},
    scriptLoadMode,
    ...(presetText ? { presetText } : {}),
    ...(options?.presetContentChanged ? { presetContentChanged: true } : {}),
  }
}

async function loadWithNetwork(ctx: LoadContext, presetCode: string, localPresetHash: string, manifestEtagStored: string): Promise<RuntimeLoadResult> {
  const { presetUrl, moduleManifestUrl } = ctx.urls
  let runtimeScriptUrl = (await readScopedGmValue(ctx.scopedScriptBundleUrlKey, SCRIPT_BUNDLE_URL_KEY, '')) as string
  let lastManifest: LoaderModuleManifest | null = null
  let scriptLoadMode: 'aggregate' | 'match-fallback' = 'aggregate'

  const runFullRetry = async (): Promise<RuntimeLoadResult> => {
    extensionLogger.info(`${ctx.logPrefix} load:retry full manifest + preset fetch`)
    try {
      const mres = await fetchModuleManifestWithConditional(moduleManifestUrl, '', true, ctx.logPrefix)
      if (!mres.notModified) {
        lastManifest = mres.data
        await persistProjectVersionFromManifest(mres.data, ctx.cacheScope)
        runtimeScriptUrl = await applyScriptBundleUrlFromManifest(mres.data, false, ctx.acceptAlpha, ctx.scopedScriptBundleUrlKey, runtimeScriptUrl)
        scriptLoadMode = mres.data.runtime?.scriptLoadMode === 'match-fallback' ? 'match-fallback' : 'aggregate'
      }
      const presetMod = extractPresetCoreModule(lastManifest)
      const presetFetchUrl = presetMod?.url ?? presetUrl
      const remoteHash = hashFromPresetCoreModule(presetMod)
      const presetResult = await requestPresetFetch(presetFetchUrl, remoteHash || localPresetHash, true, localPresetHash, true, ctx, lastManifest, '')
      if (!presetResult.ok) {
        if (presetCode) {
          return { type: 'ready', ...(await buildReadyPayload(ctx, runtimeScriptUrl, lastManifest, scriptLoadMode, { presetText: presetCode })) }
        }
        return { type: 'failed', scriptKey: ctx.entry.scriptKey, gmScope: ctx.entry.gmScope, rollbackTried: Boolean(presetCode) }
      }
      return {
        type: 'ready',
        ...(await buildReadyPayload(ctx, runtimeScriptUrl, lastManifest, scriptLoadMode, {
          presetText: presetResult.presetText,
          presetContentChanged: presetResult.contentChanged,
        })),
      }
    } catch (err) {
      extensionLogger.warn(`${ctx.logPrefix} load:retry failed`, err)
      if (presetCode) {
        return { type: 'ready', ...(await buildReadyPayload(ctx, runtimeScriptUrl, lastManifest, scriptLoadMode, { presetText: presetCode })) }
      }
      return { type: 'failed', scriptKey: ctx.entry.scriptKey, gmScope: ctx.entry.gmScope, rollbackTried: false }
    }
  }

  try {
    const mres = await fetchModuleManifestWithConditional(moduleManifestUrl, manifestEtagStored, false, ctx.logPrefix)
    let pendingManifestEtag = ''
    if (!mres.notModified) {
      lastManifest = mres.data
      pendingManifestEtag = mres.etag
      await persistProjectVersionFromManifest(mres.data, ctx.cacheScope)
      runtimeScriptUrl = await applyScriptBundleUrlFromManifest(mres.data, false, ctx.acceptAlpha, ctx.scopedScriptBundleUrlKey, runtimeScriptUrl)
      scriptLoadMode = mres.data.runtime?.scriptLoadMode === 'match-fallback' ? 'match-fallback' : 'aggregate'
    } else {
      runtimeScriptUrl = await applyScriptBundleUrlFromManifest(null, true, ctx.acceptAlpha, ctx.scopedScriptBundleUrlKey, runtimeScriptUrl)
      const modeRaw = await readScopedGmValue(`${RUNTIME_SCRIPT_LOAD_MODE_KEY}:${ctx.cacheScope}`, RUNTIME_SCRIPT_LOAD_MODE_KEY, 'aggregate')
      scriptLoadMode = modeRaw === 'match-fallback' ? 'match-fallback' : 'aggregate'
      if (presetCode) {
        return { type: 'ready', ...(await buildReadyPayload(ctx, runtimeScriptUrl, lastManifest, scriptLoadMode, { presetText: presetCode })) }
      }
    }

    const presetMod = extractPresetCoreModule(lastManifest)
    const presetFetchUrl = presetMod?.url ?? presetUrl
    const remoteHash = hashFromPresetCoreModule(presetMod)

    if (!mres.notModified && remoteHash && localPresetHash && remoteHash === localPresetHash && presetCode) {
      if (pendingManifestEtag) {
        await persistManifestEtag(ctx.scopedKeys.scopedModuleManifestEtagKey, pendingManifestEtag)
      }
      return { type: 'ready', ...(await buildReadyPayload(ctx, runtimeScriptUrl, lastManifest, scriptLoadMode, { presetText: presetCode })) }
    }

    const presetResult = await requestPresetFetch(presetFetchUrl, remoteHash || localPresetHash, false, localPresetHash, false, ctx, lastManifest, pendingManifestEtag)

    if (!presetResult.ok) {
      if (presetCode) {
        return { type: 'ready', ...(await buildReadyPayload(ctx, runtimeScriptUrl, lastManifest, scriptLoadMode, { presetText: presetCode })) }
      }
      return runFullRetry()
    }

    return {
      type: 'ready',
      ...(await buildReadyPayload(ctx, runtimeScriptUrl, lastManifest, scriptLoadMode, {
        presetText: presetResult.presetText,
        presetContentChanged: presetResult.contentChanged,
      })),
    }
  } catch (err) {
    extensionLogger.warn(`${ctx.logPrefix} manifest:fetch:failed`, err)
    if (presetCode) {
      const modeRaw = await readScopedGmValue(`${RUNTIME_SCRIPT_LOAD_MODE_KEY}:${ctx.cacheScope}`, RUNTIME_SCRIPT_LOAD_MODE_KEY, 'aggregate')
      scriptLoadMode = modeRaw === 'match-fallback' ? 'match-fallback' : 'aggregate'
      return { type: 'ready', ...(await buildReadyPayload(ctx, runtimeScriptUrl, lastManifest, scriptLoadMode, { presetText: presetCode })) }
    }
    return runFullRetry()
  }
}

/**
 * Load manifest + preset for one scriptKey.
 */
export async function loadRuntimeEntry(entry: RuntimeLoadEntry, networkEnabled: boolean): Promise<RuntimeLoadResult> {
  const logPrefix = logPrefixForEntry(entry)
  const acceptAlpha = resolveAcceptAlpha(entry)
  const urls = buildLauncherUrls({
    baseUrl: entry.baseUrl,
    scriptKey: entry.scriptKey,
    developMode: entry.developMode,
  })
  const {
    presetUrl,
    cacheScope,
    scopedPresetCacheKey,
    scopedPresetEtagKey,
    scopedPresetActivatedHashKey,
    scopedPresetPreviousHashKey,
    scopedModuleManifestEtagKey,
    scopedScriptBundleUrlKey,
  } = urls

  const ctx: LoadContext = {
    logPrefix,
    entry,
    acceptAlpha,
    urls,
    cacheScope,
    otaManualUpdate: await consumeManualUpdateFlag(cacheScope),
    scopedScriptBundleUrlKey,
    scopedKeys: {
      scopedPresetCacheKey,
      scopedPresetEtagKey,
      scopedPresetActivatedHashKey,
      scopedPresetPreviousHashKey,
      scopedModuleManifestEtagKey,
    },
  }

  let runtimeScriptUrl = (await readScopedGmValue(scopedScriptBundleUrlKey, SCRIPT_BUNDLE_URL_KEY, '')) as string
  const presetCode = (await readScopedGmValue(scopedPresetCacheKey, PRESET_CACHE_KEY, '')) as string
  const localPresetHash = normalizeEtag((await readScopedGmValue(scopedPresetEtagKey, PRESET_ETAG_KEY, '')) as string)
  const manifestEtagStored = normalizeEtag((await readScopedGmValue(scopedModuleManifestEtagKey, MODULE_MANIFEST_ETAG_KEY, '')) as string)

  extensionLogger.info(`${logPrefix} load:start network=${networkEnabled ? 'on' : 'off'} cachedPresetBytes=${presetCode?.length ?? 0}`)

  if (!networkEnabled) {
    if (!presetCode) {
      const fallback = await requestPresetFetch(presetUrl, '', true, localPresetHash, true, ctx, null, '')
      if (!fallback.ok || !fallback.presetText) {
        return { type: 'failed', scriptKey: entry.scriptKey, gmScope: entry.gmScope, rollbackTried: false }
      }
      runtimeScriptUrl = runtimeScriptUrl || String(urls.globals.__SCRIPT_URL__ || '')
      const modeRaw = await readScopedGmValue(`${RUNTIME_SCRIPT_LOAD_MODE_KEY}:${cacheScope}`, RUNTIME_SCRIPT_LOAD_MODE_KEY, 'aggregate')
      const scriptLoadMode = modeRaw === 'match-fallback' ? 'match-fallback' : 'aggregate'
      return {
        type: 'ready',
        ...(await buildReadyPayload(ctx, runtimeScriptUrl, null, scriptLoadMode, { presetText: fallback.presetText })),
      }
    }
    const modeRaw = await readScopedGmValue(`${RUNTIME_SCRIPT_LOAD_MODE_KEY}:${cacheScope}`, RUNTIME_SCRIPT_LOAD_MODE_KEY, 'aggregate')
    const scriptLoadMode = modeRaw === 'match-fallback' ? 'match-fallback' : 'aggregate'
    return { type: 'ready', ...(await buildReadyPayload(ctx, runtimeScriptUrl, null, scriptLoadMode, { presetText: presetCode })) }
  }

  return loadWithNetwork(ctx, presetCode, localPresetHash, manifestEtagStored)
}

/**
 * Ensure runtime modules are loaded for all scriptKeys on a tab.
 */
export async function ensureRuntimeLoad(request: RuntimeEnsureLoadRequest): Promise<RuntimeLoadResult[]> {
  const networkEnabled = await getShellNetworkEnabled()
  return Promise.all(request.entries.map((entry) => loadRuntimeEntry(entry, networkEnabled)))
}
