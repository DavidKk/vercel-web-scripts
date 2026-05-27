import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import Icons from 'unplugin-icons/vite'
import { build, defineConfig, type Plugin, type UserConfig } from 'vite'

import pkg from '../package.json'
import { ensureDevReloadSseServer } from './vite-plugins/dev-reload-sse'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.resolve(__dirname, 'dist')

const EXTENSION_ENTRIES = [
  { name: 'background', input: 'src/shell/background.ts' },
  { name: 'popup', input: 'src/shell/popup/popup.ts' },
  { name: 'scripts', input: 'src/pages/scripts/scripts.ts' },
  { name: 'options', input: 'src/options/options.ts' },
  { name: 'content-bridge', input: 'src/bridge/content.ts' },
  { name: 'page-launcher', input: 'src/page/index.ts' },
] as const

const sharedResolve: UserConfig['resolve'] = {
  alias: {
    '@ext': path.resolve(__dirname, 'src'),
    '@shared': path.resolve(__dirname, '../shared'),
  },
}

const sharedCss: UserConfig['css'] = {
  postcss: path.resolve(__dirname, 'postcss.config.mjs'),
}

const extensionIconsPlugin = Icons({ compiler: 'raw', autoInstall: true })

function copyToDist(from: string, to: string): void {
  if (!existsSync(from)) {
    return
  }
  cpSync(from, path.join(distDir, to))
}

function copyExtensionAssets(): void {
  if (!existsSync(distDir)) {
    mkdirSync(distDir, { recursive: true })
  }
  const manifestSrc = path.join(__dirname, 'manifest.json')
  let manifest = readFileSync(manifestSrc, 'utf-8')
  const version = (pkg as { version?: string }).version ?? '0.1.0'
  manifest = manifest.replace('__VERSION__', version)
  writeFileSync(path.join(distDir, 'manifest.json'), manifest, 'utf-8')

  copyToDist(path.join(__dirname, 'src/options/index.html'), 'options.html')
  copyToDist(path.join(__dirname, 'src/shell/popup/index.html'), 'popup.html')
  copyToDist(path.join(__dirname, 'src/pages/scripts/index.html'), 'scripts.html')

  const iconsDir = path.join(__dirname, 'icons')
  if (existsSync(iconsDir)) {
    cpSync(iconsDir, path.join(distDir, 'icons'), { recursive: true })
  }
}

function assertNoModuleSyntax(): void {
  for (const entry of EXTENSION_ENTRIES) {
    const file = path.join(distDir, `${entry.name}.js`)
    const code = readFileSync(file, 'utf-8')
    if (/^\s*import[\s{]/m.test(code) || /^\s*export[\s{]/m.test(code)) {
      throw new Error(`${entry.name}.js still contains import/export — extension bundles must be IIFE-only`)
    }
  }
}

/** Tailwind for extension HTML pages (shell.css). */
async function buildDocumentCss(): Promise<void> {
  await build({
    configFile: false,
    root: __dirname,
    build: {
      outDir: 'dist',
      emptyOutDir: false,
      rollupOptions: {
        input: path.resolve(__dirname, 'src/ui/document-css-entry.ts'),
        output: {
          entryFileNames: '_document-css.js',
          assetFileNames: 'shell.css',
        },
      },
      target: 'esnext',
      minify: false,
    },
    css: sharedCss,
  })
  rmSync(path.join(distDir, '_document-css.js'), { force: true })
  rmSync(path.join(distDir, '_document-css.js.map'), { force: true })
}

function extensionDefine(devReloadSseUrl: string): UserConfig['define'] {
  return {
    __EXTENSION_DEV_RELOAD_SSE__: JSON.stringify(devReloadSseUrl),
  }
}

function createEntryConfig(entry: (typeof EXTENSION_ENTRIES)[number], emptyOutDir: boolean, devReloadSseUrl: string): UserConfig {
  return {
    configFile: false,
    root: __dirname,
    define: extensionDefine(devReloadSseUrl),
    build: {
      outDir: 'dist',
      emptyOutDir,
      rollupOptions: {
        input: path.resolve(__dirname, entry.input),
        output: {
          entryFileNames: `${entry.name}.js`,
          /** IIFE: no import/export — safe for content scripts, page inject, popup, and service worker */
          format: 'iife',
          inlineDynamicImports: true,
        },
      },
      target: 'esnext',
      minify: false,
      sourcemap: true,
    },
    resolve: sharedResolve,
    css: sharedCss,
    plugins: [extensionIconsPlugin],
  }
}

/** Remove stale chunk output from older multi-input builds. */
function extensionCleanPlugin(): Plugin {
  return {
    name: 'extension-clean',
    buildStart() {
      rmSync(path.join(distDir, 'chunks'), { recursive: true, force: true })
    },
  }
}

/**
 * Vite 6 accepts a single config object only. Build entry[0] via the main Rollup pass;
 * compile remaining entries in closeBundle (one IIFE per entry, deps inlined).
 * Nested builds use configFile:false so this plugin is not re-entered.
 */
function extensionMultiEntryPlugin(devReload: ReturnType<typeof ensureDevReloadSseServer> | undefined): Plugin {
  let buildingRemaining = false
  const devReloadSseUrl = devReload?.sseUrl ?? ''

  return {
    name: 'extension-multi-entry',
    apply: 'build',
    buildStart() {
      if (this.meta.watchMode) {
        for (const entry of EXTENSION_ENTRIES) {
          this.addWatchFile(path.resolve(__dirname, entry.input))
        }
      }
    },
    async closeBundle() {
      if (buildingRemaining) {
        return
      }
      buildingRemaining = true
      try {
        for (let i = 1; i < EXTENSION_ENTRIES.length; i++) {
          await build(createEntryConfig(EXTENSION_ENTRIES[i], false, devReloadSseUrl))
        }
        await buildDocumentCss()
        assertNoModuleSyntax()
        copyExtensionAssets()
        if (this.meta.watchMode && devReload) {
          devReload.scheduleBroadcast()
        }
      } finally {
        buildingRemaining = false
      }
    },
  }
}

const primaryEntry = EXTENSION_ENTRIES[0]

export default defineConfig(() => {
  const isWatch = process.argv.includes('--watch')
  const devReload = isWatch ? ensureDevReloadSseServer() : undefined
  const devReloadSseUrl = devReload?.sseUrl ?? ''

  return {
    root: __dirname,
    define: extensionDefine(devReloadSseUrl),
    plugins: [extensionCleanPlugin(), extensionMultiEntryPlugin(devReload), extensionIconsPlugin],
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      /** `build.watch` enables watch mode whenever set — only turn on with --watch */
      ...(isWatch ? { watch: { exclude: ['dist/**'] } } : {}),
      rollupOptions: {
        input: path.resolve(__dirname, primaryEntry.input),
        output: {
          entryFileNames: `${primaryEntry.name}.js`,
          format: 'iife',
          inlineDynamicImports: true,
        },
      },
      target: 'esnext',
      minify: false,
      sourcemap: true,
    },
    resolve: sharedResolve,
    css: sharedCss,
  }
})
