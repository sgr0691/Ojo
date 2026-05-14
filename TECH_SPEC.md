# Ojo Technical Specification

## Architecture Overview

Ojo uses transparent package-manager interception combined with provider-agnostic sandbox execution.

---

# Core Architecture

```
npm/pnpm/bun
        ↓
    Ojo Shim Layer
        ↓
  Interceptor Engine
        ↓
Sandbox Provider Layer
        ↓
Behavioral Monitoring
        ↓
    Risk Engine
        ↓
  Allow / Block Decision
        ↓
  Real Package Install
```

---

# Interception Layer

Ojo installs lightweight runtime shims into PATH.

Example:

```
npm → ojo shim → real npm
```

Responsibilities:
- intercept install commands
- proxy package manager behavior
- preserve native developer UX
- transparently inject sandbox analysis

---

# Sandbox Provider Layer

Ojo uses a provider abstraction architecture.

## Day 1 Providers

### Daytona
Primary remote sandbox provider.

### Cloudflare Sandbox
Edge-native isolated execution provider.

### Docker
Local fallback runtime.

---

# Provider Interface

```ts
interface SandboxProvider {
  create(): Promise<Sandbox>
  destroy(id: string): Promise<void>
  execute(cmd: string): Promise<Result>
}
```

---

# Behavioral Monitoring

Captures:
- process trees
- filesystem mutations
- outbound network requests
- shell execution
- binary downloads
- environment access attempts

---

# Risk Engine

Deterministic heuristic engine.

Checks:
- install scripts
- suspicious shell commands
- obfuscated code
- outbound traffic
- package age
- maintainer churn
- typosquatting
- known CVEs

---

# Security Defaults

Sandboxes execute:
- without host secrets
- without host filesystem access
- inside ephemeral environments
- with restricted networking

---

# Setup Flow

Install:

```bash
brew install ojo
```

Enable protection:

```
Enable automatic package protection?
[Y/n]
```

Ojo then:
- installs shims
- updates PATH
- intercepts installs automatically

---

# Future Extensions

- CI/CD enforcement
- AI agent runtime mode
- signed dependency attestations
- org-level policy enforcement
- trust provenance graph
