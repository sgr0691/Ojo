import type {
  BehaviorEvent,
  BehaviorEventType,
  BehaviorReport,
  BehaviorSummary,
  EvidenceSource,
  EventSeverity,
  FilesystemMutationEvent,
  FsOperationType,
  LifecycleScriptEvent,
  NetworkRequestEvent,
  ProcessExecutionEvent,
  ScriptType,
  Timestamp,
} from './types'

export function now(): Timestamp {
  return Date.now()
}

export function severityFromExitCode(code: number | undefined): EventSeverity {
  if (code === undefined || code === 0) return 'info'
  if (code === 1) return 'warning'
  return 'critical'
}

export function severityFromPath(path: string): EventSeverity {
  const low = path.toLowerCase()
  if (
    low.includes('.env') ||
    low.includes('credential') ||
    low.includes('secret') ||
    low.includes('authorized_keys') ||
    low.includes('id_rsa') ||
    low.includes('.docker/config.json')
  ) {
    return 'critical'
  }
  if (
    low.includes('.git/config') ||
    low.includes('.npmrc') ||
    low.includes('.ssh')
  ) {
    return 'warning'
  }
  return 'info'
}

export function severityFromHost(host: string): EventSeverity {
  const known = [
    'registry.npmjs.org',
    'registry.yarnpkg.com',
    'github.com',
    'raw.githubusercontent.com',
    'api.github.com',
    'objects.githubusercontent.com',
  ]
  if (known.some((k) => host.endsWith(k) || host === k)) return 'info'
  if (host.match(/^\d+\.\d+\.\d+\.\d+$/)) return 'warning'
  return 'info'
}

export function isSensitiveKey(key: string): boolean {
  const patterns = [
    /token/i,
    /secret/i,
    /password/i,
    /key/i,
    /credential/i,
    /auth/i,
    /api_key/i,
    /access_key/i,
  ]
  return patterns.some((p) => p.test(key))
}

export function detectScriptType(command: string): ScriptType {
  const c = command.toLowerCase()
  if (c.includes('preinstall')) return 'preinstall'
  if (c.includes('postinstall')) return 'postinstall'
  if (c.includes('preuninstall')) return 'preuninstall'
  if (c.includes('prepack')) return 'prepack'
  if (c.includes('install')) return 'install'
  return 'install'
}

export function detectOperationType(args: string[]): FsOperationType {
  const cmd = args.join(' ').toLowerCase()
  if (cmd.startsWith('rm') || cmd.startsWith('del')) return 'delete'
  if (cmd.startsWith('chmod') || cmd.startsWith('chown')) return 'chmod'
  if (cmd.startsWith('mv') || cmd.startsWith('rename')) return 'rename'
  if (cmd.startsWith('mkdir')) return 'mkdir'
  return 'write'
}

export function parseDockerExecLogLine(line: string, index: number): BehaviorEvent | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  const ts = now() - index * 100

  const procMatch = trimmed.match(
    /^\[(\d+)\]\s+(\S+)\s+(.+)$/,
  )
  if (procMatch) {
    const pid = parseInt(procMatch[1], 10)
    const command = procMatch[2]
    const rest = procMatch[3].trim()
    const event: ProcessExecutionEvent = {
      type: 'process_execution',
      timestamp: ts,
      severity: 'info',
      pid,
      command,
      args: rest ? rest.split(/\s+/) : [],
    }
    return event
  }

  const fsMatch = trimmed.match(
    /^(write|delete|chmod|rename|mkdir)\s+(.+)$/i,
  )
  if (fsMatch) {
    const event: FilesystemMutationEvent = {
      type: 'filesystem_mutation',
      timestamp: ts,
      severity: severityFromPath(fsMatch[2]),
      operation: fsMatch[1].toLowerCase() as FsOperationType,
      path: fsMatch[2],
    }
    return event
  }

  const netMatch = trimmed.match(
    /^(https?|tcp|dns)\s+(\S+)(?:\s+(\S+))?(?:\s+(\S+))?$/i,
  )
  if (netMatch) {
    const host = netMatch[2]
    const third = netMatch[3]
    const fourth = netMatch[4]

    let port: number | undefined
    let path: string | undefined
    let method: string | undefined

    if (third) {
      const asNum = parseInt(third, 10)
      if (!isNaN(asNum) && third.length < 6) {
        port = asNum
        path = fourth || undefined
      } else {
        path = third
        method = fourth || undefined
      }
    }

    const event: NetworkRequestEvent = {
      type: 'network_request',
      timestamp: ts,
      severity: severityFromHost(host),
      protocol: netMatch[1].toLowerCase() as NetworkRequestEvent['protocol'],
      host,
      port,
      path,
      method,
    }
    return event
  }

  const lifecycleMatch = trimmed.match(
    /^(preinstall|install|postinstall|preuninstall|prepack)\s+(.+)/i,
  )
  if (lifecycleMatch) {
    const event: LifecycleScriptEvent = {
      type: 'lifecycle_script',
      timestamp: ts,
      severity: 'info',
      scriptType: lifecycleMatch[1].toLowerCase() as ScriptType,
      command: lifecycleMatch[2],
    }
    return event
  }

  const downloadMatch = trimmed.match(
    /^download\s+(\S+)\s+->\s+(.+)$/i,
  )
  if (downloadMatch) {
    return {
      type: 'binary_download',
      timestamp: ts,
      severity: 'warning',
      url: downloadMatch[1],
      destinationPath: downloadMatch[2],
    }
  }

  const envMatch = trimmed.match(
    /^env\s+(\S+)/i,
  )
  if (envMatch) {
    return {
      type: 'environment_access',
      timestamp: ts,
      severity: isSensitiveKey(envMatch[1]) ? 'warning' : 'info',
      key: envMatch[1],
    }
  }

  return null
}

export function parseDockerExecLog(raw: string): BehaviorEvent[] {
  return raw
    .split('\n')
    .map((line, i) => parseDockerExecLogLine(line, i))
    .filter((e): e is BehaviorEvent => e !== null)
}

export function buildSummary(events: BehaviorEvent[]): BehaviorSummary {
  const bySeverity: Record<EventSeverity, number> = {
    info: 0,
    warning: 0,
    critical: 0,
  }

  const byType = {} as Record<BehaviorEventType, number>
  const flags: string[] = []

  for (const event of events) {
    bySeverity[event.severity] = (bySeverity[event.severity] ?? 0) + 1
    byType[event.type] = (byType[event.type] ?? 0) + 1

    if (event.type === 'network_request') {
      if (event.severity === 'warning') {
        flags.push(`Unexpected outbound request to ${event.host}`)
      }
    }

    if (event.type === 'binary_download') {
      flags.push(`Binary downloaded from ${event.url}`)
    }

    if (event.type === 'environment_access' && event.severity === 'warning') {
      flags.push(`Sensitive environment variable accessed: ${event.key}`)
    }

    if (event.type === 'filesystem_mutation' && event.severity === 'critical') {
      flags.push(`Suspicious file write: ${event.path}`)
    }
  }

  let riskLevel: BehaviorSummary['riskLevel'] = 'low'
  if (bySeverity.critical > 0) riskLevel = 'high'
  else if (bySeverity.warning >= 3) riskLevel = 'high'
  else if (bySeverity.warning > 0) riskLevel = 'medium'

  return {
    totalEvents: events.length,
    bySeverity,
    byType,
    riskLevel,
    flags,
  }
}

export function createReport(
  sandboxId: string,
  packageName: string,
  events: BehaviorEvent[],
  durationMs: number,
  availableSignals?: Partial<Record<BehaviorEventType, EvidenceSource>>,
): BehaviorReport {
  const defaults: BehaviorReport['availableSignals'] = {
    process_execution: 'unavailable',
    filesystem_mutation: 'unavailable',
    network_request: 'unavailable',
    lifecycle_script: 'unavailable',
    binary_download: 'unavailable',
    environment_access: 'unavailable',
  }

  return {
    sandboxId,
    packageName,
    durationMs,
    events,
    summary: buildSummary(events),
    availableSignals: { ...defaults, ...availableSignals },
  }
}
