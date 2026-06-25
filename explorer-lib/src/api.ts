import { createExplorerChrome } from '@/explorer-chrome'
import { listLoadingHtml, listNoDataHtml } from '@/list-states'
import { createTabBar } from '@/tab-bar'
import type { ExplorerLibApi } from '@/types'

/**
 * Build public explorer-lib API object.
 * @returns ExplorerLibApi instance
 */
export function createExplorerLibApi(): ExplorerLibApi {
  return {
    version: 1,
    ready: true,
    createChrome(parent, options) {
      return createExplorerChrome(parent, options)
    },
    createTabBar(parent, options) {
      return createTabBar(parent, options)
    },
    listLoadingHtml(message) {
      return listLoadingHtml(message)
    },
    listNoDataHtml(options) {
      return listNoDataHtml(options)
    },
  }
}
