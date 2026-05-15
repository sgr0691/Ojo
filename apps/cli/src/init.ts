import { existsSync, appendFileSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { homedir } from 'node:os'
import { createInterface } from 'node:readline'
import { OJO_NAME, OJO_VERSION } from '@ojo/shared'

function detectShellProfile(): string {
  const shell = process.env.SHELL ?? ''
  const home = homedir()
  if (shell.includes('zsh')) return resolve(home, '.zshrc')
  if (shell.includes('bash')) {
    if (existsSync(resolve(home, '.bash_profile'))) return resolve(home, '.bash_profile')
    if (existsSync(resolve(home, '.bashrc'))) return resolve(home, '.bashrc')
    return resolve(home, '.profile')
  }
  if (shell.includes('fish')) return resolve(home, '.config/fish/config.fish')
  return ''
}

function shimDir(): string {
  const cliPath = typeof __dirname !== 'undefined'
    ? __dirname
    : dirname(process.argv[1] ?? '')
  return resolve(cliPath, '../shim')
}

function exportLine(): string {
  return `export PATH="${shimDir()}:$PATH"`
}

function ask(query: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr })
  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      rl.close()
      resolve(answer.trim().toLowerCase())
    })
  })
}

export async function initCommand(): Promise<void> {
  const sd = shimDir()
  const profile = detectShellProfile()

  if (!profile) {
    console.error(`${OJO_NAME}: could not detect shell profile.`)
    console.error(`Add this to your shell config manually:`)
    console.error(`  ${exportLine()}`)
    return
  }

  const line = exportLine()
  const existing = existsSync(profile) ? readFileSync(profile, 'utf-8') : ''

  if (existing.includes(sd)) {
    console.log(`${OJO_NAME}: shim directory already in PATH (${profile})`)
    return
  }

  console.log(`${OJO_NAME}: add shim directory to PATH?`)
  console.log(`  File: ${profile}`)
  console.log(`  Line: ${line}`)
  const answer = await ask('Add it automatically? [Y/n] ')

  if (answer === 'n' || answer === 'no') {
    console.log(`Add it yourself:`)
    console.log(`  echo '${line}' >> ${profile}`)
    return
  }

  appendFileSync(profile, `\n# Ojo — package install trust layer\n${line}\n`)
  console.log(`${OJO_NAME}: added to ${profile}`)
  console.log(`Run: source ${profile}`)
  console.log(`Then test: npm install is-odd`)
}

export function initPostinstall(): void {
  const sd = shimDir()
  const profile = detectShellProfile()
  const line = exportLine()

  console.log('')
  console.log('  ╔═══════════════════════════════════════╗')
  console.log('  ║     OJO  v' + OJO_VERSION.padEnd(26) + '║')
  console.log('  ║   Invisible runtime trust layer       ║')
  console.log('  ║   for package management              ║')
  console.log('  ╚═══════════════════════════════════════╝')
  console.log('')
  console.log(`  Run this to set up install interception:`)
  console.log(`    ojo init`)
  console.log('')
  console.log(`  Or manually add to your shell profile:`)
  if (profile) {
    console.log(`    echo '${line}' >> ${profile}`)
  } else {
    console.log(`    ${line}`)
  }
  console.log('')
  console.log(`  Then npm/pnpm/bun installs route through Ojo.`)
  console.log('')
}
