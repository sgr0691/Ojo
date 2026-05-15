import { describe, it, expect } from 'vitest'
import {
  RUNTIME_ACTION_TYPES,
  RUNTIME_DECISIONS,
  type RuntimeActionType,
  type RuntimeDecision,
  type AgentRuntimeRequest,
  type AgentRuntimeContext,
  type RuntimeExecutionReceipt,
} from '../types'

describe('RUNTIME_ACTION_TYPES', () => {
  it('includes package_install', () => {
    expect(RUNTIME_ACTION_TYPES).toContain('package_install')
  })

  it('includes shell_command', () => {
    expect(RUNTIME_ACTION_TYPES).toContain('shell_command')
  })

  it('includes file_mutation', () => {
    expect(RUNTIME_ACTION_TYPES).toContain('file_mutation')
  })

  it('includes network_access', () => {
    expect(RUNTIME_ACTION_TYPES).toContain('network_access')
  })

  it('has exactly 4 action types', () => {
    expect(RUNTIME_ACTION_TYPES).toHaveLength(4)
  })
})

describe('RUNTIME_DECISIONS', () => {
  it('includes allow', () => {
    expect(RUNTIME_DECISIONS).toContain('allow')
  })

  it('includes block', () => {
    expect(RUNTIME_DECISIONS).toContain('block')
  })

  it('includes approval_required', () => {
    expect(RUNTIME_DECISIONS).toContain('approval_required')
  })

  it('has exactly 3 decisions', () => {
    expect(RUNTIME_DECISIONS).toHaveLength(3)
  })
})

describe('AgentRuntimeRequest shape', () => {
  it('accepts a valid package_install request', () => {
    const req: AgentRuntimeRequest = {
      id: 'req-001',
      type: 'package_install',
      payload: { packages: ['react'] },
      requestedAt: Date.now(),
    }
    expect(req.type).toBe('package_install')
    expect(req.id).toBe('req-001')
  })

  it('accepts a valid shell_command request with optional agentId', () => {
    const req: AgentRuntimeRequest = {
      id: 'req-002',
      type: 'shell_command',
      agentId: 'claude-code',
      sessionId: 'session-abc',
      payload: { command: 'ls -la' },
      requestedAt: Date.now(),
    }
    expect(req.agentId).toBe('claude-code')
    expect(req.type).toBe('shell_command')
  })

  it('accepts file_mutation and network_access as valid types', () => {
    const fileMutation: AgentRuntimeRequest = {
      id: 'req-003',
      type: 'file_mutation',
      payload: { path: '/src/index.ts', operation: 'write' },
      requestedAt: Date.now(),
    }
    const networkAccess: AgentRuntimeRequest = {
      id: 'req-004',
      type: 'network_access',
      payload: { host: 'api.example.com', method: 'GET' },
      requestedAt: Date.now(),
    }
    expect(fileMutation.type).toBe('file_mutation')
    expect(networkAccess.type).toBe('network_access')
  })
})

describe('AgentRuntimeContext shape', () => {
  it('accepts a valid context', () => {
    const ctx: AgentRuntimeContext = {
      agentId: 'claude-code',
      sessionId: 'session-001',
      workspaceRoot: '/home/user/project',
      environment: 'development',
    }
    expect(ctx.environment).toBe('development')
    expect(ctx.agentId).toBe('claude-code')
  })

  it('accepts ci and production environments', () => {
    const ci: AgentRuntimeContext = {
      agentId: 'codex',
      sessionId: 'ci-session',
      workspaceRoot: '/workspace',
      environment: 'ci',
    }
    const prod: AgentRuntimeContext = {
      agentId: 'codex',
      sessionId: 'prod-session',
      workspaceRoot: '/workspace',
      environment: 'production',
    }
    expect(ci.environment).toBe('ci')
    expect(prod.environment).toBe('production')
  })

  it('accepts optional policyVersion', () => {
    const ctx: AgentRuntimeContext = {
      agentId: 'claude-code',
      sessionId: 'session-002',
      workspaceRoot: '/home/user/project',
      environment: 'development',
      policyVersion: 'v1.0.0',
    }
    expect(ctx.policyVersion).toBe('v1.0.0')
  })
})

describe('RuntimeDecision values', () => {
  it('allow is a valid RuntimeDecision', () => {
    const d: RuntimeDecision = 'allow'
    expect(d).toBe('allow')
  })

  it('block is a valid RuntimeDecision', () => {
    const d: RuntimeDecision = 'block'
    expect(d).toBe('block')
  })

  it('approval_required is a valid RuntimeDecision', () => {
    const d: RuntimeDecision = 'approval_required'
    expect(d).toBe('approval_required')
  })
})

describe('RuntimeExecutionReceipt shape', () => {
  const baseRequest: AgentRuntimeRequest = {
    id: 'req-100',
    type: 'package_install',
    payload: { packages: ['lodash'] },
    requestedAt: 1000,
  }

  const baseContext: AgentRuntimeContext = {
    agentId: 'claude-code',
    sessionId: 'session-100',
    workspaceRoot: '/project',
    environment: 'development',
  }

  it('accepts a minimal allow receipt', () => {
    const receipt: RuntimeExecutionReceipt = {
      requestId: 'req-100',
      request: baseRequest,
      context: baseContext,
      decision: 'allow',
      decidedAt: 2000,
    }
    expect(receipt.decision).toBe('allow')
    expect(receipt.requestId).toBe('req-100')
  })

  it('accepts a block receipt with error', () => {
    const receipt: RuntimeExecutionReceipt = {
      requestId: 'req-100',
      request: baseRequest,
      context: baseContext,
      decision: 'block',
      decidedAt: 2000,
      error: 'Risk score exceeded threshold',
    }
    expect(receipt.decision).toBe('block')
    expect(receipt.error).toBe('Risk score exceeded threshold')
  })

  it('accepts optional executedAt and completedAt', () => {
    const receipt: RuntimeExecutionReceipt = {
      requestId: 'req-100',
      request: baseRequest,
      context: baseContext,
      decision: 'allow',
      decidedAt: 2000,
      executedAt: 2100,
      completedAt: 3500,
    }
    expect(receipt.executedAt).toBe(2100)
    expect(receipt.completedAt).toBe(3500)
  })

  it('accepts optional evidence record', () => {
    const receipt: RuntimeExecutionReceipt = {
      requestId: 'req-100',
      request: baseRequest,
      context: baseContext,
      decision: 'approval_required',
      decidedAt: 2000,
      evidence: { riskScore: 45, triggeredRules: ['postinstall_scripts'] },
    }
    expect(receipt.evidence?.riskScore).toBe(45)
  })
})

describe('RuntimeActionType exhaustiveness', () => {
  it('every RUNTIME_ACTION_TYPES entry is a valid RuntimeActionType', () => {
    for (const actionType of RUNTIME_ACTION_TYPES) {
      const t: RuntimeActionType = actionType
      expect(typeof t).toBe('string')
    }
  })
})
