/** Dynamic DNR rule id for on-demand CSP header stripping (not manifest static rules). */
export const CSP_STRIP_DNR_RULE_ID = 900_001

const CSP_STRIP_HOSTS_SESSION_KEY = 'vws_csp_dnr_hosts'

function normalizeHostname(raw: string): string | null {
  try {
    const host = new URL(raw).hostname.toLowerCase()
    return host || null
  } catch {
    return null
  }
}

async function readStripHosts(): Promise<string[]> {
  const stored = await chrome.storage.session.get(CSP_STRIP_HOSTS_SESSION_KEY)
  const raw = stored[CSP_STRIP_HOSTS_SESSION_KEY]
  if (!Array.isArray(raw)) {
    return []
  }
  return [...new Set(raw.filter((item): item is string => typeof item === 'string' && item.length > 0))]
}

async function writeStripHosts(hosts: string[]): Promise<void> {
  if (hosts.length === 0) {
    await chrome.storage.session.remove(CSP_STRIP_HOSTS_SESSION_KEY)
    return
  }
  await chrome.storage.session.set({ [CSP_STRIP_HOSTS_SESSION_KEY]: hosts })
}

async function syncStripRule(hosts: string[]): Promise<void> {
  if (hosts.length === 0) {
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [CSP_STRIP_DNR_RULE_ID] })
    return
  }
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [CSP_STRIP_DNR_RULE_ID],
    addRules: [
      {
        id: CSP_STRIP_DNR_RULE_ID,
        priority: 1,
        action: {
          type: 'modifyHeaders',
          responseHeaders: [
            { header: 'content-security-policy', operation: 'remove' },
            { header: 'content-security-policy-report-only', operation: 'remove' },
          ],
        },
        condition: {
          resourceTypes: ['main_frame', 'sub_frame'],
          requestDomains: hosts,
        },
      } as chrome.declarativeNetRequest.Rule,
    ],
  })
}

/**
 * Enable CSP stripping for a single host before a one-shot tab reload.
 * @param pageUrl Tab URL used to derive hostname
 */
export async function enableCspStripForPageUrl(pageUrl: string): Promise<void> {
  const host = normalizeHostname(pageUrl)
  if (!host) {
    return
  }
  const hosts = await readStripHosts()
  if (hosts.includes(host)) {
    return
  }
  hosts.push(host)
  await writeStripHosts(hosts)
  await syncStripRule(hosts)
}

/**
 * Remove a host from the dynamic CSP strip rule after preset succeeds or gives up.
 * @param pageUrl Tab URL used to derive hostname
 */
export async function disableCspStripForPageUrl(pageUrl: string): Promise<void> {
  const host = normalizeHostname(pageUrl)
  if (!host) {
    return
  }
  const hosts = (await readStripHosts()).filter((item) => item !== host)
  await writeStripHosts(hosts)
  await syncStripRule(hosts)
}
