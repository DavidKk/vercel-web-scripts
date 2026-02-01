import path from 'path'
import { defineConfig } from 'vite'

const PRESET_DEV_SERVER_URL = process.env.PRESET_DEV_SERVER_URL || 'http://localhost:3000'

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
  plugins: [presetBuiltNotifyPlugin()],
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
