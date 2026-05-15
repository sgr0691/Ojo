import type { AgentRuntimeRequest, AgentRuntimeContext, RuntimeDecision } from './types'
import { outcomeToDecision, type PolicyResult, type PolicyOutcome } from './policy'

export interface ReceiptTimestamps {
  requestedAt: number
  decidedAt: number
}

export interface EvidenceSummary {
  outcome: PolicyOutcome
  rule: string
  reason: string
  triggered: boolean
}

export interface ExecutionReceipt {
  receiptId: string
  requestId: string
  sourceAgent?: string
  decision: RuntimeDecision
  timestamps: ReceiptTimestamps
  evidenceSummary: EvidenceSummary
}

export interface CreateReceiptParams {
  request: AgentRuntimeRequest
  context: AgentRuntimeContext
  policyResult: PolicyResult
  decidedAt?: number
}

let _counter = 0

function generateReceiptId(): string {
  return `receipt-${Date.now()}-${(++_counter).toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export function createReceipt({
  request,
  context,
  policyResult,
  decidedAt = Date.now(),
}: CreateReceiptParams): ExecutionReceipt {
  return {
    receiptId: generateReceiptId(),
    requestId: request.id,
    sourceAgent: context.agentId,
    decision: outcomeToDecision(policyResult.outcome),
    timestamps: {
      requestedAt: request.requestedAt,
      decidedAt,
    },
    evidenceSummary: {
      outcome: policyResult.outcome,
      rule: policyResult.rule,
      reason: policyResult.reason,
      triggered: policyResult.rule !== 'default',
    },
  }
}
