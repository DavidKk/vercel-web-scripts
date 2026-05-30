import { existsSync, type FSWatcher, readdirSync, statSync, watch, writeFileSync } from 'node:fs'
import path from 'node:path'

const stampPath = 'src/dev-build-stamp.ts'

/** Root-level assets outside `src/` glob (manifest version, Tailwind/PostCSS, copied icons). */
export const EXTENSION_STATIC_ASSETS = ['manifest.json', 'tailwind.config.ts', 'postcss.config.mjs'] as const

/** Repo paths relative to `extension/` (not under extension root). */
export const EXTENSION_REPO_WATCH = ['../package.json'] as const

export function ensureDevBuildStamp(extensionDir: string): void {
  const abs = path.join(extensionDir, stampPath)
  if (!existsSync(abs)) {
    writeFileSync(abs, '/** Auto-updated in dev watch */\nexport const DEV_BUILD_STAMP = 0\n', 'utf-8')
  }
}

export function touchDevBuildStamp(extensionDir: string): void {
  writeFileSync(path.join(extensionDir, stampPath), `/** Auto-updated in dev watch */\nexport const DEV_BUILD_STAMP = ${Date.now()}\n`, 'utf-8')
}

function walkFiles(baseDir: string, shouldInclude: (relativePath: string) => boolean): string[] {
  const files: string[] = []

  function visit(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name)
      const rel = path.relative(baseDir, abs).replace(/\\/g, '/')

      if (entry.isDirectory()) {
        visit(abs)
        continue
      }

      if (entry.isFile() && shouldInclude(rel)) {
        files.push(rel)
      }
    }
  }

  visit(baseDir)
  return files
}

function globAndWatch(
  baseDir: string,
  shouldInclude: (relativePath: string) => boolean,
  labelPrefix: string,
  addWatchFile: (absolutePath: string) => void,
  registered: string[]
): void {
  if (!existsSync(baseDir)) {
    return
  }
  for (const rel of walkFiles(baseDir, shouldInclude)) {
    const abs = path.join(baseDir, rel)
    addWatchFile(abs)
    registered.push(`${labelPrefix}${rel.replace(/\\/g, '/')}`)
  }
}

function isExtensionSourceFile(relativePath: string): boolean {
  return /\.(ts|tsx|html|css)$/.test(relativePath) && relativePath !== 'dev-build-stamp.ts'
}

function fileExists(abs: string): boolean {
  try {
    return statSync(abs).isFile()
  } catch {
    return false
  }
}

/**
 * Vite-recommended: register files outside the primary Rollup graph (background) so
 * `vite build --watch` rebuilds when they change. Called on every `buildStart` in watch
 * mode so **newly created** files under `src/` are picked up without restarting watch.
 * @see https://vite.dev/guide/build#build-watch
 * @see PluginContext.addWatchFile
 */
export function registerExtensionWatchFiles(extensionDir: string, addWatchFile: (absolutePath: string) => void): string[] {
  const registered: string[] = []

  for (const rel of EXTENSION_STATIC_ASSETS) {
    const abs = path.join(extensionDir, rel)
    if (existsSync(abs)) {
      addWatchFile(abs)
      registered.push(rel)
    }
  }

  for (const rel of EXTENSION_REPO_WATCH) {
    const abs = path.join(extensionDir, rel)
    if (existsSync(abs)) {
      addWatchFile(abs)
      registered.push(rel.replace(/\\/g, '/'))
    }
  }

  // All extension sources (secondary IIFE entries are built in closeBundle, not in the primary graph).
  globAndWatch(path.join(extensionDir, 'src'), isExtensionSourceFile, 'src/', addWatchFile, registered)

  // Manifest icons copied in closeBundle (not imported by Rollup).
  globAndWatch(path.join(extensionDir, 'icons'), () => true, 'icons/', addWatchFile, registered)

  // Vite plugins imported by vite.config.ts (config itself still needs a process restart).
  globAndWatch(path.join(extensionDir, 'vite-plugins'), (rel) => /\.(ts|mjs)$/.test(rel), 'vite-plugins/', addWatchFile, registered)

  globAndWatch(path.join(extensionDir, '../shared'), (rel) => /\.ts$/.test(rel), '../shared/', addWatchFile, registered)

  return registered
}

export function watchExtensionNewFiles(extensionDir: string, onNewFile: (absolutePath: string) => void): () => void {
  const watchers: FSWatcher[] = []
  const watchTargets = [
    { baseDir: path.join(extensionDir, 'src'), shouldInclude: isExtensionSourceFile },
    { baseDir: path.join(extensionDir, 'icons'), shouldInclude: () => true },
    { baseDir: path.join(extensionDir, 'vite-plugins'), shouldInclude: (rel: string) => /\.(ts|mjs)$/.test(rel) },
    { baseDir: path.join(extensionDir, '../shared'), shouldInclude: (rel: string) => /\.ts$/.test(rel) },
  ]

  for (const target of watchTargets) {
    if (!existsSync(target.baseDir)) {
      continue
    }

    try {
      const watcher = watch(target.baseDir, { recursive: true }, (eventType, filename) => {
        if (eventType !== 'rename' || !filename) {
          return
        }

        const rel = filename.toString().replace(/\\/g, '/')
        const abs = path.join(target.baseDir, rel)
        if (target.shouldInclude(rel) && fileExists(abs)) {
          onNewFile(abs)
        }
      })
      watchers.push(watcher)
    } catch {
      // Existing files are still covered by addWatchFile; unsupported recursive
      // watching only means newly created files may need a watch restart.
    }
  }

  return () => {
    for (const watcher of watchers) {
      watcher.close()
    }
  }
}
