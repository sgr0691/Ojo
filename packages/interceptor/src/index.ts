export { parseNpmArgs, parsePackageSpec } from './npm'
export type { ParsedNpmCommand } from './npm'

export { parsePnpmArgs } from './pnpm'
export type { ParsedPnpmCommand } from './pnpm'

export { parseBunArgs } from './bun'
export type { ParsedBunCommand } from './bun'

export type PackageManager = 'npm' | 'pnpm' | 'bun'

export interface InterceptorConfig {
  packageManager: PackageManager
}
