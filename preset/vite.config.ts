import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import Icons from 'unplugin-icons/vite'
import { defineConfig } from 'vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const PRESET_DEV_SERVER_URL = process.env.PRESET_DEV_SERVER_URL || 'http://localhost:3000'

/** 40-char placeholder for preset build hash (SHA-1 hex length); replaced in writeBundle with actual hash. */
const PRESET_BUILD_HASH_PLACEHOLDER = '0'.repeat(40)
/** 13-char placeholder for preset build timestamp (ms); replaced in writeBundle with Date.now(). */
const PRESET_UPDATED_AT_PLACEHOLDER = '0'.repeat(13)
/** Placeholder for project version; replaced in writeBundle (avoids define not applied in lib output). */
const PROJECT_VERSION_PLACEHOLDER = '__VWS_PROJECT_VERSION_PLACEHOLDER__'

const pkg = JSON.parse(readFileSync(path.resolve(__dirname, '../package.json'), 'utf-8')) as { version?: string }
const projectVersion = pkg.version ?? '0.0.0'

/**
 * Vite plugin: after bundle is written (writeBundle), replace placeholders with hash, build time, and project version.
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
        const hash = createHash('sha1').update(content, 'utf8').digest('hex')
        if (!content.includes(PRESET_BUILD_HASH_PLACEHOLDER)) {
          throw new Error(`[preset-build-hash] Placeholder (40 zeros) not found in ${outPath}`)
        }
        content = content.replace(PRESET_BUILD_HASH_PLACEHOLDER, hash)
        if (!content.includes(PRESET_UPDATED_AT_PLACEHOLDER)) {
          throw new Error(`[preset-build-hash] Placeholder (13 zeros) not found in ${outPath}`)
        }
        content = content.replace(PRESET_UPDATED_AT_PLACEHOLDER, buildTime)
        if (!content.includes(PROJECT_VERSION_PLACEHOLDER)) {
          throw new Error(`[preset-build-hash] Placeholder ${PROJECT_VERSION_PLACEHOLDER} not found in ${outPath}`)
        }
        content = content.replaceAll(PROJECT_VERSION_PLACEHOLDER, projectVersion)
        writeFileSync(outPath, content, 'utf-8')
        // eslint-disable-next-line no-console -- build hash debug
        console.log(`[preset-build-hash] ${key} → ${hash}`)
      }
    },
  }
}

/**
 * Vite plugin: when preset build completes (watch or single), POST to Next.js dev API
 * so preset (running in browser) receives SSE and pushes update to Launcher.
 * Note: Vite build runs with NODE_ENV=production, so we always POST; API returns 404 in production.
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
        if (!res.ok) {
          // 404 in production or when Next dev not running
        }
      } catch (err) {
        // eslint-disable-next-line no-console -- dev SSE push debug
        console.log('[preset-built-notify] POST failed:', (err as Error).message)
        // Next.js dev server may not be running (e.g. build:preset only)
      }
    },
  }
}

/**
 * Vite config for preset (gm-templates migrated as ES modules).
 * Entry: preset/src/entry.ts
 * Output: preset/dist/ipreset.js
 * Target: Chrome, ESNext.
 */
export default defineConfig({
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
    /** Inline source map so Tampermonkey/userscript gets a single file; external .map would 404 when script loads from different origin. */
    sourcemap: 'inline',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
})
