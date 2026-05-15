# Ojo Technical Specification

## Architecture Overview

Ojo uses transparent package-manager interception (npm, pnpm, bun) combined with
provider-agnostic sandbox execution.

---

# Core Architecture

```
npm/pnpm/bun
         ↓
     Ojo Shim Layer  (bash scripts in PATH)
         ↓
   Interceptor Engine  (command parsing)
         ↓
 Sandbox Provider Layer  (Docker / Daytona / Cloudflare)
         ↓
 Behavioral Analysis  (inferred from install output)
         ↓
     Risk Engine  (deterministic rules + registry metadata)
         ↓
   Allow / Block Decision
         ↓
   Real Package Install
```

---

# Interception Layer

Ojo provides lightweight bash shims that sit in PATH ahead of the real
package-manager binaries. Each shim:
1. Routes the command through Ojo's trust layer
2. If Ojo allows the install, passes through to the real binary
3. If Ojo blocks, exits with non-zero status

Shims exist for:
- `npm` — detects `install`, `i`, `add`
- `pnpm` — detects `add`, `install`, `i`
- `bun` — detects `add`, `install`, `i`

Non-install commands (run, test, exec, etc.) pass through instantly without
sandbox analysis.

---

# Sandbox Provider Layer

```
interface SandboxProvider {
  name: SandboxProviderName
  create(options?: SandboxCreateOptions): Promise<Sandbox>
  destroy(id: SandboxId): Promise<void>
  execute(id: SandboxId, command: string, options?: ExecuteOptions): Promise<ExecutionResult>
  health(): Promise<ProviderHealth>
}
```

## Docker Provider (Stable)

The default and most mature provider. Creates ephemeral Docker containers with:

- Non-root user (UID 1000)
- Read-only root filesystem (tmpfs at `/tmp`, `/var/tmp`, `/app`)
- Dropped capabilities (`--cap-drop=ALL`)
- No privilege escalation (`--security-opt no-new-privileges`)
- Image pinned to SHA256 digest
- npm cache isolated to `/tmp/.npm-cache`
- Resource limits (optional)
- Network policy: `allowAll` (default), `none` (opt-in), or `registryOnly` (defined but not enforced — logs warning)

## Daytona Provider (Experimental)

Creates remote sandboxes via the Daytona REST API. Requires `DAYTONA_API_KEY`.
Not production-tested.

## Cloudflare Sandbox Provider (Experimental)

Creates sandboxes via a Cloudflare Workers bridge or Workers Sandbox API.
Requires `CF_API_TOKEN` and a bridge Worker URL or account ID.
Not production-tested.

---

# Behavioral Monitoring

Ojo captures behavioral signals **inferred from the text output** of the package
install command. Each signal is tagged with a provenance marker:

| Signal | Provenance | Detail |
|--------|------------|--------|
| Process execution | `inferred` | Parsed from install output text |
| Lifecycle scripts | `inferred` | Lifecycle keyword match in output |
| Binary downloads | `inferred` | URL or curl/wget name in output |
| Environment access | `inferred` | Sensitive keyword match in output |
| Network requests | `unavailable` | Cannot observe without syscall instrumentation |
| Filesystem mutations | `unavailable` | Cannot observe without syscall instrumentation |

Unavailable signals cause the corresponding risk rules to be **skipped** rather
than silently passed. The trust report explicitly shows skipped checks.

Future versions will add syscall-level monitoring (strace, seccomp notify) for
true network and filesystem visibility.

---

# Risk Engine

Deterministic heuristic engine with 7 rules:

1. **postinstall_scripts** — Flags non-trivial lifecycle scripts
2. **suspicious_commands** — Detects eval, exec, base64 decodes, /dev/tcp, etc.
3. **curl_wget** — Detects external binary downloads
4. **outbound_network** — Flags non-whitelisted network requests (skipped when signal unavailable)
5. **obfuscated_scripts** — Detects obfuscated shell commands
6. **env_access** — Detects sensitive env var access (TOKEN, SECRET, etc.)
7. **package_metadata** — Registry metadata signals (age, maintainers, repo, license, deprecation)

Each rule returns a score (0–80). Scores are summed to determine risk level:
SAFE (0), LOW (1–20), MEDIUM (21–50), HIGH (51–80), BLOCKED (81+).

## Metadata signals

Ojo fetches package metadata from the npm registry API. Signals include:
- Package age (days since first publish)
- Version age (days since latest version publish)
- Maintainer count
- Repository field presence
- License field presence
- Deprecation status

Metadata is cached in-memory per process execution.

---

# Security Defaults

Sandboxes execute:
- without host secrets
- without host filesystem access
- inside ephemeral environments
- as non-root user (UID 1000)
- with read-only root filesystem (tmpfs for writable paths)
- with dropped capabilities
- with network access configurable through the NetworkPolicy interface

---

# Network Policy

```typescript
type NetworkPolicy = 'allowAll' | 'registryOnly' | 'none'
```

- `allowAll` (default) — full outbound access via Docker bridge
- `none` — complete network isolation (`--network none`)
- `registryOnly` — defined but **not enforced** via Docker alone (logs warning, falls back to `allowAll`)

True `registryOnly` enforcement requires a sidecar proxy or iptables-based
egress filtering, which is planned.

---

# Setup

Currently, Ojo requires manual setup:

```bash
# Build
git clone <repo> && cd ojo && pnpm install && pnpm build

# Add shims to PATH (before real package managers)
export PATH="$PWD/apps/cli/shim:$PATH"

# Verify
npm install is-odd
```

A future release will include automated setup via `brew` and `ojo setup` command.

---

# CLI Reference

```
ojo shim npm <args>    Handle intercepted npm command
ojo shim pnpm <args>   Handle intercepted pnpm command
ojo shim bun <args>    Handle intercepted bun command
```

Options:
- `--allow` — Skip sandbox analysis (logs audit warning)
- `--ci` — Non-interactive mode, block MEDIUM+ installs
- `--verbose` — Show detailed analysis output

---

# Future Extensions

- True `registryOnly` network enforcement
- Syscall-level monitoring (strace, seccomp notify)
- CI/CD enforcement (`ojo check` command)
- AI agent runtime mode
- Signed dependency attestations
- Org-level policy enforcement
- Trust provenance graph
