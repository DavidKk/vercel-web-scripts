/**
 * CLI Service Module
 * Provides a unified command registration system for CLI commands
 * Similar to commander.js, allows modules to register their CLI commands
 */

/**
 * Get unsafeWindow for Tampermonkey userscript
 * unsafeWindow allows access to the page's window object
 * Falls back to window if unsafeWindow is not available
 */
const getUnsafeWindow = (): Window => {
  // @ts-ignore
  return typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
}

/**
 * Command definition interface
 */
interface CommandDefinition {
  /** Command name */
  name: string
  /** Command description */
  description: string
  /** Command function */
  handler: (...args: any[]) => any
  /** Optional usage example */
  usage?: string
  /** Optional category/group */
  category?: string
}

/**
 * Module definition interface
 */
interface ModuleDefinition {
  /** Module name */
  name: string
  /** Module description */
  description: string
  /** Commands in this module */
  commands: CommandDefinition[]
}

/**
 * CLI Service Class
 * Manages command registration and provides help functionality
 */
class CLIService {
  /** Registered modules */
  private modules: Map<string, ModuleDefinition> = new Map()

  /**
   * Register a module with its commands
   * @param module Module definition
   */
  registerModule(module: ModuleDefinition): void {
    this.modules.set(module.name, module)

    // Create namespace on window object
    const win = getUnsafeWindow()
    // @ts-ignore
    if (!win.vws) {
      // @ts-ignore
      win.vws = {}
    }

    // Create module namespace
    // @ts-ignore
    if (!win.vws[module.name]) {
      // @ts-ignore
      win.vws[module.name] = {}
    }

    // Create test namespace for module (for backward compatibility, can be renamed to 'cli' later)
    // @ts-ignore
    if (!win.vws[module.name].test) {
      // @ts-ignore
      win.vws[module.name].test = {}
    }

    // Register each command
    module.commands.forEach((command) => {
      // @ts-ignore
      win.vws[module.name].test[command.name] = command.handler
    })

    // Register help function for module
    // @ts-ignore
    win.vws[module.name].help = this.createHelpFunction(module.name)
  }

  /**
   * Create help function for a module
   * @param moduleName Module name
   * @returns Help function that outputs to console
   */
  private createHelpFunction(moduleName: string): () => void {
    return (): void => {
      const module = this.modules.get(moduleName)
      if (!module) {
        // eslint-disable-next-line no-console
        console.log(`%cModule "${moduleName}" not found.`, 'color: #ef4444')
        return
      }

      if (module.commands.length === 0) {
        // eslint-disable-next-line no-console
        console.log(`%c${module.name}%c - ${module.description}\n\n%cNo commands registered.`, 'color: #3b82f6; font-weight: bold', 'color: #6b7280', 'color: #6b7280')
        return
      }

      // Group commands by category if available
      const categorized = new Map<string, CommandDefinition[]>()
      const uncategorized: CommandDefinition[] = []

      module.commands.forEach((cmd) => {
        if (cmd.category) {
          if (!categorized.has(cmd.category)) {
            categorized.set(cmd.category, [])
          }
          categorized.get(cmd.category)!.push(cmd)
        } else {
          uncategorized.push(cmd)
        }
      })

      // Build help text with colors
      let helpText = `%c${module.name}%c - ${module.description}\n\n`
      const styles: string[] = ['color: #3b82f6; font-weight: bold', 'color: #6b7280']

      // Display categorized commands
      categorized.forEach((cmds, category) => {
        helpText += `%c${category}:\n`
        styles.push('color: #10b981; font-weight: bold')

        cmds.forEach((cmd) => {
          helpText += `  %c${cmd.name.padEnd(25)}%c${cmd.description}\n`
          styles.push('color: #8b5cf6; font-weight: 500', 'color: #374151')
          if (cmd.usage) {
            helpText += `    %c${cmd.usage}\n`
            styles.push('color: #6b7280; font-style: italic')
          }
        })
        helpText += '\n'
      })

      // Display uncategorized commands
      if (uncategorized.length > 0) {
        if (categorized.size > 0) {
          helpText += `%cGeneral:\n`
          styles.push('color: #10b981; font-weight: bold')
        }
        uncategorized.forEach((cmd) => {
          helpText += `  %c${cmd.name.padEnd(25)}%c${cmd.description}\n`
          styles.push('color: #8b5cf6; font-weight: 500', 'color: #374151')
          if (cmd.usage) {
            helpText += `    %c${cmd.usage}\n`
            styles.push('color: #6b7280; font-style: italic')
          }
        })
        helpText += '\n'
      }

      // Output with colors
      // eslint-disable-next-line no-console
      console.log(helpText, ...styles)
    }
  }

  /**
   * Get global help (all modules)
   * Outputs help to console
   */
  getGlobalHelp(): void {
    if (this.modules.size === 0) {
      // eslint-disable-next-line no-console
      console.log(`%cVercel Web Scripts%c - CLI Service\n\n%cNo modules registered.`, 'color: #3b82f6; font-weight: bold; font-size: 16px', 'color: #6b7280', 'color: #6b7280')
      return
    }

    let helpText = `%cVercel Web Scripts%c - CLI Service\n\n%cAvailable Modules:\n\n`
    const styles: string[] = ['color: #3b82f6; font-weight: bold; font-size: 16px', 'color: #6b7280', 'color: #10b981; font-weight: bold']

    this.modules.forEach((module) => {
      helpText += `  %c${module.name.padEnd(20)}%c${module.description}\n`
      helpText += `    %c${module.commands.length} command${module.commands.length !== 1 ? 's' : ''}\n`
      helpText += `    %cvws.${module.name}.help()\n\n`
      styles.push('color: #8b5cf6; font-weight: 500', 'color: #374151', 'color: #6b7280', 'color: #6b7280; font-style: italic')
    })

    // Output with colors
    // eslint-disable-next-line no-console
    console.log(helpText, ...styles)
  }

  /**
   * Initialize global help function
   */
  initializeGlobalHelp(): void {
    const win = getUnsafeWindow()
    // @ts-ignore
    if (!win.vws) {
      // @ts-ignore
      win.vws = {}
    }

    // Create global help function
    // @ts-ignore
    win.vws.help = (): void => {
      this.getGlobalHelp()
    }
  }
}

// Create singleton instance (use closure to keep it private)
const cliService = (() => {
  const service = new CLIService()
  // Initialize global help
  service.initializeGlobalHelp()
  return service
})()

/**
 * Register a module with CLI commands
 * @param module Module definition
 */
function registerCLIModule(module: ModuleDefinition): void {
  cliService.registerModule(module)
}

/**
 * Get CLI service instance (for advanced usage)
 * @returns CLI service instance
 */
function getCLIService(): CLIService {
  return cliService
}

// Make registerCLIModule available globally for modules to use
// Since files are merged at compile time, we need to expose it on window
const win = getUnsafeWindow()
// @ts-ignore
win.registerCLIModule = registerCLIModule
// @ts-ignore
win.getCLIService = getCLIService
