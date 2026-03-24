/**
 * Preset UI bundle entry.
 * Contains optional UI/debug modules that are lazy-loaded by Preset Core.
 */

import '@/services/cli-service'
import '@/ui/node-toolbar/index'
import '@/ui/node-selector/types'
import '@/ui/node-selector/MarkerHighlightBox'
import '@/ui/node-selector/NodeSelector'
import '@/ui/node-selector/index'
import '@/ui/log-viewer/index'
import '@/ui/command-palette/index'

import { registerPresetUiModule } from '@/services/preset-ui-register'

registerPresetUiModule()
