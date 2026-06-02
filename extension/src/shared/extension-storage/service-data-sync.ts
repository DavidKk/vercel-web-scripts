import type { ExtensionConfig } from '../../types'
import { syncRulesFromServer } from './extension-rules'
import { fetchManagedScriptList } from './script-list-cache'

/**
 * Pull fresh RULE and managed script list for the active service.
 * @param config Extension connection config
 */
export async function refreshExtensionServiceData(config: ExtensionConfig): Promise<void> {
  await syncRulesFromServer(config)
  await fetchManagedScriptList(config)
}
