import { createHash } from 'crypto'

import { fetchGist, getGistInfo } from '@/services/gist'
import { buildVersionedScriptModuleUrl, buildVersionedStaticModuleUrl } from '@/services/runtime/contentAddressedAssets'
import type { ScriptFileMeta } from '@/services/scripts/gistScripts'
import { readManagedScriptIndex } from '@/services/scripts/gistScripts'
import { getEditorLibManifest, getExplorerLibManifest, getPresetManifest, getPresetUiManifest } from '@/services/tampermonkey/gmCore'
import { buildRemoteScriptBundlesFromGist, compileRemoteScriptModulePayload } from '@/services/tampermonkey/remoteScriptBundle.server'
import { buildScriptFilesForBundleTrack } from '@/shared/script-bundle-track'
import {
  buildScriptPolicySummary,
  resolveRuntimeOtaPolicy,
  resolveScriptOtaPolicy,
  type RuntimeOtaPolicy,
  type ScriptBundleTrack,
  type ScriptOtaPolicy,
} from '@/shared/script-ota-policy'

import pkg from '../../package.json'

const defaultProjectVersion = (pkg as { version?: string }).version ?? '0.0.0'

/**
 * Supported hash algorithms for module integrity checks.
 */
export type RuntimeModuleHashAlgorithm = 'sha1' | 'none'

/**
 * Runtime module kind in the modular architecture.
 */
export type RuntimeModuleKind = 'launcher' | 'preset-core' | 'preset-ui' | 'editor-lib' | 'explorer-lib' | 'script-bundle' | 'script-bundle-alpha'

/**
 * Hash payload attached to each runtime module.
 */
export interface RuntimeModuleHash {
  algorithm: RuntimeModuleHashAlgorithm
  value: string | null
}

/**
 * Runtime module dependency declaration.
 */
export interface RuntimeModuleDependency {
  id: RuntimeModuleKind
  minApiVersion: number
}

/**
 * Runtime module definition item in manifest response.
 */
export interface RuntimeModuleDefinition {
  id: RuntimeModuleKind
  optional: boolean
  lazy: boolean
  apiVersion: number
  url: string
  hash: RuntimeModuleHash
  dependsOn: RuntimeModuleDependency[]
}

/** Manifest script policy summary keyed by Gist filename. */
export type RuntimeScriptPolicies = Record<string, ScriptOtaPolicy & { version?: string }>

/** Per-script module catalog entry for match-based loading (Phase D). */
export interface RuntimeScriptModule {
  file: string
  match: string[]
  track: ScriptBundleTrack
  url: string
  hash: RuntimeModuleHash
  dependsOn: string[]
}

/**
 * Runtime module manifest response contract.
 */
export interface RuntimeModuleManifest {
  manifestVersion: 1
  generatedAt: number
  /** Semver baked into preset at build time; surfaced for popup / diagnostics */
  projectVersion: string
  runtime: RuntimeOtaPolicy
  scriptPolicies: RuntimeScriptPolicies
  modules: RuntimeModuleDefinition[]
  /** Per-file script modules for match-fallback loading. */
  scriptModules?: RuntimeScriptModule[]
}

/**
 * Build per-script module catalog entries for manifest (Phase D).
 */
async function buildScriptModulesForManifest(
  baseUrl: string,
  scriptKey: string,
  scripts: ScriptFileMeta[],
  gistFiles: Record<string, { content: string }>,
  gistUpdatedAtMs: number
): Promise<RuntimeScriptModule[]> {
  const modules: RuntimeScriptModule[] = []
  for (const script of scripts) {
    const ota = resolveScriptOtaPolicy(script.ota)
    const track: ScriptBundleTrack = ota.stage === 'alpha' ? 'alpha' : 'stable'
    const files = buildScriptFilesForBundleTrack([script], gistFiles, track)
    const source = files[script.filename]
    if (!source) {
      continue
    }
    const payload = await compileRemoteScriptModulePayload(script.filename, source, track, gistUpdatedAtMs)
    if (!payload) {
      continue
    }
    modules.push({
      file: script.filename,
      match: Array.isArray(script.match) ? script.match.filter((pattern): pattern is string => typeof pattern === 'string' && Boolean(pattern)) : [],
      track,
      url: buildVersionedScriptModuleUrl(baseUrl, scriptKey, script.filename, payload.hash, track),
      hash: { algorithm: 'sha1', value: payload.hash },
      dependsOn: Array.isArray(script.dependsOn) ? script.dependsOn.filter((dep): dep is string => typeof dep === 'string' && Boolean(dep.trim())) : [],
    })
  }
  return modules
}

/**
 * Build module manifest for a specific script key.
 * @param baseUrl Current request base URL
 * @param key Tampermonkey script key
 * @returns Runtime module manifest payload
 */
export async function buildRuntimeModuleManifest(baseUrl: string, key: string): Promise<RuntimeModuleManifest> {
  const presetManifest = await getPresetManifest()
  const presetUiManifest = await getPresetUiManifest()
  const editorLibManifest = await getEditorLibManifest()
  const explorerLibManifest = await getExplorerLibManifest()
  const bundles = await buildRemoteScriptBundlesFromGist()
  const scriptBundleHash = bundles.stable?.hash ?? null
  const scriptBundleAlphaHash = bundles.alpha?.hash ?? null
  const presetCoreHash = presetManifest?.hash ?? null
  const presetUiHash = presetUiManifest?.hash ?? null
  const editorLibHash = editorLibManifest?.hash ?? null
  const explorerLibHash = explorerLibManifest?.hash ?? null

  let scriptPolicies: RuntimeScriptPolicies = {}
  let runtimePolicy: RuntimeOtaPolicy = resolveRuntimeOtaPolicy(null, presetManifest?.projectVersion?.trim() || defaultProjectVersion)
  let scriptModules: RuntimeScriptModule[] = []
  try {
    const index = await readManagedScriptIndex()
    scriptPolicies = Object.fromEntries(index.scripts.map((script) => [script.filename, buildScriptPolicySummary(script)]))
    runtimePolicy = resolveRuntimeOtaPolicy(index.runtime ?? null, presetManifest?.projectVersion?.trim() || defaultProjectVersion)
    try {
      const { gistId, gistToken } = getGistInfo()
      const gist = await fetchGist({ gistId, gistToken })
      const gistFiles = Object.fromEntries(Object.entries(gist.files).map(([name, file]) => [name, { content: file.content }]))
      const gistUpdatedAtMs = new Date(gist.updated_at).getTime()
      scriptModules = await buildScriptModulesForManifest(baseUrl, key, index.scripts, gistFiles, gistUpdatedAtMs)
    } catch {
      scriptModules = []
    }
  } catch {
    runtimePolicy = resolveRuntimeOtaPolicy(null, presetManifest?.projectVersion?.trim() || defaultProjectVersion)
  }

  const modules: RuntimeModuleDefinition[] = [
    {
      id: 'launcher',
      optional: false,
      lazy: false,
      apiVersion: 1,
      url: `${baseUrl}/static/${key}/tampermonkey.user.js`,
      hash: {
        algorithm: 'none',
        value: null,
      },
      dependsOn: [],
    },
    {
      id: 'preset-core',
      optional: false,
      lazy: false,
      apiVersion: 1,
      url: buildVersionedStaticModuleUrl(baseUrl, key, 'preset.js', presetCoreHash),
      hash: {
        algorithm: presetManifest ? 'sha1' : 'none',
        value: presetCoreHash,
      },
      dependsOn: [],
    },
    {
      id: 'preset-ui',
      optional: true,
      lazy: true,
      apiVersion: 1,
      url: buildVersionedStaticModuleUrl(baseUrl, key, 'preset-ui.js', presetUiHash),
      hash: {
        algorithm: presetUiManifest ? 'sha1' : 'none',
        value: presetUiHash,
      },
      dependsOn: [{ id: 'preset-core', minApiVersion: 1 }],
    },
    {
      id: 'editor-lib',
      optional: true,
      lazy: true,
      apiVersion: 1,
      url: buildVersionedStaticModuleUrl(baseUrl, key, 'editor-lib.js', editorLibHash),
      hash: {
        algorithm: editorLibManifest ? 'sha1' : 'none',
        value: editorLibHash,
      },
      dependsOn: [{ id: 'preset-core', minApiVersion: 1 }],
    },
    {
      id: 'explorer-lib',
      optional: true,
      lazy: true,
      apiVersion: 1,
      url: buildVersionedStaticModuleUrl(baseUrl, key, 'explorer-lib.js', explorerLibHash),
      hash: {
        algorithm: explorerLibManifest ? 'sha1' : 'none',
        value: explorerLibHash,
      },
      dependsOn: [{ id: 'preset-core', minApiVersion: 1 }],
    },
    {
      id: 'script-bundle',
      optional: true,
      lazy: true,
      apiVersion: 1,
      url: buildVersionedStaticModuleUrl(baseUrl, key, 'tampermonkey-remote.js', scriptBundleHash),
      hash: {
        algorithm: scriptBundleHash ? 'sha1' : 'none',
        value: scriptBundleHash,
      },
      dependsOn: [{ id: 'preset-core', minApiVersion: 1 }],
    },
    {
      id: 'script-bundle-alpha',
      optional: true,
      lazy: true,
      apiVersion: 1,
      url: buildVersionedStaticModuleUrl(baseUrl, key, 'tampermonkey-remote.alpha.js', scriptBundleAlphaHash),
      hash: {
        algorithm: scriptBundleAlphaHash ? 'sha1' : 'none',
        value: scriptBundleAlphaHash,
      },
      dependsOn: [{ id: 'preset-core', minApiVersion: 1 }],
    },
  ]

  const projectVersion = presetManifest?.projectVersion?.trim() || defaultProjectVersion

  return {
    manifestVersion: 1,
    generatedAt: Date.now(),
    projectVersion,
    runtime: runtimePolicy,
    scriptPolicies,
    modules,
    ...(scriptModules.length > 0 ? { scriptModules } : {}),
  }
}

/**
 * Build deterministic ETag for module manifest response.
 * Excludes `generatedAt` so conditional GET (If-None-Match) works across requests.
 * @param manifest Runtime module manifest payload
 * @returns SHA-1 ETag hash string
 */
export function buildRuntimeModuleManifestEtag(manifest: RuntimeModuleManifest): string {
  const stable = {
    manifestVersion: manifest.manifestVersion,
    projectVersion: manifest.projectVersion,
    runtime: manifest.runtime,
    scriptPolicies: manifest.scriptPolicies,
    modules: manifest.modules,
    scriptModules: manifest.scriptModules ?? [],
  }
  return createHash('sha1').update(JSON.stringify(stable), 'utf8').digest('hex')
}
