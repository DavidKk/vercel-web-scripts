/**
 * Preset bundle entry.
 * Imports gm-templates modules in dependency order (same as getCoreScriptsSource).
 * Build: pnpm build:preset → preset/dist/preset.js
 */

// 1. helpers/http
import '@/helpers/http'
// 2. helpers/utils
import '@/helpers/utils'
// 3. services/log-store (before logger)
import '@/services/log-store'
// 4. helpers/logger
import '@/helpers/logger'
// 5. helpers/dom
import '@/helpers/dom'
// 6. services/tab-communication
import '@/services/tab-communication'
// 7. services/script-update
import '@/services/script-update'
// 8. services/cli-service
import '@/services/cli-service'
// 9. services/dev-mode (constants + editor + local)
import '@/services/dev-mode'
// 10. services/script-execution
import '@/services/script-execution'
// 11. services/preset-built-sse
import '@/services/preset-built-sse'
// 12. services/menu
import '@/services/menu'
// 15. rules
import '@/rules'
// 16. scripts
import '@/scripts'
// 17. UI modules (order: corner-widget, notification, node-selector deps then index, log-viewer, command-palette, hash-tool)
import '@/ui/corner-widget/index'
import '@/ui/notification/index'
import '@/ui/node-selector/types'
import '@/ui/node-selector/MarkerHighlightBox'
import '@/ui/node-selector/NodeSelector'
import '@/ui/node-selector/index'
import '@/ui/log-viewer/index'
import '@/ui/command-palette/index'
import '@/ui/hash-tool/index'
// 18. register globals for GIST / legacy
import '@/register'
// 19. main
import '@/main'
