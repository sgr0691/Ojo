import { describe, it, expect } from 'vitest'
import { DockerProvider } from '../providers/docker'

interface InstallScenario {
  name: string
  pkg: string
  args?: string
  expectExitCode: number
}

function pkgDir(spec: string): string {
  if (!spec) return ''
  if (spec.startsWith('@')) {
    const afterAt = spec.indexOf('/')
    if (afterAt === -1) return spec
    const rest = spec.slice(afterAt + 1)
    const namePart = rest.includes('@') ? rest.slice(0, rest.lastIndexOf('@')) : rest
    return `node_modules/${spec.slice(0, afterAt + 1)}${namePart}`
  }
  const namePart = spec.includes('@') ? spec.slice(0, spec.indexOf('@')) : spec
  return `node_modules/${namePart}`
}

const SCENARIOS: InstallScenario[] = [
  { name: 'pure JS package', pkg: 'is-odd', expectExitCode: 0 },
  { name: 'scoped package', pkg: '@types/node', expectExitCode: 0 },
  { name: 'scoped package with version', pkg: '@types/node@22.0.0', expectExitCode: 0 },
  { name: 'package with version specifier', pkg: 'lodash@4.17.21', expectExitCode: 0 },
  { name: 'larger dependency tree', pkg: 'express', expectExitCode: 0 },
  { name: 'postinstall with binary download', pkg: 'esbuild', expectExitCode: 0 },
  { name: 'package with postinstall lifecycle', pkg: 'react', expectExitCode: 0 },
  { name: 'no-arg install in project dir', pkg: '', args: 'npm init -y && npm install', expectExitCode: 0 },
]

const itDocker = process.env.OJO_DOCKER_TESTS ? it : it.skip

describe('Docker sandbox compatibility matrix', () => {
  itDocker('Docker daemon is reachable', async () => {
    const provider = new DockerProvider({ name: 'docker' })
    const health = await provider.health()
    expect(health.ok).toBe(true)
  })

  for (const scenario of SCENARIOS) {
    itDocker(
      `installs ${scenario.name}`,
      async () => {
        const provider = new DockerProvider({ name: 'docker' })
        const sandbox = await provider.create({
          image: 'node:22-alpine',
          timeoutMs: 120_000,
        })

        try {
          const cmd = scenario.args ?? `npm install ${scenario.pkg} 2>&1`
          const start = Date.now()
          const result = await provider.execute(sandbox.id, cmd, {
            timeoutMs: 120_000,
          })
          const duration = Date.now() - start

          expect(result.exitCode).toBe(scenario.expectExitCode)

          if (scenario.expectExitCode === 0 && scenario.pkg) {
            const dir = pkgDir(scenario.pkg)
            const check = await provider.execute(
              sandbox.id,
              `ls ${dir}/package.json 2>/dev/null && echo FOUND || echo MISSING`,
              { timeoutMs: 10_000 },
            )
            expect(check.stdout.trim()).toBe('FOUND')
          }

          expect(duration).toBeLessThan(120_000)
        } finally {
          await provider.destroy(sandbox.id).catch(() => {})
        }
      },
      180_000,
    )
  }

  itDocker('non-existent package exits non-zero', async () => {
    const provider = new DockerProvider({ name: 'docker' })
    const sandbox = await provider.create({
      image: 'node:22-alpine',
      timeoutMs: 60_000,
    })

    try {
      const result = await provider.execute(
        sandbox.id,
        'npm install ojo-nonexistent-test-pkg-xyzzy 2>&1',
        { timeoutMs: 60_000 },
      )
      expect(result.exitCode).not.toBe(0)
    } finally {
      await provider.destroy(sandbox.id)
    }
  }, 120_000)

  itDocker('sandbox tmpfs is empty on fresh container', async () => {
    const provider = new DockerProvider({ name: 'docker' })
    const sandbox = await provider.create({
      image: 'node:22-alpine',
      timeoutMs: 60_000,
    })

    try {
      const result = await provider.execute(sandbox.id, 'ls -A /app', {
        timeoutMs: 10_000,
      })
      expect(result.stdout.trim()).toBe('')
    } finally {
      await provider.destroy(sandbox.id)
    }
  }, 120_000)

  itDocker('destroy removes container from docker', async () => {
    const provider = new DockerProvider({ name: 'docker' })
    const sandbox = await provider.create({
      image: 'node:22-alpine',
      timeoutMs: 60_000,
    })

    const containerId = sandbox.id
    await provider.destroy(sandbox.id)

    await expect(provider.execute(containerId, 'ls')).rejects.toThrow(
      'not found',
    )
  }, 120_000)

  itDocker('npm install --save-dev also works', async () => {
    const provider = new DockerProvider({ name: 'docker' })
    const sandbox = await provider.create({
      image: 'node:22-alpine',
      timeoutMs: 120_000,
    })

    try {
      const result = await provider.execute(
        sandbox.id,
        'npm install --save-dev typescript 2>&1',
        { timeoutMs: 120_000 },
      )
      expect(result.exitCode).toBe(0)

      const check = await provider.execute(
        sandbox.id,
        'ls node_modules/typescript/package.json 2>/dev/null && echo FOUND || echo MISSING',
        { timeoutMs: 10_000 },
      )
      expect(check.stdout.trim()).toBe('FOUND')
    } finally {
      await provider.destroy(sandbox.id)
    }
  }, 180_000)
})
