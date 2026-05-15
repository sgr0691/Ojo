# Ojo

> Invisible runtime trust infrastructure for modern development and AI agents.

Ojo automatically intercepts `npm install` (and `pnpm add`, `bun add`), executes each
package inside an isolated Docker sandbox, analyzes its behavior, evaluates risk, and
only then allows the install to reach your development environment. You keep using
your package manager — Ojo works invisibly behind the scenes.

```bash
npm install is-odd
# Ojo: SAFE (0) — allowing install
# + is-odd@3.0.1
# added 1 package in 0.5s
```

---

## Why

AI-assisted development massively accelerates supply-chain risk. AI agents install
dependencies automatically, execute generated code, and accelerate trust decisions
beyond human review capacity. Existing security tooling is static-analysis focused,
reactive, and disconnected from real developer workflows.

Ojo introduces a transparent runtime trust layer between developers, AI agents,
package ecosystems, and untrusted code execution.

## Current Status

Ojo is currently in **source-only pre-alpha** (v0.1.0-alpha). The core pipeline
is functional for Docker-backed sandboxing of `npm`, `pnpm`, and `bun` install
commands. See [CHANGELOG](CHANGELOG.md) for the full release notes.

### Implemented

| Feature | Status |
|---------|--------|
| npm / pnpm / bun install interception via PATH shims | ✅ Stable |
| Ephemeral Docker sandbox with non-root, read-only FS, dropped capabilities | ✅ Stable |
| Behavioral analysis from sandbox install output (inferred from text) | ✅ Stable |
| Deterministic rule-based risk engine (7 checks) | ✅ Stable |
| npm registry metadata checks (package age, maintainers, repo, license, deprecation) | ✅ Stable |
| Human-readable trust reports | ✅ Stable |
| Interactive allow/block approval | ✅ Stable |
| CI mode (`OJO_CI=true`) — block MEDIUM+ installs non-interactively | ✅ Stable |
| Provider abstraction layer | ✅ Stable |
| Docker sandbox image pinned to SHA256 digest | ✅ Stable |
| CLI integration tests with mocked provider | ✅ Stable |
| Docker compatibility test matrix (opt-in, `pnpm test:docker`) | ✅ Stable |

### Experimental

| Feature | Status |
|---------|--------|
| Daytona remote sandbox provider | ⚠️ Experimental — requires API key, not production-tested |
| Cloudflare Sandbox provider | ⚠️ Experimental — requires bridge Worker, not production-tested |

### Planned

- True `registryOnly` network policy (currently falls back to `allowAll` with warning)
- Real syscall-level monitoring (currently inferred from install output text)
- Real network packet capture (currently marked `unavailable`)
- Real filesystem mutation tracing (currently marked `unavailable`)
- Override allowlist/blocklist
- Typosquatting detection via metadata
- See [Roadmap](#roadmap)

---

## Architecture

```
npm/pnpm/bun install <package>
         │
   ┌─────▼──────┐
   │  shim/<pm> │  (thin bash shim, first in PATH)
   └─────┬──────┘
         │
   ┌─────▼──────────┐
   │  ojo CLI       │  (Node.js)
   │  ─ parse<pm>Args
   │  ─ detect       │
   │    install cmd  │
   └─────┬──────────┘
         │
   ┌─────▼──────────────┐
   │  Sandbox Provider  │  (Docker / Daytona / Cloudflare)
   │  ─ create ephemeral│
   │  ─ exec npm install│  (sandbox always uses npm — available in image)
   │  ─ capture output  │
   │  ─ destroy         │
   └─────┬──────────────┘
         │
   ┌─────▼────────────────┐
   │  Behavioral Monitor  │
   │  ─ analyze output    │
   │  ─ create events     │
   │    (inferred from    │
   │     stdout/stderr)   │
   └─────┬────────────────┘
         │
   ┌─────▼────────────┐
   │  Risk Engine     │
   │  ─ 7 rule checks │
   │  ─ score + level │
   │  ─ TrustReport   │
   └─────┬────────────┘
         │
   ┌─────▼───────────┐
   │  Decision        │
   │  SAFE/LOW → allow│
   │  MEDIUM+ → ask   │
   │  BLOCKED → reject│
   └─────────────────┘
```

**Important:** Behavioral analysis is currently **inferred from the text output** of the
package install, not from syscall-level monitoring. Network traffic and filesystem
mutations are marked as `unavailable` — Ojo reports honestly when it cannot observe
these signals. See [Monitoring Limitations](#monitoring-limitations).

---

## Quick Start

### Prerequisites

- **Node.js** >= 22
- **pnpm** >= 9 (install: `npm install -g pnpm`)
- **Docker** (for the local sandbox provider)

### 1. Clone and build

```bash
git clone https://github.com/sgr0691/Ojo.git
cd ojo
pnpm install
pnpm build
```

### 2. Test the CLI

```bash
# Check version
node apps/cli/dist/index.js --version

# Test install detection (requires Docker)
node apps/cli/dist/index.js shim npm install is-odd
# → "Docker not available — skipping sandbox analysis" (if no Docker)
# → "SAFE (0) — allowing install" (if Docker is running)
```

### 3. Intercept real npm installs

```bash
# Add to your shell profile (~/.zshrc, ~/.bashrc, etc.) for persistence:
export PATH="/path/to/ojo/apps/cli/shim:$PATH"

# For temporary use in the current shell:
export PATH="$PWD/apps/cli/shim:$PATH"

# Now npm/pnpm/bun installs go through Ojo
npm install is-odd
# Ojo: SAFE (0) — allowing install
# + is-odd@3.0.1
# added 1 package in 0.5s

# pnpm also works
pnpm add is-odd

# bun also works
bun add is-odd

# Non-install commands pass through silently
npm run dev
pnpm test
bun run dev
```

### 4. Override flags

```bash
# Skip analysis entirely (logs audit warning)
OJO_ALLOW=true npm install some-package

# CI mode — block MEDIUM+ installs (score > 20) non-interactively
OJO_CI=true npm install suspicious-package

# Verbose output
npm install some-package --verbose
```

---

## CLI Reference

```
  ojo 0.1.0-alpha

Invisible runtime trust infrastructure for modern development and AI agents.

USAGE
  ojo [command]

COMMANDS
  shim npm <args>    Handle intercepted npm command
  shim pnpm <args>   Handle intercepted pnpm command
  shim bun <args>    Handle intercepted bun command
  --version, -v      Print version
  --help, -h         Print this help message

SHIM OPTIONS
  --allow            Skip sandbox analysis, allow install (logs warning)
  --ci               Non-interactive mode, block risky installs
  --verbose          Show detailed analysis output
```

---

## How the Risk Engine Works

Seven deterministic rules evaluate package install behavior:

| Rule | What it checks | Max score | Status |
|------|---------------|-----------|--------|
| `postinstall_scripts` | Non-trivial lifecycle scripts (postinstall, preinstall) | 30 | ✅ Real |
| `suspicious_commands` | `eval(`, `exec(`, `base64 -d`, `/dev/tcp/`, `chmod +x`, `nc`, `mkfifo` | 40 | ✅ Real |
| `curl_wget` | External binary downloads via curl/wget or `binary_download` events | 50 | ✅ Real |
| `outbound_network` | Network requests to non-whitelisted hosts | 30 | ⚠️ Unavailable — see below |
| `obfuscated_scripts` | Long base64 strings, hex encoding, `rot13`, `xxd -r`, `openssl enc` | 35 | ✅ Real |
| `env_access` | Access to sensitive env vars (TOKEN, SECRET, PASSWORD, etc.) | 20 | ✅ Real |
| `package_metadata` | Package age, version freshness, maintainers, repo, license | 80 | ✅ Real |

**Score → Risk Level:** 0 = SAFE, 1–20 = LOW, 21–50 = MEDIUM, 51–80 = HIGH, 81+ = BLOCKED

### Monitoring Limitations

| Signal | How it's obtained | Current status |
|--------|------------------|----------------|
| Process execution | Inferred from install output text | ✅ Available (inferred) |
| Lifecycle scripts | Inferred from install output text | ✅ Available (inferred) |
| Binary downloads | Inferred from URLs + binary names in output | ✅ Available (inferred) |
| Environment access | Inferred from sensitive keywords in output | ✅ Available (inferred) |
| Network requests | **Cannot currently observe** — no syscall instrumentation | ❌ Unavailable |
| Filesystem mutations | **Cannot currently observe** — no syscall instrumentation | ❌ Unavailable |

The risk engine **skips** unavailable rules rather than silently passing them. The report
explicitly shows which checks were skipped and why.

---

## Provider Roadmap

| Provider | Status | Notes |
|----------|--------|-------|
| Docker | **Stable** | Install Docker. No config needed. Image pinned to `@sha256:` digest. |
| Daytona | **Experimental** | Code exists, not production-tested. Requires API token. |
| Cloudflare Sandbox | **Experimental** | Code exists, not production-tested. Requires bridge Worker. |

---

## Security Model

### Container Hardening (Docker provider)

- **Non-root user** — runs as UID 1000 (not root)
- **Read-only rootfs** — except tmpfs at `/tmp`, `/var/tmp`, `/app`
- **Dropped capabilities** — `--cap-drop=ALL`
- **No privilege escalation** — `--security-opt no-new-privileges`
- **Immutable image** — pinned to SHA256 digest
- **Ephemeral** — container destroyed after each analysis
- **No host mounts** — containers have no access to host filesystem
- **No host secrets** — only explicitly passed env vars reach the container
- **npm cache isolation** — cache redirected to `/tmp/.npm-cache` (tmpfs)

### What Ojo protects against

- **Malicious postinstall scripts** — packages that run shell commands, download binaries, or exfiltrate environment variables during install
- **New or suspicious packages** — registry metadata (age, maintainers, repo, license) feeds risk scoring
- **AI agent supply-chain attacks** — automated installs by AI coding agents without human review

### What Ojo does NOT protect against

- **Runtime vulnerabilities** — Ojo only protects during install, not during application runtime
- **Compromised package updates** — if a trusted package is updated with malware, Ojo will re-analyze on next install
- **Build-time injection** — code that evades detection during install and activates later
- **Zero-day container escapes** — Ojo relies on Docker sandbox isolation; see SECURITY.md for assumptions
- **Network-based exfiltration** — cannot currently observe outbound network traffic during install

### Network policy

The default network policy is `allowAll` (full outbound access, required for `npm install`).
A `registryOnly` policy is defined but not enforced — Docker lacks native DNS-name-based
egress filtering. When selected, `registryOnly` logs a warning and falls back to `allowAll`.
See the issue tracker for progress on true registry-only enforcement.

### Trust boundaries

```
Untrusted zone                        Trusted zone
┌─────────────────────┐     ┌──────────────────────┐
│ npm registry        │     │ Developer machine     │
│ Package tarball     │     │ Real node_modules     │
│ Install scripts     │     │ Application code      │
│ Network egress      │     │ Source control        │
└─────────┬───────────┘     └──────────┬───────────┘
          │                            ▲
          ▼                            │
    ┌──────────────────┐              │
    │ Docker container │── allow ──────┘
    │ (ephemeral)      │── block ──────┐
    │ Read-only rootfs │              │
    │ No capabilities  │              ▼
    │ No host mounts   │     stderr: "install blocked"
    │ Non-root user    │
    └──────────────────┘
```

---

## Roadmap

### Short term

- True `registryOnly` network enforcement (sidecar proxy or iptables)
- Override allowlist/blocklist (`~/.ojo/config.json`)
- Installer / automatic PATH setup
- Typosquatting detection via string distance

### Medium term

- CI/CD integration (configurable policy, `ojo check` command)
- Container instrumentation (strace, seccomp notify)
- Real network packet capture

### Long term

- AI agent runtime mode (claude code / cursor / codex integration)
- Signed dependency attestations
- Organization-level policy enforcement
- Trust provenance graph

---

## Local Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run all tests
pnpm test

# Run Docker compatibility tests (requires Docker)
pnpm test:docker

# TypeScript type checking
pnpm typecheck

# Format code
pnpm format:fix

# Build in watch mode (all packages)
pnpm dev
```

### Package structure

```
ojo/
├── apps/cli/                # CLI entrypoint + shims
│   ├── src/
│   │   ├── index.ts         # CLI parser (version, help, shim)
│   │   ├── intercept.ts     # Interception flow (mockable integration tests)
│   │   └── prompt.ts        # Interactive approval prompt
│   ├── shim/npm             # Bash shim for npm (first in PATH)
│   ├── shim/pnpm            # Bash shim for pnpm
│   └── shim/bun             # Bash shim for bun
├── packages/
│   ├── shared/              # Shared types (PackageSpec, OjoContext)
│   ├── interceptor/         # npm/pnpm/bun argument parsing
│   ├── providers/           # Sandbox provider abstraction + implementations
│   │   ├── docker.ts        # DockerProvider (stable)
│   │   ├── daytona.ts       # DaytonaProvider (experimental)
│   │   └── cloudflare.ts    # CloudflareSandboxProvider (experimental)
│   ├── monitor/             # Behavioral evidence + provenance tracking
│   └── risk-engine/         # Deterministic rule engine + metadata fetcher
```

---

## License

Apache 2.0. See [LICENSE](LICENSE).
