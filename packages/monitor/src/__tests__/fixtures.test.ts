import { describe, it, expect } from 'vitest'
import {
  npmInstallEvents,
  suspiciousInstallEvents,
  maliciousNetworkEvents,
  cleanReport,
  makeReport,
  rawLogSample,
} from '../fixtures'
import { buildSummary } from '../normalize'

describe('fixtures', () => {
  it('npmInstallEvents has expected shape', () => {
    expect(npmInstallEvents.length).toBeGreaterThan(0)
    for (const event of npmInstallEvents) {
      expect(event).toHaveProperty('type')
      expect(event).toHaveProperty('timestamp')
      expect(event).toHaveProperty('severity')
    }
  })

  it('npmInstallEvents has all info severity', () => {
    const allInfo = npmInstallEvents.every((e) => e.severity === 'info')
    expect(allInfo).toBe(true)
  })

  it('suspiciousInstallEvents contains all event types', () => {
    const types = new Set(suspiciousInstallEvents.map((e) => e.type))
    expect(types.has('process_execution')).toBe(true)
    expect(types.has('network_request')).toBe(true)
    expect(types.has('filesystem_mutation')).toBe(true)
    expect(types.has('lifecycle_script')).toBe(true)
    expect(types.has('binary_download')).toBe(true)
    expect(types.has('environment_access')).toBe(true)
  })

  it('suspiciousInstallEvents has mixed severity', () => {
    const severities = new Set(suspiciousInstallEvents.map((e) => e.severity))
    expect(severities.has('info')).toBe(true)
    expect(severities.has('warning')).toBe(true)
  })

  it('maliciousNetworkEvents contains critical severity events', () => {
    const critical = maliciousNetworkEvents.filter((e) => e.severity === 'critical')
    expect(critical.length).toBeGreaterThan(0)
  })

  it('cleanReport has low risk level', () => {
    expect(cleanReport.summary.riskLevel).toBe('low')
    expect(cleanReport.events.length).toBe(8)
  })

  it('makeReport creates reports with summary', () => {
    const report = makeReport('sandbox-test', 'test-pkg', npmInstallEvents)
    expect(report.sandboxId).toBe('sandbox-test')
    expect(report.packageName).toBe('test-pkg')
    expect(report.summary).toBeDefined()
    expect(report.summary.totalEvents).toBe(npmInstallEvents.length)
  })

  it('suspicious events produce high risk summary', () => {
    const summary = buildSummary(suspiciousInstallEvents)
    expect(summary.riskLevel).toBe('high')
    expect(summary.flags.length).toBeGreaterThan(0)
  })

  it('malicious network events produce critical indicators', () => {
    const summary = buildSummary(maliciousNetworkEvents)
    expect(summary.bySeverity.critical).toBeGreaterThan(0)
    expect(summary.flags.some((f) => f.includes('evil.example.com')) || summary.flags.some((f) => f.includes('data-exfil'))).toBe(true)
  })

  it('rawLogSample contains parseable content', () => {
    const log = rawLogSample()
    expect(typeof log).toBe('string')
    expect(log.length).toBeGreaterThan(0)
    expect(log).toContain('[101]')
    expect(log).toContain('registry.npmjs.org')
    expect(log).toContain('AWS_SECRET_ACCESS_KEY')
  })

  it('maliciousNetworkEvents has higher risk than npmInstallEvents', () => {
    const cleanSummary = buildSummary(npmInstallEvents)
    const maliciousSummary = buildSummary(maliciousNetworkEvents)

    expect(cleanSummary.riskLevel).toBe('low')
    expect(maliciousSummary.riskLevel).toBe('high')
    expect(maliciousSummary.bySeverity.critical).toBeGreaterThan(
      cleanSummary.bySeverity.critical,
    )
  })
})
