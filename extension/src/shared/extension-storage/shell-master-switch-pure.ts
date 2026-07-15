/** Whether preset/scripts should run on a tab given master-switch state. */
export function isShellEnabledForTabState(globalEnabled: boolean, disabledTabIds: readonly number[], tabId: number): boolean {
  if (!globalEnabled) {
    return false
  }
  return !disabledTabIds.includes(tabId)
}

/**
 * Whether the URL is a Cloudflare challenge redirect carrying `__cf_chl_rt_tk`.
 * @param url Absolute page URL
 * @returns True when MagickMonkey should apply the same disable as “This tab only”
 */
export function isCloudflareChallengeRtTkUrl(url: string): boolean {
  if (!url) {
    return false
  }
  try {
    return new URL(url).searchParams.has('__cf_chl_rt_tk')
  } catch {
    return /[?&]__cf_chl_rt_tk(?:=|&|$)/.test(url)
  }
}
