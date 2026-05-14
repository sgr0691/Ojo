# Ojo UX Flows & User Journeys

## Core UX Principle

Ojo should feel invisible.

Developers should not:
- learn new workflows
- change package managers
- manage infrastructure
- think about sandbox lifecycles

---

# Initial Onboarding

## Install

```bash
brew install ojo
```

Ojo asks:

```
Enable automatic package protection?
[Y/n]
```

Once enabled:
- package installs are automatically protected
- native workflows continue working

---

# Standard Developer Flow

Developer runs:

```bash
npm install react-markdown
```

Ojo automatically:
1. intercepts request
2. creates ephemeral sandbox
3. installs package safely
4. monitors behavior
5. evaluates risk
6. allows install

User sees:

```
Ojo: package verified
Installing...
```

---

# Suspicious Dependency Flow

Developer runs:

```bash
npm install suspicious-package
```

Ojo detects:

- obfuscated install script
- outbound credential request
- newly published maintainer

User sees:

```
HIGH RISK

- Executes obfuscated postinstall script
- Attempts outbound network request
- Newly published package

Install blocked.
```

---

# AI Agent Flow

Claude Code or Cursor attempts dependency install.

Ojo intercepts automatically.

Trust evaluation occurs before package promotion.

---

# UX Design Principles

## Invisible Safety

Safe installs should feel nearly instant.

---

## Fast Feedback

Risk reports should:
- be concise
- explain why
- avoid security jargon

---

## Native Workflows

Ojo enhances:
- npm
- pnpm
- bun

without replacing them.
