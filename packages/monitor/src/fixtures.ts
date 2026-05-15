import type {
  BehaviorEvent,
  BehaviorReport,
  BehaviorSummary,
  BehaviorEventType,
  EvidenceSource,
} from './types'
import { createReport, now } from './normalize'

export const npmInstallEvents: BehaviorEvent[] = [
  {
    type: 'process_execution',
    timestamp: now() - 5000,
    severity: 'info',
    pid: 101,
    command: 'node',
    args: ['/app/node_modules/.bin/npm', 'install', 'is-odd'],
  },
  {
    type: 'network_request',
    timestamp: now() - 4800,
    severity: 'info',
    protocol: 'https',
    host: 'registry.npmjs.org',
    path: '/is-odd',
    method: 'GET',
  },
  {
    type: 'network_request',
    timestamp: now() - 4700,
    severity: 'info',
    protocol: 'https',
    host: 'registry.npmjs.org',
    path: '/is-number',
    method: 'GET',
  },
  {
    type: 'filesystem_mutation',
    timestamp: now() - 4400,
    severity: 'info',
    operation: 'mkdir',
    path: '/app/node_modules/is-odd',
  },
  {
    type: 'filesystem_mutation',
    timestamp: now() - 4300,
    severity: 'info',
    operation: 'write',
    path: '/app/node_modules/is-odd/index.js',
    size: 412,
  },
  {
    type: 'filesystem_mutation',
    timestamp: now() - 4200,
    severity: 'info',
    operation: 'write',
    path: '/app/node_modules/is-odd/package.json',
    size: 800,
  },
  {
    type: 'lifecycle_script',
    timestamp: now() - 4100,
    severity: 'info',
    scriptType: 'postinstall',
    command: 'node postinstall.js',
    exitCode: 0,
  },
  {
    type: 'environment_access',
    timestamp: now() - 4000,
    severity: 'info',
    key: 'NODE_ENV',
  },
]

export const suspiciousInstallEvents: BehaviorEvent[] = [
  {
    type: 'process_execution',
    timestamp: now() - 5000,
    severity: 'info',
    pid: 201,
    command: 'node',
    args: ['/app/node_modules/.bin/npm', 'install', 'suspicious-pkg'],
  },
  {
    type: 'network_request',
    timestamp: now() - 4800,
    severity: 'info',
    protocol: 'https',
    host: 'registry.npmjs.org',
    path: '/suspicious-pkg',
    method: 'GET',
  },
  {
    type: 'filesystem_mutation',
    timestamp: now() - 4400,
    severity: 'info',
    operation: 'mkdir',
    path: '/app/node_modules/suspicious-pkg',
  },
  {
    type: 'lifecycle_script',
    timestamp: now() - 4300,
    severity: 'info',
    scriptType: 'postinstall',
    command: 'node malicious.js',
  },
  {
    type: 'process_execution',
    timestamp: now() - 4200,
    severity: 'warning',
    pid: 202,
    command: 'node',
    args: ['malicious.js'],
  },
  {
    type: 'binary_download',
    timestamp: now() - 4100,
    severity: 'warning',
    url: 'https://evil.example.com/payload.sh',
    destinationPath: '/tmp/payload.sh',
  },
  {
    type: 'filesystem_mutation',
    timestamp: now() - 4000,
    severity: 'warning',
    operation: 'write',
    path: '/app/node_modules/suspicious-pkg/index.js',
    size: 32000,
  },
  {
    type: 'network_request',
    timestamp: now() - 3900,
    severity: 'warning',
    protocol: 'dns',
    host: 'evil.example.com',
  },
  {
    type: 'network_request',
    timestamp: now() - 3800,
    severity: 'warning',
    protocol: 'https',
    host: 'evil.example.com',
    path: '/exfil',
    method: 'POST',
  },
  {
    type: 'environment_access',
    timestamp: now() - 3700,
    severity: 'warning',
    key: 'NPM_TOKEN',
  },
  {
    type: 'environment_access',
    timestamp: now() - 3600,
    severity: 'warning',
    key: 'AWS_SECRET_ACCESS_KEY',
  },
  {
    type: 'filesystem_mutation',
    timestamp: now() - 3500,
    severity: 'warning',
    operation: 'write',
    path: '/root/.ssh/authorized_keys',
    size: 512,
  },
]

export const maliciousNetworkEvents: BehaviorEvent[] = [
  {
    type: 'network_request',
    timestamp: now() - 3000,
    severity: 'warning',
    protocol: 'https',
    host: 'data-exfil.xyz',
    path: '/collect',
    method: 'POST',
  },
  {
    type: 'network_request',
    timestamp: now() - 2900,
    severity: 'warning',
    protocol: 'dns',
    host: 'data-exfil.xyz',
  },
  {
    type: 'binary_download',
    timestamp: now() - 2800,
    severity: 'warning',
    url: 'https://data-exfil.xyz/payload',
    destinationPath: '/tmp/.cache/payload',
    size: 1048576,
  },
  {
    type: 'filesystem_mutation',
    timestamp: now() - 2700,
    severity: 'warning',
    operation: 'chmod',
    path: '/tmp/.cache/payload',
  },
  {
    type: 'process_execution',
    timestamp: now() - 2600,
    severity: 'critical',
    pid: 301,
    command: 'bash',
    args: ['/tmp/.cache/payload'],
  },
  {
    type: 'environment_access',
    timestamp: now() - 2500,
    severity: 'critical',
    key: 'AWS_ACCESS_KEY_ID',
  },
  {
    type: 'environment_access',
    timestamp: now() - 2400,
    severity: 'critical',
    key: 'AWS_SECRET_ACCESS_KEY',
  },
]

const cleanSummary: BehaviorSummary = {
  totalEvents: 8,
  bySeverity: { info: 8, warning: 0, critical: 0 },
  byType: {
    process_execution: 1,
    network_request: 2,
    filesystem_mutation: 3,
    lifecycle_script: 1,
    binary_download: 0,
    environment_access: 1,
  },
  riskLevel: 'low',
  flags: [],
}

export const cleanReport: BehaviorReport = {
  sandboxId: 'sandbox-clean-001',
  packageName: 'is-odd',
  durationMs: 5000,
  events: npmInstallEvents,
  summary: cleanSummary,
  availableSignals: {
    process_execution: 'inferred',
    filesystem_mutation: 'inferred',
    network_request: 'inferred',
    lifecycle_script: 'inferred',
    binary_download: 'inferred',
    environment_access: 'inferred',
  },
}

function inferAvailableSignals(events: BehaviorEvent[]): Record<BehaviorEventType, EvidenceSource> {
  const present = new Set(events.map((e) => e.type))
  const all: BehaviorEventType[] = [
    'process_execution',
    'filesystem_mutation',
    'network_request',
    'lifecycle_script',
    'binary_download',
    'environment_access',
  ]
  const signals = {} as Record<BehaviorEventType, EvidenceSource>
  for (const t of all) {
    signals[t] = present.has(t) ? 'inferred' : 'unavailable'
  }
  return signals
}

export function makeReport(
  sandboxId: string,
  packageName: string,
  events: BehaviorEvent[],
  durationMs?: number,
): BehaviorReport {
  const report = createReport(sandboxId, packageName, events, durationMs ?? 5000)
  report.availableSignals = inferAvailableSignals(events)
  return report
}

export function rawLogSample(): string {
  return [
    '[101] node /app/node_modules/.bin/npm install is-odd',
    'https registry.npmjs.org /is-odd GET',
    'https registry.npmjs.org /is-number GET',
    'mkdir /app/node_modules/is-odd',
    'write /app/node_modules/is-odd/index.js',
    'write /app/node_modules/is-odd/package.json',
    'postinstall node postinstall.js',
    'env NODE_ENV',
    '',
    '[201] node malicious.js',
    'download https://evil.example.com/payload.sh -> /tmp/payload.sh',
    'write /app/node_modules/suspicious-pkg/index.js',
    'https evil.example.com /exfil POST',
    'env NPM_TOKEN',
    'env AWS_SECRET_ACCESS_KEY',
    'write /root/.ssh/authorized_keys',
  ].join('\n')
}
