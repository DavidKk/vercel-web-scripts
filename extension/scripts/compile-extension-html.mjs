import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import ejs from 'ejs'

const PAGE_OUTPUT = {
  popup: 'popup.html',
  servers: 'servers.html',
  scripts: 'scripts.html',
  rules: 'rules.html',
}

/**
 * Compile extension page templates (`src/html/pages/*.ejs`) into dist HTML.
 * @param {string} extensionDir Absolute path to `extension/`
 * @param {string} outDir Absolute path to `extension/dist/` (or target output dir)
 */
export function compileExtensionHtml(extensionDir, outDir) {
  const htmlRoot = path.join(extensionDir, 'src/html')
  const pagesDir = path.join(htmlRoot, 'pages')
  const partialsDir = path.join(htmlRoot, 'partials')

  if (!existsSync(pagesDir)) {
    throw new Error(`Missing extension HTML pages directory: ${pagesDir}`)
  }

  mkdirSync(outDir, { recursive: true })

  ejs.clearCache()

  for (const [pageName, outFile] of Object.entries(PAGE_OUTPUT)) {
    const src = path.join(pagesDir, `${pageName}.ejs`)
    const dest = path.join(outDir, outFile)

    if (!existsSync(src)) {
      rmSync(dest, { force: true })
      continue
    }

    const html = ejs.render(
      readFileSync(src, 'utf-8'),
      {},
      {
        filename: src,
        views: [pagesDir, partialsDir],
        root: htmlRoot,
        async: false,
        cache: false,
      }
    )

    writeFileSync(dest, html, 'utf-8')
  }
}

/**
 * Register all EJS sources for Vite watch (pages + partials).
 * @param {string} extensionDir
 * @returns {string[]} Relative paths from `extension/` for logging
 */
export function listExtensionHtmlSources(extensionDir) {
  const htmlRoot = path.join(extensionDir, 'src/html')
  const relPaths = []

  function walk(dir) {
    if (!existsSync(dir)) {
      return
    }
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(abs)
        continue
      }
      if (entry.isFile() && entry.name.endsWith('.ejs')) {
        relPaths.push(path.relative(extensionDir, abs).replace(/\\/g, '/'))
      }
    }
  }

  walk(htmlRoot)
  return relPaths
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const extensionDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  compileExtensionHtml(extensionDir, path.join(extensionDir, 'dist'))
}
