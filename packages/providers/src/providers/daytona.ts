import type {
  SandboxId,
  SandboxProvider,
  Sandbox,
  SandboxCreateOptions,
  ExecuteOptions,
  ExecutionResult,
  ProviderConfig,
  ProviderHealth,
  SandboxProviderName,
} from '../types'

interface DaytonaSandboxDto {
  id: string
  name?: string
  state?: string
  image?: string
  cpu?: number
  memory?: number
  disk?: number
  toolboxProxyUrl?: string
  target?: string
  created?: string
}

interface ExecuteResponseDto {
  exitCode: number
  result: string
}

const DEFAULT_API_URL = 'https://app.daytona.io/api'
const POLL_INTERVAL_MS = 1000
const MAX_POLL_TIME_MS = 120_000
const DEFAULT_TARGET = 'us'

/** @deprecated Experimental — not tested against real Daytona API. Will be removed or replaced. */
export class DaytonaProvider implements SandboxProvider {
  readonly name: SandboxProviderName = 'daytona'
  private sandboxes = new Map<SandboxId, { toolboxUrl: string; name: string }>()
  private apiKey: string
  private apiUrl: string
  private target: string

  constructor(config: ProviderConfig) {
    if (!config.apiKey) {
      throw new Error('DaytonaProvider requires an API key (config.apiKey)')
    }
    this.apiKey = config.apiKey
    this.apiUrl = config.endpoint ?? config.config?.apiUrl ?? DEFAULT_API_URL
    this.target = config.config?.target ?? DEFAULT_TARGET
  }

  async health(): Promise<ProviderHealth> {
    try {
      const data = await this.request<DaytonaSandboxDto[]>(
        'GET',
        '/sandboxes?limit=1',
      )
      return {
        ok: true,
        message: `Daytona API available, target: ${this.target}`,
      }
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : 'Daytona API unreachable',
      }
    }
  }

  async create(options?: SandboxCreateOptions): Promise<Sandbox> {
    const image = options?.image ?? 'node:22'
    const ttlMs = options?.timeoutMs ?? 120_000

    const body: Record<string, unknown> = {
      language: 'typescript',
      image,
      target: this.target,
      envVars: options?.env ?? {},
      ephemeral: true,
      autoStopInterval: Math.max(1, Math.floor(ttlMs / 60000)),
      autoDeleteInterval: Math.max(1, Math.floor(ttlMs / 60000) + 1),
    }

    if (options?.resources) {
      const resources: Record<string, number> = {}
      if (options.resources.cpuCount) resources.cpu = options.resources.cpuCount
      if (options.resources.memoryMb) resources.memory = options.resources.memoryMb / 1024
      if (options.resources.diskMb) resources.disk = options.resources.diskMb / 1024
      body.resources = resources
    }

    if (options?.networkAccess === 'isolated') {
      body.networkBlockAll = true
    }

    const created = await this.request<DaytonaSandboxDto>('POST', '/sandbox', body)

    const sandboxId = created.id
    if (!sandboxId) {
      throw new Error('Daytona API did not return a sandbox ID')
    }

    const maxWait = Math.min(MAX_POLL_TIME_MS, Math.max(ttlMs, 10_000))
    const ready = await this.pollUntilReady(sandboxId, maxWait)

    const sandbox: Sandbox = {
      id: sandboxId,
      providerName: this.name,
      createdAt: ready.created ? new Date(ready.created) : new Date(),
      image: ready.image ?? image,
      state: 'ready',
      metadata: {
        target: ready.target ?? this.target,
        toolboxUrl: ready.toolboxProxyUrl ?? '',
        workspaceName: ready.name ?? sandboxId,
      },
    }

    this.sandboxes.set(sandboxId, {
      toolboxUrl: ready.toolboxProxyUrl ?? '',
      name: ready.name ?? sandboxId,
    })

    return sandbox
  }

  async execute(
    id: SandboxId,
    command: string,
    options?: ExecuteOptions,
  ): Promise<ExecutionResult> {
    const record = this.sandboxes.get(id)
    if (!record) {
      throw new Error(`Daytona sandbox not found: ${id}`)
    }

    const execTimeout = Math.max(1, Math.floor((options?.timeoutMs ?? 120_000) / 1000))

    const result = await this.request<ExecuteResponseDto>(
      'POST',
      `${record.toolboxUrl}/process/execute`,
      {
        command,
        timeout: execTimeout,
        env: options?.env,
      },
    )

    return {
      stdout: result.result ?? '',
      stderr: '',
      exitCode: result.exitCode,
    }
  }

  async destroy(id: SandboxId): Promise<void> {
    const record = this.sandboxes.get(id)
    if (!record) {
      throw new Error(`Daytona sandbox not found: ${id}`)
    }

    try {
      await this.request('DELETE', `/sandbox/${id}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!msg.includes('404') && !msg.includes('not found')) {
        throw err
      }
    }

    this.sandboxes.delete(id)
  }

  private async pollUntilReady(
    sandboxId: string,
    maxWaitMs: number,
  ): Promise<DaytonaSandboxDto> {
    const deadline = Date.now() + maxWaitMs

    while (Date.now() < deadline) {
      const sandbox = await this.request<DaytonaSandboxDto>(
        'GET',
        `/sandbox/${sandboxId}`,
      )

      if (sandbox.state === 'started' || sandbox.state === 'running') {
        return sandbox
      }

      if (sandbox.state === 'error') {
        throw new Error(
          `Daytona sandbox entered error state: ${sandbox.name ?? sandboxId}`,
        )
      }

      await sleep(POLL_INTERVAL_MS)
    }

    throw new Error(
      `Daytona sandbox ${sandboxId} did not become ready within ${maxWaitMs}ms`,
    )
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.apiUrl}${path.startsWith('/') ? path : '/' + path}`

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(
        `Daytona API ${method} ${path} failed: ${response.status} ${response.statusText}${text ? ` — ${text.slice(0, 200)}` : ''}`,
      )
    }

    if (response.status === 204) {
      return undefined as T
    }

    return response.json() as Promise<T>
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
