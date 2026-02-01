#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * One-time migration: copy templates/gm-templates → preset/src and convert to ES modules.
 * Templates have been removed; preset is the single source. This script is kept for reference only.
 * Run from repo root: node preset/scripts/migrate-to-preset.mjs (requires templates/gm-templates to exist).
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../..')
const srcDir = path.join(repoRoot, 'templates/gm-templates')
const outDir = path.join(repoRoot, 'preset/src')

const SKIP = new Set(['entry.ts', 'editor-typings.d.ts', 'README.md'])

function stripGlobalThisBlock(content) {
  return content.replace(/\nconst g = typeof globalThis[^;]+;[^\n]*\n(?:;\s*\(g as any\)\.[^\n]+\n)+/g, '')
}

function convertLogger(content) {
  if (!content.includes('declare const logStore')) return content
  let out = content
    .replace(/\/\*\* Injected by log-store[^]*?declare const logStore:[^;]+;\s*/, "import { logStore } from '../services/log-store'\n\n")
    .replace(/const store = typeof logStore !== 'undefined' && logStore \? logStore : null/, 'const store = logStore')
  out = stripGlobalThisBlock(out)
  return out
}

function convertFile(content, relPath) {
  const base = path.basename(relPath)
  if (base === 'logger.ts') return convertLogger(content)
  return stripGlobalThisBlock(content)
}

function migrateDir(dir, rel = '') {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const e of entries) {
    const relPath = path.join(rel, e.name)
    const srcPath = path.join(dir, e.name)
    const destPath = path.join(outDir, relPath)
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === 'scripts') continue
      fs.mkdirSync(destPath, { recursive: true })
      migrateDir(srcPath, relPath)
    } else if (e.isFile() && (e.name.endsWith('.ts') || e.name.endsWith('.css') || e.name.endsWith('.html'))) {
      if (SKIP.has(e.name)) continue
      let content = fs.readFileSync(srcPath, 'utf8')
      if (e.name.endsWith('.ts')) {
        content = convertFile(content, relPath)
      }
      fs.mkdirSync(path.dirname(destPath), { recursive: true })
      fs.writeFileSync(destPath, content)
      console.log('Written:', relPath)
    }
  }
}

fs.mkdirSync(outDir, { recursive: true })
migrateDir(srcDir)
console.log('Done. Preset src already has typings.d.ts, utils.ts, log-store.ts, logger.ts, entry.ts – merge or overwrite as needed.')
