import { createHash } from 'crypto'

import { buildVersionedStaticModuleUrl } from '@/services/runtime/contentAddressedAssets'
import { getPresetManifest, getPresetUiManifest } from '@/services/tampermonkey/gmCore'
import { buildRemoteScriptBundleFromGist } from '@/services/tampermonkey/remoteScriptBundle.server'

/**
 * Supported hash algorithms for module integrity checks.
 */
export type RuntimeModuleHashAlgorithm = 'sha1' | 'none'

/**
 * Runtime module kind in the modular architecture.
 */
export type RuntimeModuleKind = 'launcher' | 'preset-core' | 'preset-ui' | 'script-bundle'

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

/**
 * Runtime module manifest response contract.
 */
export interface RuntimeModuleManifest {
  manifestVersion: 1
  generatedAt: number
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
  const remoteBundle = await buildRemoteScriptBundleFromGist()
  const scriptBundleHash = remoteBundle?.hash ?? null
  const presetCoreHash = presetManifest?.hash ?? null
  const presetUiHash = presetUiManifest?.hash ?? null
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
  ]

  return {
    manifestVersion: 1,
    generatedAt: Date.now(),
    modules,
  }
}

/**
 * Build deterministic ETag for module manifest response.
 * @param manifest Runtime module manifest payload
 * @returns SHA-1 ETag hash string
 */
export function buildRuntimeModuleManifestEtag(manifest: RuntimeModuleManifest): string {
  return createHash('sha1').update(JSON.stringify(manifest), 'utf8').digest('hex')
}
