import { createGMELogger } from '@/helpers/logger'
import { ensureRuntimeCore } from '@/services/runtime-core'
import { GME_openCommandPalette, GME_registerCommandPaletteCommand } from '@/ui/command-palette/index'
import { GME_openLogViewer } from '@/ui/log-viewer/index'
import {
  GME_areMarksHidden,
  GME_cleanupInvalidMarks,
  GME_clearAllMarks,
  GME_clearMarksByCaller,
  GME_clearSelection,
  GME_disableNodeSelector,
  GME_enableNodeSelector,
  GME_getMarkedNodes,
  GME_getSelectedNode,
  GME_hideMarks,
  GME_markNode,
  GME_showMarks,
  GME_unmarkNode,
} from '@/ui/node-selector/index'
import { GME_registerNodeToolbar, GME_registerNodeToolbarQuery, GME_unregisterNodeToolbar } from '@/ui/node-toolbar/index'

const { GME_debug } = createGMELogger('ModuleLoad:preset-ui')

/**
 * Register Preset UI module API into runtime core.
 * @returns Nothing
 */
export function registerPresetUiModule(): void {
  const globalDecl = (() => {
    try {
      return typeof __GLOBAL__ !== 'undefined' ? 'defined' : 'undefined'
    } catch {
      return 'error'
    }
  })()
  const core = ensureRuntimeCore()
  GME_debug(
    `[ModuleLoad][preset-ui] debug:register:start globalDecl=${globalDecl} core=${core && typeof core.register === 'function' ? 'ok' : 'missing'} preset-ui=${typeof core?.get === 'function' && core.get('preset-ui') ? 'already' : 'no'}`
  )
  if (!core || typeof core.register !== 'function') {
    GME_debug('[ModuleLoad][preset-ui] debug:register:skip core.register unavailable')
    return
  }

  core.register(
    'preset-ui',
    {
      version: 1,
      ready: true,
      openLogViewer: GME_openLogViewer,
      openCommandPalette: GME_openCommandPalette,
      registerCommandPaletteCommand: GME_registerCommandPaletteCommand,
      registerNodeToolbar: GME_registerNodeToolbar,
      registerNodeToolbarQuery: GME_registerNodeToolbarQuery,
      unregisterNodeToolbar: GME_unregisterNodeToolbar,
      enableNodeSelector: GME_enableNodeSelector,
      disableNodeSelector: GME_disableNodeSelector,
      getSelectedNode: GME_getSelectedNode,
      clearSelection: GME_clearSelection,
      markNode: GME_markNode,
      unmarkNode: GME_unmarkNode,
      clearAllMarks: GME_clearAllMarks,
      clearMarksByCaller: GME_clearMarksByCaller,
      getMarkedNodes: GME_getMarkedNodes,
      cleanupInvalidMarks: GME_cleanupInvalidMarks,
      hideMarks: GME_hideMarks,
      showMarks: GME_showMarks,
      areMarksHidden: GME_areMarksHidden,
    },
    { minApiVersion: 1 }
  )

  GME_debug('[ModuleLoad][preset-ui] debug:register:success')

  if (typeof core.emit === 'function') {
    core.emit('module:ui:loaded', { module: 'preset-ui' })
  }
}
