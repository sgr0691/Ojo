import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { handleInstall } from '../intercept'
import type { InterceptOptions } from '../intercept'

vi.mock('@ojo/providers', () => ({
  createProvider: vi.fn(),
}))

vi.mock('../prompt', () => ({
  askForApproval: vi.fn().mockResolvedValue(false),
}))

import { createProvider } from '@ojo/providers'

function healthyProvider() {
  return {
    name: 'docker' as const,
    health: vi.fn().mockResolvedValue({ ok: true }),
    create: vi.fn().mockResolvedValue({
      id: 'mock-sandbox-1',
      providerName: 'docker' as const,
      image: 'node:22-alpine@sha256:mock',
      state: 'ready' as const,
      createdAt: new Date(),
    }),
    execute: vi.fn().mockResolvedValue({ exitCode: 0, stdout: 'added 1 package', stderr: '' }),
    destroy: vi.fn().mockResolvedValue(undefined),
  }
}

function captureStderr() {
  const lines: string[] = []
  const orig = console.error
  console.error = (...args: unknown[]) => { lines.push(args.join(' ')) }
  return {
    restore: () => { console.error = orig },
    lines,
  }
}

describe('CLI intercept integration', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let exitSpy: any

  beforeEach(() => {
    delete process.env.OJO_ALLOW
    delete process.env.OJO_CI
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 500, json: () => Promise.resolve({}),
      text: () => Promise.resolve(''),
    }))
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never)
    vi.mocked(createProvider).mockReturnValue(healthyProvider())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    exitSpy.mockRestore()
    vi.mocked(createProvider).mockReset()
  })

  it('intercepts npm install with basic package (SAFE → allow)', async () => {
    const stderr = captureStderr()
    await handleInstall(
      [{ name: 'is-odd', raw: 'is-odd' }],
      { providerName: 'docker' },
    )
    stderr.restore()
    expect(stderr.lines.join(' ')).toContain('allowing install')
  })

  it('passes packageManager through to analysis', async () => {
    const stderr = captureStderr()
    await handleInstall(
      [{ name: 'lodash', raw: 'lodash' }],
      { providerName: 'docker', packageManager: 'pnpm' },
    )
    stderr.restore()
    expect(stderr.lines.join(' ')).toContain('allowing install')
  })

  it('handles no-arg install (empty packages)', async () => {
    const stderr = captureStderr()
    await handleInstall([], { providerName: 'docker', packageManager: 'npm' })
    stderr.restore()
    expect(stderr.lines.join(' ')).toContain('allowing install')
  })

  it('OJO_ALLOW env var bypasses analysis with audit warning', async () => {
    process.env.OJO_ALLOW = 'true'
    const stderr = captureStderr()
    await handleInstall(
      [{ name: 'evil-pkg', raw: 'evil-pkg' }],
      { providerName: 'docker' },
    )
    stderr.restore()
    const output = stderr.lines.join(' ')
    expect(output).toContain('WARNING')
    expect(output).toContain('allow override')
  })

  it('allow option bypasses analysis with audit warning', async () => {
    const stderr = captureStderr()
    await handleInstall(
      [{ name: 'evil-pkg', raw: 'evil-pkg' }],
      { providerName: 'docker', allow: true },
    )
    stderr.restore()
    expect(stderr.lines.join(' ')).toContain('WARNING')
  })

  it('CI mode blocks MEDIUM+ risk install', async () => {
    vi.mocked(createProvider).mockReturnValue({
      ...healthyProvider(),
      execute: vi.fn().mockResolvedValue({
        exitCode: 0,
        stdout: 'downloaded from https://evil.example.com/payload.sh',
        stderr: '',
      }),
    })

    const stderr = captureStderr()
    await handleInstall(
      [{ name: 'evil-pkg', raw: 'evil-pkg' }],
      { providerName: 'docker', ci: true },
    )
    stderr.restore()
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('escapes single quotes in package names', async () => {
    const mockProvider = healthyProvider()
    const executeSpy = vi.mocked(mockProvider.execute)
    vi.mocked(createProvider).mockReturnValue(mockProvider)

    await handleInstall(
      [{ name: "evil'pkg", raw: "evil'pkg" }],
      { providerName: 'docker' },
    )

    const command = executeSpy.mock.calls[0][1] as string
    expect(command).toContain("'evil'\\''pkg'")
  })

  it('fails closed when provider unavailable', async () => {
    vi.mocked(createProvider).mockReturnValue({
      ...healthyProvider(),
      health: vi.fn().mockResolvedValue({ ok: false, message: 'Docker not running' }),
    })

    const stderr = captureStderr()
    await handleInstall(
      [{ name: 'any-pkg', raw: 'any-pkg' }],
      { providerName: 'docker' },
    )
    stderr.restore()
    expect(stderr.lines.join(' ')).toContain('not available')
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('cleans up sandbox on execute failure', async () => {
    const destroy = vi.fn().mockResolvedValue(undefined)
    vi.mocked(createProvider).mockReturnValue({
      ...healthyProvider(),
      execute: vi.fn().mockRejectedValue(new Error('exec failed')),
      destroy,
    })

    const stderr = captureStderr()
    try {
      await handleInstall(
        [{ name: 'fail-pkg', raw: 'fail-pkg' }],
        { providerName: 'docker' },
      )
    } catch {
      // expected — execute rejects
    } finally {
      stderr.restore()
    }
    expect(destroy).toHaveBeenCalledWith('mock-sandbox-1')
  })
})
