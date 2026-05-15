import type {
  BehaviorEvent,
  BehaviorEventType,
  BehaviorReport,
  EvidenceSource,
  ExecutionEvidenceInput,
} from './types'
import { createReport, buildSummary } from './normalize'

const SUSPICIOUS_PATTERNS = [
  'base64 -d',
  'eval(',
  'chmod +x',
  '/dev/tcp',
  'mkfifo',
  'openssl enc',
]

const SENSITIVE_KEYS = ['token', 'secret', 'password', 'credential']

const WHITELISTED_HOSTS = [
  'registry.npmjs.org',
  'registry.yarnpkg.com',
  'objects.githubusercontent.com',
  'github.com',
  'raw.githubusercontent.com',
]

export function fromExecution(input: ExecutionEvidenceInput): BehaviorReport {
  const output = input.stdout + '\n' + input.stderr
  const lower = output.toLowerCase()
  const events: BehaviorEvent[] = []
  const ts = Date.now()

  events.push({
    type: 'process_execution',
    timestamp: ts,
    severity: input.exitCode === 0 ? 'info' : 'warning',
    source: 'inferred',
    sourceDetail: 'captured from sandbox execution',
    pid: 1,
    command: input.packageManager,
    args: ['install', ...input.packagesRequested],
    exitCode: input.exitCode,
  })

  const hasLifecycle =
    lower.includes('postinstall') ||
    lower.includes('preinstall') ||
    lower.includes('prepare')

  if (hasLifecycle) {
    const detected = lower.includes('postinstall') ? 'postinstall' : 'install'
    events.push({
      type: 'lifecycle_script',
      timestamp: ts + 100,
      severity: 'info',
      source: 'inferred',
      sourceDetail: 'matched lifecycle keyword in install output',
      scriptType: detected,
      command: `${input.packageManager} lifecycle script`,
    })
  }

  const hasCurlWget = /\b(curl|wget)\b/.test(lower)
  const urls = output.match(/https?:\/\/[^\s'"<>]+/g) ?? []
  const suspiciousUrl = urls.find(
    (u) => !WHITELISTED_HOSTS.some((w) => u.includes(w)),
  )

  if (hasCurlWget || suspiciousUrl) {
    events.push({
      type: 'binary_download',
      timestamp: ts + 200,
      severity: 'warning',
      source: 'inferred',
      sourceDetail: suspiciousUrl
        ? 'non-registry URL detected in output'
        : 'curl/wget binary name detected in output',
      url: suspiciousUrl ?? 'unknown',
      destinationPath: '/tmp/download',
    })
  }

  for (const pattern of SUSPICIOUS_PATTERNS) {
    if (lower.includes(pattern)) {
      events.push({
        type: 'process_execution',
        timestamp: ts + 300,
        severity: 'warning',
        source: 'inferred',
        sourceDetail: `matched suspicious pattern "${pattern}" in output`,
        pid: 2,
        command: 'sh',
        args: ['-c', pattern],
      })
    }
  }

  for (const key of SENSITIVE_KEYS) {
    if (lower.includes(key)) {
      events.push({
        type: 'environment_access',
        timestamp: ts + 400,
        severity: 'warning',
        source: 'inferred',
        sourceDetail: `matched sensitive key "${key}" in output`,
        key: key.toUpperCase(),
      })
    }
  }

  const availableSignals: Record<BehaviorEventType, EvidenceSource> = {
    process_execution: 'inferred',
    filesystem_mutation: 'unavailable',
    network_request: 'unavailable',
    lifecycle_script: 'inferred',
    binary_download: 'inferred',
    environment_access: 'inferred',
  }

  return {
    sandboxId: input.sandboxId,
    packageName: input.packageName,
    durationMs: input.durationMs,
    events,
    summary: buildSummary(events),
    availableSignals,
  }
}
