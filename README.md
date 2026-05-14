# Ojo

> Invisible runtime trust infrastructure for modern development and AI agents.

Ojo automatically intercepts dependency installs, executes packages inside isolated sandboxes,
analyzes behavior, and only then allows promotion into the real developer environment.

Developers keep using:
- npm
- pnpm
- bun

Ojo works automatically behind the scenes.

---

# Core Thesis

AI-assisted software development massively increases supply-chain risk.

Ojo introduces a transparent trust layer between:
- developers
- AI agents
- package ecosystems
- CI/CD systems

and untrusted code execution.

---

# What Makes Ojo Different

Ojo is NOT:
- another package manager
- another container platform
- another security dashboard

Ojo IS:
- invisible-by-default
- runtime-first
- sandbox-native
- provider-agnostic
- designed for autonomous systems

---

# How It Works

Existing workflow:

```bash
npm install react-markdown
```

Ojo intercepts automatically:

1. detects package install
2. creates ephemeral sandbox
3. installs package safely
4. monitors behavior
5. evaluates risk
6. allows or blocks install

---

# Initial Sandbox Providers

Day 1 providers:
- Daytona
- Cloudflare Sandbox

Local fallback:
- Docker

Future:
- Vercel Sandbox
- Kubernetes
- Firecracker microVMs

---

# MVP Features

- automatic npm interception
- automatic pnpm interception
- automatic bun interception
- ephemeral sandbox execution
- behavioral monitoring
- deterministic risk engine
- trust reports
- install blocking
- override support
- provider abstraction layer

---

# Vision

Ojo becomes the trust runtime for:
- AI coding agents
- autonomous software systems
- CI/CD pipelines
- cloud-native development

---

# License

Apache 2.0
