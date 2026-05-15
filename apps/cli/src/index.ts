import { OJO_NAME, OJO_VERSION } from '@ojo/shared'
import { parseNpmArgs, parsePnpmArgs, parseBunArgs } from '@ojo/interceptor'
import { handleInstall } from './intercept'
import { initCommand, initPostinstall } from './init'

const args = process.argv.slice(2)
const command = args[0] ?? ''

async function main(): Promise<void> {
  switch (command) {
    case 'shim':
      await handleShim(args.slice(1))
      break

    case 'init':
      await initCommand()
      break

    case '--version':
    case '-v':
      console.log(`${OJO_NAME} ${OJO_VERSION}`)
      break

    case '--help':
    case '-h':
      printHelp()
      break

    default:
      printHelp()
      break
  }
}

export { initPostinstall }

async function handleShim(shimArgs: string[]): Promise<void> {
  const pm = shimArgs[0]
  const pmArgs = shimArgs.slice(1)
  const isCI = shimArgs.includes('--ci')
  const isAllow = shimArgs.includes('--allow')
  const isVerbose = shimArgs.includes('--verbose')
  const filtered = pmArgs.filter((a) => !['--ci', '--allow', '--verbose'].includes(a))

  switch (pm) {
    case 'npm':
      await handleNpmShim(filtered, { ci: isCI, allow: isAllow, verbose: isVerbose })
      break
    case 'pnpm':
      await handlePnpmShim(filtered, { ci: isCI, allow: isAllow, verbose: isVerbose })
      break
    case 'bun':
      await handleBunShim(filtered, { ci: isCI, allow: isAllow, verbose: isVerbose })
      break
    default:
      console.error(`${OJO_NAME}: unsupported package manager: ${pm}`)
      process.exit(1)
  }
}

async function handleNpmShim(
  pmArgs: string[],
  options: { ci: boolean; allow: boolean; verbose: boolean },
): Promise<void> {
  const parsed = parseNpmArgs(pmArgs)

  if (parsed.type !== 'install') {
    return
  }

  await handleInstall(parsed.packages, { ...options, packageManager: 'npm' })
}

async function handlePnpmShim(
  pmArgs: string[],
  options: { ci: boolean; allow: boolean; verbose: boolean },
): Promise<void> {
  const parsed = parsePnpmArgs(pmArgs)

  if (parsed.type !== 'install') {
    return
  }

  await handleInstall(parsed.packages, { ...options, packageManager: 'pnpm' })
}

async function handleBunShim(
  pmArgs: string[],
  options: { ci: boolean; allow: boolean; verbose: boolean },
): Promise<void> {
  const parsed = parseBunArgs(pmArgs)

  if (parsed.type !== 'install') {
    return
  }

  await handleInstall(parsed.packages, { ...options, packageManager: 'bun' })
}

function printHelp(): void {
  console.log(`${OJO_NAME} ${OJO_VERSION}

Invisible runtime trust infrastructure for modern development and AI agents.

USAGE
  ${OJO_NAME} [command]

COMMANDS
  shim npm <args>    Handle intercepted npm command
  shim pnpm <args>   Handle intercepted pnpm command
  shim bun <args>    Handle intercepted bun command
  init               Set up PATH shims for install interception
  --version, -v      Print version
  --help, -h         Print this help message

SHIM OPTIONS
  --allow            Skip sandbox analysis, allow install
  --ci               Non-interactive mode, block risky installs
  --verbose          Show detailed analysis output
`)
}

main().catch((err: Error) => {
  console.error(`${OJO_NAME}: error: ${err.message}`)
  process.exit(1)
})
