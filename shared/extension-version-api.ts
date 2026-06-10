/** GET path for latest Chrome extension release metadata (semver + download URL). */
export const EXTENSION_VERSION_API_PATH = '/api/extension/version'

/** JSON body returned by {@link EXTENSION_VERSION_API_PATH}. */
export interface ExtensionVersionApiResponse {
  version: string
  downloadUrl: string
}
