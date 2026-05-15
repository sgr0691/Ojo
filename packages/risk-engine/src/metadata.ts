import { OJO_NAME } from '@ojo/shared'
import type { PackageMetadata, RuleResult } from './types'

const RATE_LIMIT_MS = 100
let lastFetchTime = 0

const metadataCache = new Map<string, PackageMetadata | null>()

function encodePackageName(name: string): string {
  if (name.startsWith('@')) {
    return '@' + encodeURIComponent(name.slice(1)).replace(/%2F/g, '/')
  }
  return encodeURIComponent(name)
}

function parseRegistryData(data: Record<string, unknown>, name: string): PackageMetadata {
  const now = Date.now()
  const time = (data.time ?? {}) as Record<string, string>
  const versions = (data.versions ?? {}) as Record<string, Record<string, unknown>>
  const distTags = data['dist-tags'] as Record<string, string> | undefined
  const latestVersion = distTags?.latest

  const latestVersionData = latestVersion ? versions[latestVersion] : undefined
  const publishTime: string | undefined = (time.created as string) ?? undefined
  const latestPublishTime: string | undefined = latestVersion ? (time[latestVersion] as string) : undefined

  let packageAgeDays: number | undefined
  let versionAgeDays: number | undefined

  if (publishTime) {
    packageAgeDays = Math.floor((now - new Date(publishTime).getTime()) / 86_400_000)
  }
  if (latestPublishTime) {
    versionAgeDays = Math.floor((now - new Date(latestPublishTime).getTime()) / 86_400_000)
  }

  const maintainers = (data.maintainers ?? []) as Array<Record<string, string>>
  const latestMaintainers = (latestVersionData?.maintainers ?? maintainers) as Array<Record<string, string>>

  return {
    name: (data.name as string) || name,
    publishTime,
    latestVersion,
    latestVersionPublishTime: latestPublishTime,
    packageAgeDays,
    versionAgeDays,
    maintainerCount: latestMaintainers.length,
    distTags,
    hasRepository: !!(latestVersionData?.repository || data.repository),
    hasLicense: !!(latestVersionData?.license || data.license),
    deprecated: latestVersionData?.deprecated as string | undefined,
    isDeprecated: !!latestVersionData?.deprecated,
  }
}

export async function fetchPackageMetadata(
  name: string,
  signal?: AbortSignal,
): Promise<PackageMetadata | null> {
  const cacheKey = name.toLowerCase()

  if (metadataCache.has(cacheKey)) {
    return metadataCache.get(cacheKey) ?? null
  }

  const now = Date.now()
  const timeSinceLastFetch = now - lastFetchTime
  if (timeSinceLastFetch < RATE_LIMIT_MS) {
    await sleep(RATE_LIMIT_MS - timeSinceLastFetch)
  }
  lastFetchTime = Date.now()

  try {
    const encoded = encodePackageName(name)
    const url = `https://registry.npmjs.org/${encoded}`
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10_000)
    const response = await fetch(url, { signal: signal ?? controller.signal })
    clearTimeout(timeoutId)

    if (!response.ok) {
      const error = `registry returned ${response.status}`
      const result: PackageMetadata = { name, error }
      metadataCache.set(cacheKey, result)
      return result
    }

    const data = (await response.json()) as Record<string, unknown>
    const metadata = parseRegistryData(data, name)
    metadataCache.set(cacheKey, metadata)
    return metadata
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      const result: PackageMetadata = { name, error: 'fetch aborted' }
      metadataCache.set(cacheKey, result)
      return result
    }
    const result: PackageMetadata = { name, error: 'registry unreachable' }
    metadataCache.set(cacheKey, result)
    return result
  }
}

export function checkPackageMetadata(metadata: PackageMetadata): RuleResult {
  if (metadata.error) {
    return {
      ruleName: 'package_metadata',
      passed: true,
      score: 0,
      detail: `Registry metadata unavailable: ${metadata.error}`,
      skipped: true,
    }
  }

  let totalScore = 0
  const details: string[] = []

  if (metadata.packageAgeDays !== undefined && metadata.packageAgeDays <= 1) {
    totalScore += 40
    details.push(`Package published less than 24 hours ago`)
  } else if (metadata.packageAgeDays !== undefined && metadata.packageAgeDays <= 7) {
    totalScore += 20
    details.push(`Package published ${metadata.packageAgeDays} days ago`)
  } else if (metadata.packageAgeDays !== undefined && metadata.packageAgeDays <= 30) {
    totalScore += 10
    details.push(`Package is ${metadata.packageAgeDays} days old`)
  }

  if (metadata.versionAgeDays !== undefined && metadata.versionAgeDays <= 1) {
    totalScore += 25
    details.push(`Latest version published less than 24 hours ago`)
  } else if (metadata.versionAgeDays !== undefined && metadata.versionAgeDays <= 7) {
    totalScore += 15
    details.push(`Latest version published ${metadata.versionAgeDays} days ago`)
  }

  if (metadata.isDeprecated) {
    totalScore += 30
    details.push('Package is deprecated')
  }

  if (metadata.maintainerCount !== undefined && metadata.maintainerCount <= 1) {
    totalScore += 15
    details.push(`Only ${metadata.maintainerCount} maintainer`)
  } else if (metadata.maintainerCount !== undefined && metadata.maintainerCount <= 2) {
    totalScore += 5
    details.push(`Only ${metadata.maintainerCount} maintainers`)
  }

  if (metadata.hasRepository === false) {
    totalScore += 10
    details.push('No repository field')
  }

  if (metadata.hasLicense === false) {
    totalScore += 5
    details.push('No license field')
  }

  return {
    ruleName: 'package_metadata',
    passed: totalScore === 0,
    score: Math.min(totalScore, 80),
    detail: details.length > 0 ? details.join('; ') : 'Package metadata looks normal',
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
