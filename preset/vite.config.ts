import { createHash } from 'node:crypto'
import { createReadStream, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import Icons from 'unplugin-icons/vite'
import { defineConfig } from 'vite'

import pkg from '../package.json'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const PRESET_DEV_SERVER_URL = process.env.PRESET_DEV_SERVER_URL || 'http://localhost:3000'

/** 40-char placeholder for preset build hash (SHA-1 hex length); replaced in writeBundle with actual hash. */
const PRESET_BUILD_HASH_PLACEHOLDER = '0'.repeat(40)
/** 13-char placeholder for preset build timestamp (ms); replaced in writeBundle with Date.now(). */
const PRESET_UPDATED_AT_PLACEHOLDER = '0'.repeat(13)
/** Placeholder for project version; replaced in writeBundle (avoids define not applied in lib output). */
const PROJECT_VERSION_PLACEHOLDER = '__VWS_PROJECT_VERSION_PLACEHOLDER__'

const projectVersion = (pkg as { version?: string }).version ?? '0.0.0'

/** Manifest shape: content hash for conditional GET (If-None-Match → 304). */
const MANIFEST_FILE = 'manifest.json'

/**
 * Hash file by streaming (avoids loading full content into memory for hash step).
 * @returns Promise of SHA-1 hex digest
 */
function hashFileStream(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha1')
    const stream = createReadStream(filePath)
    stream.on('data', (chunk: Buffer | string) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}

/**
 * Vite plugin: after bundle is written (writeBundle), replace placeholders with hash, build time, and project version;
 * write manifest.json with content hash (streaming) for ETag / If-None-Match.
 */
function presetBuildHashPlugin() {
  return {
    name: 'preset-build-hash',
    writeBundle(options: { dir?: string }, bundle: Record<string, unknown>) {
      const outDir = options.dir || process.cwd()
      const jsKeys = Object.keys(bundle).filter((k) => k.endsWith('.js') && !k.endsWith('.map'))
      const buildTime = String(Date.now())
      for (const key of jsKeys) {
        const outPath = path.resolve(outDir, key)
        let content = readFileSync(outPath, 'utf-8')
        if (!content.includes(PRESET_BUILD_HASH_PLACEHOLDER)) continue
        if (!content.includes(PRESET_UPDATED_AT_PLACEHOLDER)) {
          throw new Error(`[preset-build-hash] Placeholder (13 zeros) not found in ${outPath}`)
        }
        content = content.replaceAll(PRESET_UPDATED_AT_PLACEHOLDER, buildTime)
        if (!content.includes(PROJECT_VERSION_PLACEHOLDER)) {
          throw new Error(`[preset-build-hash] Placeholder ${PROJECT_VERSION_PLACEHOLDER} not found in ${outPath}`)
        }
        content = content.replaceAll(PROJECT_VERSION_PLACEHOLDER, projectVersion)
        const inlineHash = createHash('sha1').update(content, 'utf8').digest('hex')
        content = content.replace(PRESET_BUILD_HASH_PLACEHOLDER, inlineHash)
        writeFileSync(outPath, content, 'utf-8')
        return hashFileStream(outPath).then((contentHash) => {
          writeFileSync(path.resolve(outDir, MANIFEST_FILE), JSON.stringify({ file: key, hash: contentHash }, null, 0), 'utf-8')
          // eslint-disable-next-line no-console -- build hash debug
          console.log(`[preset-build-hash] ${key} → ${contentHash}`)
        })
      }
    },
  }
}

/**
 * Vite plugin: when preset build completes (watch or single), POST to Next.js dev API
 * so preset (running in browser) receives SSE and pushes update to Launcher.
 */
function presetBuiltNotifyPlugin() {
  return {
    name: 'preset-built-notify',
    async closeBundle() {
      const url = `${PRESET_DEV_SERVER_URL}/api/sse/preset-built`
      const builtAt = Date.now()
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ builtAt }),
        })
        // eslint-disable-next-line no-console -- dev SSE push debug
        console.log(`[preset-built-notify] POST ${url} → ${res.status}${res.ok ? ` (builtAt=${builtAt})` : ''}`)
      } catch (err) {
        // eslint-disable-next-line no-console -- dev SSE push debug
        console.log('[preset-built-notify] POST failed:', (err as Error).message)
      }
    },
  }
}

/**
 * Preset build: entry → preset/dist/preset.js (IIFE). Clears dist.
 */
const presetConfig = defineConfig({
  root: __dirname,
  define: {
    __PRESET_BUILD_HASH__: JSON.stringify(PRESET_BUILD_HASH_PLACEHOLDER),
    __PROJECT_VERSION__: JSON.stringify(PROJECT_VERSION_PLACEHOLDER),
    __SCRIPT_UPDATED_AT__: JSON.stringify(PRESET_UPDATED_AT_PLACEHOLDER),
  },
  plugins: [Icons({ compiler: 'raw', autoInstall: true }), presetBuildHashPlugin(), presetBuiltNotifyPlugin()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    lib: {
      entry: path.resolve(__dirname, 'src/entry.ts'),
      name: 'GME',
      fileName: () => 'preset.js',
      formats: ['iife'],
    },
    rollupOptions: {
      output: {
        format: 'iife',
        inlineDynamicImports: true,
      },
    },
    target: 'esnext',
    minify: false,
    sourcemap: 'inline',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
})

export default presetConfig
