#!/usr/bin/env node
/**
 * Verifies extension `vite build --watch` reflects static file create/update/delete
 * in dist. This catches both "watch did not fire" and "watch fired but stale output
 * stayed in dist" regressions.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createScriptLogger } from './logger.mjs'

const log = createScriptLogger('verify-static-watch')
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = path.resolve(root, '..')

const htmlSrc = path.join(root, 'src/html/pages/admin.ejs')
const partialSrc = path.join(root, 'src/html/partials/admin-header.ejs')
const htmlDist = path.join(root, 'dist/admin.html')
const stampSrc = path.join(root, 'src/dev-build-stamp.ts')
const testAssetRel = '__watch-static-test.txt'
const testAssetSrc = path.join(root, 'icons', testAssetRel)
const testAssetDist = path.join(root, 'dist/icons', testAssetRel)

let buildCount = 0
const waiters = new Set()

function notifyBuildComplete() {
  buildCount += 1
  for (const waiter of [...waiters]) {
    waiter()
  }
}

function waitForBuildCount(target, timeoutMs = 120_000) {
  if (buildCount >= target) {
    return Promise.resolve()
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      waiters.delete(check)
      reject(new Error(`Timeout waiting for build #${target}; current build count is ${buildCount}`))
    }, timeoutMs)

    function check() {
      if (buildCount < target) {
        return
      }
      clearTimeout(timer)
      waiters.delete(check)
      resolve()
    }

    waiters.add(check)
  })
}

function waitForLog(child, pattern, timeoutMs = 120_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${pattern}`)), timeoutMs)
    const onData = (chunk) => {
      const text = chunk.toString()
      process.stdout.write(text)
      if (pattern.test(text)) {
        clearTimeout(timer)
        child.stdout?.off('data', onData)
        child.stderr?.off('data', onData)
        resolve()
      }
    }
    child.stdout?.on('data', onData)
    child.stderr?.on('data', onData)
  })
}

async function waitForBuildAfter(action, label) {
  const target = buildCount + 1
  action()
  await waitForBuildCount(target, 90_000)
  log.info(`observed build after ${label}`)
}

function assertFileContains(file, marker) {
  if (!existsSync(file)) {
    throw new Error(`${file} does not exist`)
  }
  const content = readFileSync(file, 'utf-8')
  if (!content.includes(marker)) {
    throw new Error(`${file} does not contain ${marker}`)
  }
}

function assertFileMissing(file) {
  if (existsSync(file)) {
    throw new Error(`${file} still exists after source deletion`)
  }
}

function restoreFile(file, original) {
  if (original == null) {
    rmSync(file, { force: true })
    return
  }
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, original, 'utf-8')
}

const child = spawn('pnpm', ['exec', 'vite', 'build', '--config', 'extension/vite.config.ts', '--watch'], {
  cwd: repoRoot,
  stdio: ['ignore', 'pipe', 'pipe'],
  shell: false,
  env: {
    ...process.env,
    EXTENSION_DEV_RELOAD_PORT: process.env.EXTENSION_DEV_RELOAD_PORT ?? '5184',
  },
})

child.stdout?.on('data', (chunk) => {
  const text = chunk.toString()
  process.stdout.write(text)
  if (text.includes('[extension] compiled HTML, manifest, icons')) {
    notifyBuildComplete()
  }
})
child.stderr?.on('data', (chunk) => {
  const text = chunk.toString()
  process.stderr.write(text)
  if (text.includes('[extension] compiled HTML, manifest, icons')) {
    notifyBuildComplete()
  }
})

let exitCode = 1
const originalHtml = existsSync(htmlSrc) ? readFileSync(htmlSrc, 'utf-8') : undefined
const originalPartial = existsSync(partialSrc) ? readFileSync(partialSrc, 'utf-8') : undefined
const originalStamp = existsSync(stampSrc) ? readFileSync(stampSrc, 'utf-8') : undefined
const originalAsset = existsSync(testAssetSrc) ? readFileSync(testAssetSrc, 'utf-8') : undefined

try {
  await waitForLog(child, /addWatchFile/)
  await waitForBuildCount(1)

  const htmlMarker = `watch-html-update-${Date.now()}`
  await waitForBuildAfter(() => {
    if (originalHtml == null) {
      throw new Error(`${htmlSrc} is missing before test`)
    }
    writeFileSync(
      htmlSrc,
      originalHtml.replace(
        '<mm-scripts-app class="mm-admin-view-host" data-loading>',
        `<mm-scripts-app class="mm-admin-view-host" data-loading>\n          <!-- ${htmlMarker} -->`
      ),
      'utf-8'
    )
  }, 'HTML update')
  assertFileContains(htmlDist, htmlMarker)

  const partialMarker = `watch-partial-${Date.now()}`
  await waitForBuildAfter(() => {
    if (originalPartial == null) {
      throw new Error(`${partialSrc} is missing before test`)
    }
    writeFileSync(partialSrc, originalPartial.replace('MagickMonkey', `MagickMonkey ${partialMarker}`), 'utf-8')
  }, 'EJS partial update')
  assertFileContains(htmlDist, partialMarker)

  await waitForBuildAfter(() => {
    rmSync(htmlSrc, { force: true })
  }, 'HTML delete')
  assertFileMissing(htmlDist)

  await waitForBuildAfter(() => {
    restoreFile(htmlSrc, originalHtml)
  }, 'HTML restore')
  assertFileContains(htmlDist, '<!doctype html>')

  const createdAsset = `watch-asset-create-${Date.now()}`
  await waitForBuildAfter(() => {
    mkdirSync(path.dirname(testAssetSrc), { recursive: true })
    writeFileSync(testAssetSrc, createdAsset, 'utf-8')
  }, 'asset create')
  assertFileContains(testAssetDist, createdAsset)

  const updatedAsset = `watch-asset-update-${Date.now()}`
  await waitForBuildAfter(() => {
    writeFileSync(testAssetSrc, updatedAsset, 'utf-8')
  }, 'asset update')
  assertFileContains(testAssetDist, updatedAsset)

  await waitForBuildAfter(() => {
    rmSync(testAssetSrc, { force: true })
  }, 'asset delete')
  assertFileMissing(testAssetDist)

  log.info('OK — create/update/delete changes all triggered builds and updated dist output')
  exitCode = 0
} catch (e) {
  log.error('FAIL:', e instanceof Error ? e.message : e)
} finally {
  restoreFile(htmlSrc, originalHtml)
  restoreFile(partialSrc, originalPartial)
  restoreFile(stampSrc, originalStamp)
  restoreFile(testAssetSrc, originalAsset)
  child.kill('SIGTERM')
  process.exit(exitCode)
}
