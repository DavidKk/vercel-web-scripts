#!/usr/bin/env node
/**
 * Zip extension/dist for manual Chrome install (Load unpacked after extract).
 * Output: public/downloads/magickmonkey-chrome-extension.zip
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createScriptLogger } from './logger.mjs'

const log = createScriptLogger('pack-extension-zip')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../..')
const distDir = path.join(repoRoot, 'extension/dist')
const manifestPath = path.join(distDir, 'manifest.json')
const outDir = path.join(repoRoot, 'public/downloads')
const outZip = path.join(outDir, 'magickmonkey-chrome-extension.zip')

if (!existsSync(manifestPath)) {
  log.error(`Missing ${manifestPath}. Run pnpm run build:extension first.`)
  process.exit(1)
}

const hasZip = spawnSync('which', ['zip'], { encoding: 'utf8' }).status === 0
if (!hasZip) {
  log.error('`zip` CLI not found. Install zip (macOS: built-in; Linux: apt install zip).')
  process.exit(1)
}

mkdirSync(outDir, { recursive: true })
rmSync(outZip, { force: true })

const result = spawnSync('zip', ['-r', '-q', outZip, '.'], { cwd: distDir, encoding: 'utf8' })
if (result.status !== 0) {
  log.error(result.stderr || 'zip command failed')
  process.exit(result.status ?? 1)
}

const sizeKb = Math.round(statSync(outZip).size / 1024)
log.info(`Wrote ${outZip} (${sizeKb} KB)`)
