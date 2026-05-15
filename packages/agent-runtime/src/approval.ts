import type { AgentRuntimeRequest } from './types'
import type { PolicyResult, PolicyOutcome } from './policy'

export const APPROVAL_STATES = ['not_required', 'pending', 'approved', 'denied', 'auto_blocked'] as const

export type ApprovalState = (typeof APPROVAL_STATES)[number]

export interface ApprovalRequest {
  requestId: string
  description: string
  policyOutcome: PolicyOutcome
  state: ApprovalState
}

export interface ApprovalOptions {
  ci?: boolean
}

function isCiMode(options?: ApprovalOptions): boolean {
  return options?.ci === true || process.env.OJO_CI === 'true' || process.env.OJO_CI === '1'
}

export function initiateApproval(
  request: AgentRuntimeRequest,
  policyResult: PolicyResult,
  options?: ApprovalOptions,
): ApprovalRequest {
  let state: ApprovalState

  if (policyResult.outcome === 'block') {
    state = 'auto_blocked'
  } else if (policyResult.outcome === 'require_approval') {
    state = isCiMode(options) ? 'auto_blocked' : 'pending'
  } else {
    // 'allow' and 'warn' — no human gate needed
    state = 'not_required'
  }

  return {
    requestId: request.id,
    description: policyResult.reason,
    policyOutcome: policyResult.outcome,
    state,
  }
}

export function resolveApproval(approvalRequest: ApprovalRequest, approved: boolean): ApprovalRequest {
  if (approvalRequest.state !== 'pending') {
    throw new Error(
      `Cannot resolve approval in state "${approvalRequest.state}" — only "pending" approvals can be resolved`,
    )
  }

  return { ...approvalRequest, state: approved ? 'approved' : 'denied' }
}
