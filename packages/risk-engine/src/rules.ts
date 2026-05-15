import type { BehaviorEvent } from '@ojo/monitor'
import type { RuleResult } from './types'

export type RuleCheck = (events: BehaviorEvent[]) => RuleResult

const WHITELISTED_HOSTS = [
  'registry.npmjs.org',
  'registry.yarnpkg.com',
  'github.com',
  'raw.githubusercontent.com',
  'objects.githubusercontent.com',
  'api.github.com',
]

const SUSPICIOUS_PATTERNS = [
  /eval\s*\(/i,
  /exec\s*\(/i,
  /base64\s*-d/i,
  /\/dev\/tcp\//,
  /chmod\s+\+x/i,
  /wget\s+(http|ftp)/i,
  /curl\s+(http|ftp)/i,
  /nc\s+/i,
  /ncat\s+/i,
  /mkfifo/i,
  />\s*\/dev\//,
]

const OBFUSCATION_PATTERNS = [
  /[A-Za-z0-9+/]{100,}={0,2}/,
  /(?:\\x[0-9a-f]{2}){10,}/i,
  /(?:\$\(|`)[^)]{200,}(?:\)|`)/,
  /rot13/i,
  /xxd\s+-r/i,
  /openssl\s+enc/i,
]

const SENSITIVE_ENV_KEYS = [
  /token/i,
  /secret/i,
  /password/i,
  /credential/i,
  /auth/i,
  /api_key/i,
  /access_key/i,
  /key/i,
]

export function checkPostinstallScripts(events: BehaviorEvent[]): RuleResult {
  const matches = events.filter(
    (e): e is BehaviorEvent & { type: 'lifecycle_script' } =>
      e.type === 'lifecycle_script' && e.scriptType !== 'install',
  )

  if (matches.length === 0) {
    return {
      ruleName: 'postinstall_scripts',
      passed: true,
      score: 0,
      detail: 'No lifecycle scripts detected',
    }
  }

  return {
    ruleName: 'postinstall_scripts',
    passed: false,
    score: Math.min(matches.length * 15, 30),
    detail: `Runs ${matches.length} lifecycle script(s): ${matches.map((m) => `${m.scriptType} (${m.command})`).join(', ')}`,
  }
}

export function checkSuspiciousCommands(events: BehaviorEvent[]): RuleResult {
  const matches = events.filter((e) => {
    if (e.type !== 'process_execution') return false
    const cmdline = [e.command, ...e.args].join(' ')
    return SUSPICIOUS_PATTERNS.some((p) => p.test(cmdline))
  })

  if (matches.length === 0) {
    return {
      ruleName: 'suspicious_commands',
      passed: true,
      score: 0,
      detail: 'No suspicious commands detected',
    }
  }

  return {
    ruleName: 'suspicious_commands',
    passed: false,
    score: Math.min(matches.length * 20, 40),
    detail: `Suspicious command(s): ${matches.map((m) => (m.type === 'process_execution' ? `${m.command} ${m.args.join(' ')}` : '')).join('; ')}`,
  }
}

export function checkCurlWget(events: BehaviorEvent[]): RuleResult {
  const downloads = events.filter(
    (e) => e.type === 'binary_download',
  )

  const procDownloads = events.filter((e) => {
    if (e.type !== 'process_execution') return false
    const base = e.command.toLowerCase()
    return base === 'curl' || base === 'wget' || base === 'fetch'
  })

  const total = downloads.length + procDownloads.length

  if (total === 0) {
    return {
      ruleName: 'curl_wget',
      passed: true,
      score: 0,
      detail: 'No external downloads detected',
    }
  }

  const details: string[] = []
  for (const d of downloads) {
    if (d.type === 'binary_download') {
      details.push(`Binary: ${d.url}`)
    }
  }
  for (const p of procDownloads) {
    if (p.type === 'process_execution') {
      details.push(`Process: ${p.command} ${p.args.join(' ')}`)
    }
  }

  return {
    ruleName: 'curl_wget',
    passed: false,
    score: Math.min(total * 25, 50),
    detail: `External download(s): ${details.join('; ')}`,
  }
}

export function checkOutboundNetwork(events: BehaviorEvent[]): RuleResult {
  const matches = events.filter((e) => {
    if (e.type !== 'network_request') return false
    return !WHITELISTED_HOSTS.some(
      (w) => e.host === w || e.host.endsWith('.' + w),
    )
  })

  if (matches.length === 0) {
    return {
      ruleName: 'outbound_network',
      passed: true,
      score: 0,
      detail: 'No unexpected outbound network requests',
    }
  }

  const hosts = [...new Set(matches.map((m) => (m.type === 'network_request' ? m.host : '')))]

  return {
    ruleName: 'outbound_network',
    passed: false,
    score: Math.min(matches.length * 10, 30),
    detail: `Unexpected outbound request(s) to: ${hosts.join(', ')}`,
  }
}

export function checkObfuscatedScripts(events: BehaviorEvent[]): RuleResult {
  const matches = events.filter((e) => {
    let content = ''
    if (e.type === 'lifecycle_script') {
      content = e.command
    } else if (e.type === 'process_execution') {
      content = [e.command, ...e.args].join(' ')
    }
    return OBFUSCATION_PATTERNS.some((p) => p.test(content))
  })

  if (matches.length === 0) {
    return {
      ruleName: 'obfuscated_scripts',
      passed: true,
      score: 0,
      detail: 'No obfuscated scripts detected',
    }
  }

  const cmd = matches
    .map((m) => (m.type === 'lifecycle_script' ? m.command : m.type === 'process_execution' ? `${m.command} ${m.args.join(' ')}` : ''))
    .join('; ')

  return {
    ruleName: 'obfuscated_scripts',
    passed: false,
    score: 35,
    detail: `Obfuscated script pattern detected: ${cmd}`,
  }
}

export function checkEnvAccess(events: BehaviorEvent[]): RuleResult {
  const matches = events.filter((e) => {
    if (e.type !== 'environment_access') return false
    return SENSITIVE_ENV_KEYS.some((p) => p.test(e.key))
  })

  if (matches.length === 0) {
    return {
      ruleName: 'env_access',
      passed: true,
      score: 0,
      detail: 'No sensitive environment access detected',
    }
  }

  const keys = matches.map((m) => (m.type === 'environment_access' ? m.key : ''))

  return {
    ruleName: 'env_access',
    passed: false,
    score: Math.min(matches.length * 10, 20),
    detail: `Sensitive environment variable(s) accessed: ${keys.join(', ')}`,
  }
}

