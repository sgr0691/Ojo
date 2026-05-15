import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DaytonaProvider } from '../providers/daytona'

const MOCK_API_KEY = 'test-api-key-12345'

function mockFetch(status: number, body: unknown, delayMs = 0) {
  return vi.fn().mockImplementation(
    () =>
      new Promise((resolve) => {
        setTimeout(
          () =>
            resolve({
              ok: status >= 200 && status < 300,
              status,
              statusText: status === 200 ? 'OK' : 'Error',
              json: () => Promise.resolve(body),
              text: () =>
                Promise.resolve(
                  typeof body === 'string' ? body : JSON.stringify(body),
                ),
            }),
          delayMs,
        )
      }),
  )
}

describe('DaytonaProvider', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch(200, {}))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('throws if no API key provided', () => {
    expect(() => new DaytonaProvider({ name: 'daytona' })).toThrow('API key')
  })

  it('accepts API key from config', () => {
    const provider = new DaytonaProvider({
      name: 'daytona',
      apiKey: MOCK_API_KEY,
    })
    expect(provider.name).toBe('daytona')
  })

  it('health() returns ok when API responds', async () => {
    vi.stubGlobal('fetch', mockFetch(200, []))
    const provider = new DaytonaProvider({ name: 'daytona', apiKey: MOCK_API_KEY })
    const health = await provider.health()
    expect(health.ok).toBe(true)
  })

  it('health() returns not ok when API fails', async () => {
    vi.stubGlobal('fetch', mockFetch(401, { message: 'Unauthorized' }))
    const provider = new DaytonaProvider({ name: 'daytona', apiKey: MOCK_API_KEY })
    const health = await provider.health()
    expect(health.ok).toBe(false)
  })

  it('creates a sandbox with polling', async () => {
    const calls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        calls.push(url)

        if (url.includes('/sandbox') && !url.includes('/sandbox/')) {
          // POST create
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ id: 'ws-123' }),
            text: () => Promise.resolve(''),
          })
        }

        if (url.includes('/sandbox/ws-123')) {
          // GET poll — first two calls return creating, third returns started
          const count = calls.filter((c) => c.includes('/sandbox/ws-123')).length
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve(
                count >= 3
                  ? {
                      id: 'ws-123',
                      state: 'started',
                      image: 'node:22',
                      toolboxProxyUrl: 'https://toolbox.daytona.io/ws-123',
                      name: 'ojo-sandbox',
                      target: 'us',
                      created: '2026-01-01T00:00:00Z',
                    }
                  : { id: 'ws-123', state: 'creating' },
              ),
            text: () => Promise.resolve(''),
          })
        }

        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}), text: () => Promise.resolve('') })
      }),
    )

    const provider = new DaytonaProvider({
      name: 'daytona',
      apiKey: MOCK_API_KEY,
    })

    const sandbox = await provider.create({ image: 'node:22', timeoutMs: 30_000 })
    expect(sandbox.id).toBe('ws-123')
    expect(sandbox.providerName).toBe('daytona')
    expect(sandbox.state).toBe('ready')
    expect(sandbox.image).toBe('node:22')
    expect(sandbox.metadata?.toolboxUrl).toBe('https://toolbox.daytona.io/ws-123')
  })

  it('executes a command', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('/process/execute')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                exitCode: 0,
                result: 'installed',
              }),
            text: () => Promise.resolve(''),
          })
        }
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}), text: () => Promise.resolve('') })
      }),
    )

    const provider = new DaytonaProvider({ name: 'daytona', apiKey: MOCK_API_KEY })

    // Manually inject sandbox state (bypass create which needs polling)
    const inject = provider as unknown as {
      sandboxes: Map<string, { toolboxUrl: string; name: string }>
    }
    inject.sandboxes.set('ws-123', {
      toolboxUrl: 'https://toolbox.daytona.io/ws-123',
      name: 'test-sandbox',
    })

    const result = await provider.execute(
      'ws-123',
      'npm install react',
    )
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe('installed')
  })

  it('destroys a sandbox', async () => {
    let deleted = false
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, opts: RequestInit) => {
        if (opts?.method === 'DELETE' && url.includes('/sandbox/ws-123')) {
          deleted = true
          return Promise.resolve({ ok: true, status: 204, json: () => Promise.resolve({}), text: () => Promise.resolve('') })
        }
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}), text: () => Promise.resolve('') })
      }),
    )

    const provider = new DaytonaProvider({ name: 'daytona', apiKey: MOCK_API_KEY })
    const inject = provider as unknown as {
      sandboxes: Map<string, { toolboxUrl: string; name: string }>
    }
    inject.sandboxes.set('ws-123', {
      toolboxUrl: 'https://toolbox.daytona.io/ws-123',
      name: 'test-sandbox',
    })

    await provider.destroy('ws-123')
    expect(deleted).toBe(true)
    expect(inject.sandboxes.has('ws-123')).toBe(false)
  })

  it('throws on execute for unknown sandbox', async () => {
    const provider = new DaytonaProvider({ name: 'daytona', apiKey: MOCK_API_KEY })
    await expect(provider.execute('nonexistent', 'ls')).rejects.toThrow(
      'Daytona sandbox not found',
    )
  })

  it('throws on destroy for unknown sandbox', async () => {
    const provider = new DaytonaProvider({ name: 'daytona', apiKey: MOCK_API_KEY })
    await expect(provider.destroy('nonexistent')).rejects.toThrow(
      'Daytona sandbox not found',
    )
  })

  it('handles API error on create', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch(400, { message: 'Bad request' }),
    )
    const provider = new DaytonaProvider({ name: 'daytona', apiKey: MOCK_API_KEY })
    await expect(provider.create()).rejects.toThrow('Daytona API')
  })

  it('handles poll timeout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('/sandbox') && !url.includes('/sandbox/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ id: 'ws-timeout' }),
            text: () => Promise.resolve(''),
          })
        }
        // Always return 'creating' — never becomes ready
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ id: 'ws-timeout', state: 'creating' }),
          text: () => Promise.resolve(''),
        }) as unknown as Response
      }),
    )

    const provider = new DaytonaProvider({
      name: 'daytona',
      apiKey: MOCK_API_KEY,
      config: { target: 'us' },
    })

    await expect(provider.create({ timeoutMs: 2000 })).rejects.toThrow(
      'did not become ready',
    )
  }, 15_000)

  it('passes config to API calls', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, opts: RequestInit) => {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            id: 'ws-config',
            state: 'started',
            toolboxProxyUrl: 'https://toolbox.daytona.io/ws-config',
          }),
        text: () => Promise.resolve(''),
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const provider = new DaytonaProvider({
      name: 'daytona',
      apiKey: MOCK_API_KEY,
      config: { target: 'eu', region: 'eu-west-1' },
    })

    await provider.create({ image: 'node:20' })

    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>
    const createCall = calls.find(
      ([url]) => url.includes('/sandbox') && !url.includes('/sandbox/'),
    )
    expect(createCall).toBeDefined()

    const createArg = createCall![1]
    const body = JSON.parse(createArg.body as string) as Record<string, unknown>
    expect(body.image).toBe('node:20')
    expect(body.ephemeral).toBe(true)
  })
})
