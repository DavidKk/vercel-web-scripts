/**
 * CLI: bump root package.json version from conventional commits in the push range.
 * Usage: pnpm version:bump [--dry-run] [--commit] [--range <git-rev-range>]
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
 * Resolve the commit range to inspect for bump level.
 * Prefer origin/<branch>..HEAD when available; else last release commit..HEAD; else HEAD~20..HEAD.
 * @param explicit Explicit `--range` value
 * @returns Git rev range
 */
function resolveCommitRange(explicit?: string): string {
  if (explicit) {
    return explicit
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

  try {
    const releaseSha = git(['log', '-1', '--grep=^chore(release):', '--pretty=%H'])
    if (releaseSha) {
      return `${releaseSha}..HEAD`
    }
  } catch {
    // ignore
  }

  try {
    git(['rev-parse', '--verify', 'HEAD~20'])
    return 'HEAD~20..HEAD'
  } catch {
    return 'HEAD'
  }
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
  execFileSync('git', ['commit', '-m', subject], {
    cwd: ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      // Avoid nested auto-bump if hooks ever call this again.
      VWS_SKIP_VERSION_BUMP: '1',
    },
  })
}

/**
 * Main entry.
 * @returns Process exit code
 */
function main(): number {
  if (process.env.VWS_SKIP_VERSION_BUMP === '1') {
    // eslint-disable-next-line no-console -- CLI status
    console.log('[version:bump] skipped (VWS_SKIP_VERSION_BUMP=1)')
    return 0
  }

  const options = parseArgs(process.argv.slice(2))
  const range = resolveCommitRange(options.range)
  const messages = listCommitMessages(range)

  if (messages.length === 0) {
    // eslint-disable-next-line no-console -- CLI status
    console.log(`[version:bump] no commits in range ${range}; skip`)
    return 0
  }

  const pending = commitsAfterLastRelease(messages).filter((m) => {
    const subject = m.split('\n', 1)[0] ?? m
    return !isReleaseCommitSubject(subject)
  })

  if (pending.length === 0) {
    // eslint-disable-next-line no-console -- CLI status
    console.log(`[version:bump] no commits after last release in ${range}; skip`)
    return 0
  }

  const level = resolveBumpLevel(pending)
  if (!level) {
    // eslint-disable-next-line no-console -- CLI status
    console.log(`[version:bump] nothing to bump for range ${range}`)
    return 0
  }

  const current = readPackageVersion()
  const next = applySemverBump(current, level)
  // eslint-disable-next-line no-console -- CLI status
  console.log(`[version:bump] range=${range} level=${level} ${current} → ${next}`)

  if (options.dryRun) {
    return 0
  }

  writePackageVersion(next)
  if (options.commit) {
    commitRelease(next)
    // eslint-disable-next-line no-console -- CLI status
    console.log(`[version:bump] committed ${buildReleaseCommitSubject(next)}`)
    // Exit 2: pre-push must abort so the caller re-pushes including the release commit.
    return 2
  }
  // eslint-disable-next-line no-console -- CLI status
  console.log('[version:bump] wrote package.json (pass --commit to create release commit)')
  return 0
}

process.exit(main())
