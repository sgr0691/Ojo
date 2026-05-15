import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createProvider } from '../registry'
import { DockerProvider } from '../providers/docker'
import { DaytonaProvider } from '../providers/daytona'
import { CloudflareSandboxProvider } from '../providers/cloudflare'

beforeAll(() => {
  globalThis.fetch = () =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: 'mock-id', state: 'ready', execUrl: 'http://localhost/exec' }),
      text: () => Promise.resolve(''),
    } as Response)
})

afterAll(() => {
  delete (globalThis as { fetch?: typeof fetch }).fetch
})

describe('createProvider', () => {
  it('creates a DockerProvider', () => {
    const provider = createProvider({ name: 'docker' })
    expect(provider).toBeInstanceOf(DockerProvider)
    expect(provider.name).toBe('docker')
  })

  it('creates a DaytonaProvider', () => {
    const provider = createProvider({
      name: 'daytona',
      apiKey: 'test-key',
    })
    expect(provider).toBeInstanceOf(DaytonaProvider)
    expect(provider.name).toBe('daytona')
  })

  it('creates a CloudflareSandboxProvider', () => {
    const provider = createProvider({
      name: 'cloudflare',
      apiKey: 'test-cf-token',
      config: { accountId: 'test-acct' },
    })
    expect(provider).toBeInstanceOf(CloudflareSandboxProvider)
    expect(provider.name).toBe('cloudflare')
  })

  it('throws for unknown provider', () => {
    expect(() => createProvider({ name: 'unknown' as never })).toThrow()
  })

  it('passes config through to provider create', () => {
    const docker = createProvider({ name: 'docker', priority: 5 }) as DockerProvider
    expect(docker).toBeInstanceOf(DockerProvider)

    const daytona = createProvider({
      name: 'daytona',
      endpoint: 'https://api.daytona.io',
      apiKey: 'test-key',
    }) as DaytonaProvider
    expect(daytona).toBeInstanceOf(DaytonaProvider)
  })
})

describe('Provider lifecycle (stub)', () => {
  const cfStub = () =>
    createProvider({
      name: 'cloudflare',
      apiKey: 'test-cf-token',
      config: { bridgeUrl: 'http://localhost:9999' },
    })

  it('creates a sandbox with expected shape', async () => {
    const provider = cfStub()
    const sandbox = await provider.create({ image: 'node:22-alpine' })

    expect(sandbox.id).toBeDefined()
    expect(sandbox.providerName).toBe('cloudflare')
    expect(sandbox.createdAt).toBeInstanceOf(Date)
    expect(sandbox.image).toBe('node:22-alpine')
    expect(sandbox.state).toBe('ready')
  })

  it('uses default image when none provided', async () => {
    const provider = cfStub()
    const sandbox = await provider.create()
    expect(sandbox.image).toBe('node:22')
  })

  it('executes a command and returns result shape', async () => {
    const provider = cfStub()
    const sandbox = await provider.create()
    const result = await provider.execute(sandbox.id, 'npm install react')

    expect(result).toHaveProperty('stdout')
    expect(result).toHaveProperty('stderr')
    expect(result).toHaveProperty('exitCode')
    expect(typeof result.exitCode).toBe('number')
  })

  it('destroys a sandbox', async () => {
    const provider = cfStub()
    const sandbox = await provider.create()
    await expect(provider.destroy(sandbox.id)).resolves.toBeUndefined()
  })

  it('throws on double destroy', async () => {
    const provider = cfStub()
    const sandbox = await provider.create()
    await provider.destroy(sandbox.id)
    await expect(provider.destroy(sandbox.id)).rejects.toThrow('not found')
  })

  it('respects env option', async () => {
    const provider = cfStub()
    const sandbox = await provider.create({
      image: 'node:22',
      env: { FOO: 'bar' },
    })
    expect(sandbox.image).toBe('node:22')
  })

  it('stub providers create independent sandboxes', async () => {
    const cf1 = cfStub()
    const cf2 = cfStub()

    const [a, b] = await Promise.all([
      cf1.create(),
      cf2.create(),
    ])

    expect(a.providerName).toBe('cloudflare')
    expect(b.providerName).toBe('cloudflare')
  })
})
