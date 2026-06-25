import { createHash } from 'crypto'

import { buildVersionedStaticModuleUrl } from '@/services/runtime/contentAddressedAssets'
import { readManagedScriptIndex } from '@/services/scripts/gistScripts'
import { getEditorLibManifest, getExplorerLibManifest, getPresetManifest, getPresetUiManifest } from '@/services/tampermonkey/gmCore'
import { buildRemoteScriptBundlesFromGist } from '@/services/tampermonkey/remoteScriptBundle.server'
import { buildScriptPolicySummary, resolveRuntimeOtaPolicy, type RuntimeOtaPolicy, type ScriptOtaPolicy } from '@/shared/script-ota-policy'

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
  try {
    const index = await readManagedScriptIndex()
    scriptPolicies = Object.fromEntries(index.scripts.map((script) => [script.filename, buildScriptPolicySummary(script)]))
    runtimePolicy = resolveRuntimeOtaPolicy(index.runtime ?? null, presetManifest?.projectVersion?.trim() || defaultProjectVersion)
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
  }
  return createHash('sha1').update(JSON.stringify(stable), 'utf8').digest('hex')
}
