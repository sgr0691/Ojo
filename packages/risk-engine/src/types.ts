export type RiskLevel = 'SAFE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'BLOCKED'

export interface RuleResult {
  ruleName: string
  passed: boolean
  score: number
  detail: string
  skipped?: boolean
}

export interface PackageMetadata {
  name: string
  publishTime?: string
  latestVersion?: string
  latestVersionPublishTime?: string
  packageAgeDays?: number
  versionAgeDays?: number
  maintainerCount?: number
  distTags?: Record<string, string>
  hasRepository?: boolean
  hasLicense?: boolean
  deprecated?: string
  isDeprecated?: boolean
  error?: string
}

export interface TrustReport {
  packageName: string
  packageVersion?: string
  riskLevel: RiskLevel
  score: number
  rules: RuleResult[]
  summary: string
}

export interface RiskThresholds {
  safe: number
  low: number
  medium: number
  high: number
}

export const DEFAULT_THRESHOLDS: RiskThresholds = {
  safe: 0,
  low: 20,
  medium: 50,
  high: 80,
}

export function riskLevelFromScore(score: number): RiskLevel {
  if (score <= DEFAULT_THRESHOLDS.safe) return 'SAFE'
  if (score <= DEFAULT_THRESHOLDS.low) return 'LOW'
  if (score <= DEFAULT_THRESHOLDS.medium) return 'MEDIUM'
  if (score <= DEFAULT_THRESHOLDS.high) return 'HIGH'
  return 'BLOCKED'
}

export interface EvaluateOptions {
  blockedRules?: string[]
  metadata?: PackageMetadata
}
