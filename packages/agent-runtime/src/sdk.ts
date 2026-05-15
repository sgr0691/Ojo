import type { AgentRuntimeRequest, AgentRuntimeContext, RuntimeActionType } from './types'
import { evaluate as policyEvaluate, type PolicyResult } from './policy'
import { initiateApproval, type ApprovalState, type ApprovalOptions } from './approval'
import { createReceipt, type ExecutionReceipt } from './receipt'

export interface OjoRuntimeOptions extends ApprovalOptions {
  agentId?: string
  sessionId?: string
  workspaceRoot?: string
  environment?: AgentRuntimeContext['environment']
}

export interface OjoEvaluateInput {
  actionType: RuntimeActionType
  [key: string]: unknown
}

export interface OjoEvaluateResult {
  requestId: string
  policyResult: PolicyResult
  approvalState: ApprovalState
  receipt: ExecutionReceipt
}

let _reqCounter = 0

function generateRequestId(): string {
  return `req-${Date.now()}-${(++_reqCounter).toString(36)}`
}

export class OjoRuntime {
  private readonly context: AgentRuntimeContext
  private readonly options: OjoRuntimeOptions

  constructor(options: OjoRuntimeOptions = {}) {
    this.options = options
    this.context = {
      agentId: options.agentId ?? 'unknown',
      sessionId: options.sessionId ?? 'unknown',
      workspaceRoot: options.workspaceRoot ?? process.cwd(),
      environment: options.environment ?? 'development',
    }
  }

  async evaluate(input: OjoEvaluateInput): Promise<OjoEvaluateResult> {
    const { actionType, ...payloadFields } = input

    const request: AgentRuntimeRequest = {
      id: generateRequestId(),
      type: actionType,
      agentId: this.context.agentId,
      sessionId: this.context.sessionId,
      payload: payloadFields,
      requestedAt: Date.now(),
    }

    const policyResult = policyEvaluate(request)
    const approvalRequest = initiateApproval(request, policyResult, { ci: this.options.ci })
    const receipt = createReceipt({ request, context: this.context, policyResult })

    return {
      requestId: request.id,
      policyResult,
      approvalState: approvalRequest.state,
      receipt,
    }
  }
}
