export type {
  BehaviorEvent,
  BehaviorEventType,
  BehaviorReport,
  BehaviorSummary,
  EventSeverity,
  EvidenceSource,
  ExecutionEvidenceInput,
  Timestamp,
  FsOperationType,
  Protocol,
  ScriptType,
  ProcessExecutionEvent,
  FilesystemMutationEvent,
  NetworkRequestEvent,
  LifecycleScriptEvent,
  BinaryDownloadEvent,
  EnvironmentAccessEvent,
} from './types'

export {
  parseDockerExecLog,
  parseDockerExecLogLine,
  buildSummary,
  createReport,
  now,
  severityFromExitCode,
  severityFromPath,
  severityFromHost,
  isSensitiveKey,
  detectScriptType,
  detectOperationType,
} from './normalize'

export { fromExecution } from './evidence'

export {
  npmInstallEvents,
  suspiciousInstallEvents,
  maliciousNetworkEvents,
  cleanReport,
  makeReport,
  rawLogSample,
} from './fixtures'
