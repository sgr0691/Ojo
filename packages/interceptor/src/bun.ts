import type { PackageSpec } from '@ojo/shared'
import { parsePackageSpec } from './npm'

export interface ParsedBunCommand {
  type: 'install' | 'other'
  packages: PackageSpec[]
  flags: string[]
}

export function parseBunArgs(args: string[]): ParsedBunCommand {
  let inInstall = false
  let seenSubcommand = false
  const packages: PackageSpec[] = []
  const flags: string[] = []

  for (const arg of args) {
    if (!inInstall) {
      if (!arg.startsWith('-')) {
        if (arg === 'add' || arg === 'install' || arg === 'i') {
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
