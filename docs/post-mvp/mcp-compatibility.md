# Ojo MCP Compatibility Plan

## What MCP Provides

Model Context Protocol (MCP) defines a standard interface through which AI agents
call external tools and access resources. An MCP server exposes structured tools
with input/output schemas. An MCP client (Claude Code, Cursor, or any MCP-capable
host) calls those tools during agent execution.

Ojo's policy engine, approval workflow, and receipt system map naturally onto MCP
primitives. The integration requires no changes to the core runtime.

---

## Integration Points

### Ojo as an MCP Server

The minimal viable integration exposes two tools and one resource:

```
Tool: ojo_evaluate
  Input:  { actionType, ...payload }
  Output: { requestId, policyResult, approvalState, receipt }
  Maps to: OjoRuntime.evaluate()

Tool: ojo_resolve
  Input:  { requestId, approved: boolean }
  Output: { approvalState }
  Maps to: resolveApproval()

Resource: ojo://receipts/{receiptId}
  Returns: ExecutionReceipt
  Maps to: receipt store lookup
```

The AI agent calls `ojo_evaluate` before executing any dangerous action. Ojo
returns the policy decision. The agent acts on the result — proceeding, waiting
for approval, or aborting.

This is voluntary. The agent must be prompted or configured to call Ojo. Ojo
does not intercept MCP tool calls transparently.

### Ojo Intercepting MCP Tool Calls (future)

A deeper integration would place Ojo as a proxy in the MCP transport layer,
intercepting `bash_execute` or `write_file` tool calls before they reach the
underlying tool server. This requires:
- Knowledge of the upstream tool server's schema
- A passthrough proxy that wraps each tool call
- No official MCP proxy protocol exists yet

This approach is deferred — it is the right long-term architecture but has no
stable protocol foundation today.

---

## Trust Boundaries

```
AI Agent (MCP client)
  ↓  MCP tool call (stdio or local socket — trusted transport)
Ojo MCP Server
  ↓  OjoRuntime.evaluate() — untrusted input from agent
Policy Engine
  ↓  deterministic rules
Allow / Block / Approval
  ↓  structured result returned to agent
AI Agent decides whether to proceed
```

Key boundary: the MCP transport is trusted (local process communication). The
_content_ of the tool call is untrusted — the agent's requested action may be
malicious, erroneous, or confused. The policy engine is the security layer, not
the transport.

The MCP server must never trust `actionType` or payload fields without evaluation.
An agent can claim `actionType: "package_install"` while putting `rm -rf /` in
the payload.

---

## Minimal Architecture

A new package `apps/mcp-server` (or `@ojo/mcp`) containing:

```
apps/mcp-server/
  src/
    server.ts        MCP server setup, tool registration
    tools/
      evaluate.ts    ojo_evaluate tool handler
      resolve.ts     ojo_resolve tool handler
    resources/
      receipts.ts    ojo://receipts/{id} resource handler
    receipt-store.ts In-memory receipt store keyed by receiptId
```

The server imports `OjoRuntime` from `@ojo/agent-runtime`. No new policy logic.
No new approval logic. The MCP layer is purely a protocol adapter.

The receipt store is in-memory only. No persistence, no network, no telemetry.
Receipts expire when the server process exits.

---

## Phased Rollout

**Phase 1 — Schema only**
- Define tool input/output schemas in JSON Schema
- Register tools with no implementation (stub responses)
- Verify MCP host discovers and lists Ojo tools correctly

**Phase 2 — evaluate tool**
- Wire `ojo_evaluate` to `OjoRuntime.evaluate()`
- Return structured `OjoEvaluateResult`
- Cover with integration tests (no MCP host needed — call handler directly)

**Phase 3 — resolve tool**
- In-memory pending approval store keyed by `requestId`
- `ojo_resolve` transitions state, returns updated `ApprovalState`
- Timeout mechanism: pending approvals expire after configurable interval

**Phase 4 — receipts resource**
- Receipt store persists receipts by `receiptId` during server lifetime
- `ojo://receipts/{id}` returns `ExecutionReceipt` as MCP resource
- Clear receipts on server restart (local-first, no persistence)

---

## What MCP Cannot Fix

MCP integration does not solve the fundamental monitoring gap: Ojo still evaluates
intent (what the agent _says_ it wants to do) rather than behavior (what the
agent _actually does_ at the OS level). An agent that calls `ojo_evaluate` and
receives `allow`, then runs something different, is not detected.

The honest mitigation: require agents to re-evaluate before every action, not
just ambiguous ones. Receipts provide the audit trail. Enforcement is still
voluntary at the agent layer.
