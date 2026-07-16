import type { Config } from '@jest/types'
import fs from 'fs'
import JSON5 from 'json5'
import path from 'path'
import { pathsToModuleNameMapper } from 'ts-jest'
import type { CompilerOptions } from 'typescript'

const tsconfigFile = path.join(__dirname, './tsconfig.json')
const tsconfigContent = fs.readFileSync(tsconfigFile, 'utf-8')
const { compilerOptions } = JSON5.parse<{ compilerOptions: CompilerOptions }>(tsconfigContent)
const tsconfigPaths = compilerOptions.paths!

export default (): Config.InitialOptions => ({
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  testMatch: ['<rootDir>/__tests__/**/*.spec.ts', '<rootDir>/__tests__/**/*.spec.tsx'],
  moduleNameMapper: {
    '\\.css\\?raw$': '<rootDir>/__tests__/editor-lib/mocks/raw-css.ts',
    '^~icons/(.*)\\?raw$': '<rootDir>/__tests__/editor-lib/mocks/mdi-icon.ts',
    '^@/editor-theme$': '<rootDir>/editor-lib/src/editor-theme',
    '^@/search-extensions$': '<rootDir>/editor-lib/src/search-extensions',
    '^@/search-icons$': '<rootDir>/editor-lib/src/search-icons',
    '^@/search-panel$': '<rootDir>/editor-lib/src/search-panel',
    '^@/vscode-keymap$': '<rootDir>/editor-lib/src/vscode-keymap',
    '^@/types$': '<rootDir>/editor-lib/src/types',
    '^@/profiles$': '<rootDir>/editor-lib/src/profiles',
    '^@/host-direct$': '<rootDir>/editor-lib/src/host-direct',
    '^@/host-iframe$': '<rootDir>/editor-lib/src/host-iframe',
    '^@/api$': '<rootDir>/editor-lib/src/api',
    '^@/format-document$': '<rootDir>/editor-lib/src/format-document',
    '^@/iframe-boot$': '<rootDir>/editor-lib/src/iframe-boot',
    '^@/iframe-protocol$': '<rootDir>/editor-lib/src/iframe-protocol',
    '^@/ui/(.*)$': '<rootDir>/preset/src/ui/$1',
    '^@/helpers/(.*)$': '<rootDir>/preset/src/helpers/$1',
    // Root Next.js `services/*` must win over preset `@/services/*` (same alias prefix).
    '^@/services/(2fa|ai|auth|context|curl|extension|fetch|gist|oauth-login|runtime|scripts|tampermonkey)(/.*)?$': '<rootDir>/services/$1$2',
    '^@/services/(.*)$': '<rootDir>/preset/src/services/$1',
    ...pathsToModuleNameMapper(tsconfigPaths, {
      prefix: '<rootDir>',
    }),
    '^@ext/(.*)$': '<rootDir>/extension/src/$1',
  },
})
