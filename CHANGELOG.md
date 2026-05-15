# Changelog

## v0.1.0-alpha (2026-05-15) — Source-Only Pre-Alpha

**Source-only pre-alpha release.** Ojo is not published to npm or Homebrew.
Installation requires cloning the repo and building from source (see [README](README.md)).

### What Works

- **npm / pnpm / bun install interception** — transparent PATH shims intercept package
  installs, route them through Ojo's trust layer, and pass through to the real package
  manager on approval.
- **Ephemeral Docker sandbox** — hardened containers with non-root user (UID 1000),
  read-only rootfs (tmpfs at `/tmp`, `/var/tmp`, `/app`), dropped capabilities
  (`--cap-drop=ALL`), and no privilege escalation.
- **Behavioral analysis** — structured `ExecutionEvidence` extracted from sandbox
  install output, with honest provenance tracking (`inferred` vs `unavailable`).
- **Deterministic risk engine** — 7 rules scoring 0–80 each: lifecycle scripts,
  suspicious commands, curl/wget downloads, outbound network requests, obfuscated
  scripts, env access, and package metadata.
- **npm registry metadata** — checks package age, version age, maintainer count,
  repository/license presence, and deprecation status. Rate-limited and cached.
- **Trust reports** — human-readable output with per-rule scoring and risk level
  (SAFE / LOW / MEDIUM / HIGH / BLOCKED).
- **CI mode** — `OJO_CI=true` blocks MEDIUM+ installs non-interactively.
- **Docker image pinning** — `node:22-alpine` pinned to SHA256 digest.

### Security Model

- **Fail-closed**: install is blocked when Docker is unavailable (bypass via
  `OJO_ALLOW=true` with audit warning).
- **Shell injection protection**: package names are shell-escaped before being
  passed to the sandbox.
- **Container isolation**: non-root, read-only, cap-drop, no-new-privileges.
- **Honest signal provenance**: signals that cannot be observed (network traffic,
  filesystem mutations) are explicitly marked `unavailable` and cause corresponding
  risk rules to be skipped rather than silently passed.

### Known Limitations

- Network traffic and filesystem mutations are **not observable** during sandbox
  execution — all behavioral signals are inferred from install output text.
- `registryOnly` network policy is defined but **not enforced** via Docker alone
  (falls back to `allowAll` with a warning).
- Daytona and Cloudflare providers are **experimental stubs** — not tested against
  real APIs.
- No syscall-level monitoring — future work.
- No automatic PATH setup — shims must be added manually or via `apps/cli/install.sh`.

### Install / Setup

```bash
git clone <repo> && cd ojo && pnpm install && pnpm build
export PATH="$PWD/apps/cli/shim:$PATH"   # temporary
# or: bash apps/cli/install.sh           # persistent (adds to shell profile)
npm install is-odd                       # try it
```

### Test Status

```
Build:    6/6 packages
Tests:    234 passed (mocked) + 13 Docker integration (opt-in)
Typecheck: 11/11 packages
```

### Files Changed (since 0.0.1)

- `apps/cli/src/intercept.ts` — fail-closed on provider unavailable; shell-escaping
  for package names; OJO_ALLOW audit hardening; renamed `handleNpmInstall` →
  `handleInstall`
- `packages/monitor/src/normalize.ts` — `createReport` defaults all signals to
  `unavailable` (conservative)
- `packages/monitor/src/evidence.ts` — correct provenance per signal
- `packages/monitor/src/fixtures.ts` — `makeReport` infers signals from events
- `packages/risk-engine/src/rules.ts` — removed dead `checkNewlyPublished` placeholder
- `packages/risk-engine/src/metadata.ts` — rate limiting, fetch timeout
- `packages/risk-engine/src/format.ts` — fixed check/cross Unicode characters
- `packages/risk-engine/src/index.ts` — `package_metadata` rule in DEFAULT_RULES
- `packages/providers/src/registry.ts` — removed unused ProviderRegistry
- `packages/providers/src/providers/docker.ts` — `timeout` wrapper for Docker exec
- `packages/providers/src/providers/daytona.ts` — `@deprecated` tag
- `packages/providers/src/providers/cloudflare.ts` — `@deprecated` tag
- `packages/shared/src/index.ts` — removed unused `OjoContext`
- `packages/interceptor/src/index.ts` — removed unused `shimPath`
- `apps/cli/install.sh` — new installer script
- `ARCHITECTURE_DIAGRAMS.md` — deleted (content in README)
- `UX_FLOWS.md` — deleted (aspirational, not implemented)
- `IMPLEMENTATION_PLAN.md` — deleted (inaccurate)
- `README.md`, `SECURITY.md`, `CONTRIBUTING.md`, `TECH_SPEC.md` — honest audit
