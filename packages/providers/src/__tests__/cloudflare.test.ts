import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CloudflareSandboxProvider } from '../providers/cloudflare'

const MOCK_TOKEN = 'cf-api-token-12345'
const MOCK_ACCOUNT = 'acct-001'

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(body),
    text: () =>
      Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
  })
}

describe('CloudflareSandboxProvider', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch(200, {}))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('throws if no API token provided', () => {
    expect(() => new CloudflareSandboxProvider({ name: 'cloudflare' })).toThrow(
      'API token',
    )
  })

  it('accepts API token from config', () => {
    const p = new CloudflareSandboxProvider({
      name: 'cloudflare',
      apiKey: MOCK_TOKEN,
      config: { accountId: MOCK_ACCOUNT },
    })
    expect(p.name).toBe('cloudflare')
  })

  it('health() returns ok when bridge responds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ status: 'ok' }),
        text: () => Promise.resolve(''),
      }),
    )
    const p = new CloudflareSandboxProvider({
      name: 'cloudflare',
      apiKey: MOCK_TOKEN,
      config: { bridgeUrl: 'https://ojo-bridge.example.com' },
    })
    const health = await p.health()
    expect(health.ok).toBe(true)
    expect(health.message).toContain('bridge')
  })

  it('health() returns not ok when bridge fails', async () => {
    vi.stubGlobal('fetch', mockFetch(503, {}))
    const p = new CloudflareSandboxProvider({
      name: 'cloudflare',
      apiKey: MOCK_TOKEN,
      config: { bridgeUrl: 'https://ojo-bridge.example.com' },
    })
    const health = await p.health()
    expect(health.ok).toBe(false)
  })

  it('health() reports missing accountId without bridge', async () => {
    const p = new CloudflareSandboxProvider({
      name: 'cloudflare',
      apiKey: MOCK_TOKEN,
    })
    const health = await p.health()
    expect(health.ok).toBe(false)
    expect(health.message).toContain('account ID')
  })

  it('creates sandbox via bridge', async () => {
    const calls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
        calls.push(url)
        if (opts?.method === 'POST' && url.includes('/sandbox') && !url.includes('sandbox/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ id: 'cf-ws-001' }),
            text: () => Promise.resolve(''),
          })
        }
        if (url.includes('/sandbox/cf-ws-001')) {
          const count = calls.filter((c) => c.includes('/sandbox/cf-ws-001')).length
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve(
                count >= 2
                  ? {
                      id: 'cf-ws-001',
                      state: 'ready',
                      image: 'node:22',
                      execUrl: 'https://exec.cf.example.com/cf-ws-001',
                      createdAt: '2026-01-01T00:00:00Z',
                    }
                  : { id: 'cf-ws-001', state: 'creating' },
              ),
            text: () => Promise.resolve(''),
          })
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({}),
          text: () => Promise.resolve(''),
        })
      }),
    )

    const p = new CloudflareSandboxProvider({
      name: 'cloudflare',
      apiKey: MOCK_TOKEN,
      config: { bridgeUrl: 'https://ojo-bridge.example.com' },
    })

    const sandbox = await p.create({ image: 'node:22', timeoutMs: 30_000 })
    expect(sandbox.id).toBe('cf-ws-001')
    expect(sandbox.providerName).toBe('cloudflare')
    expect(sandbox.state).toBe('ready')
    expect(sandbox.metadata?.execUrl).toBe('https://exec.cf.example.com/cf-ws-001')
  })

  it('executes a command via bridge', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({ exitCode: 0, stdout: 'Hello from CF', stderr: '' }),
        text: () => Promise.resolve(''),
      }),
    )

    const p = new CloudflareSandboxProvider({
      name: 'cloudflare',
      apiKey: MOCK_TOKEN,
    })
    ;(p as unknown as { sandboxes: Map<string, { execUrl: string }> }).sandboxes.set(
      'cf-ws-001',
      { execUrl: 'https://exec.cf.example.com/cf-ws-001/exec' },
    )

    const result = await p.execute('cf-ws-001', 'echo hello')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe('Hello from CF')
  })

  it('destroys sandbox', async () => {
    let deleted = false
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url: string, opts?: RequestInit) => {
        if (opts?.method === 'DELETE') deleted = true
        return Promise.resolve({
          ok: true,
          status: 204,
          json: () => Promise.resolve({}),
          text: () => Promise.resolve(''),
        })
      }),
    )

    const p = new CloudflareSandboxProvider({
      name: 'cloudflare',
      apiKey: MOCK_TOKEN,
      config: { bridgeUrl: 'https://ojo-bridge.example.com' },
    })
    ;(p as unknown as { sandboxes: Map<string, { execUrl: string }> }).sandboxes.set(
      'cf-ws-001',
      { execUrl: 'https://exec.cf.example.com/cf-ws-001/exec' },
    )

    await p.destroy('cf-ws-001')
    expect(deleted).toBe(true)
  })

  it('throws on execute for unknown sandbox', async () => {
    const p = new CloudflareSandboxProvider({
      name: 'cloudflare',
      apiKey: MOCK_TOKEN,
    })
    await expect(p.execute('nonexistent', 'ls')).rejects.toThrow(
      'Cloudflare sandbox not found',
    )
  })

  it('throws on destroy for unknown sandbox', async () => {
    const p = new CloudflareSandboxProvider({
      name: 'cloudflare',
      apiKey: MOCK_TOKEN,
    })
    await expect(p.destroy('nonexistent')).rejects.toThrow(
      'Cloudflare sandbox not found',
    )
  })

  it('handles poll timeout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
        if (opts?.method === 'POST' || url.includes('/sandbox') && !url.includes('/sandbox/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ id: 'cf-timeout' }),
            text: () => Promise.resolve(''),
          })
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ id: 'cf-timeout', state: 'creating' }),
          text: () => Promise.resolve(''),
        })
      }),
    )

    const p = new CloudflareSandboxProvider({
      name: 'cloudflare',
      apiKey: MOCK_TOKEN,
      config: { bridgeUrl: 'https://ojo-bridge.example.com' },
    })

    await expect(p.create({ timeoutMs: 2000 })).rejects.toThrow(
      'did not become ready',
    )
  }, 15_000)

  it('passes image and env to API', async () => {
    const fetchMock = vi.fn().mockImplementation((_url: string, opts?: RequestInit) => {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            id: 'cf-config',
            state: 'ready',
            execUrl: 'https://exec.cf.example.com/cf-config',
          }),
        text: () => Promise.resolve(''),
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const p = new CloudflareSandboxProvider({
      name: 'cloudflare',
      apiKey: MOCK_TOKEN,
      config: { bridgeUrl: 'https://ojo-bridge.example.com' },
    })

    await p.create({
      image: 'node:20',
      env: { FOO: 'bar' },
    })

    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>
    const createCall = calls.find(
      ([url, opts]) => opts?.method === 'POST' && url.includes('/sandbox'),
    )
    expect(createCall).toBeDefined()

    const body = JSON.parse(createCall![1].body as string) as Record<string, unknown>
    expect(body.image).toBe('node:20')
    expect(body.ephemeral).toBe(true)
  })
})
