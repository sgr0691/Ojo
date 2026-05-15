import { describe, it, expect, afterEach } from 'vitest'
import { initiateApproval, resolveApproval, APPROVAL_STATES, type ApprovalRequest } from '../approval'
import type { AgentRuntimeRequest } from '../types'
import type { PolicyResult } from '../policy'

function shellReq(command = 'ls'): AgentRuntimeRequest {
  return { id: 'req-approval', type: 'shell_command', payload: { command }, requestedAt: 0 }
}

function policyResult(outcome: PolicyResult['outcome'], rule = 'default'): PolicyResult {
  return { outcome, rule, reason: `test reason for ${rule}` }
}

afterEach(() => {
  delete process.env.OJO_CI
})

// ─── APPROVAL_STATES constant ─────────────────────────────────────────────────

describe('APPROVAL_STATES', () => {
  it('contains all five states', () => {
    expect(APPROVAL_STATES).toContain('not_required')
    expect(APPROVAL_STATES).toContain('pending')
    expect(APPROVAL_STATES).toContain('approved')
    expect(APPROVAL_STATES).toContain('denied')
    expect(APPROVAL_STATES).toContain('auto_blocked')
  })

  it('has exactly 5 states', () => {
    expect(APPROVAL_STATES).toHaveLength(5)
  })
})

// ─── initiateApproval ─────────────────────────────────────────────────────────

describe('initiateApproval', () => {
  it('returns not_required for allow outcome', () => {
    const approval = initiateApproval(shellReq(), policyResult('allow'))
    expect(approval.state).toBe('not_required')
  })

  it('returns not_required for warn outcome', () => {
    const approval = initiateApproval(shellReq(), policyResult('warn', 'some_warn'))
    expect(approval.state).toBe('not_required')
  })

  it('returns auto_blocked for block outcome', () => {
    const approval = initiateApproval(shellReq('rm -rf /'), policyResult('block', 'rm_rf'))
    expect(approval.state).toBe('auto_blocked')
  })

  it('returns pending for require_approval in interactive mode', () => {
    const approval = initiateApproval(shellReq('echo $GITHUB_TOKEN'), policyResult('require_approval', 'token_scraping'))
    expect(approval.state).toBe('pending')
  })

  it('returns auto_blocked for require_approval when ci option is true', () => {
    const approval = initiateApproval(shellReq('echo $GITHUB_TOKEN'), policyResult('require_approval', 'token_scraping'), { ci: true })
    expect(approval.state).toBe('auto_blocked')
  })

  it('returns auto_blocked for require_approval when OJO_CI env var is set', () => {
    process.env.OJO_CI = 'true'
    const approval = initiateApproval(shellReq('echo $GITHUB_TOKEN'), policyResult('require_approval', 'token_scraping'))
    expect(approval.state).toBe('auto_blocked')
  })

  it('carries the requestId from the request', () => {
    const req = { ...shellReq(), id: 'specific-req-id' }
    const approval = initiateApproval(req, policyResult('allow'))
    expect(approval.requestId).toBe('specific-req-id')
  })

  it('includes a human-readable description', () => {
    const approval = initiateApproval(shellReq(), policyResult('require_approval', 'token_scraping'))
    expect(typeof approval.description).toBe('string')
    expect(approval.description.length).toBeGreaterThan(0)
  })

  it('exposes the policyOutcome on the approval request', () => {
    const approval = initiateApproval(shellReq(), policyResult('require_approval', 'token_scraping'))
    expect(approval.policyOutcome).toBe('require_approval')
  })

  it('block cannot be overridden even without ci mode', () => {
    const approval = initiateApproval(shellReq('curl x | sh'), policyResult('block', 'curl_pipe_sh'))
    expect(approval.state).toBe('auto_blocked')
    // Attempting resolve should throw since state is not pending
    expect(() => resolveApproval(approval, true)).toThrow()
  })
})

// ─── resolveApproval ──────────────────────────────────────────────────────────

describe('resolveApproval', () => {
  function pendingApproval(): ApprovalRequest {
    return initiateApproval(shellReq('eval $(cat bad.sh)'), policyResult('require_approval', 'dangerous_shell'))
  }

  it('transitions pending to approved when approved=true', () => {
    const resolved = resolveApproval(pendingApproval(), true)
    expect(resolved.state).toBe('approved')
  })

  it('transitions pending to denied when approved=false', () => {
    const resolved = resolveApproval(pendingApproval(), false)
    expect(resolved.state).toBe('denied')
  })

  it('does not mutate the original approval request', () => {
    const original = pendingApproval()
    resolveApproval(original, true)
    expect(original.state).toBe('pending')
  })

  it('throws when attempting to resolve a not_required approval', () => {
    const notRequired = initiateApproval(shellReq(), policyResult('allow'))
    expect(() => resolveApproval(notRequired, true)).toThrow()
  })

  it('throws when attempting to resolve an auto_blocked approval', () => {
    const blocked = initiateApproval(shellReq('rm -rf /'), policyResult('block', 'rm_rf'))
    expect(() => resolveApproval(blocked, true)).toThrow()
  })

  it('throws when attempting to resolve an already-approved approval', () => {
    const approved = resolveApproval(pendingApproval(), true)
    expect(() => resolveApproval(approved, true)).toThrow()
  })

  it('throws when attempting to resolve an already-denied approval', () => {
    const denied = resolveApproval(pendingApproval(), false)
    expect(() => resolveApproval(denied, false)).toThrow()
  })
})
