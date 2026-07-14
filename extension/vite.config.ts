import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import Icons from 'unplugin-icons/vite'
import { build, defineConfig, type InlineConfig, type Plugin, type UserConfig } from 'vite'

import pkg from '../package.json'
import { compileExtensionHtml, listExtensionHtmlSources } from './scripts/compile-extension-html.mjs'
import { createScriptLogger } from './scripts/logger.mjs'
import { buildShellCss } from './vite-plugins/build-shell-css'
import { ensureDevReloadSseServer } from './vite-plugins/dev-reload-sse'
import { ensureDevBuildStamp, registerExtensionWatchFiles, touchDevBuildStamp, watchExtensionNewFiles } from './vite-plugins/extension-watch-files'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.resolve(__dirname, 'dist')
const extensionLog = createScriptLogger('extension')

const EXTENSION_ENTRIES = [
  { name: 'background', input: 'src/shell/background.ts' },
  { name: 'popup', input: 'src/shell/popup/popup.ts' },
  { name: 'admin', input: 'src/pages/admin/admin.ts' },
  { name: 'sidepanel', input: 'src/ui/sidepanel/sidepanel.ts' },
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

function copyExtensionAssets(watchMode = false): void {
  if (!existsSync(distDir)) {
    mkdirSync(distDir, { recursive: true })
  }
  const manifestSrc = path.join(__dirname, 'manifest.json')
  let manifest = readFileSync(manifestSrc, 'utf-8')
  const version = (pkg as { version?: string }).version ?? '0.1.0'
  manifest = manifest.replace('__VERSION__', version)
  writeFileSync(path.join(distDir, 'manifest.json'), manifest, 'utf-8')

  compileExtensionHtml(__dirname, distDir)

  const iconsDir = path.join(__dirname, 'icons')
  const distIconsDir = path.join(distDir, 'icons')
  if (existsSync(iconsDir)) {
    rmSync(distIconsDir, { recursive: true, force: true })
    cpSync(iconsDir, distIconsDir, { recursive: true })
  } else {
    rmSync(distIconsDir, { recursive: true, force: true })
  }

  const rulesDir = path.join(__dirname, 'rules')
  const distRulesDir = path.join(distDir, 'rules')
  if (existsSync(rulesDir)) {
    rmSync(distRulesDir, { recursive: true, force: true })
    cpSync(rulesDir, distRulesDir, { recursive: true })
  } else if (existsSync(distRulesDir)) {
    rmSync(distRulesDir, { recursive: true, force: true })
  }

  if (watchMode) {
    extensionLog.info('compiled HTML, manifest, icons → dist/')
  }
}

function assertNoModuleSyntax(): void {
  for (const entry of EXTENSION_ENTRIES) {
    const file = path.join(distDir, `${entry.name}.js`)
    if (!existsSync(file)) {
      throw new Error(`${entry.name}.js missing after extension build — dist is incomplete (watch rebuild race?)`)
    }
    const code = readFileSync(file, 'utf-8')
    if (/^\s*import[\s{]/m.test(code) || /^\s*export[\s{]/m.test(code)) {
      throw new Error(`${entry.name}.js still contains import/export — extension bundles must be IIFE-only`)
    }
  }
}

function extensionDefine(devReloadSseUrl: string): UserConfig['define'] {
  return {
    __EXTENSION_DEV_RELOAD_SSE__: JSON.stringify(devReloadSseUrl),
  }
}

function createEntryConfig(entry: (typeof EXTENSION_ENTRIES)[number], emptyOutDir: boolean, devReloadSseUrl: string): InlineConfig {
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
          format: 'iife' as const,
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

const primaryIifeOutput = {
  entryFileNames: `${EXTENSION_ENTRIES[0].name}.js`,
  format: 'iife' as const,
  inlineDynamicImports: true,
}

/** Explicit watch list for EJS pages/partials (include graph is invisible to Rollup). */
function extensionHtmlWatchPlugin(): Plugin {
  return {
    name: 'extension-html-watch',
    apply: 'build',
    buildStart() {
      for (const rel of listExtensionHtmlSources(__dirname)) {
        this.addWatchFile(path.join(__dirname, rel))
      }
    },
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
/** popup, scripts, servers, content-bridge, page-launcher + shell.css (watch + closeBundle). */
async function buildSecondaryExtensionEntries(devReloadSseUrl: string, watchMode: boolean): Promise<void> {
  for (let i = 1; i < EXTENSION_ENTRIES.length; i++) {
    await build(createEntryConfig(EXTENSION_ENTRIES[i], false, devReloadSseUrl))
  }
  await buildShellCss(__dirname, 'dist')
  assertNoModuleSyntax()
  copyExtensionAssets(watchMode)
}

function extensionMultiEntryPlugin(devReload: ReturnType<typeof ensureDevReloadSseServer> | undefined): Plugin {
  let closeBundleQueue: Promise<void> = Promise.resolve()
  let closeNewFileWatcher: (() => void) | undefined
  let touchStampTimer: ReturnType<typeof setTimeout> | undefined
  let watchSecondaryTimer: ReturnType<typeof setTimeout> | undefined
  let watchSecondaryWaiters: Array<{ resolve: () => void; reject: (error: unknown) => void }> = []
  const devReloadSseUrl = devReload?.sseUrl ?? ''
  /** Coalesce rapid watch rebuilds so secondary IIFEs are not interrupted mid-pipeline. */
  const watchSecondaryDebounceMs = 80

  function enqueueSecondaryBuild(watchMode: boolean): Promise<void> {
    closeBundleQueue = closeBundleQueue
      .catch(() => undefined)
      .then(async () => {
        await buildSecondaryExtensionEntries(devReloadSseUrl, watchMode)
        if (watchMode && devReload) {
          devReload.scheduleBroadcast()
        }
      })
    return closeBundleQueue
  }

  function scheduleWatchSecondaryBuild(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      watchSecondaryWaiters.push({ resolve, reject })
      clearTimeout(watchSecondaryTimer)
      watchSecondaryTimer = setTimeout(() => {
        watchSecondaryTimer = undefined
        const waiters = watchSecondaryWaiters
        watchSecondaryWaiters = []
        void enqueueSecondaryBuild(true)
          .then(() => {
            for (const waiter of waiters) {
              waiter.resolve()
            }
          })
          .catch((error: unknown) => {
            for (const waiter of waiters) {
              waiter.reject(error)
            }
          })
      }, watchSecondaryDebounceMs)
    })
  }

  return {
    name: 'extension-multi-entry',
    apply: 'build',
    buildStart() {
      ensureDevBuildStamp(__dirname)
      if (!this.meta.watchMode) {
        return
      }
      if (!closeNewFileWatcher) {
        closeNewFileWatcher = watchExtensionNewFiles(__dirname, () => {
          clearTimeout(touchStampTimer)
          touchStampTimer = setTimeout(() => {
            touchDevBuildStamp(__dirname)
          }, 50)
        })
      }
      for (const entry of EXTENSION_ENTRIES) {
        this.addWatchFile(path.resolve(__dirname, entry.input))
      }
      const staticPaths = registerExtensionWatchFiles(__dirname, (id) => {
        this.addWatchFile(id)
      })
      extensionLog.info(`watch: ${EXTENSION_ENTRIES.length} entries + ${staticPaths.length} path(s) via addWatchFile (src glob each buildStart)`)
    },
    closeBundle() {
      const watchMode = this.meta.watchMode
      const run = watchMode ? scheduleWatchSecondaryBuild() : enqueueSecondaryBuild(false)
      return run.catch((err: unknown) => {
        // eslint-disable-next-line no-console -- Vite build pipeline error surface
        console.error('[extension] multi-entry build failed:', err)
        throw err
      })
    },
    closeWatcher() {
      clearTimeout(touchStampTimer)
      clearTimeout(watchSecondaryTimer)
      if (watchSecondaryWaiters.length > 0) {
        const waiters = watchSecondaryWaiters
        watchSecondaryWaiters = []
        for (const waiter of waiters) {
          waiter.reject(new Error('Extension watch build closed'))
        }
      }
      closeNewFileWatcher?.()
      closeNewFileWatcher = undefined
    },
  }
}

const primaryEntry = EXTENSION_ENTRIES[0]

export default defineConfig((): UserConfig => {
  const isWatch = process.argv.includes('--watch')
  const devReload = isWatch ? ensureDevReloadSseServer() : undefined
  const devReloadSseUrl = devReload?.sseUrl ?? ''

  return {
    root: __dirname,
    define: extensionDefine(devReloadSseUrl),
    plugins: [extensionCleanPlugin(), extensionHtmlWatchPlugin(), extensionMultiEntryPlugin(devReload), extensionIconsPlugin],
    build: {
      outDir: 'dist',
      /** Watch: never empty dist mid-pipeline (closeBundle still writing popup/scripts/…). */
      emptyOutDir: !isWatch,
      /** `build.watch` enables watch mode whenever set — only turn on with --watch */
      ...(isWatch
        ? {
            watch: {
              exclude: ['dist/**', 'node_modules/**'],
            },
          }
        : {}),
      rollupOptions: {
        input: path.resolve(__dirname, primaryEntry.input),
        output: primaryIifeOutput,
      },
      target: 'esnext',
      minify: false,
      sourcemap: true,
    },
    resolve: sharedResolve,
    css: sharedCss,
  }
})
