export type SandboxId = string

export type SandboxProviderName = 'daytona' | 'cloudflare' | 'docker'

export type SandboxState = 'creating' | 'ready' | 'destroyed'

export type NetworkAccess = 'isolated' | 'outbound-only' | 'full'

export type NetworkPolicy = 'allowAll' | 'registryOnly' | 'none'

export interface ExecutionResult {
  stdout: string
  stderr: string
  exitCode: number
}

export interface ExecuteOptions {
  timeoutMs?: number
  env?: Record<string, string>
}

export interface ResourceLimits {
  memoryMb?: number
  cpuCount?: number
  diskMb?: number
}

export interface SandboxCreateOptions {
  image?: string
  env?: Record<string, string>
  networkAccess?: NetworkAccess
  networkPolicy?: NetworkPolicy
  resources?: ResourceLimits
  timeoutMs?: number
}

export interface Sandbox {
  id: SandboxId
  providerName: SandboxProviderName
  createdAt: Date
  image: string
  state: SandboxState
  metadata?: Record<string, string>
}

export interface ProviderHealth {
  ok: boolean
  message?: string
  version?: string
}

export interface SandboxProvider {
  readonly name: SandboxProviderName
  create(options?: SandboxCreateOptions): Promise<Sandbox>
  destroy(id: SandboxId): Promise<void>
  execute(id: SandboxId, command: string, options?: ExecuteOptions): Promise<ExecutionResult>
  health(): Promise<ProviderHealth>
}

export interface ProviderConfig {
  name: SandboxProviderName
  priority?: number
  apiKey?: string
  endpoint?: string
  config?: Record<string, string>
}
