import { createHash } from 'node:crypto'
import { createReadStream, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import Icons from 'unplugin-icons/vite'
import { defineConfig } from 'vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MANIFEST_FILE = 'manifest-ui.json'
const IS_WATCH_MODE = process.argv.includes('--watch')

/**
 * Hash file by streaming.
 * @param filePath Absolute file path
 * @returns SHA-1 hex digest
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
 * Write UI bundle hash manifest after build.
 */
function presetUiManifestPlugin() {
  return {
    name: 'preset-ui-manifest',
    writeBundle(options: { dir?: string }, bundle: Record<string, unknown>) {
      const outDir = options.dir || process.cwd()
      const jsKeys = Object.keys(bundle).filter((k) => k.endsWith('.js') && !k.endsWith('.map'))
      for (const key of jsKeys) {
        const outPath = path.resolve(outDir, key)
        const content = readFileSync(outPath, 'utf-8')
        return Promise.resolve()
          .then(() => hashFileStream(outPath))
          .then((contentHash) => {
            writeFileSync(path.resolve(outDir, MANIFEST_FILE), JSON.stringify({ file: key, hash: contentHash }, null, 0), 'utf-8')
            // eslint-disable-next-line no-console
            console.log(`[preset-ui-manifest] ${key} -> ${contentHash} (${content.length} bytes)`)
          })
      }
    },
  }
}

export default defineConfig({
  root: __dirname,
  plugins: [Icons({ compiler: 'raw', autoInstall: true }), presetUiManifestPlugin()],
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: path.resolve(__dirname, 'src/entry-ui.ts'),
      name: 'GME_UI',
      fileName: () => 'preset-ui.js',
      formats: ['iife'],
    },
    rollupOptions: {
      output: {
        format: 'iife',
        inlineDynamicImports: true,
      },
    },
    target: 'esnext',
    minify: IS_WATCH_MODE ? false : 'esbuild',
    sourcemap: IS_WATCH_MODE ? 'inline' : false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
})
