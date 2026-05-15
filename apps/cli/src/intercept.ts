import { createProvider } from '@ojo/providers'
import { fromExecution } from '@ojo/monitor'
import { evaluate, formatReport, fetchPackageMetadata } from '@ojo/risk-engine'
import type { PackageMetadata } from '@ojo/risk-engine'
import type { PackageSpec } from '@ojo/shared'
import { OJO_NAME } from '@ojo/shared'
import { askForApproval } from './prompt'

export interface InterceptOptions {
  allow?: boolean
  ci?: boolean
  verbose?: boolean
  providerName?: 'docker' | 'daytona' | 'cloudflare'
  packageManager?: string
}

export async function handleInstall(
  packages: PackageSpec[],
  options: InterceptOptions,
): Promise<void> {
  const pm = options.packageManager ?? 'npm'
  const label =
    packages.length > 0
      ? packages.map((p) => p.raw).join(' ')
      : '(project dependencies)'

  if (options.allow || process.env.OJO_ALLOW === 'true' || process.env.OJO_ALLOW === '1') {
    console.error(`${OJO_NAME}: ════════════════════════════════════════════`)
    console.error(`${OJO_NAME}: WARNING — allow override ACTIVE via OJO_ALLOW`)
    console.error(`${OJO_NAME}: Sandbox analysis will be SKIPPED entirely`)
    console.error(`${OJO_NAME}: Install will proceed without any trust verification`)
    console.error(`${OJO_NAME}: ════════════════════════════════════════════`)
    if (options.verbose) {
      console.error(`${OJO_NAME}: allow override — skipping analysis`)
    }
    return
  }

  const providerName = options.providerName ?? 'docker'
  const executionStart = Date.now()
  const provider = createProvider({ name: providerName })

  const health = await provider.health()
  if (!health.ok) {
    if (providerName === 'docker') {
      console.error(`${OJO_NAME}: Docker not available — cannot verify package safety`)
      console.error(`${OJO_NAME}: install blocked (set OJO_ALLOW=true to bypass or start Docker)`)
      process.exit(1)
    }
    console.error(`${OJO_NAME}: ${providerName} provider unavailable: ${health.message}`)
    process.exit(1)
  }

  let sandboxId: string | undefined

  try {
    if (options.verbose) {
      console.error(`${OJO_NAME}: analyzing ${label} in ${providerName} sandbox...`)
    }

    const sandbox = await provider.create({
      image: 'node:22-alpine@sha256:968df39aedcea65eeb078fb336ed7191baf48f972b4479711397108be0966920',
      timeoutMs: 120_000,
    })
    sandboxId = sandbox.id

    const cmd =
      packages.length > 0
        ? `npm install ${packages.map((p) => `'${p.raw.replace(/'/g, "'\\''")}'`).join(' ')} 2>&1`
        : 'npm install 2>&1'

    const result = await provider.execute(sandbox.id, cmd, { timeoutMs: 120_000 })

    if (options.verbose) {
      console.error(`${OJO_NAME}: stdout from sandbox:`)
      for (const line of result.stdout.split('\n').filter(Boolean)) {
        console.error(`  | ${line}`)
      }
    }

    const report = fromExecution({
      sandboxId: sandbox.id,
      packageName: label,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      durationMs: Date.now() - executionStart,
      packageManager: pm,
      packagesRequested: packages.map((p) => p.raw),
    })

    const metadataTarget = packages.length > 0 ? packages[0].name : undefined
    let metadata: PackageMetadata | undefined = undefined
    if (metadataTarget) {
      if (options.verbose) {
        console.error(`${OJO_NAME}: fetching registry metadata for ${metadataTarget}...`)
      }
      const result = await fetchPackageMetadata(metadataTarget)
      if (result) metadata = result
      if (options.verbose && metadata?.error) {
        console.error(`${OJO_NAME}: metadata fetch failed — ${metadata.error}`)
      }
    }

    const trustReport = evaluate(report, { metadata })

    if (options.verbose) {
      console.error(formatReport(trustReport, { verbose: true }))
    }

    if (trustReport.riskLevel === 'SAFE' || trustReport.riskLevel === 'LOW') {
      console.error(`${OJO_NAME}: ${trustReport.riskLevel} (${trustReport.score}) — allowing install`)
      return
    }

    console.error(formatReport(trustReport))

    if (options.ci || process.env.OJO_CI === 'true' || process.env.OJO_CI === '1') {
      console.error(`${OJO_NAME}: CI mode — blocking install`)
      process.exit(1)
    }

    const approved = await askForApproval()

    if (!approved) {
      console.error(`${OJO_NAME}: install blocked by user`)
      process.exit(1)
    }

    console.error(`${OJO_NAME}: install approved — proceeding`)
  } finally {
    if (sandboxId) {
      await provider.destroy(sandboxId).catch(() => {})
    }
  }
}
