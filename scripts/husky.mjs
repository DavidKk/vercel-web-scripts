import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

import { fail, info, ok, warn } from './print.mjs'

const inPlatform = (platform) => platform === process.platform

export const husky = async (options = {}) => {
  const git = path.join(process.cwd(), '.git')
  const isGitRepo = fs.existsSync(git) && (await fs.promises.stat(git)).isDirectory()
  if (!isGitRepo) {
    warn('The project is not a Git repository, skip the Husky installation process.')
    return
  }

  const { upgrade = false, cwd = process.cwd(), compatible = true, skipCi = true } = options
  if (skipCi && process.env.CI) {
    warn('CI/CD environment, skip Husky installation process.')
    return
  }

  const huskyHooksPath = path.join(cwd, '.husky')
  if (upgrade === false && fs.existsSync(huskyHooksPath)) {
    ok('Husky is already installed, skip the Husky installation process.')
    return
  }

  // Husky v9+: create hook files directly; initialize husky (install or init)
  try {
    // Prefer husky init (v9+)
    execSync('husky init', { stdio: 'pipe', cwd })
  } catch (error) {
    try {
      execSync('husky install', { stdio: 'pipe', cwd })
    } catch (installError) {
      if (!fs.existsSync(huskyHooksPath)) {
        await fs.promises.mkdir(huskyHooksPath, { recursive: true })
      }
      // Husky helper script at _/husky.sh
      const huskyShPath = path.join(huskyHooksPath, '_', 'husky.sh')
      const huskyShDir = path.dirname(huskyShPath)
      if (!fs.existsSync(huskyShDir)) {
        await fs.promises.mkdir(huskyShDir, { recursive: true })
      }
      if (!fs.existsSync(huskyShPath)) {
        await fs.promises.writeFile(
          huskyShPath,
          `#!/usr/bin/env sh
if [ -z "$husky_skip_init" ]; then
  debug () {
    if [ "$HUSKY_DEBUG" = "1" ]; then
      echo "husky (debug) - $1"
    fi
  }

  readonly hook_name="$(basename -- "$0")"
  debug "starting $hook_name..."

  if [ "$HUSKY" = "0" ]; then
    debug "HUSKY env variable is set to 0, skipping hook"
    exit 0
  fi

  if [ -f ~/.huskyrc ]; then
    debug "sourcing ~/.huskyrc"
    . ~/.huskyrc
  fi

  readonly husky_skip_init=1
  export husky_skip_init
  sh -e "$0" "$@"
  exitcode="$?"

  if [ $exitcode != 0 ]; then
    echo "husky - $hook_name hook exited with code $exitcode (error)"
  fi

  if [ $exitcode = 127 ]; then
    echo "husky - command not found in PATH=$PATH"
  fi

  exit $exitcode
fi
`,
          { mode: 0o755 }
        )
      }
    }
  }

  // Hook body differs by platform; Git GUIs on Windows often ship a minimal PATH
  const isWindows = inPlatform('win32')

  // Ensure PATH includes system locations so pnpm is found (SourceTree, GitHub Desktop, etc.)
  const pathSetup = isWindows
    ? `# Git GUIs on Windows may provide an incomplete PATH; extend it explicitly
# Include full system PATH (GUI may only pass a minimal PATH)
export PATH="$PATH":$PATH
# Common pnpm install locations on Windows
if [ -n "$USERPROFILE" ] && [ -d "$USERPROFILE/AppData/Local/pnpm" ]; then
  export PATH="$USERPROFILE/AppData/Local/pnpm:$PATH"
fi
if [ -n "$HOME" ] && [ -d "$HOME/AppData/Local/pnpm" ]; then
  export PATH="$HOME/AppData/Local/pnpm:$PATH"
fi
# Try npm global prefix for pnpm
if command -v npm >/dev/null 2>&1; then
  npm_prefix=$(npm config get prefix 2>/dev/null)
  if [ -n "$npm_prefix" ] && [ -d "$npm_prefix" ]; then
    export PATH="$npm_prefix:$PATH"
  fi
fi`
    : `# Git GUIs may provide an incomplete PATH; extend it explicitly
# Include full system PATH (GUI may only pass a minimal PATH)
export PATH="$PATH":$PATH
# Common pnpm install locations on Unix
if [ -d "$HOME/.local/share/pnpm" ]; then
  export PATH="$HOME/.local/share/pnpm:$PATH"
fi
if [ -d "$HOME/.pnpm" ]; then
  export PATH="$HOME/.pnpm:$PATH"
fi
# Try npm global prefix for pnpm
if command -v npm >/dev/null 2>&1; then
  npm_prefix=$(npm config get prefix 2>/dev/null)
  if [ -n "$npm_prefix" ] && [ -d "$npm_prefix" ]; then
    export PATH="$npm_prefix:$PATH"
  fi
fi`

  // Husky v9+: no shebang / _/husky.sh in each hook; .husky/_/h runs this file with sh -e
  const hooks = [
    {
      name: 'pre-commit',
      content: `${pathSetup}

pnpm lint-staged
`,
    },
    {
      name: 'commit-msg',
      content: `${pathSetup}

pnpm commitlint --edit "$1"
`,
    },
  ]

  for (const hook of hooks) {
    const hookPath = path.join(huskyHooksPath, hook.name)

    if (!fs.existsSync(huskyHooksPath)) {
      await fs.promises.mkdir(huskyHooksPath, { recursive: true })
    }

    await fs.promises.writeFile(hookPath, hook.content, { mode: 0o755 })
    info(`Created ${path.relative(cwd, hookPath)}`)
  }

  try {
    if (compatible === true) {
      const hooksPath = path.join(cwd, '.git/hooks')
      if (!fs.existsSync(hooksPath)) {
        await fs.promises.mkdir(hooksPath, { recursive: true })
      }
      const files = await fs.promises.readdir(huskyHooksPath)
      if (files.length > 0) {
        info(`Compatible with some GUI tools that do not use \`git config core.hooksPath\` as the custom hook path.`)
        for (const filename of files) {
          const huskyFile = path.join(huskyHooksPath, filename)
          const file = path.join(hooksPath, filename)

          const stats = await fs.promises.lstat(huskyFile)
          if (!stats.isFile()) {
            continue
          }

          fs.existsSync(file) && (await fs.promises.unlink(file))
          await fs.promises.copyFile(huskyFile, file)
          info(`${path.relative(cwd, huskyFile)} => ${path.relative(cwd, file)}`)
        }
      }
    }
  } catch (error) {
    await fs.promises.rmdir(huskyHooksPath, { recursive: true })
    fail(error)
    return
  }

  ok(`Husky (Git hook) was installed successfully.`)
}
