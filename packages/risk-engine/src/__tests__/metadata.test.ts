import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { checkPackageMetadata, fetchPackageMetadata, evaluate } from '../index'
import type { PackageMetadata } from '../types'
import { makeReport } from '@ojo/monitor'

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
  })
}

const oldTrustedPkg = {
  name: 'trusted-pkg',
  'dist-tags': { latest: '5.0.0' },
  time: {
    created: '2019-01-01T00:00:00.000Z',
    '5.0.0': '2024-01-01T00:00:00.000Z',
  },
  maintainers: [{ name: 'alice' }, { name: 'bob' }, { name: 'charlie' }],
  repository: { type: 'git', url: 'https://github.com/test/pkg' },
  license: 'MIT',
}

const freshlyPublishedPkg = {
  name: 'fresh-pkg',
  'dist-tags': { latest: '1.0.0' },
  time: {
    created: new Date(Date.now() - 60_000).toISOString(),
    '1.0.0': new Date(Date.now() - 60_000).toISOString(),
  },
  maintainers: [{ name: 'attacker' }],
  repository: undefined,
  license: undefined,
}

const deprecatedPkg = {
  name: 'deprecated-pkg',
  'dist-tags': { latest: '2.0.0' },
  time: {
    created: '2020-06-01T00:00:00.000Z',
    '2.0.0': '2024-06-01T00:00:00.000Z',
  },
  maintainers: [{ name: 'dev' }],
  repository: { type: 'git', url: 'https://github.com/test/pkg' },
  license: 'MIT',
  versions: {
    '2.0.0': {
      deprecated: 'This package is no longer maintained',
      maintainers: [{ name: 'dev' }],
      repository: { type: 'git', url: 'https://github.com/test/pkg' },
      license: 'MIT',
    },
  },
}

const newVersionPkg = {
  name: 'new-version-pkg',
  'dist-tags': { latest: '2.0.0' },
  time: {
    created: '2020-01-01T00:00:00.000Z',
    '2.0.0': new Date(Date.now() - 60_000).toISOString(),
  },
  maintainers: [{ name: 'dev' }, { name: 'team' }],
  repository: { type: 'git', url: 'https://github.com/test/pkg' },
  license: 'MIT',
}

const noMetadataPkg = {
  name: 'bare-pkg',
  'dist-tags': { latest: '1.0.0' },
  time: {
    created: '2023-01-01T00:00:00.000Z',
    '1.0.0': '2023-01-01T00:00:00.000Z',
  },
  maintainers: [{ name: 'dev' }],
}

describe('checkPackageMetadata', () => {
  it('assigns high score for package published within 24 hours', () => {
    const metadata: PackageMetadata = {
      name: 'test',
      packageAgeDays: 0,
      versionAgeDays: 0,
      maintainerCount: 1,
      hasRepository: true,
      hasLicense: true,
    }
    const result = checkPackageMetadata(metadata)
    expect(result.passed).toBe(false)
    expect(result.score).toBeGreaterThanOrEqual(40)
    expect(result.detail).toContain('less than 24 hours')
  })

  it('assigns medium score for version published within 24 hours on old package', () => {
    const metadata: PackageMetadata = {
      name: 'test',
      packageAgeDays: 365,
      versionAgeDays: 0,
      maintainerCount: 2,
      hasRepository: true,
      hasLicense: true,
    }
    const result = checkPackageMetadata(metadata)
    expect(result.passed).toBe(false)
    expect(result.score).toBeGreaterThanOrEqual(25)
    expect(result.detail).toContain('less than 24 hours')
  })

  it('returns safe for old trusted-looking package', () => {
    const metadata: PackageMetadata = {
      name: 'trusted',
      packageAgeDays: 2000,
      versionAgeDays: 365,
      maintainerCount: 5,
      hasRepository: true,
      hasLicense: true,
    }
    const result = checkPackageMetadata(metadata)
    expect(result.passed).toBe(true)
    expect(result.score).toBe(0)
  })

  it('detects deprecated package', () => {
    const metadata: PackageMetadata = {
      name: 'deprecated',
      packageAgeDays: 1000,
      versionAgeDays: 100,
      maintainerCount: 3,
      hasRepository: true,
      hasLicense: true,
      isDeprecated: true,
      deprecated: 'Use newer package instead',
    }
    const result = checkPackageMetadata(metadata)
    expect(result.passed).toBe(false)
    expect(result.score).toBeGreaterThanOrEqual(30)
    expect(result.detail).toContain('deprecated')
  })

  it('flags missing repository field', () => {
    const metadata: PackageMetadata = {
      name: 'bare',
      packageAgeDays: 365,
      versionAgeDays: 100,
      maintainerCount: 3,
      hasRepository: false,
      hasLicense: true,
    }
    const result = checkPackageMetadata(metadata)
    expect(result.passed).toBe(false)
    expect(result.score).toBeGreaterThanOrEqual(10)
    expect(result.detail).toContain('repository')
  })

  it('flags missing license field', () => {
    const metadata: PackageMetadata = {
      name: 'bare',
      packageAgeDays: 365,
      versionAgeDays: 100,
      maintainerCount: 3,
      hasRepository: true,
      hasLicense: false,
    }
    const result = checkPackageMetadata(metadata)
    expect(result.passed).toBe(false)
    expect(result.score).toBeGreaterThanOrEqual(5)
    expect(result.detail).toContain('license')
  })

  it('flags single maintainer', () => {
    const metadata: PackageMetadata = {
      name: 'solo',
      packageAgeDays: 365,
      versionAgeDays: 100,
      maintainerCount: 1,
      hasRepository: true,
      hasLicense: true,
    }
    const result = checkPackageMetadata(metadata)
    expect(result.passed).toBe(false)
    expect(result.score).toBeGreaterThanOrEqual(15)
    expect(result.detail).toContain('maintainer')
  })

  it('returns skipped when metadata has error', () => {
    const metadata: PackageMetadata = {
      name: 'error-pkg',
      error: 'registry unreachable',
    }
    const result = checkPackageMetadata(metadata)
    expect(result.skipped).toBe(true)
    expect(result.score).toBe(0)
  })

  it('combines multiple signals with additive scoring', () => {
    const metadata: PackageMetadata = {
      name: 'risky',
      packageAgeDays: 0,
      versionAgeDays: 0,
      maintainerCount: 1,
      hasRepository: false,
      hasLicense: false,
      isDeprecated: true,
    }
    const result = checkPackageMetadata(metadata)
    expect(result.passed).toBe(false)
    expect(result.score).toBeGreaterThan(50)
  })
})

describe('fetchPackageMetadata', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch(200, oldTrustedPkg))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('fetches metadata for regular package', async () => {
    const metadata = await fetchPackageMetadata('trusted-pkg')
    expect(metadata).not.toBeNull()
    expect(metadata!.name).toBe('trusted-pkg')
    expect(metadata!.hasRepository).toBe(true)
    expect(metadata!.hasLicense).toBe(true)
    expect(metadata!.maintainerCount).toBe(3)
  })

  it('caches metadata for repeated fetch', async () => {
    const fetchMock = vi.mocked(globalThis.fetch as typeof fetch)
    fetchMock.mockClear()

    await fetchPackageMetadata('cached-pkg')
    await fetchPackageMetadata('cached-pkg')

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('returns null on registry failure', async () => {
    vi.stubGlobal('fetch', mockFetch(500, {}))
    const metadata = await fetchPackageMetadata('failing-pkg')
    expect(metadata).not.toBeNull()
    expect(metadata!.error).toBeTruthy()
  })

  it('handles network error gracefully', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('Network failure')),
    )
    const metadata = await fetchPackageMetadata('offline-pkg')
    expect(metadata).not.toBeNull()
    expect(metadata!.error).toBe('registry unreachable')
  })

  it('returns error on 404', async () => {
    vi.stubGlobal('fetch', mockFetch(404, {}))
    const metadata = await fetchPackageMetadata('nonexistent-pkg')
    expect(metadata).not.toBeNull()
    expect(metadata!.error).toContain('404')
  })
})

describe('evaluate with metadata', () => {
  it('replaces package_metadata when metadata not provided', () => {
    const report = makeReport('s-meta', 'test-pkg', [], 100)
    const metadata: PackageMetadata = {
      name: 'test-pkg',
      packageAgeDays: 0,
      versionAgeDays: 0,
      maintainerCount: 1,
      hasRepository: false,
      hasLicense: false,
    }

    const withoutMeta = evaluate(report)
    const withMeta = evaluate(report, { metadata })

    const noMeta = withoutMeta.rules.find((r) => r.ruleName === 'package_metadata')
    expect(noMeta).toBeDefined()
    expect(noMeta?.skipped).toBe(true)

    const metaRule = withMeta.rules.find((r) => r.ruleName === 'package_metadata')
    expect(metaRule).toBeDefined()
    expect(metaRule?.passed).toBe(false)
  })
})
