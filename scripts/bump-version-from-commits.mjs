#!/usr/bin/env node
/**
 * MagickMonkey root version bump entry (pre-push / pnpm version:bump).
 * Delegates to the TypeScript runner so shared/version-bump stays the single source of truth.
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runner = path.join(root, 'scripts/bump-version-from-commits-runner.ts')
const extraArgs = process.argv.slice(2)

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const result = spawnSync(
  pnpm,
  [
    'exec',
    'ts-node',
    '--transpile-only',
    '--compiler-options',
    JSON.stringify({
      module: 'commonjs',
      moduleResolution: 'node',
      esModuleInterop: true,
      target: 'ES2019',
      strict: true,
      skipLibCheck: true,
      resolveJsonModule: true,
    }),
    runner,
    ...extraArgs,
  ],
  {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
    shell: process.platform === 'win32',
  }
)

process.exit(result.status ?? 1)
