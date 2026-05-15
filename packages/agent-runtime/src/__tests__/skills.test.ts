import { describe, it, expect } from 'vitest'
import {
  createSkill,
  PackageInstallSkill,
  ShellCommandSkill,
  FileMutationSkill,
  type Skill,
} from '../skills'
import type { AgentRuntimeRequest } from '../types'

function makeRequest(overrides: Partial<AgentRuntimeRequest> & { type: AgentRuntimeRequest['type'] }): AgentRuntimeRequest {
  return {
    id: 'req-test',
    payload: {},
    requestedAt: 0,
    ...overrides,
  }
}

describe('createSkill factory', () => {
  it('returns a PackageInstallSkill for package_install', () => {
    const skill = createSkill('package_install')
    expect(skill.actionType).toBe('package_install')
    expect(skill).toBeInstanceOf(PackageInstallSkill)
  })

  it('returns a ShellCommandSkill for shell_command', () => {
    const skill = createSkill('shell_command')
    expect(skill.actionType).toBe('shell_command')
    expect(skill).toBeInstanceOf(ShellCommandSkill)
  })

  it('returns a FileMutationSkill for file_mutation', () => {
    const skill = createSkill('file_mutation')
    expect(skill.actionType).toBe('file_mutation')
    expect(skill).toBeInstanceOf(FileMutationSkill)
  })

  it('throws for unimplemented network_access', () => {
    expect(() => createSkill('network_access')).toThrow('network_access')
  })
})

describe('PackageInstallSkill', () => {
  const skill: Skill = new PackageInstallSkill()

  it('canHandle package_install requests', () => {
    expect(skill.canHandle(makeRequest({ type: 'package_install' }))).toBe(true)
  })

  it('does not handle other request types', () => {
    expect(skill.canHandle(makeRequest({ type: 'shell_command' }))).toBe(false)
    expect(skill.canHandle(makeRequest({ type: 'file_mutation' }))).toBe(false)
    expect(skill.canHandle(makeRequest({ type: 'network_access' }))).toBe(false)
  })

  it('describes install with named packages', () => {
    const req = makeRequest({ type: 'package_install', payload: { packages: ['react', 'lodash'] } })
    expect(skill.describe(req)).toContain('react')
    expect(skill.describe(req)).toContain('lodash')
  })

  it('describes install without packages as project dependencies', () => {
    const req = makeRequest({ type: 'package_install', payload: {} })
    expect(skill.describe(req)).toContain('project dependencies')
  })
})

describe('ShellCommandSkill', () => {
  const skill: Skill = new ShellCommandSkill()

  it('canHandle shell_command requests', () => {
    expect(skill.canHandle(makeRequest({ type: 'shell_command' }))).toBe(true)
  })

  it('does not handle other request types', () => {
    expect(skill.canHandle(makeRequest({ type: 'package_install' }))).toBe(false)
    expect(skill.canHandle(makeRequest({ type: 'file_mutation' }))).toBe(false)
    expect(skill.canHandle(makeRequest({ type: 'network_access' }))).toBe(false)
  })

  it('describes the shell command', () => {
    const req = makeRequest({ type: 'shell_command', payload: { command: 'rm -rf dist' } })
    expect(skill.describe(req)).toContain('rm -rf dist')
  })

  it('describes unknown command gracefully', () => {
    const req = makeRequest({ type: 'shell_command', payload: {} })
    const desc = skill.describe(req)
    expect(typeof desc).toBe('string')
    expect(desc.length).toBeGreaterThan(0)
  })
})

describe('FileMutationSkill', () => {
  const skill: Skill = new FileMutationSkill()

  it('canHandle file_mutation requests', () => {
    expect(skill.canHandle(makeRequest({ type: 'file_mutation' }))).toBe(true)
  })

  it('does not handle other request types', () => {
    expect(skill.canHandle(makeRequest({ type: 'package_install' }))).toBe(false)
    expect(skill.canHandle(makeRequest({ type: 'shell_command' }))).toBe(false)
    expect(skill.canHandle(makeRequest({ type: 'network_access' }))).toBe(false)
  })

  it('describes the file operation and path', () => {
    const req = makeRequest({ type: 'file_mutation', payload: { operation: 'write', path: '/src/index.ts' } })
    expect(skill.describe(req)).toContain('write')
    expect(skill.describe(req)).toContain('/src/index.ts')
  })

  it('describes unknown path and operation gracefully', () => {
    const req = makeRequest({ type: 'file_mutation', payload: {} })
    const desc = skill.describe(req)
    expect(typeof desc).toBe('string')
    expect(desc.length).toBeGreaterThan(0)
  })
})
