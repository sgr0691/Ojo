import type { AgentRuntimeRequest, RuntimeDecision } from './types'

export const POLICY_OUTCOMES = ['allow', 'warn', 'require_approval', 'block'] as const

export type PolicyOutcome = (typeof POLICY_OUTCOMES)[number]

export interface PolicyResult {
  outcome: PolicyOutcome
  rule: string
  reason: string
}

export type PolicyRule = (request: AgentRuntimeRequest) => PolicyResult | null

// ─── Helpers ─────────────────────────────────────────────────────────────────

const OUTCOME_PRIORITY: Record<PolicyOutcome, number> = {
  allow: 0,
  warn: 1,
  require_approval: 2,
  block: 3,
}

function shellCommand(req: AgentRuntimeRequest): string | null {
  return req.type === 'shell_command' && typeof req.payload.command === 'string'
    ? req.payload.command
    : null
}

function filePath(req: AgentRuntimeRequest): string | null {
  return req.type === 'file_mutation' && typeof req.payload.path === 'string'
    ? req.payload.path
    : null
}

function fileBasename(path: string): string {
  return path.split(/[/\\]/).pop() ?? path
}

// ─── Rule: curl_pipe_sh ───────────────────────────────────────────────────────
// Pipes remote content directly into a shell — classic code-injection vector.

const CURL_PIPE_SH = /\b(curl|wget)\b[^|]*\|\s*(ba)?sh\b/i

function ruleCurlPipeSh(req: AgentRuntimeRequest): PolicyResult | null {
  const cmd = shellCommand(req)
  if (!cmd || !CURL_PIPE_SH.test(cmd)) return null
  return { outcome: 'block', rule: 'curl_pipe_sh', reason: `Remote content piped into shell: ${cmd}` }
}

// ─── Rule: rm_rf ──────────────────────────────────────────────────────────────
// Recursive forced deletion — any path, any depth.

const RM_RF = /\brm\b[^;|&\n]*-[a-zA-Z]*(rf|fr)/i

function ruleRmRf(req: AgentRuntimeRequest): PolicyResult | null {
  const cmd = shellCommand(req)
  if (!cmd || !RM_RF.test(cmd)) return null
  return { outcome: 'block', rule: 'rm_rf', reason: `Recursive forced deletion detected: ${cmd}` }
}

// ─── Rule: dangerous_shell ────────────────────────────────────────────────────
// eval and any non-remote pipe into a shell (obfuscation vectors).

const DANGEROUS_SHELL_PATTERNS = [
  /\beval\s*[\$`(]/i,    // eval $(, eval `, eval (
  /\|\s*(ba)?sh\b/i,     // any pipe into sh/bash (curl|sh already blocked above)
]

function ruleDangerousShell(req: AgentRuntimeRequest): PolicyResult | null {
  const cmd = shellCommand(req)
  if (!cmd) return null
  if (DANGEROUS_SHELL_PATTERNS.some((p) => p.test(cmd))) {
    return { outcome: 'require_approval', rule: 'dangerous_shell', reason: `Dangerous execution pattern: ${cmd}` }
  }
  return null
}

// ─── Rule: token_scraping ─────────────────────────────────────────────────────
// Shell commands that read or echo sensitive environment variables.

const TOKEN_VAR_REF = /\$\{?[A-Z_]*(TOKEN|SECRET|PASSWORD|CREDENTIAL|PRIVATE_KEY|ACCESS_KEY)\}?/i
const PRINTENV_SENSITIVE = /\bprintenv\s+[A-Z_]*(TOKEN|SECRET|PASSWORD|CREDENTIAL|KEY|AUTH)/i
const ENV_GREP_SENSITIVE = /\benv\b[^|]*\|[^|]*(grep|awk|sed)[^|]*(TOKEN|SECRET|PASSWORD|KEY)/i

function ruleTokenScraping(req: AgentRuntimeRequest): PolicyResult | null {
  const cmd = shellCommand(req)
  if (!cmd) return null
  if (TOKEN_VAR_REF.test(cmd) || PRINTENV_SENSITIVE.test(cmd) || ENV_GREP_SENSITIVE.test(cmd)) {
    return { outcome: 'require_approval', rule: 'token_scraping', reason: `Sensitive environment variable access: ${cmd}` }
  }
  return null
}

// ─── Rule: sensitive_file ─────────────────────────────────────────────────────
// File mutations targeting credentials, keys, or secrets.

const SENSITIVE_BASENAME_PATTERNS = [
  /^\.env(\.|$)/,                  // .env, .env.local, .env.production
  /^\.npmrc$/i,
  /^\.netrc$/i,
  /\.(pem|key|p12|pfx)$/i,
]

const SENSITIVE_PATH_PATTERNS = [
  /[/\\]\.ssh[/\\]/,               // ~/.ssh/*
  /[/\\]\.aws[/\\](credentials|config)$/i,
]

function ruleSensitiveFile(req: AgentRuntimeRequest): PolicyResult | null {
  const path = filePath(req)
  if (!path) return null
  const base = fileBasename(path)
  if (
    SENSITIVE_BASENAME_PATTERNS.some((p) => p.test(base)) ||
    SENSITIVE_PATH_PATTERNS.some((p) => p.test(path))
  ) {
    return { outcome: 'require_approval', rule: 'sensitive_file', reason: `Mutation targets sensitive file: ${path}` }
  }
  return null
}

// ─── Rule: workflow_mutation ──────────────────────────────────────────────────
// CI/CD pipeline definitions — mutating these can compromise the build supply chain.

const WORKFLOW_PATH_PATTERNS = [
  /[/\\]?\.github[/\\]workflows[/\\]/i,
  /[/\\]?\.circleci[/\\]/i,
  /[/\\]?\.buildkite[/\\]/i,
]

const WORKFLOW_BASENAME_PATTERNS = [
  /^Jenkinsfile$/,
  /^\.travis\.yml$/i,
  /^\.gitlab-ci\.yml$/i,
]

function ruleWorkflowMutation(req: AgentRuntimeRequest): PolicyResult | null {
  const path = filePath(req)
  if (!path) return null
  const base = fileBasename(path)
  if (
    WORKFLOW_PATH_PATTERNS.some((p) => p.test(path)) ||
    WORKFLOW_BASENAME_PATTERNS.some((p) => p.test(base))
  ) {
    return { outcome: 'require_approval', rule: 'workflow_mutation', reason: `Mutation targets CI/CD workflow file: ${path}` }
  }
  return null
}

// ─── Evaluation ───────────────────────────────────────────────────────────────

const DEFAULT_RULES: PolicyRule[] = [
  ruleCurlPipeSh,
  ruleRmRf,
  ruleDangerousShell,
  ruleTokenScraping,
  ruleSensitiveFile,
  ruleWorkflowMutation,
]

export function outcomeToDecision(outcome: PolicyOutcome): RuntimeDecision {
  if (outcome === 'block') return 'block'
  if (outcome === 'require_approval') return 'approval_required'
  return 'allow'
}

const ALLOW: PolicyResult = { outcome: 'allow', rule: 'default', reason: 'No policy rules triggered' }

export function evaluate(
  request: AgentRuntimeRequest,
  rules: PolicyRule[] = DEFAULT_RULES,
): PolicyResult {
  let worst = ALLOW
  for (const rule of rules) {
    const result = rule(request)
    if (result && OUTCOME_PRIORITY[result.outcome] > OUTCOME_PRIORITY[worst.outcome]) {
      worst = result
    }
  }
  return worst
}
