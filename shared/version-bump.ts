/** Conventional-commit → semver bump helpers for MagickMonkey root package.json. */

export type VersionBumpLevel = 'minor' | 'patch'

/** Release commits created by the auto-bump script (skip to avoid loops). */
export const RELEASE_COMMIT_SUBJECT_RE = /^chore\(release\):\s*\d+\.\d+\.\d+\s*$/i

/**
 * Whether a commit subject is an auto-generated release bump commit.
 * @param subject Commit subject line
 * @returns True when the subject is `chore(release): x.y.z`
 */
export function isReleaseCommitSubject(subject: string): boolean {
  return RELEASE_COMMIT_SUBJECT_RE.test(subject.trim())
}

/**
 * Resolve bump level from conventional commit subjects / bodies.
 * feat / feat! / BREAKING CHANGE → minor; otherwise patch.
 * @param commits Commit messages (subject or full message)
 * @returns Bump level, or null when there are no commits to consider
 */
export function resolveBumpLevel(commits: readonly string[]): VersionBumpLevel | null {
  const meaningful = commits.map((c) => c.trim()).filter((c) => c.length > 0 && !isReleaseCommitSubject(c.split('\n', 1)[0] ?? c))
  if (meaningful.length === 0) {
    return null
  }

  for (const message of meaningful) {
    const subject = message.split('\n', 1)[0] ?? message
    if (/^feat(\(.+\))?!:/i.test(subject) || /^feat!:/i.test(subject)) {
      return 'minor'
    }
    if (/^feat(\(.+\))?:/i.test(subject)) {
      return 'minor'
    }
    if (/^BREAKING CHANGE:/im.test(message) || /\nBREAKING[- ]CHANGE:/im.test(message)) {
      return 'minor'
    }
  }

  return 'patch'
}

/**
 * Apply a minor or patch bump to a strict `x.y.z` version.
 * @param version Current semver (optional leading `v`)
 * @param level Bump level
 * @returns Next version without leading `v`
 */
export function applySemverBump(version: string, level: VersionBumpLevel): string {
  const normalized = version.trim().replace(/^v/i, '')
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(normalized)
  if (!match) {
    throw new Error(`Invalid semver version: ${version}`)
  }
  const major = Number(match[1])
  const minor = Number(match[2])
  const patch = Number(match[3])
  if (level === 'minor') {
    return `${major}.${minor + 1}.0`
  }
  return `${major}.${minor}.${patch + 1}`
}

/**
 * Keep only commits after the last `chore(release)` in the list (oldest→newest).
 * @param messages Commit messages oldest→newest
 * @returns Commits that still need a version bump
 */
export function commitsAfterLastRelease(messages: readonly string[]): string[] {
  let lastReleaseIdx = -1
  for (let i = 0; i < messages.length; i++) {
    const subject = (messages[i]?.split('\n', 1)[0] ?? '').trim()
    if (isReleaseCommitSubject(subject)) {
      lastReleaseIdx = i
    }
  }
  if (lastReleaseIdx === -1) {
    return [...messages]
  }
  return messages.slice(lastReleaseIdx + 1)
}

/**
 * Build the conventional release commit subject for a version.
 * @param version Semver string
 * @returns Commit subject
 */
export function buildReleaseCommitSubject(version: string): string {
  return `chore(release): ${version.trim().replace(/^v/i, '')}`
}
