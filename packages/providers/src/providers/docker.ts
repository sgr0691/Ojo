import { spawn } from 'node:child_process'
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
  NetworkPolicy,
} from '../types'
import { OJO_NAME } from '@ojo/shared'

export interface DockerResult {
  stdout: string
  stderr: string
  exitCode: number
}

export type DockerCli = (args: string[], options?: { timeout?: number }) => Promise<DockerResult>

export function createRealDockerCli(): DockerCli {
  return (args, options) =>
    new Promise<DockerResult>((resolve, reject) => {
      const child = spawn('docker', args, {
        timeout: options?.timeout,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, DOCKER_CLI_HINTS: 'false' },
      })

      let stdout = ''
      let stderr = ''

      child.stdout.on('data', (d: Buffer) => {
        stdout += d.toString()
      })
      child.stderr.on('data', (d: Buffer) => {
        stderr += d.toString()
      })

      child.on('close', (code) => {
        resolve({ stdout, stderr, exitCode: code ?? -1 })
      })
      child.on('error', reject)
    })
}

const DEFAULT_TIMEOUT_MS = 120_000

const DEFAULT_IMAGE_DIGEST =
  'node:22-alpine@sha256:968df39aedcea65eeb078fb336ed7191baf48f972b4479711397108be0966920'

interface ContainerRecord {
  containerName: string
  sandbox: Sandbox
  createdAt: number
  ttlMs: number
  expiryTimer?: ReturnType<typeof setTimeout>
}

export class DockerProvider implements SandboxProvider {
  readonly name: SandboxProviderName = 'docker'
  private containers = new Map<SandboxId, ContainerRecord>()
  private docker: DockerCli
  private defaultImage: string
  private defaultPolicy: NetworkPolicy

  constructor(config: ProviderConfig, docker?: DockerCli) {
    const configuredImage = config.config?.defaultImage
    const allowMutable = config.config?.allowMutableImage === 'true'

    if (configuredImage) {
      this.defaultImage = configuredImage
      if (!configuredImage.includes('@sha256:') && !allowMutable) {
        console.warn(
          `${OJO_NAME}: default image "${configuredImage}" is not pinned to a digest. ` +
          `Image tags are mutable and may change unexpectedly. ` +
          `Set config.allowMutableImage=true to suppress this warning, ` +
          `or use a @sha256: pinned reference.`,
        )
      }
    } else {
      this.defaultImage = DEFAULT_IMAGE_DIGEST
    }

    this.defaultPolicy = (config.config?.defaultPolicy as NetworkPolicy) ?? 'allowAll'
    this.docker = docker ?? createRealDockerCli()
  }

  async health(): Promise<ProviderHealth> {
    try {
      const result = await this.docker(['info', '--format', '{{.ServerVersion}}'], { timeout: 10_000 })
      if (result.exitCode === 0) {
        return { ok: true, version: result.stdout.trim(), message: 'Docker daemon is running' }
      }
      return { ok: false, message: result.stderr || 'Docker daemon not available' }
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : 'Unknown error' }
    }
  }

  async create(options?: SandboxCreateOptions): Promise<Sandbox> {
    const image = options?.image ?? this.defaultImage
    const ttlMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS
    const tag = crypto.randomUUID().slice(0, 12)
    const containerName = `ojo-${tag}`

    await this.ensureImage(image)

    const createArgs: string[] = [
      'create',
      '--name', containerName,
      '--workdir', '/app',
      '--stop-timeout', '10',
      '--security-opt', 'no-new-privileges',
      '--cap-drop', 'ALL',
      '--read-only',
      '--tmpfs', '/tmp:rw,noexec,nosuid,size=512m,mode=1777',
      '--tmpfs', '/var/tmp:rw,noexec,nosuid,size=128m,mode=1777',
      '--tmpfs', '/app:rw,exec,nosuid,size=1g,uid=1000,gid=1000,mode=0755',
      '--user', '1000:1000',
    ]

    const policy = this.resolveNetworkPolicy(options)

    if (policy === 'none') {
      createArgs.push('--network', 'none')
    } else if (policy === 'registryOnly') {
      console.warn(
        `${OJO_NAME}: registryOnly network policy requested but not yet fully enforced via Docker alone. ` +
        `Falling back to allowAll for this session. See https://github.com/sgr0691/Ojo/issues for progress.`,
      )
    }

    if (options?.env) {
      for (const [key, value] of Object.entries(options.env)) {
        createArgs.push('--env', `${key}=${value}`)
      }
    }

    createArgs.push('--env', 'npm_config_cache=/tmp/.npm-cache')

    if (options?.resources?.memoryMb) {
      createArgs.push('--memory', `${options.resources.memoryMb}m`)
    }

    createArgs.push(image, 'tail', '-f', '/dev/null')

    const created = await this.docker(createArgs, { timeout: 30_000 })
    if (created.exitCode !== 0) {
      throw new Error(
        `Failed to create container: ${created.stderr || created.stdout}`,
      )
    }

    const started = await this.docker(['start', containerName], { timeout: 30_000 })
    if (started.exitCode !== 0) {
      await this.forceRemove(containerName)
      throw new Error(
        `Failed to start container: ${started.stderr || started.stdout}`,
      )
    }

    const inspectArgs = ['inspect', '--format', '{{.Id}}', containerName]
    const inspected = await this.docker(inspectArgs, { timeout: 10_000 })
    const fullId = inspected.stdout.trim()

    const sandbox: Sandbox = {
      id: fullId,
      providerName: this.name,
      createdAt: new Date(),
      image,
      state: 'ready',
      metadata: {
        containerName,
        image,
      },
    }

    const record: ContainerRecord = {
      containerName,
      sandbox,
      createdAt: Date.now(),
      ttlMs,
    }

    if (ttlMs > 0) {
      record.expiryTimer = setTimeout(async () => {
        await this.destroy(fullId).catch(() => {})
      }, ttlMs)
    }

    this.containers.set(fullId, record)
    return sandbox
  }

  async execute(id: SandboxId, command: string, options?: ExecuteOptions): Promise<ExecutionResult> {
    const record = this.containers.get(id)
    if (!record) {
      throw new Error(`Docker sandbox not found: ${id}`)
    }

    const execTimeout = options?.timeoutMs ?? record.ttlMs
    const wrappedCmd = execTimeout > 0 ? `timeout ${Math.ceil(execTimeout / 1000)} ${command}` : command

    const result = await this.docker(
      ['exec', '--user', '1000:1000', record.containerName, 'sh', '-c', wrappedCmd],
      { timeout: execTimeout + 5_000 },
    )

    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    }
  }

  async destroy(id: SandboxId): Promise<void> {
    const record = this.containers.get(id)
    if (!record) {
      throw new Error(`Docker sandbox not found: ${id}`)
    }

    if (record.expiryTimer) {
      clearTimeout(record.expiryTimer)
    }

    await this.forceRemove(record.containerName)
    this.containers.delete(id)
  }

  private async ensureImage(image: string): Promise<void> {
    const check = await this.docker(['image', 'inspect', image], { timeout: 15_000 })
    if (check.exitCode === 0) return

    const pulled = await this.docker(['pull', image], { timeout: 120_000 })
    if (pulled.exitCode !== 0) {
      throw new Error(
        `Failed to pull image "${image}": ${pulled.stderr || pulled.stdout}`,
      )
    }
  }

  private async forceRemove(name: string): Promise<void> {
    await this.docker(['rm', '-f', name], { timeout: 30_000 }).catch(() => {})
  }

  private resolveNetworkPolicy(options?: SandboxCreateOptions): NetworkPolicy {
    if (options?.networkPolicy) return options.networkPolicy
    if (options?.networkAccess) {
      if (options.networkAccess === 'isolated') return 'none'
      return 'allowAll'
    }
    return this.defaultPolicy
  }
}
