import { describe, it, expect } from 'vitest'
import { formatReport, formatReportInline, evaluate } from '../index'
import { makeReport, suspiciousInstallEvents } from '@ojo/monitor'

describe('formatReport', () => {
  it('produces non-empty string', () => {
    const report = makeReport('s-1', 'suspicious-pkg', suspiciousInstallEvents)
    const result = evaluate(report)
    const formatted = formatReport(result)
    expect(typeof formatted).toBe('string')
    expect(formatted.length).toBeGreaterThan(0)
  })

  it('includes package name', () => {
    const report = makeReport('s-1', 'suspicious-pkg', suspiciousInstallEvents)
    const result = evaluate(report)
    const formatted = formatReport(result)
    expect(formatted).toContain('suspicious-pkg')
  })

  it('includes risk level', () => {
    const report = makeReport('s-1', 'suspicious-pkg', suspiciousInstallEvents)
    const result = evaluate(report)
    const formatted = formatReport(result)
    expect(formatted).toContain('HIGH')
  })

  it('includes score', () => {
    const report = makeReport('s-1', 'suspicious-pkg', suspiciousInstallEvents)
    const result = evaluate(report)
    const formatted = formatReport(result)
    expect(formatted).toContain(String(result.score))
  })

  it('verbose mode includes rule details', () => {
    const report = makeReport('s-1', 'suspicious-pkg', suspiciousInstallEvents)
    const result = evaluate(report)
    const formatted = formatReport(result, { verbose: true })
    expect(formatted.length).toBeGreaterThan(0)
  })

  it('safe report shows all checks passed', () => {
    const events = [
      { type: 'process_execution' as const, timestamp: Date.now(), severity: 'info' as const, pid: 1, command: 'node', args: ['npm', 'install', 'safe-pkg'] },
    ]
    const report = makeReport('s-2', 'safe-pkg', events, 100)
    const result = evaluate(report)
    const formatted = formatReport(result)
    expect(formatted).toContain('SAFE')
    expect(formatted).toContain('checks passed')
  })
})

describe('formatReportInline', () => {
  it('produces single-line output', () => {
    const report = makeReport('s-1', 'suspicious-pkg', suspiciousInstallEvents)
    const result = evaluate(report)
    const formatted = formatReportInline(result)
    expect(typeof formatted).toBe('string')
    expect(formatted).toContain('suspicious-pkg')
    expect(formatted).not.toContain('\n')
  })
})
