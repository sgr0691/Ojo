export type EvidenceSource = 'real' | 'inferred' | 'unavailable'

export interface ExecutionEvidenceInput {
  sandboxId: string
  packageName: string
  exitCode: number
  stdout: string
  stderr: string
  durationMs: number
  packageManager: string
  packagesRequested: string[]
}

export type EventSeverity = 'info' | 'warning' | 'critical'

export type Timestamp = number

interface EventBase {
  timestamp: Timestamp
  severity: EventSeverity
  source?: EvidenceSource
  sourceDetail?: string
}

export type FsOperationType = 'write' | 'delete' | 'chmod' | 'rename' | 'mkdir'

export interface ProcessExecutionEvent extends EventBase {
  type: 'process_execution'
  pid: number
  command: string
  args: string[]
  exitCode?: number
}

export interface FilesystemMutationEvent extends EventBase {
  type: 'filesystem_mutation'
  operation: FsOperationType
  path: string
  size?: number
}

export type Protocol = 'http' | 'https' | 'tcp' | 'dns'

export interface NetworkRequestEvent extends EventBase {
  type: 'network_request'
  protocol: Protocol
  host: string
  port?: number
  path?: string
  method?: string
}

export type ScriptType = 'preinstall' | 'install' | 'postinstall' | 'preuninstall' | 'prepack'

export interface LifecycleScriptEvent extends EventBase {
  type: 'lifecycle_script'
  scriptType: ScriptType
  command: string
  exitCode?: number
}

export interface BinaryDownloadEvent extends EventBase {
  type: 'binary_download'
  url: string
  destinationPath: string
  size?: number
}

export interface EnvironmentAccessEvent extends EventBase {
  type: 'environment_access'
  key: string
}

export type BehaviorEvent =
  | ProcessExecutionEvent
  | FilesystemMutationEvent
  | NetworkRequestEvent
  | LifecycleScriptEvent
  | BinaryDownloadEvent
  | EnvironmentAccessEvent

export type BehaviorEventType = BehaviorEvent['type']

export interface BehaviorSummary {
  totalEvents: number
  bySeverity: Record<EventSeverity, number>
  byType: Record<BehaviorEventType, number>
  riskLevel: 'low' | 'medium' | 'high'
  flags: string[]
}

export interface BehaviorReport {
  sandboxId: string
  packageName: string
  durationMs: number
  events: BehaviorEvent[]
  summary: BehaviorSummary
  availableSignals: Record<BehaviorEventType, EvidenceSource>
}
