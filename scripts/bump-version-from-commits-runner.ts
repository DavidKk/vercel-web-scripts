/**
 * CLI: bump root package.json version from conventional commits.
 * Usage: pnpm version:bump [--dry-run] [--commit] [--from-last-release] [--range <git-rev-range>]
 */

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { applySemverBump, buildReleaseCommitSubject, commitsAfterLastRelease, isReleaseCommitSubject, resolveBumpLevel } from '../shared/version-bump'

const ROOT = path.resolve(__dirname, '..')
const PACKAGE_JSON_PATH = path.join(ROOT, 'package.json')

interface CliOptions {
  dryRun: boolean
  commit: boolean
  fromLastRelease: boolean
  range?: string
}

/**
 * Parse CLI flags.
 * @param argv Process argv (without node/script)
 * @returns Parsed options
 */
function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    dryRun: false,
    commit: false,
    fromLastRelease: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--dry-run') {
      options.dryRun = true
      continue
    }
    if (arg === '--commit') {
      options.commit = true
      continue
    }
    if (arg === '--from-last-release') {
      options.fromLastRelease = true
      continue
    }
    if (arg === '--range') {
      options.range = argv[i + 1]
      i += 1
      continue
    }
    if (arg.startsWith('--range=')) {
      options.range = arg.slice('--range='.length)
    }
  }
  return options
}

/**
 * Run a git command and return stdout trim.
 * @param args Git argv after `git`
 * @returns Stdout
 */
function git(args: string[]): string {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim()
}

/**
 * Resolve range from the last `chore(release)` commit or `vX.Y.Z` tag to HEAD.
 * Used by CI `workflow_dispatch` (must not use `origin/main..HEAD`, which is often empty).
 * @returns Git rev range
 */
function resolveRangeFromLastRelease(): string {
  try {
    const releaseSha = git(['log', '-1', '--grep=^chore(release):', '--pretty=%H'])
    if (releaseSha) {
      return `${releaseSha}..HEAD`
    }
  } catch {
    // ignore
  }

  try {
    const tags = git(['tag', '-l', 'v*.*.*', '--sort=-v:refname'])
    const latest = tags
      .split('\n')
      .map((t) => t.trim())
      .find((t) => /^v\d+\.\d+\.\d+$/.test(t))
    if (latest) {
      return `${latest}..HEAD`
    }
  } catch {
    // ignore
  }

  try {
    const root = git(['rev-list', '--max-parents=0', 'HEAD']).split('\n')[0]?.trim()
    if (root) {
      return `${root}..HEAD`
    }
  } catch {
    // ignore
  }

  return 'HEAD'
}

/**
 * Resolve the commit range to inspect for bump level.
 * Prefer explicit `--range`, then `--from-last-release`, else local push-oriented defaults.
 * @param options Parsed CLI options
 * @returns Git rev range
 */
function resolveCommitRange(options: CliOptions): string {
  if (options.range) {
    return options.range
  }
  if (options.fromLastRelease) {
    return resolveRangeFromLastRelease()
  }

  try {
    const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'])
    if (branch && branch !== 'HEAD') {
      const remoteRef = `origin/${branch}`
      try {
        git(['rev-parse', '--verify', remoteRef])
        return `${remoteRef}..HEAD`
      } catch {
        // no remote tracking ref
      }
    }
  } catch {
    // ignore
  }

  return resolveRangeFromLastRelease()
}

/**
 * List commit subjects (and bodies) in a range.
 * @param range Git rev range
 * @returns Commit messages oldest→newest
 */
function listCommitMessages(range: string): string[] {
  try {
    if (range === 'HEAD') {
      const message = git(['log', '-1', '--pretty=%B'])
      return message ? [message] : []
    }
    const raw = git(['log', range, '--pretty=%B%x1e'])
    if (!raw) {
      return []
    }
    return raw
      .split('\x1e')
      .map((m) => m.trim())
      .filter(Boolean)
      .reverse()
  } catch {
    return []
  }
}

/**
 * Read root package.json version.
 * @returns Current version string
 */
function readPackageVersion(): string {
  const pkg = JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf8')) as { version?: string }
  const version = pkg.version?.trim()
  if (!version) {
    throw new Error('package.json is missing version')
  }
  return version
}

/**
 * Write root package.json version.
 * @param nextVersion Next semver
 */
function writePackageVersion(nextVersion: string): void {
  const raw = readFileSync(PACKAGE_JSON_PATH, 'utf8')
  const pkg = JSON.parse(raw) as Record<string, unknown>
  pkg.version = nextVersion
  writeFileSync(PACKAGE_JSON_PATH, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8')
}

/**
 * Create a release commit for package.json only.
 * @param version New version
 */
function commitRelease(version: string): void {
  const subject = buildReleaseCommitSubject(version)
  execFileSync('git', ['add', 'package.json'], { cwd: ROOT, stdio: 'inherit' })
  execFileSync('git', ['commit', '-m', subject, '-m', '[skip vercel]'], {
    cwd: ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      VWS_SKIP_VERSION_BUMP: '1',
      HUSKY: '0',
    },
  })
}

/**
 * Print a stable RESULT line for CI parsers.
 * @param bumped Whether package.json was (or would be) bumped
 * @param version Version after bump, or current when skipped
 */
function printResult(bumped: boolean, version: string): void {
  // eslint-disable-next-line no-console -- CLI machine-readable status
  console.log(`[version:bump] RESULT bumped=${bumped ? 1 : 0} version=${version}`)
}

/**
 * Main entry.
 * @returns Process exit code
 */
function main(): number {
  if (process.env.VWS_SKIP_VERSION_BUMP === '1') {
    // eslint-disable-next-line no-console -- CLI status
    console.log('[version:bump] skipped (VWS_SKIP_VERSION_BUMP=1)')
    printResult(false, readPackageVersion())
    return 0
  }

  const options = parseArgs(process.argv.slice(2))
  const range = resolveCommitRange(options)
  const messages = listCommitMessages(range)
  const current = readPackageVersion()

  if (messages.length === 0) {
    // eslint-disable-next-line no-console -- CLI status
    console.log(`[version:bump] no commits in range ${range}; skip`)
    printResult(false, current)
    return 0
  }

  const pending = commitsAfterLastRelease(messages).filter((m) => {
    const subject = m.split('\n', 1)[0] ?? m
    return !isReleaseCommitSubject(subject)
  })

  if (pending.length === 0) {
    // eslint-disable-next-line no-console -- CLI status
    console.log(`[version:bump] no commits after last release in ${range}; skip`)
    printResult(false, current)
    return 0
  }

  const level = resolveBumpLevel(pending)
  if (!level) {
    // eslint-disable-next-line no-console -- CLI status
    console.log(`[version:bump] nothing to bump for range ${range}`)
    printResult(false, current)
    return 0
  }

  const next = applySemverBump(current, level)
  // eslint-disable-next-line no-console -- CLI status
  console.log(`[version:bump] range=${range} level=${level} ${current} → ${next}`)

  if (options.dryRun) {
    printResult(true, next)
    return 0
  }

  writePackageVersion(next)
  if (options.commit) {
    commitRelease(next)
    // eslint-disable-next-line no-console -- CLI status
    console.log(`[version:bump] committed ${buildReleaseCommitSubject(next)}`)
  } else {
    // eslint-disable-next-line no-console -- CLI status
    console.log('[version:bump] wrote package.json (pass --commit to create release commit)')
  }
  printResult(true, next)
  return 0
}

process.exit(main())
