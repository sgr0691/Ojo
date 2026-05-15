# Security Policy

## Reporting a Vulnerability

Ojo is a security tool — protecting developers and AI agents from supply-chain
attacks is its core mission. If you discover a security vulnerability in Ojo
itself, please report it privately.

**Do not file a public GitHub issue for security vulnerabilities.**

Instead, send details to: **security@ojo.dev** (placeholder — replace with actual email)

Please include:

- Description of the vulnerability
- Steps to reproduce
- Ojo version, Node.js version, OS, Docker version
- Potential impact
- Any suggested remediation (optional)

You should receive a response within 48 hours. If you don't, please follow up.

## Scope

The following are considered in-scope for security reports:

- Ojo's CLI and core libraries
- Docker provider sandbox escape vulnerabilities
- Risk engine bypass (a package that should be flagged but passes)
- Shim/monorepo build integrity
- Authentication bypass in remote providers (Daytona, Cloudflare)

The following are out of scope:

- Docker daemon vulnerabilities (report to Docker)
- Cloudflare/daytona platform vulnerabilities (report to them)
- Known `npm`/`pnpm`/`bun` vulnerabilities
- Dependency confusion in Ojo's own dependencies

## Security Assumptions

Ojo's security model relies on the following assumptions:

### Container isolation (Docker provider)

1. **Docker is trusted** — container breakout is possible but Docker is the
   industry standard for isolation.
2. **Container hardening is in place** — Ojo adds:
   - Non-root user (UID 1000)
   - Read-only root filesystem (tmpfs at `/tmp`, `/var/tmp`, `/app`)
   - Dropped capabilities (`--cap-drop=ALL`)
   - No privilege escalation (`--security-opt no-new-privileges`)
3. **Container images are trusted** — Ojo uses `node:22-alpine` pinned to
   a SHA256 digest. The digest is verifiable at pull time.
4. **No host filesystem exposure** — containers have no bind mounts.
5. **No host secret leakage** — only explicitly passed `env` vars reach the container.
6. **Network defaults to bridge** — outbound traffic is allowed by default
   (required for `npm install` to reach package registries).
   True `registryOnly` enforcement is planned but not yet implemented.

### Behavioral monitoring

7. **All behavioral signals are inferred from install output text** — Ojo does
   not use syscall-level monitoring. Network traffic and filesystem mutations
   cannot currently be observed and are honestly reported as `unavailable`.

### Supply chain

8. **Base image is pinned** — `node:22-alpine` is pulled by SHA256 digest.
   The digest must be manually updated when a new base image is needed.

## Best Practices for Users

- Keep Ojo updated: `git pull && pnpm install && pnpm build`
- Run Ojo with Docker whenever possible for full sandbox analysis
- Review trust reports carefully before approving MEDIUM+ installs
- Use `OJO_CI=true` in automated pipelines to prevent unreviewed installs
- Do not bypass Ojo with `OJO_ALLOW=true` unless you understand the risk
- Note that `OJO_ALLOW` always logs an audit warning — rely on this in CI monitoring

## Known Limitations

- Network traffic and filesystem mutations are not observable during sandbox execution
- `registryOnly` network policy is defined but not enforced (falls back to `allowAll`)
- Dayona and Cloudflare providers are experimental and not production-tested
- No automatic PATH setup — shims must be added manually
