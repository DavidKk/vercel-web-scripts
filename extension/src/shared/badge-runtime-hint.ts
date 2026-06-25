/** One-shot runtime action hint shown on the next page bootstrap (reset / update). */
export const BADGE_RUNTIME_HINT_SESSION_KEY = 'vws_badge_runtime_hint'

export type BadgeRuntimeHint = 'reset' | 'update'

/**
 * Remember that the next bootstrap on any tab should briefly show reset/update done.
 * @param hint Runtime action that just completed
 */
export async function setBadgeRuntimeHint(hint: BadgeRuntimeHint): Promise<void> {
  try {
    await chrome.storage.session.set({ [BADGE_RUNTIME_HINT_SESSION_KEY]: hint })
  } catch {
    // session storage may be unavailable
  }
}

/**
 * Consume and clear the pending runtime hint, if any.
 */
export async function consumeBadgeRuntimeHint(): Promise<BadgeRuntimeHint | null> {
  try {
    const result = await chrome.storage.session.get(BADGE_RUNTIME_HINT_SESSION_KEY)
    const hint = result[BADGE_RUNTIME_HINT_SESSION_KEY]
    if (hint !== 'reset' && hint !== 'update') {
      return null
    }
    await chrome.storage.session.remove(BADGE_RUNTIME_HINT_SESSION_KEY)
    return hint
  } catch {
    return null
  }
}
