import packageJson from '../package.json'

/**
 * Package name from package.json
 */
export const packageName = packageJson.name

/**
 * Repository URL from package.json
 */
export const repositoryUrl = packageJson.repository?.url || ''

/**
 * Default title derived from package name
 * Removes 'vercel' and replaces hyphens with spaces
 */
export const defaultTitle = packageName.replace('vercel', '').split('-').join(' ')
