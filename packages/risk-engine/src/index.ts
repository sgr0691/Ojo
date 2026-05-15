import type { BehaviorReport, BehaviorEventType } from '@ojo/monitor'
import type { EvaluateOptions, RuleResult, TrustReport, PackageMetadata } from './types'

export { riskLevelFromScore, DEFAULT_THRESHOLDS } from './types'
export type { RiskLevel, RuleResult, TrustReport, RiskThresholds, EvaluateOptions, PackageMetadata } from './types'

export {
  checkPostinstallScripts,
  checkSuspiciousCommands,
  checkCurlWget,
  checkOutboundNetwork,
  checkObfuscatedScripts,
  checkEnvAccess,
} from './rules'

export { formatReport, formatReportInline } from './format'
export type { FormatOptions } from './format'

export { fetchPackageMetadata, checkPackageMetadata } from './metadata'

import {
  checkPostinstallScripts,
  checkSuspiciousCommands,
  checkCurlWget,
  checkOutboundNetwork,
  checkObfuscatedScripts,
  checkEnvAccess,
} from './rules'

import { checkPackageMetadata, fetchPackageMetadata } from './metadata'

import type { RuleCheck } from './rules'

export type { RuleCheck }

export interface Rule {
  name: string
  description: string
  check: RuleCheck
}

export const DEFAULT_RULES: Rule[] = [
  { name: 'postinstall_scripts', description: 'Flags non-trivial lifecycle scripts', check: checkPostinstallScripts },
  { name: 'suspicious_commands', description: 'Detects suspicious shell commands', check: checkSuspiciousCommands },
  { name: 'curl_wget', description: 'Detects external binary downloads', check: checkCurlWget },
  { name: 'outbound_network', description: 'Flags unexpected outbound network requests', check: checkOutboundNetwork },
  { name: 'obfuscated_scripts', description: 'Flags obfuscated script content', check: checkObfuscatedScripts },
  { name: 'env_access', description: 'Detects sensitive env var access', check: checkEnvAccess },
  { name: 'package_metadata', description: 'Checks registry metadata signals', check: () => ({ ruleName: 'package_metadata', passed: true, score: 0, detail: 'No registry metadata available', skipped: true }) },
]

function computeScore(results: RuleResult[]): number {
  return results.reduce((sum, r) => sum + (r.skipped ? 0 : r.score), 0)
}

function computeRiskLevel(score: number): TrustReport['riskLevel'] {
  if (score <= 0) return 'SAFE'
  if (score <= 20) return 'LOW'
  if (score <= 50) return 'MEDIUM'
  if (score <= 80) return 'HIGH'
  return 'BLOCKED'
}

function buildSummary(riskLevel: TrustReport['riskLevel'], results: RuleResult[]): string {
  const failed = results.filter((r) => !r.passed && !r.skipped)
  const skipped = results.filter((r) => r.skipped)
  const active = results.filter((r) => !r.skipped)
  const total = active.length
  const passed = total - failed.length

  if (failed.length === 0) {
    const base = `All ${total} checks passed — package appears safe`
    if (skipped.length > 0) {
      return `${base} (${skipped.length} check(s) skipped — signals unavailable)`
    }
    return base
  }

  const labels: Record<string, string> = {
    SAFE: 'No risk indicators',
    LOW: 'Minor risk indicators detected',
    MEDIUM: 'Moderate risk indicators detected',
    HIGH: 'Significant risk indicators detected',
    BLOCKED: 'Critical risk indicators — install should be blocked',
  }

  return `${labels[riskLevel] ?? 'Risk detected'} (${passed}/${total} checks passed, ${failed.length} triggered)`
}

const RULE_TO_SIGNAL: Record<string, BehaviorEventType> = {
  outbound_network: 'network_request',
}

export function evaluate(
  report: BehaviorReport,
  options?: EvaluateOptions,
): TrustReport {
  const rules = DEFAULT_RULES
  const activeRules = options?.blockedRules
    ? rules.filter((r) => !options.blockedRules!.includes(r.name))
    : rules

  const results: RuleResult[] = []

  for (const rule of activeRules) {
    if (rule.name === 'package_metadata' && options?.metadata) {
      results.push(checkPackageMetadata(options.metadata))
      continue
    }

    const requiredSignal = RULE_TO_SIGNAL[rule.name]
    if (requiredSignal && report.availableSignals[requiredSignal] === 'unavailable') {
      results.push({
        ruleName: rule.name,
        passed: true,
        score: 0,
        detail: 'Signal unavailable — outbound network traffic cannot be verified from captured output',
        skipped: true,
      })
      continue
    }
    results.push(rule.check(report.events))
  }

  const score = computeScore(results)
  const riskLevel = computeRiskLevel(score)
  const summary = buildSummary(riskLevel, results)

  return {
    packageName: report.packageName,
    riskLevel,
    score,
    rules: results,
    summary,
  }
}
