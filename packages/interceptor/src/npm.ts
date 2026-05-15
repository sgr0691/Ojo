import type { PackageSpec } from '@ojo/shared'

export interface ParsedNpmCommand {
  type: 'install' | 'other'
  packages: PackageSpec[]
  flags: string[]
}

export function parseNpmArgs(args: string[]): ParsedNpmCommand {
  let inInstall = false
  let seenSubcommand = false
  const packages: PackageSpec[] = []
  const flags: string[] = []

  for (const arg of args) {
    if (!inInstall) {
      if (!arg.startsWith('-')) {
        if (arg === 'install' || arg === 'i' || arg === 'add') {
          if (!seenSubcommand) {
            inInstall = true
          }
        } else {
          seenSubcommand = true
        }
      }
      continue
    }

    if (arg.startsWith('-')) {
      flags.push(arg)
    } else {
      packages.push(parsePackageSpec(arg))
    }
  }

  return {
    type: inInstall ? 'install' : 'other',
    packages,
    flags,
  }
}

export function parsePackageSpec(raw: string): PackageSpec {
  if (raw.startsWith('@')) {
    const slashIndex = raw.indexOf('/')
    if (slashIndex === -1) {
      return { name: raw, raw }
    }
    const afterScope = raw.slice(slashIndex + 1)
    const atIndex = afterScope.lastIndexOf('@')
    if (atIndex > 0) {
      return {
        name: raw.slice(0, slashIndex + 1 + atIndex),
        version: afterScope.slice(atIndex + 1),
        raw,
      }
    }
    return { name: raw, raw }
  }

  const atIndex = raw.lastIndexOf('@')
  if (atIndex > 0) {
    const name = raw.slice(0, atIndex)
    if (!name.includes('/') && name !== '.') {
      return {
        name,
        version: raw.slice(atIndex + 1),
        raw,
      }
    }
  }

  return { name: raw, raw }
}
