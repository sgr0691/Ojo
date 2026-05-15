import type { AgentRuntimeRequest, RuntimeActionType } from './types'

export interface Skill {
  readonly actionType: RuntimeActionType
  canHandle(request: AgentRuntimeRequest): boolean
  describe(request: AgentRuntimeRequest): string
}

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

export class ShellCommandSkill implements Skill {
  readonly actionType: RuntimeActionType = 'shell_command'

  canHandle(request: AgentRuntimeRequest): boolean {
    return request.type === 'shell_command'
  }

  describe(request: AgentRuntimeRequest): string {
    const cmd = request.payload.command
    return `run: ${typeof cmd === 'string' ? cmd : '(unknown command)'}`
  }
}

export class FileMutationSkill implements Skill {
  readonly actionType: RuntimeActionType = 'file_mutation'

  canHandle(request: AgentRuntimeRequest): boolean {
    return request.type === 'file_mutation'
  }

  describe(request: AgentRuntimeRequest): string {
    const op = typeof request.payload.operation === 'string' ? request.payload.operation : 'modify'
    const path = typeof request.payload.path === 'string' ? request.payload.path : '(unknown path)'
    return `${op} ${path}`
  }
}

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
