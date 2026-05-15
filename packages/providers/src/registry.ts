import type { SandboxProvider, ProviderConfig } from './types'
import { DockerProvider } from './providers/docker'
import { DaytonaProvider } from './providers/daytona'
import { CloudflareSandboxProvider } from './providers/cloudflare'

export function createProvider(config: ProviderConfig): SandboxProvider {
  switch (config.name) {
    case 'docker':
      return new DockerProvider(config)
    case 'daytona':
      return new DaytonaProvider(config)
    case 'cloudflare':
      return new CloudflareSandboxProvider(config)
    default:
      throw new Error(`Unknown provider: "${config.name}"`)
  }
}
