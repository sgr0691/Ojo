# Ojo Post-MVP Technical Specification

## Architecture Overview

Ojo acts as a runtime trust layer between AI agents and execution.

---

## Runtime Flow

AI Agent
  ↓
Ojo SDK
  ↓
Skill Runtime
  ↓
Policy Engine
  ↓
Sandbox Provider
  ↓
Execution Evidence
  ↓
Trust Evaluation
  ↓
Allow / Block / Approval

---

## Ojo Agent SDK

Example:

```ts
const ojo = new Ojo()

await ojo.execute({
  type: "shell",
  command: "npm install react"
})
```

Responsibilities:
- execution interception
- policy evaluation
- approval handling
- provenance generation
