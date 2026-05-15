import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DockerProvider, type DockerResult, type DockerCli } from '../providers/docker'

function mockCli(responses?: Record<string, Partial<DockerResult>>): DockerCli {
  const defaultResp = { stdout: '', stderr: '', exitCode: 0 }
  return vi.fn((args: string[]) => {
    const key = args.join(' ')
    const resp = responses?.[key]
    if (resp?.exitCode != null && resp.exitCode !== 0) {
      return Promise.resolve({ ...defaultResp, ...resp })
    }
    if (args[0] === 'create') {
      return Promise.resolve(defaultResp)
    }
    if (args[0] === 'start') {
      return Promise.resolve(defaultResp)
    }
    if (args[0] === 'inspect') {
      return Promise.resolve({ ...defaultResp, stdout: 'abc123def456\n' })
    }
    if (args[0] === 'image' && args[1] === 'inspect') {
      return Promise.resolve(defaultResp)
    }
    if (args[0] === 'exec') {
      return Promise.resolve({ ...defaultResp, stdout: 'installed' })
    }
    if (args[0] === 'rm') {
      return Promise.resolve(defaultResp)
    }
    return Promise.resolve(defaultResp)
  }) as DockerCli
}

describe('DockerProvider (unit)', () => {
  let provider: DockerProvider
  let cli: ReturnType<typeof vi.fn>

  beforeEach(() => {
    cli = mockCli() as unknown as ReturnType<typeof vi.fn>
    provider = new DockerProvider({ name: 'docker' }, cli as unknown as DockerCli)
  })

  it('creates a sandbox', async () => {
    const sandbox = await provider.create()

    expect(sandbox.id).toBe('abc123def456')
    expect(sandbox.providerName).toBe('docker')
    expect(sandbox.image).toContain('@sha256:')
    expect(sandbox.state).toBe('ready')
    expect(sandbox.createdAt).toBeInstanceOf(Date)

    expect(cli).toHaveBeenCalledWith(
      expect.arrayContaining(['create', '--name', expect.stringContaining('ojo-')]),
      expect.any(Object),
    )
    expect(cli).toHaveBeenCalledWith(
      expect.arrayContaining(['start', expect.stringContaining('ojo-')]),
      expect.any(Object),
    )
  })

  it('pulls image if not found locally', async () => {
    cli = vi.fn((args: string[]) => {
      if (args[0] === 'image' && args[1] === 'inspect') {
        return Promise.resolve({ stdout: '', stderr: 'not found', exitCode: 1 })
      }
      if (args[0] === 'pull') {
        return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 })
      }
      if (args[0] === 'create') {
        return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 })
      }
      if (args[0] === 'start') {
        return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 })
      }
      if (args[0] === 'inspect') {
        return Promise.resolve({ stdout: 'full-id\n', stderr: '', exitCode: 0 })
      }
      return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 })
    }) as unknown as ReturnType<typeof vi.fn>

    provider = new DockerProvider({ name: 'docker' }, cli as unknown as DockerCli)
    await provider.create({ image: 'custom:latest' })

    expect(cli).toHaveBeenCalledWith(
      ['image', 'inspect', 'custom:latest'],
      expect.any(Object),
    )
    expect(cli).toHaveBeenCalledWith(
      ['pull', 'custom:latest'],
      expect.any(Object),
    )
  })

  it('throws if image pull fails', async () => {
    cli = vi.fn((args: string[]) => {
      if (args[0] === 'image' && args[1] === 'inspect') {
        return Promise.resolve({ stdout: '', stderr: 'not found', exitCode: 1 })
      }
      if (args[0] === 'pull') {
        return Promise.resolve({ stdout: '', stderr: 'pull failed', exitCode: 1 })
      }
      return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 })
    }) as unknown as ReturnType<typeof vi.fn>

    provider = new DockerProvider({ name: 'docker' }, cli as unknown as DockerCli)
    await expect(provider.create({ image: 'nonexistent:latest' })).rejects.toThrow(
      'Failed to pull image',
    )
  })

  it('executes a command', async () => {
    const sandbox = await provider.create()
    const result = await provider.execute(sandbox.id, 'npm install react')

    expect(result.stdout).toBe('installed')
    expect(result.exitCode).toBe(0)
    expect(cli).toHaveBeenCalledWith(
      ['exec', '--user', '1000:1000', expect.stringContaining('ojo-'), 'sh', '-c', 'timeout 120 npm install react'],
      expect.any(Object),
    )
  })

  it('destroys a sandbox', async () => {
    const sandbox = await provider.create()
    await provider.destroy(sandbox.id)

    expect(cli).toHaveBeenCalledWith(
      ['rm', '-f', expect.stringContaining('ojo-')],
      expect.any(Object),
    )
  })

  it('throws on execute for unknown sandbox', async () => {
    await expect(provider.execute('nonexistent', 'ls')).rejects.toThrow(
      'Docker sandbox not found',
    )
  })

  it('throws on destroy for unknown sandbox', async () => {
    await expect(provider.destroy('nonexistent')).rejects.toThrow(
      'Docker sandbox not found',
    )
  })

  it('double destroy throws', async () => {
    const sandbox = await provider.create()
    await provider.destroy(sandbox.id)
    await expect(provider.destroy(sandbox.id)).rejects.toThrow(
      'Docker sandbox not found',
    )
  })

  it('creates with custom image', async () => {
    const sandbox = await provider.create({ image: 'node:22' })
    expect(sandbox.image).toBe('node:22')
  })

  it('custom digest-pinned default image does not warn', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    new DockerProvider(
      {
        name: 'docker',
        config: {
          defaultImage: 'node:22-alpine@sha256:0000000000000000000000000000000000000000000000000000000000000000',
        },
      },
      cli as unknown as DockerCli,
    )
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('custom mutable tag default image warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    new DockerProvider(
      { name: 'docker', config: { defaultImage: 'node:22' } },
      cli as unknown as DockerCli,
    )
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('not pinned'))
    warn.mockRestore()
  })

  it('allowMutableImage suppresses image pinning warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    new DockerProvider(
      {
        name: 'docker',
        config: { defaultImage: 'node:22', allowMutableImage: 'true' },
      },
      cli as unknown as DockerCli,
    )
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('creates with env vars', async () => {
    const sandbox = await provider.create({ env: { FOO: 'bar', BAZ: 'qux' } })
    expect(sandbox.id).toBeDefined()

    const calls = cli.mock.calls as unknown as Array<[string[]]>
    const createCall = calls.find((c) => c[0][0] === 'create')
    expect(createCall).toBeDefined()
    const createArgs = createCall![0]
    expect(createArgs).toContain('--env')
    const envIdx = createArgs.indexOf('--env')
    expect(createArgs[envIdx + 1]).toBe('FOO=bar')
    expect(createArgs[envIdx + 3]).toBe('BAZ=qux')
  })

  it('creates with isolated network (legacy networkAccess)', async () => {
    await provider.create({ networkAccess: 'isolated' })
    const calls = cli.mock.calls as unknown as Array<[string[]]>
    const createCall = calls.find((c) => c[0][0] === 'create')
    expect(createCall).toBeDefined()
    expect(createCall![0]).toContain('--network')
    expect(createCall![0]).toContain('none')
  })

  it('creates with explicit none network policy', async () => {
    await provider.create({ networkPolicy: 'none' })
    const calls = cli.mock.calls as unknown as Array<[string[]]>
    const createCall = calls.find((c) => c[0][0] === 'create')
    expect(createCall).toBeDefined()
    expect(createCall![0]).toContain('--network')
    expect(createCall![0]).toContain('none')
  })

  it('defaults to allowAll network policy with no network flag', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await provider.create()
    const calls = cli.mock.calls as unknown as Array<[string[]]>
    const createCall = calls.find((c) => c[0][0] === 'create')
    expect(createCall).toBeDefined()
    const args = createCall![0]
    expect(args).not.toContain('--network')
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('respects explicit allowAll policy', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await provider.create({ networkPolicy: 'allowAll' })
    const calls = cli.mock.calls as unknown as Array<[string[]]>
    const createCall = calls.find((c) => c[0][0] === 'create')
    expect(createCall).toBeDefined()
    expect(createCall![0]).not.toContain('--network')
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('warns and falls back when registryOnly policy requested', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await provider.create({ networkPolicy: 'registryOnly' })
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('registryOnly'),
    )
    warn.mockRestore()
  })

  it('creates with security hardening flags', async () => {
    await provider.create()
    const calls = cli.mock.calls as unknown as Array<[string[]]>
    const createCall = calls.find((c) => c[0][0] === 'create')
    expect(createCall).toBeDefined()
    const args = createCall![0]
    expect(args).toContain('--security-opt')
    expect(args).toContain('no-new-privileges')
    expect(args).toContain('--cap-drop')
    expect(args).toContain('ALL')
    expect(args).toContain('--read-only')
    expect(args).toContain('--user')
    expect(args).toContain('1000:1000')
    expect(args).toContain('npm_config_cache=/tmp/.npm-cache')
  })

  it('executes command as non-root user', async () => {
    const sandbox = await provider.create()
    await provider.execute(sandbox.id, 'whoami')
    const calls = cli.mock.calls as unknown as Array<[string[]]>
    const execCall = calls.find((c) => c[0][0] === 'exec')
    expect(execCall).toBeDefined()
    const execArgs = execCall![0]
    expect(execArgs).toContain('--user')
    expect(execArgs).toContain('1000:1000')
  })

  it('creates with memory limit', async () => {
    await provider.create({ resources: { memoryMb: 512 } })
    const calls = cli.mock.calls as unknown as Array<[string[]]>
    const createCall = calls.find((c) => c[0][0] === 'create')
    expect(createCall).toBeDefined()
    expect(createCall![0]).toContain('--memory')
    expect(createCall![0]).toContain('512m')
  })

  it('sets expiry timer when timeoutMs > 0', async () => {
    vi.useFakeTimers()
    provider = new DockerProvider({ name: 'docker' }, cli as unknown as DockerCli)

    const sandbox = await provider.create({ timeoutMs: 5000 })
    expect(sandbox.state).toBe('ready')

    vi.advanceTimersByTime(5000)
    await vi.runAllTimersAsync()

    await expect(provider.execute(sandbox.id, 'ls')).rejects.toThrow(
      'Docker sandbox not found',
    )
    vi.useRealTimers()
  })
})

describe('DockerProvider integration (requires Docker)', () => {
  it('runs npm install inside container', async () => {
    const dockerAvailable = await checkDocker()
    if (!dockerAvailable) {
      return
    }

    const provider = new DockerProvider({ name: 'docker' })
    const sandbox = await provider.create({ image: 'node:22-alpine', timeoutMs: 60_000 })

    try {
      const result = await provider.execute(
        sandbox.id,
        'npm install is-odd',
      )

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('added')
      expect(result.stderr).toBeDefined()
    } finally {
      await provider.destroy(sandbox.id)
    }
  }, 120_000)

  it('reports non-zero exit code for failing command', async () => {
    const dockerAvailable = await checkDocker()
    if (!dockerAvailable) {
      return
    }

    const provider = new DockerProvider({ name: 'docker' })
    const sandbox = await provider.create({ image: 'node:22-alpine', timeoutMs: 30_000 })

    try {
      const result = await provider.execute(sandbox.id, 'npm install nonexistent-package-that-definitely-does-not-exist-12345')

      expect(result.exitCode).not.toBe(0)
    } finally {
      await provider.destroy(sandbox.id)
    }
  }, 120_000)

  it('isolates container from host filesystem', async () => {
    const dockerAvailable = await checkDocker()
    if (!dockerAvailable) {
      return
    }

    const provider = new DockerProvider({ name: 'docker' })
    const sandbox = await provider.create({ image: 'node:22-alpine', timeoutMs: 30_000 })

    try {
      const result = await provider.execute(sandbox.id, 'ls /app')

      expect(result.exitCode).toBe(0)
      expect(result.stdout.trim()).toBe('')
    } finally {
      await provider.destroy(sandbox.id)
    }
  }, 60_000)
})

async function checkDocker(): Promise<boolean> {
  try {
    const { spawn } = await import('node:child_process')
    return new Promise((resolve) => {
      const child = spawn('docker', ['info'], {
        stdio: 'ignore',
        timeout: 5_000,
      })
      child.on('close', (code) => resolve(code === 0))
      child.on('error', () => resolve(false))
    })
  } catch {
    return false
  }
}
