import type { TrustReport, RuleResult } from './types'

export interface FormatOptions {
  verbose?: boolean
}

const SEPARATOR = '\u2501'.repeat(48)

export function formatReport(report: TrustReport, options?: FormatOptions): string {
  const lines: string[] = []
  const v = options?.verbose ?? false

  const icon = report.riskLevel === 'SAFE' || report.riskLevel === 'LOW'
    ? '\u2713'
    : '\u2717'

  lines.push(`${icon}  Ojo trust report for ${report.packageName}${report.packageVersion ? '@' + report.packageVersion : ''}`)
  lines.push(SEPARATOR)
  lines.push(`  risk: ${riskLabel(report.riskLevel)} (score: ${report.score})`)
  lines.push('')

  const failed = report.rules.filter((r) => !r.passed && !r.skipped)
  const passed = report.rules.filter((r) => r.passed && !r.skipped)
  const skipped = report.rules.filter((r) => r.skipped)

  if (failed.length > 0) {
    lines.push('  triggers:')
    for (const rule of failed) {
      lines.push(`    ${cross()} ${rule.ruleName}  (+${rule.score})`)
      if (v) {
        lines.push(`       ${rule.detail}`)
      }
    }
    lines.push('')
  }

  if (v && passed.length > 0) {
    lines.push('  passed:')
    for (const rule of passed) {
      lines.push(`    ${check()} ${rule.ruleName}`)
      if (v) {
        lines.push(`       ${rule.detail}`)
      }
    }
    lines.push('')
  }

  if (skipped.length > 0) {
    lines.push('  skipped (unavailable):')
    for (const rule of skipped) {
      lines.push(`    ~ ${rule.ruleName}`)
      if (v) {
        lines.push(`       ${rule.detail}`)
      }
    }
    lines.push('')
  }

  if (!v && failed.length > 0) {
    lines.push(`  ${formatDetail(report)}`)
    lines.push('')
  }

  lines.push(SEPARATOR)
  lines.push(`  ${report.summary}`)

  return lines.join('\n')
}

export function formatReportInline(report: TrustReport): string {
  const icon = report.riskLevel === 'SAFE' || report.riskLevel === 'LOW' ? '\u2713' : '\u2717'
  const triggered = report.rules.filter((r) => !r.passed && !r.skipped)
  const skipped = report.rules.filter((r) => r.skipped)
  const parts = triggered.map((r) => `${r.ruleName} (+${r.score})`)
  const detail = parts.length > 0 ? ` [${parts.join(', ')}]` : ''
  const skipNote = skipped.length > 0 ? ` (${skipped.length} check(s) unavailable)` : ''
  return `${icon} ${report.packageName}: ${riskLabel(report.riskLevel)} (${report.score})${detail}${skipNote}`
}

function riskLabel(level: string): string {
  const labels: Record<string, string> = {
    SAFE: 'SAFE',
    LOW: 'LOW',
    MEDIUM: 'MEDIUM',
    HIGH: 'HIGH',
    BLOCKED: 'BLOCKED',
  }
  return labels[level] ?? level
}

function check(): string {
  return '\u2713'  // ✓ check mark
}

function cross(): string {
  return '\u2717'  // ✗ cross mark
}

function formatDetail(report: TrustReport): string {
  const failed = report.rules.filter((r) => !r.passed)
  if (failed.length === 0) return 'No issues detected'
  return failed
    .map((r) => r.detail)
    .filter(Boolean)
    .join(' | ')
}
