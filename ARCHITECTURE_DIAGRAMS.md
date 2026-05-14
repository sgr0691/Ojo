# Ojo Architecture Diagrams

## Runtime Interception Flow

```
Developer
    │
    ▼
npm install package
    │
    ▼
Ojo Shim Intercepts
    │
    ▼
Sandbox Provider Layer
    │
    ├── Daytona
    ├── Cloudflare Sandbox
    └── Docker Fallback
    │
    ▼
Isolated Package Execution
    │
    ▼
Behavioral Monitoring
    │
    ▼
Risk Engine
    │
    ▼
Allow / Block Decision
    │
    ▼
Real Local Install
```

---

## Provider-Agnostic Architecture

```
        Ojo Runtime
              │
  ┌───────────┼───────────┐
  │           │           │
  ▼           ▼           ▼
Daytona   Cloudflare    Docker
           Sandbox
```

---

## Agentic Security Flow

```
AI Agent
   │
   ▼
Requests Dependency
   │
   ▼
Ojo Automatically Intercepts
   │
   ▼
Sandbox Execution
   │
   ▼
Behavioral Analysis
   │
   ▼
Trust Evaluation
   │
   ├── Allow
   └── Block
```
