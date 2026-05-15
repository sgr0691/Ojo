import { describe, it, expect } from 'vitest'
import { FileMutationSkill } from '../skills'
import type { AgentRuntimeRequest, AgentRuntimeContext } from '../types'

const skill = new FileMutationSkill()

const ctx: AgentRuntimeContext = {
  agentId: 'claude-code',
  sessionId: 'session-002',
  workspaceRoot: '/home/user/project',
  environment: 'development',
}

function fileReq(path: string, operation = 'write', id = 'req-file', extra?: Record<string, unknown>): AgentRuntimeRequest {
  return {
    id,
    type: 'file_mutation',
    payload: { path, operation, ...extra },
    requestedAt: 2000,
  }
}

// ─── evaluate() ──────────────────────────────────────────────────────────────

describe('FileMutationSkill.evaluate()', () => {
  it('returns allow for safe source files', () => {
    expect(skill.evaluate(fileReq('src/index.ts')).outcome).toBe('allow')
    expect(skill.evaluate(fileReq('README.md')).outcome).toBe('allow')
    expect(skill.evaluate(fileReq('package.json')).outcome).toBe('allow')
  })

  it('returns require_approval for .env', () => {
    const r = skill.evaluate(fileReq('.env'))
    expect(r.outcome).toBe('require_approval')
    expect(r.rule).toBe('sensitive_file')
  })

  it('returns require_approval for .env.local and .env.production', () => {
    expect(skill.evaluate(fileReq('.env.local')).outcome).toBe('require_approval')
    expect(skill.evaluate(fileReq('.env.production')).outcome).toBe('require_approval')
  })

  it('returns require_approval for .npmrc', () => {
    expect(skill.evaluate(fileReq('.npmrc')).outcome).toBe('require_approval')
  })

  it('returns require_approval for ssh key files', () => {
    expect(skill.evaluate(fileReq('~/.ssh/id_rsa')).outcome).toBe('require_approval')
    expect(skill.evaluate(fileReq('/home/user/.ssh/id_ed25519')).outcome).toBe('require_approval')
  })

  it('returns require_approval for GitHub Actions workflows', () => {
    const r = skill.evaluate(fileReq('.github/workflows/ci.yml'))
    expect(r.outcome).toBe('require_approval')
    expect(r.rule).toBe('workflow_mutation')
  })

  it('returns require_approval for other CI configs', () => {
    expect(skill.evaluate(fileReq('Jenkinsfile')).outcome).toBe('require_approval')
    expect(skill.evaluate(fileReq('.travis.yml')).outcome).toBe('require_approval')
    expect(skill.evaluate(fileReq('.circleci/config.yml')).outcome).toBe('require_approval')
  })

  it('returns require_approval for PEM and key files', () => {
    expect(skill.evaluate(fileReq('cert.pem')).outcome).toBe('require_approval')
    expect(skill.evaluate(fileReq('private.key')).outcome).toBe('require_approval')
  })
})

// ─── buildReceipt() ──────────────────────────────────────────────────────────

describe('FileMutationSkill.buildReceipt()', () => {
  it('produces a receipt with the correct requestId', () => {
    const req = fileReq('src/index.ts', 'write', 'req-file-001')
    const receipt = skill.buildReceipt(req, ctx, skill.evaluate(req))
    expect(receipt.requestId).toBe('req-file-001')
  })

  it('maps allow outcome to allow decision', () => {
    const req = fileReq('src/index.ts')
    const receipt = skill.buildReceipt(req, ctx, skill.evaluate(req))
    expect(receipt.decision).toBe('allow')
  })

  it('maps require_approval to approval_required decision', () => {
    const req = fileReq('.env')
    const receipt = skill.buildReceipt(req, ctx, skill.evaluate(req))
    expect(receipt.decision).toBe('approval_required')
  })

  it('stores path and operation in the receipt payload', () => {
    const req = fileReq('src/utils.ts', 'write')
    const receipt = skill.buildReceipt(req, ctx, skill.evaluate(req))
    expect(receipt.request.payload.path).toBe('src/utils.ts')
    expect(receipt.request.payload.operation).toBe('write')
  })

  it('does NOT store file content in the receipt even if provided', () => {
    const req = fileReq('src/index.ts', 'write', 'req-content', { content: 'export const x = 1' })
    const receipt = skill.buildReceipt(req, ctx, skill.evaluate(req))
    expect(receipt.request.payload.content).toBeUndefined()
  })

  it('does NOT store file content for sensitive files either', () => {
    const req = fileReq('.env', 'write', 'req-env', { content: 'SECRET=abc123' })
    const receipt = skill.buildReceipt(req, ctx, skill.evaluate(req))
    expect(receipt.request.payload.content).toBeUndefined()
  })

  it('includes policy rule and reason in evidence', () => {
    const req = fileReq('.github/workflows/ci.yml')
    const receipt = skill.buildReceipt(req, ctx, skill.evaluate(req))
    expect(receipt.evidence?.rule).toBe('workflow_mutation')
    expect(typeof receipt.evidence?.reason).toBe('string')
  })

  it('stores context on the receipt', () => {
    const req = fileReq('src/index.ts')
    const receipt = skill.buildReceipt(req, ctx, skill.evaluate(req))
    expect(receipt.context.agentId).toBe('claude-code')
  })

  it('sets decidedAt to a recent timestamp', () => {
    const before = Date.now()
    const req = fileReq('src/index.ts')
    const receipt = skill.buildReceipt(req, ctx, skill.evaluate(req))
    expect(receipt.decidedAt).toBeGreaterThanOrEqual(before)
  })

  it('accepts an optional decidedAt override', () => {
    const req = fileReq('src/index.ts')
    const receipt = skill.buildReceipt(req, ctx, skill.evaluate(req), 12345)
    expect(receipt.decidedAt).toBe(12345)
  })
})
