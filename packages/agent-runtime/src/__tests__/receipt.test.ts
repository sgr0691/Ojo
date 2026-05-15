import { describe, it, expect } from 'vitest'
import { createReceipt, type ExecutionReceipt } from '../receipt'
import type { AgentRuntimeRequest, AgentRuntimeContext } from '../types'
import type { PolicyResult } from '../policy'

const ctx: AgentRuntimeContext = {
  agentId: 'claude-code',
  sessionId: 'session-100',
  workspaceRoot: '/home/user/project',
  environment: 'development',
}

function makeRequest(overrides?: Partial<AgentRuntimeRequest>): AgentRuntimeRequest {
  return {
    id: 'req-001',
    type: 'shell_command',
    payload: { command: 'ls -la' },
    requestedAt: 1000,
    ...overrides,
  }
}

function makePolicyResult(overrides?: Partial<PolicyResult>): PolicyResult {
  return {
    outcome: 'allow',
    rule: 'default',
    reason: 'No policy rules triggered',
    ...overrides,
  }
}

// ─── receiptId ────────────────────────────────────────────────────────────────

describe('ExecutionReceipt receiptId', () => {
  it('generates a receiptId starting with "receipt-"', () => {
    const receipt = createReceipt({ request: makeRequest(), context: ctx, policyResult: makePolicyResult() })
    expect(receipt.receiptId).toMatch(/^receipt-/)
  })

  it('generates unique receiptIds for separate calls', () => {
    const r1 = createReceipt({ request: makeRequest(), context: ctx, policyResult: makePolicyResult() })
    const r2 = createReceipt({ request: makeRequest(), context: ctx, policyResult: makePolicyResult() })
    expect(r1.receiptId).not.toBe(r2.receiptId)
  })
})

// ─── requestId ────────────────────────────────────────────────────────────────

describe('ExecutionReceipt requestId', () => {
  it('copies requestId from the request', () => {
    const req = makeRequest({ id: 'req-xyz-999' })
    const receipt = createReceipt({ request: req, context: ctx, policyResult: makePolicyResult() })
    expect(receipt.requestId).toBe('req-xyz-999')
  })
})

// ─── sourceAgent ──────────────────────────────────────────────────────────────

describe('ExecutionReceipt sourceAgent', () => {
  it('sets sourceAgent from context.agentId', () => {
    const receipt = createReceipt({ request: makeRequest(), context: ctx, policyResult: makePolicyResult() })
    expect(receipt.sourceAgent).toBe('claude-code')
  })

  it('sourceAgent reflects different agents', () => {
    const codexCtx: AgentRuntimeContext = { ...ctx, agentId: 'codex' }
    const receipt = createReceipt({ request: makeRequest(), context: codexCtx, policyResult: makePolicyResult() })
    expect(receipt.sourceAgent).toBe('codex')
  })
})

// ─── decision ────────────────────────────────────────────────────────────────

describe('ExecutionReceipt decision', () => {
  it('maps allow outcome to allow decision', () => {
    const receipt = createReceipt({ request: makeRequest(), context: ctx, policyResult: makePolicyResult({ outcome: 'allow' }) })
    expect(receipt.decision).toBe('allow')
  })

  it('maps warn outcome to allow decision', () => {
    const receipt = createReceipt({ request: makeRequest(), context: ctx, policyResult: makePolicyResult({ outcome: 'warn', rule: 'test' }) })
    expect(receipt.decision).toBe('allow')
  })

  it('maps require_approval outcome to approval_required decision', () => {
    const receipt = createReceipt({
      request: makeRequest(),
      context: ctx,
      policyResult: makePolicyResult({ outcome: 'require_approval', rule: 'sensitive_file', reason: 'test' }),
    })
    expect(receipt.decision).toBe('approval_required')
  })

  it('maps block outcome to block decision', () => {
    const receipt = createReceipt({
      request: makeRequest(),
      context: ctx,
      policyResult: makePolicyResult({ outcome: 'block', rule: 'rm_rf', reason: 'test' }),
    })
    expect(receipt.decision).toBe('block')
  })
})

// ─── timestamps ───────────────────────────────────────────────────────────────

describe('ExecutionReceipt timestamps', () => {
  it('sets timestamps.requestedAt from request.requestedAt', () => {
    const req = makeRequest({ requestedAt: 5000 })
    const receipt = createReceipt({ request: req, context: ctx, policyResult: makePolicyResult() })
    expect(receipt.timestamps.requestedAt).toBe(5000)
  })

  it('sets timestamps.decidedAt to approximately now', () => {
    const before = Date.now()
    const receipt = createReceipt({ request: makeRequest(), context: ctx, policyResult: makePolicyResult() })
    expect(receipt.timestamps.decidedAt).toBeGreaterThanOrEqual(before)
    expect(receipt.timestamps.decidedAt).toBeLessThanOrEqual(Date.now() + 10)
  })

  it('accepts an explicit decidedAt override', () => {
    const receipt = createReceipt({ request: makeRequest(), context: ctx, policyResult: makePolicyResult(), decidedAt: 99999 })
    expect(receipt.timestamps.decidedAt).toBe(99999)
  })
})

// ─── evidenceSummary ──────────────────────────────────────────────────────────

describe('ExecutionReceipt evidenceSummary', () => {
  it('includes outcome in evidenceSummary', () => {
    const receipt = createReceipt({ request: makeRequest(), context: ctx, policyResult: makePolicyResult({ outcome: 'block', rule: 'rm_rf', reason: 'test' }) })
    expect(receipt.evidenceSummary.outcome).toBe('block')
  })

  it('includes rule in evidenceSummary', () => {
    const receipt = createReceipt({ request: makeRequest(), context: ctx, policyResult: makePolicyResult({ rule: 'curl_pipe_sh', outcome: 'block', reason: 'test' }) })
    expect(receipt.evidenceSummary.rule).toBe('curl_pipe_sh')
  })

  it('includes reason in evidenceSummary', () => {
    const reason = 'Remote content piped into shell: curl x | sh'
    const receipt = createReceipt({ request: makeRequest(), context: ctx, policyResult: makePolicyResult({ rule: 'curl_pipe_sh', outcome: 'block', reason }) })
    expect(receipt.evidenceSummary.reason).toBe(reason)
  })

  it('evidenceSummary.triggered is false when no rules fired', () => {
    const receipt = createReceipt({ request: makeRequest(), context: ctx, policyResult: makePolicyResult() })
    expect(receipt.evidenceSummary.triggered).toBe(false)
  })

  it('evidenceSummary.triggered is true when a rule fired', () => {
    const receipt = createReceipt({ request: makeRequest(), context: ctx, policyResult: makePolicyResult({ outcome: 'block', rule: 'rm_rf', reason: 'test' }) })
    expect(receipt.evidenceSummary.triggered).toBe(true)
  })
})
