#!/usr/bin/env node
/**
 * Regenerate extension/icons/* from public/ assets (macOS sips resize when available).
 * Run from repo root: node extension/scripts/build-icons.mjs
 */

import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createScriptLogger } from './logger.mjs'

const log = createScriptLogger('build-icons')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../..')
const iconsDir = path.join(repoRoot, 'extension/icons')
const publicDir = path.join(repoRoot, 'public')

const sources = [
  { from: 'logo.png', to: 'icon16.png', size: 16 },
  { from: 'logo.png', to: 'icon32.png', size: 32 },
  { from: 'favicon-96x96.png', to: 'icon48.png', size: 48 },
  { from: 'web-app-manifest-512x512.png', to: 'icon128.png', size: 128 },
]

mkdirSync(iconsDir, { recursive: true })

const hasSips = spawnSync('which', ['sips'], { encoding: 'utf8' }).status === 0

for (const { from, to, size } of sources) {
  const src = path.join(publicDir, from)
  const dest = path.join(iconsDir, to)
  if (!existsSync(src)) {
    log.error(`Missing ${src}`)
    process.exit(1)
  }
  cpSync(src, dest)
  if (hasSips) {
    const r = spawnSync('sips', ['-z', String(size), String(size), dest], { encoding: 'utf8' })
    if (r.status !== 0) {
      log.error(`sips failed for ${to}:`, r.stderr)
      process.exit(1)
    }
  }
  log.info(`${to} (${size}px)${hasSips ? '' : ' — copy only, install sips to resize'}`)
}
