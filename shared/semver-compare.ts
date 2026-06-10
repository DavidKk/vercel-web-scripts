/**
 * Parse semver-like strings into numeric segments for comparison.
 * @param version Version string (optional leading "v")
 * @returns Numeric segments (non-numeric suffix ignored per segment)
 */
function parseSemverSegments(version: string): number[] {
  return version
    .trim()
    .replace(/^v/i, '')
    .split('.')
    .map((segment) => {
      const n = parseInt(segment.replace(/[^0-9].*$/, ''), 10)
      return Number.isFinite(n) ? n : 0
    })
}

/**
 * Compare two semver-like version strings.
 * @param a First version
 * @param b Second version
 * @returns Positive when a > b, negative when a < b, zero when equal
 */
export function compareSemver(a: string, b: string): number {
  const pa = parseSemverSegments(a)
  const pb = parseSemverSegments(b)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) {
      return diff > 0 ? 1 : -1
    }
  }
  return 0
}

/**
 * Whether `latest` is strictly newer than `current`.
 * @param latest Remote or published version
 * @param current Installed version
 * @returns True when latest > current
 */
export function isSemverNewer(latest: string, current: string): boolean {
  return compareSemver(latest, current) > 0
}
