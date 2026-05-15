export const RUNTIME_ACTION_TYPES = [
  'package_install',
  'shell_command',
  'file_mutation',
  'network_access',
] as const

export type RuntimeActionType = (typeof RUNTIME_ACTION_TYPES)[number]

export const RUNTIME_DECISIONS = ['allow', 'block', 'approval_required'] as const

export type RuntimeDecision = (typeof RUNTIME_DECISIONS)[number]

export interface AgentRuntimeRequest {
  id: string
  type: RuntimeActionType
  agentId?: string
  sessionId?: string
  payload: Record<string, unknown>
  requestedAt: number
}

export interface AgentRuntimeContext {
  agentId: string
  sessionId: string
  workspaceRoot: string
  environment: 'development' | 'ci' | 'production'
  policyVersion?: string
}

export interface RuntimeExecutionReceipt {
  requestId: string
  request: AgentRuntimeRequest
  context: AgentRuntimeContext
  decision: RuntimeDecision
  decidedAt: number
  executedAt?: number
  completedAt?: number
  evidence?: Record<string, unknown>
  error?: string
}
