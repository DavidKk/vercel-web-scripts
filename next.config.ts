import type { NextConfig } from 'next'
import path from 'path'

const nextConfig: NextConfig = {
  webpack(config) {
    // Allow `import foo from './file.ts?raw'` to inline file content as string
    // This rule must be added BEFORE other loaders to ensure it takes precedence
    // Especially important for CSS files which are normally processed by CSS loader
    const rawRule = {
      resourceQuery: /raw/,
      type: 'asset/source',
    }

    // Insert at the beginning to ensure it takes precedence over CSS loader
    // Next.js uses nested rules, so we need to handle both array and nested structures
    if (Array.isArray(config.module.rules)) {
      config.module.rules.unshift(rawRule)
    }

    // Also handle nested rules (Next.js often uses oneOf)
    const rules = config.module.rules
    for (const rule of rules) {
      if (rule && typeof rule === 'object' && 'oneOf' in rule && Array.isArray(rule.oneOf)) {
        rule.oneOf.unshift(rawRule)
      }
    }

    // Add alias for templates directory
    // Webpack resolves aliases before applying query parameters
    if (!config.resolve.alias) {
      config.resolve.alias = {}
    }
    config.resolve.alias['@templates'] = path.resolve(__dirname, 'templates')

    return config
  },
}

export default nextConfig
