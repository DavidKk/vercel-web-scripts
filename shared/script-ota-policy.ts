/** OTA release stage for scripts and platform runtime. */
export type OtaReleaseStage = 'stable' | 'alpha'

/** SERVER-authoritative OTA policy for one managed script file. */
export interface ScriptOtaPolicy {
  /** Release stage; omitted in storage is resolved at read time. */
  stage: OtaReleaseStage
  /** Whether clients may auto-apply a newer artifact hash. */
  autoUpgrade: boolean
  /** Fleet pin: stable builds use the matching releases snapshot when set. */
  lockedVersion?: string
}

/** How clients load Gist script modules (Phase D). */
export type RuntimeScriptLoadMode = 'aggregate' | 'match-fallback'

/** SERVER-authoritative OTA policy for preset / platform runtime. */
export interface RuntimeOtaPolicy {
  projectVersion?: string
  stage: OtaReleaseStage
  autoUpgrade: boolean
  lockedVersion?: string | null
  /** Per-script module load strategy; default `aggregate`. */
  scriptLoadMode?: RuntimeScriptLoadMode
}

/** Gist path prefix for immutable release snapshots (`releases/foo.js@1.2.0`). */
export const RELEASES_PREFIX = 'releases/'

/** Script bundle track served to clients. */
export type ScriptBundleTrack = 'stable' | 'alpha'

/** Default for legacy scripts with no persisted `ota` field. */
export const LEGACY_SCRIPT_OTA_DEFAULTS: ScriptOtaPolicy = {
  stage: 'stable',
  autoUpgrade: true,
}

/** Default when creating a new script (debug save). */
export const NEW_SCRIPT_OTA_DEFAULTS: ScriptOtaPolicy = {
  stage: 'alpha',
  autoUpgrade: false,
}

/** Default platform runtime policy when index has no `runtime` block. */
export const DEFAULT_RUNTIME_OTA: RuntimeOtaPolicy = {
  stage: 'stable',
  autoUpgrade: true,
  lockedVersion: null,
  scriptLoadMode: 'aggregate',
}

/**
 * Build a releases snapshot path for a managed script filename and semver.
 * @param filename Managed script filename (no slashes)
 * @param version Semver string (used verbatim in the path)
 * @returns Gist path under `releases/`
 */
export function buildReleaseSnapshotPath(filename: string, version: string): string {
  const trimmedFile = filename.trim()
  const trimmedVersion = version.trim().replace(/^v/i, '')
  if (!trimmedFile || trimmedFile.includes('/') || trimmedFile.includes('\\')) {
    throw new Error('Invalid script filename for release snapshot')
  }
  if (!trimmedVersion) {
    throw new Error('version is required for release snapshot')
  }
  return `${RELEASES_PREFIX}${trimmedFile}@${trimmedVersion}`
}

/**
 * Whether a Gist path is a release snapshot (not a managed script entry).
 * @param path Gist file path
 * @returns True when path is under `releases/` with `@version` suffix
 */
export function isReleaseSnapshotPath(path: string): boolean {
  if (!path.startsWith(RELEASES_PREFIX)) {
    return false
  }
  const rest = path.slice(RELEASES_PREFIX.length)
  const at = rest.lastIndexOf('@')
  if (at <= 0 || at === rest.length - 1) {
    return false
  }
  const filename = rest.slice(0, at)
  return filename.length > 0 && !filename.includes('/')
}

/**
 * Parse a release snapshot path into filename and version.
 * @param path Gist snapshot path
 * @returns Parsed parts or null when not a snapshot path
 */
export function parseReleaseSnapshotPath(path: string): { filename: string; version: string } | null {
  if (!isReleaseSnapshotPath(path)) {
    return null
  }
  const rest = path.slice(RELEASES_PREFIX.length)
  const at = rest.lastIndexOf('@')
  return {
    filename: rest.slice(0, at),
    version: rest.slice(at + 1),
  }
}

/**
 * Normalize raw persisted `ota` JSON into a full policy object.
 * @param raw Unknown value from script index
 * @param options isNewScript when true, apply NEW_SCRIPT defaults instead of legacy
 * @returns Resolved policy
 */
export function resolveScriptOtaPolicy(raw: Partial<ScriptOtaPolicy> | undefined | null, options?: { isNewScript?: boolean }): ScriptOtaPolicy {
  const fallback = options?.isNewScript ? NEW_SCRIPT_OTA_DEFAULTS : LEGACY_SCRIPT_OTA_DEFAULTS
  if (!raw || typeof raw !== 'object') {
    return { ...fallback }
  }
  const stage: OtaReleaseStage = raw.stage === 'alpha' ? 'alpha' : raw.stage === 'stable' ? 'stable' : fallback.stage
  const autoUpgrade = typeof raw.autoUpgrade === 'boolean' ? raw.autoUpgrade : stage === 'alpha' ? false : fallback.autoUpgrade
  const lockedVersion = typeof raw.lockedVersion === 'string' && raw.lockedVersion.trim() ? raw.lockedVersion.trim() : undefined
  return {
    stage,
    autoUpgrade,
    ...(lockedVersion ? { lockedVersion } : {}),
  }
}

/**
 * Normalize raw runtime OTA from script index top-level `runtime` block.
 * @param raw Unknown value from index JSON
 * @param projectVersion Fallback project version from preset build
 * @returns Resolved runtime policy
 */
export function resolveRuntimeOtaPolicy(raw: Partial<RuntimeOtaPolicy> | undefined | null, projectVersion?: string): RuntimeOtaPolicy {
  const base = { ...DEFAULT_RUNTIME_OTA, ...(projectVersion?.trim() ? { projectVersion: projectVersion.trim() } : {}) }
  if (!raw || typeof raw !== 'object') {
    return base
  }
  const stage: OtaReleaseStage = raw.stage === 'alpha' ? 'alpha' : 'stable'
  const autoUpgrade = typeof raw.autoUpgrade === 'boolean' ? raw.autoUpgrade : stage === 'alpha' ? false : true
  const lockedVersion =
    raw.lockedVersion === null || raw.lockedVersion === undefined ? null : typeof raw.lockedVersion === 'string' && raw.lockedVersion.trim() ? raw.lockedVersion.trim() : null
  const scriptLoadMode: RuntimeScriptLoadMode =
    raw.scriptLoadMode === 'match-fallback' ? 'match-fallback' : raw.scriptLoadMode === 'aggregate' ? 'aggregate' : (base.scriptLoadMode ?? 'aggregate')
  return {
    projectVersion: typeof raw.projectVersion === 'string' && raw.projectVersion.trim() ? raw.projectVersion.trim() : base.projectVersion,
    stage,
    autoUpgrade,
    lockedVersion,
    scriptLoadMode,
  }
}

/**
 * Build manifest scriptPolicies entry from script meta.
 * @param script Script index row
 * @returns Policy summary for clients
 */
export function buildScriptPolicySummary(script: { filename: string; version?: string; ota?: Partial<ScriptOtaPolicy> }): ScriptOtaPolicy & { version?: string } {
  const ota = resolveScriptOtaPolicy(script.ota)
  return {
    ...ota,
    ...(script.version?.trim() ? { version: script.version.trim() } : {}),
  }
}
