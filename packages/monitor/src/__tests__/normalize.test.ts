import { describe, it, expect } from 'vitest'
import {
  parseDockerExecLog,
  parseDockerExecLogLine,
  buildSummary,
  createReport,
  severityFromExitCode,
  severityFromPath,
  severityFromHost,
  isSensitiveKey,
  detectScriptType,
  detectOperationType,
} from '../normalize'
import { rawLogSample, npmInstallEvents, suspiciousInstallEvents } from '../fixtures'

describe('severityFromExitCode', () => {
  it('returns info for exit code 0', () => {
    expect(severityFromExitCode(0)).toBe('info')
  })

  it('returns info for undefined', () => {
    expect(severityFromExitCode(undefined)).toBe('info')
  })

  it('returns warning for exit code 1', () => {
    expect(severityFromExitCode(1)).toBe('warning')
  })

  it('returns critical for exit code > 1', () => {
    expect(severityFromExitCode(2)).toBe('critical')
    expect(severityFromExitCode(137)).toBe('critical')
  })
})

describe('severityFromPath', () => {
  it('returns critical for env files', () => {
    expect(severityFromPath('/app/.env')).toBe('critical')
    expect(severityFromPath('/root/.env.production')).toBe('critical')
  })

  it('returns warning for config files', () => {
    expect(severityFromPath('/root/.git/config')).toBe('warning')
    expect(severityFromPath('/root/.npmrc')).toBe('warning')
  })

  it('returns info for normal paths', () => {
    expect(severityFromPath('/app/node_modules/foo/index.js')).toBe('info')
  })
})

describe('severityFromHost', () => {
  it('returns info for npm registry', () => {
    expect(severityFromHost('registry.npmjs.org')).toBe('info')
  })

  it('returns warning for raw IP addresses', () => {
    expect(severityFromHost('192.168.1.1')).toBe('warning')
  })

  it('returns info for known hosts', () => {
    expect(severityFromHost('github.com')).toBe('info')
    expect(severityFromHost('raw.githubusercontent.com')).toBe('info')
  })
})

describe('isSensitiveKey', () => {
  it('detects token keys', () => {
    expect(isSensitiveKey('NPM_TOKEN')).toBe(true)
    expect(isSensitiveKey('GITHUB_TOKEN')).toBe(true)
  })

  it('detects secret keys', () => {
    expect(isSensitiveKey('AWS_SECRET_ACCESS_KEY')).toBe(true)
    expect(isSensitiveKey('MY_SECRET')).toBe(true)
  })

  it('returns false for benign keys', () => {
    expect(isSensitiveKey('NODE_ENV')).toBe(false)
    expect(isSensitiveKey('PATH')).toBe(false)
  })
})

describe('detectScriptType', () => {
  it('detects postinstall', () => {
    expect(detectScriptType('node postinstall.js')).toBe('postinstall')
  })

  it('detects preinstall', () => {
    expect(detectScriptType('node preinstall.js')).toBe('preinstall')
  })

  it('defaults to install', () => {
    expect(detectScriptType('node build.js')).toBe('install')
  })
})

describe('detectOperationType', () => {
  it('detects delete', () => {
    expect(detectOperationType(['rm', '-rf', '/tmp'])).toBe('delete')
  })

  it('detects chmod', () => {
    expect(detectOperationType(['chmod', '+x', 'file'])).toBe('chmod')
  })

  it('detects mkdir', () => {
    expect(detectOperationType(['mkdir', '-p', 'dir'])).toBe('mkdir')
  })

  it('defaults to write', () => {
    expect(detectOperationType(['echo', 'hello'])).toBe('write')
  })
})

describe('parseDockerExecLogLine', () => {
  it('parses process execution lines', () => {
    const event = parseDockerExecLogLine('[101] node npm install is-odd', 0)
    expect(event).not.toBeNull()
    expect(event!.type).toBe('process_execution')
    if (event?.type === 'process_execution') {
      expect(event.pid).toBe(101)
      expect(event.command).toBe('node')
      expect(event.args).toEqual(['npm', 'install', 'is-odd'])
    }
  })

  it('parses network request lines', () => {
    const event = parseDockerExecLogLine('https registry.npmjs.org /is-odd GET', 0)
    expect(event).not.toBeNull()
    expect(event!.type).toBe('network_request')
    if (event?.type === 'network_request') {
      expect(event.protocol).toBe('https')
      expect(event.host).toBe('registry.npmjs.org')
      expect(event.path).toBe('/is-odd')
      expect(event.method).toBe('GET')
    }
  })

  it('parses filesystem mutation lines', () => {
    const event = parseDockerExecLogLine('write /app/node_modules/foo/index.js', 0)
    expect(event).not.toBeNull()
    expect(event!.type).toBe('filesystem_mutation')
    if (event?.type === 'filesystem_mutation') {
      expect(event.operation).toBe('write')
      expect(event.path).toBe('/app/node_modules/foo/index.js')
    }
  })

  it('parses lifecycle script lines', () => {
    const event = parseDockerExecLogLine('postinstall node postinstall.js', 0)
    expect(event).not.toBeNull()
    expect(event!.type).toBe('lifecycle_script')
    if (event?.type === 'lifecycle_script') {
      expect(event.scriptType).toBe('postinstall')
      expect(event.command).toBe('node postinstall.js')
    }
  })

  it('parses binary download lines', () => {
    const event = parseDockerExecLogLine(
      'download https://evil.example.com/payload.sh -> /tmp/payload.sh',
      0,
    )
    expect(event).not.toBeNull()
    expect(event!.type).toBe('binary_download')
    if (event?.type === 'binary_download') {
      expect(event.url).toBe('https://evil.example.com/payload.sh')
      expect(event.destinationPath).toBe('/tmp/payload.sh')
    }
  })

  it('parses environment access lines', () => {
    const event = parseDockerExecLogLine('env NPM_TOKEN', 0)
    expect(event).not.toBeNull()
    expect(event!.type).toBe('environment_access')
    if (event?.type === 'environment_access') {
      expect(event.key).toBe('NPM_TOKEN')
      expect(event.severity).toBe('warning')
    }
  })

  it('returns null for empty lines', () => {
    expect(parseDockerExecLogLine('', 0)).toBeNull()
    expect(parseDockerExecLogLine('   ', 0)).toBeNull()
  })

  it('returns null for unparseable lines', () => {
    expect(parseDockerExecLogLine('# comment line', 0)).toBeNull()
  })
})

describe('parseDockerExecLog', () => {
  it('parses a complete raw log into events', () => {
    const log = rawLogSample()
    const events = parseDockerExecLog(log)

    expect(events.length).toBeGreaterThan(0)
    expect(events.every((e) => 'type' in e)).toBe(true)

    const types = events.map((e) => e.type)
    expect(types).toContain('process_execution')
    expect(types).toContain('network_request')
    expect(types).toContain('filesystem_mutation')
    expect(types).toContain('lifecycle_script')
    expect(types).toContain('binary_download')
    expect(types).toContain('environment_access')
  })

  it('filters out empty lines', () => {
    const log = ['line 1', '', 'line 3'].join('\n')
    const events = parseDockerExecLog(log)
    expect(events.every((e) => e !== null)).toBe(true)
  })
})

describe('buildSummary', () => {
  it('counts events by severity', () => {
    const summary = buildSummary(npmInstallEvents)
    expect(summary.totalEvents).toBe(8)
    expect(summary.bySeverity.info).toBe(8)
    expect(summary.bySeverity.warning).toBe(0)
    expect(summary.bySeverity.critical).toBe(0)
  })

  it('sets low risk for all-clear events', () => {
    const summary = buildSummary(npmInstallEvents)
    expect(summary.riskLevel).toBe('low')
    expect(summary.flags).toHaveLength(0)
  })

  it('sets high risk when critical events exist', () => {
    const summary = buildSummary(suspiciousInstallEvents)
    expect(summary.riskLevel).toBe('high')
  })

  it('flags suspicious behaviors', () => {
    const summary = buildSummary(suspiciousInstallEvents)
    expect(summary.flags.length).toBeGreaterThan(0)
    expect(summary.flags.some((f) => f.toLowerCase().includes('binary'))).toBe(true)
    expect(summary.flags.some((f) => f.includes('NPM_TOKEN'))).toBe(true)
    expect(summary.flags.some((f) => f.includes('AWS_SECRET'))).toBe(true)
  })

  it('counts events by type', () => {
    const summary = buildSummary(npmInstallEvents)
    expect(summary.byType.process_execution).toBe(1)
    expect(summary.byType.network_request).toBe(2)
    expect(summary.byType.filesystem_mutation).toBe(3)
  })
})

describe('createReport', () => {
  it('creates a complete BehaviorReport', () => {
    const report = createReport('sandbox-1', 'is-odd', npmInstallEvents, 5000)
    expect(report.sandboxId).toBe('sandbox-1')
    expect(report.packageName).toBe('is-odd')
    expect(report.durationMs).toBe(5000)
    expect(report.events).toEqual(npmInstallEvents)
    expect(report.summary.totalEvents).toBe(8)
  })
})
