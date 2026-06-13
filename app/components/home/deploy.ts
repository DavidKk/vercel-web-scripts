import { repositoryUrl } from '@/config/package'

function normalizeRepositoryUrl(url: string) {
  return url
    .replace(/^git\+/, '')
    .replace(/\.git$/, '')
    .trim()
}

const defaultRepo = 'https://github.com/DavidKk/vercel-web-scripts'

/** Anchor id for the deploy section on the homepage. */
export const HOME_DEPLOY_SECTION_ID = 'deploy'

/** Public Git repository URL for docs and deploy links. */
export function getRepositoryBrowseUrl() {
  return normalizeRepositoryUrl(repositoryUrl || defaultRepo)
}

/** Vercel one-click deploy — clones into the visitor's own Vercel account. */
export function getVercelDeployUrl() {
  return `https://vercel.com/new/clone?repository-url=${encodeURIComponent(getRepositoryBrowseUrl())}`
}

export function getEnvExampleUrl() {
  return `${getRepositoryBrowseUrl()}/blob/main/.env.example`
}

export function getReadmeDeployUrl() {
  return `${getRepositoryBrowseUrl()}#deploy-to-vercel`
}
