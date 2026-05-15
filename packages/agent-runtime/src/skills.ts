import type { AgentRuntimeRequest, AgentRuntimeContext, RuntimeDecision, RuntimeActionType, RuntimeExecutionReceipt } from './types'
import { evaluate as policyEvaluate, type PolicyResult } from './policy'

export interface Skill {
  readonly actionType: RuntimeActionType
  canHandle(request: AgentRuntimeRequest): boolean
  describe(request: AgentRuntimeRequest): string
}

export interface EvaluatingSkill extends Skill {
  evaluate(request: AgentRuntimeRequest): PolicyResult
  buildReceipt(
    request: AgentRuntimeRequest,
    context: AgentRuntimeContext,
    policyResult: PolicyResult,
    decidedAt?: number,
  ): RuntimeExecutionReceipt
}

// ─── Outcome → RuntimeDecision ────────────────────────────────────────────────

function toDecision(outcome: PolicyResult['outcome']): RuntimeDecision {
  if (outcome === 'block') return 'block'
  if (outcome === 'require_approval') return 'approval_required'
  return 'allow' // 'allow' and 'warn' both permit execution
}

// ─── PackageInstallSkill ──────────────────────────────────────────────────────

export class PackageInstallSkill implements Skill {
  readonly actionType: RuntimeActionType = 'package_install'

  canHandle(request: AgentRuntimeRequest): boolean {
    return request.type === 'package_install'
  }

  describe(request: AgentRuntimeRequest): string {
    const pkgs = request.payload.packages
    if (Array.isArray(pkgs) && pkgs.length > 0) {
      return `install ${(pkgs as string[]).join(' ')}`
    }
    return 'install (project dependencies)'
  }
}

// ─── ShellCommandSkill ────────────────────────────────────────────────────────

export class ShellCommandSkill implements EvaluatingSkill {
  readonly actionType: RuntimeActionType = 'shell_command'

  canHandle(request: AgentRuntimeRequest): boolean {
    return request.type === 'shell_command'
  }

  describe(request: AgentRuntimeRequest): string {
    const cmd = request.payload.command
    return `run: ${typeof cmd === 'string' ? cmd : '(unknown command)'}`
  }

  evaluate(request: AgentRuntimeRequest): PolicyResult {
    return policyEvaluate(request)
  }

  buildReceipt(
    request: AgentRuntimeRequest,
    context: AgentRuntimeContext,
    policyResult: PolicyResult,
    decidedAt = Date.now(),
  ): RuntimeExecutionReceipt {
    // Redact command payload if token scraping was detected — don't persist secret variable names.
    const sanitizedPayload =
      policyResult.rule === 'token_scraping'
        ? { ...request.payload, command: '[REDACTED] - contained sensitive variable reference' }
        : { ...request.payload }

    return {
      requestId: request.id,
      request: { ...request, payload: sanitizedPayload },
      context,
      decision: toDecision(policyResult.outcome),
      decidedAt,
      evidence: { rule: policyResult.rule, reason: policyResult.reason, outcome: policyResult.outcome },
    }
  }
}

// ─── FileMutationSkill ────────────────────────────────────────────────────────

export class FileMutationSkill implements EvaluatingSkill {
  readonly actionType: RuntimeActionType = 'file_mutation'

  canHandle(request: AgentRuntimeRequest): boolean {
    return request.type === 'file_mutation'
  }

  describe(request: AgentRuntimeRequest): string {
    const op = typeof request.payload.operation === 'string' ? request.payload.operation : 'modify'
    const path = typeof request.payload.path === 'string' ? request.payload.path : '(unknown path)'
    return `${op} ${path}`
  }

  evaluate(request: AgentRuntimeRequest): PolicyResult {
    return policyEvaluate(request)
  }

  buildReceipt(
    request: AgentRuntimeRequest,
    context: AgentRuntimeContext,
    policyResult: PolicyResult,
    decidedAt = Date.now(),
  ): RuntimeExecutionReceipt {
    // Strip file content from receipts — content may be sensitive and audit logs should not store it.
    const { content: _content, ...safePayload } = request.payload

    return {
      requestId: request.id,
      request: { ...request, payload: safePayload },
      context,
      decision: toDecision(policyResult.outcome),
      decidedAt,
      evidence: { rule: policyResult.rule, reason: policyResult.reason, outcome: policyResult.outcome },
    }
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createSkill(actionType: RuntimeActionType): Skill {
  switch (actionType) {
    case 'package_install':
      return new PackageInstallSkill()
    case 'shell_command':
      return new ShellCommandSkill()
    case 'file_mutation':
      return new FileMutationSkill()
    default:
      throw new Error(`No skill implemented for action type: "${actionType}"`)
  }
}
