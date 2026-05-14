# Ojo PRD

## Product Vision

Ojo is a transparent runtime trust layer that automatically intercepts package installs,
safely executes them inside isolated sandboxes, analyzes behavior, and prevents malicious
dependencies from reaching developer environments, AI agents, CI/CD systems, or production.

---

# Problem

Modern software development is increasingly autonomous.

AI agents:
- install dependencies automatically
- execute generated code
- interact with shell environments
- accelerate trust decisions beyond human review capacity

Existing security tooling is:
- static-analysis focused
- reactive
- enterprise-heavy
- disconnected from real developer workflows

Developers need:
- invisible security
- minimal friction
- runtime-level trust verification
- agent-safe execution environments

---

# Product Goals

## Primary Goal

Create invisible-by-default dependency protection for modern development workflows.

## Secondary Goals

- support AI-native development
- reduce supply-chain attacks
- preserve developer velocity
- remain provider-agnostic

---

# Key Product Principle

Developers should not change their workflows.

Existing workflows should continue working:

```bash
npm install package
```

Ojo automatically intercepts and protects installs behind the scenes.

---

# Target Users

## Primary

- AI-assisted developers
- Cursor users
- Claude Code users
- Codex users
- startup engineering teams
- OSS maintainers

## Secondary

- CI/CD teams
- security-conscious organizations
- platform engineering teams

---

# MVP Scope

## Included

- automatic npm interception
- automatic pnpm interception
- automatic bun interception
- sandbox abstraction layer
- Daytona provider
- Cloudflare Sandbox provider
- Docker fallback provider
- behavioral monitoring
- deterministic risk engine
- trust scoring
- install blocking/approval
- provider-agnostic architecture

## Excluded

- enterprise dashboards
- IAM/RBAC
- production runtime security
- SIEM integrations
- browser UI
- AI-generated risk scoring

---

# Success Metrics

## Developer Experience

- minimal setup
- transparent workflow integration
- sub-5 second analysis startup

## Security

- detect malicious install behavior
- detect suspicious outbound traffic
- block dangerous install scripts

## Adoption

- AI developer adoption
- OSS ecosystem experimentation
- CI/CD usage

---

# Long-Term Vision

Ojo evolves into:
- trust infrastructure for AI agents
- runtime policy engine
- dependency provenance layer
- autonomous software execution guardrail
