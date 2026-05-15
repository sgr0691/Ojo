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

interface CfSandboxDto {
  id: string
  state?: string
  image?: string
  createdAt?: string
  execUrl?: string
}

interface CfExecResponseDto {
  exitCode: number
  stdout: string
  stderr: string
}

const DEFAULT_API_URL = 'https://api.cloudflare.com/client/v4'
const BRIDGE_POLL_INTERVAL_MS = 1500
const BRIDGE_MAX_POLL_MS = 120_000

/** @deprecated Experimental — not tested against real Cloudflare Sandbox API. Will be removed or replaced. */
export class CloudflareSandboxProvider implements SandboxProvider {
  readonly name: SandboxProviderName = 'cloudflare'
  private sandboxes = new Map<SandboxId, { execUrl: string }>()
  private apiKey: string
  private accountId?: string
  private apiUrl: string
  private bridgeUrl?: string

  constructor(config: ProviderConfig) {
    if (!config.apiKey) {
      throw new Error(
        'CloudflareSandboxProvider requires an API token (config.apiKey)',
      )
    }
    this.apiKey = config.apiKey
    this.accountId = config.config?.accountId
    this.apiUrl = config.endpoint ?? config.config?.apiUrl ?? DEFAULT_API_URL
    this.bridgeUrl = config.config?.bridgeUrl
  }

  async health(): Promise<ProviderHealth> {
    if (this.bridgeUrl) {
      try {
        const res = await fetch(`${this.bridgeUrl}/health`, {
          headers: { Authorization: `Bearer ${this.apiKey}` },
        })
        if (res.ok) {
          return {
            ok: true,
            message: `Cloudflare Sandbox bridge available at ${this.bridgeUrl}`,
          }
        }
        return { ok: false, message: `Bridge unhealthy: ${res.status}` }
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : 'Bridge unreachable',
        }
      }
    }

    if (!this.accountId) {
      return {
        ok: false,
        message:
          'Cloudflare account ID not configured. Set config.accountId or deploy a bridge worker (config.bridgeUrl)',
      }
    }

    try {
      const res = await fetch(
        `${this.apiUrl}/accounts/${this.accountId}/workers/sandbox`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        },
      )
      if (res.ok) {
        return { ok: true, message: `Cloudflare API available` }
      }
      if (res.status === 401) {
        return { ok: false, message: 'Invalid Cloudflare API token' }
      }
      if (res.status === 404) {
        return {
          ok: false,
          message:
            'Cloudflare Sandbox API not found. Deploy a bridge worker or check API availability',
        }
      }
      return { ok: false, message: `Cloudflare API error: ${res.status}` }
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : 'Cloudflare API unreachable',
      }
    }
  }

  async create(options?: SandboxCreateOptions): Promise<Sandbox> {
    const image = options?.image ?? 'node:22'
    const ttlMs = options?.timeoutMs ?? 120_000

    const body: Record<string, unknown> = {
      image,
      ephemeral: true,
      env: options?.env ?? {},
      autoStopMs: ttlMs,
    }

    if (options?.networkAccess === 'isolated') {
      body.networkBlockAll = true
    }

    if (options?.resources) {
      const resources: Record<string, number> = {}
      if (options.resources.cpuCount) resources.cpu = options.resources.cpuCount
      if (options.resources.memoryMb) resources.memory = options.resources.memoryMb / 1024
      if (options.resources.diskMb) resources.disk = options.resources.diskMb / 1024
      body.resources = resources
    }

    if (this.bridgeUrl) {
      return this.createViaBridge(image, body, ttlMs)
    }

    return this.createViaApi(image, body, ttlMs)
  }

  async execute(
    id: SandboxId,
    command: string,
    options?: ExecuteOptions,
  ): Promise<ExecutionResult> {
    const record = this.sandboxes.get(id)
    if (!record) {
      throw new Error(`Cloudflare sandbox not found: ${id}`)
    }

    const execTimeout = Math.max(1, Math.floor((options?.timeoutMs ?? 120_000) / 1000))

    if (record.execUrl) {
      const res = await fetch(record.execUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ command, timeout: execTimeout }),
      })

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(
          `Cloudflare execute failed: ${res.status}${text ? ` — ${text.slice(0, 200)}` : ''}`,
        )
      }

      const data = (await res.json()) as CfExecResponseDto
      return {
        stdout: data.stdout ?? '',
        stderr: data.stderr ?? '',
        exitCode: data.exitCode ?? 0,
      }
    }

    throw new Error(`Cloudflare sandbox ${id} has no exec endpoint configured`)
  }

  async destroy(id: SandboxId): Promise<void> {
    const record = this.sandboxes.get(id)
    if (!record) {
      throw new Error(`Cloudflare sandbox not found: ${id}`)
    }

    const path = this.bridgeUrl
      ? `${this.bridgeUrl}/sandbox/${id}`
      : `${this.apiUrl}/accounts/${this.accountId}/workers/sandbox/${id}`

    try {
      await fetch(path, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${this.apiKey}` },
      })
    } catch {
      // ignore network errors on destroy
    }

    this.sandboxes.delete(id)
  }

  private async createViaBridge(
    image: string,
    body: Record<string, unknown>,
    ttlMs: number,
  ): Promise<Sandbox> {
    const res = await fetch(`${this.bridgeUrl}/sandbox`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(
        `Cloudflare bridge create failed: ${res.status}${text ? ` — ${text.slice(0, 200)}` : ''}`,
      )
    }

    const dto = (await res.json()) as CfSandboxDto
    if (!dto.id) throw new Error('Cloudflare bridge did not return a sandbox ID')

    const ready = await this.pollSandbox(dto.id, ttlMs)

    const sandbox: Sandbox = {
      id: ready.id,
      providerName: this.name,
      createdAt: ready.createdAt ? new Date(ready.createdAt) : new Date(),
      image: ready.image ?? image,
      state: 'ready',
      metadata: {
        execUrl: ready.execUrl ?? '',
        bridgeUrl: this.bridgeUrl ?? '',
      },
    }

    this.sandboxes.set(ready.id, { execUrl: ready.execUrl ?? '' })
    return sandbox
  }

  private async createViaApi(
    image: string,
    body: Record<string, unknown>,
    ttlMs: number,
  ): Promise<Sandbox> {
    const res = await fetch(
      `${this.apiUrl}/accounts/${this.accountId}/workers/sandbox`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    )

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(
        `Cloudflare API create failed: ${res.status}${text ? ` — ${text.slice(0, 200)}` : ''}`,
      )
    }

    const dto = (await res.json()) as CfSandboxDto
    if (!dto.id) throw new Error('Cloudflare API did not return a sandbox ID')

    const ready = await this.pollSandbox(dto.id, ttlMs)

    const sandbox: Sandbox = {
      id: ready.id,
      providerName: this.name,
      createdAt: ready.createdAt ? new Date(ready.createdAt) : new Date(),
      image: ready.image ?? image,
      state: 'ready',
      metadata: {
        execUrl: ready.execUrl ?? '',
        accountId: this.accountId ?? '',
      },
    }

    this.sandboxes.set(ready.id, { execUrl: ready.execUrl ?? '' })
    return sandbox
  }

  private async pollSandbox(
    sandboxId: string,
    maxWaitMs: number,
  ): Promise<CfSandboxDto> {
    const deadline = Date.now() + maxWaitMs
    const baseUrl = this.bridgeUrl ?? `${this.apiUrl}/accounts/${this.accountId}`

    while (Date.now() < deadline) {
      const res = await fetch(`${baseUrl}/sandbox/${sandboxId}`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      })

      if (res.ok) {
        const dto = (await res.json()) as CfSandboxDto
        if (dto.state === 'ready' || dto.state === 'started') {
          return dto
        }
        if (dto.state === 'error' || dto.state === 'failed') {
          throw new Error(`Cloudflare sandbox ${sandboxId} entered error state`)
        }
      }

      await sleep(BRIDGE_POLL_INTERVAL_MS)
    }

    throw new Error(
      `Cloudflare sandbox ${sandboxId} did not become ready within ${maxWaitMs}ms`,
    )
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
