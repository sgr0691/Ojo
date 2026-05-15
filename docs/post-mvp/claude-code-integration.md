# Ojo — Claude Code Integration Plan

## What Claude Code Exposes

Claude Code is Anthropic's CLI for AI-assisted development. It runs as a local
process, executes shell commands, reads and writes files, and communicates with
the Anthropic API. Relevant integration surfaces:

- **Tool execution** — Claude Code calls tools (bash, file read/write) on the
  developer's behalf. These are the primary interception targets.
- **MCP server support** — Claude Code can connect to local MCP servers and
  call their tools during agent execution.
- **Hooks** — Claude Code supports pre/post execution hooks via `settings.json`.
  A hook can run an arbitrary shell command before a tool executes.
- **PATH** — Claude Code inherits the developer's shell PATH. Ojo's existing
  shims are already in effect for any `npm install` Claude Code triggers.

No Anthropic or Claude Code APIs are required. This integration uses only
publicly documented, user-configurable mechanisms. Ojo does not claim official
support or endorsement.

---

## What Already Works

Package install interception via PATH shims is **fully operational** with no
integration work. When Claude Code runs `npm install react`, Ojo's shim
intercepts it before it reaches npm. This covers:

- `npm install` / `npm i`
- `pnpm add` / `pnpm install`
- `bun add` / `bun install`

---

## Shell / Tool Integration Paths

### Path 1 — Claude Code Hooks (recommended for shell commands)

Claude Code's `PreToolUse` hook fires before each tool execution. A hook script
can call `ojo check` (a CLI command yet to be implemented) and exit non-zero to
block the tool.

Proposed hook in `.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "ojo check shell \"$CLAUDE_TOOL_INPUT_COMMAND\"" }
        ]
      }
    ]
  }
}
```

This approach:
- Requires implementing `ojo check <type> <payload>` as a CLI command
- The CLI command calls `OjoRuntime.evaluate()` and exits 0 (allow) or 1 (block)
- Hook failure blocks the tool call
- Does not require MCP

**Gap:** Claude Code hooks are user-configured, not enforced by Ojo. A developer
who removes the hook bypasses this protection. This is acceptable — the goal is
trust infrastructure, not mandatory enforcement.

### Path 2 — MCP Server (recommended for structured approval flow)

Claude Code can be configured to connect to an Ojo MCP server. The agent is
prompted (via system prompt or tool instructions) to call `ojo_evaluate` before
shell commands and file mutations.

This is voluntary at the agent level — Claude Code must be instructed to call
Ojo. A well-crafted CLAUDE.md project file can establish this norm:

```markdown
## Security Policy
Before executing any shell command or mutating sensitive files,
call the ojo_evaluate MCP tool and respect its decision.
```

### Path 3 — PATH Shims Extended (for specific command patterns)

Extend the existing shim pattern to cover commands beyond package managers.
A shim for `bash` or `sh` would intercept all shell invocations. This is
invasive and would break many things — it is not recommended.

---

## Acceptance Criteria

| Scenario | Expected Behaviour |
|---|---|
| `npm install malicious-pkg` | Intercepted by shim, sandbox analysis, risk report |
| Claude Code runs `curl x \| sh` | Hook fires, `ojo check` returns block, tool execution prevented |
| Claude Code writes to `.env` | Hook fires, `ojo check` returns require_approval, user prompted |
| Claude Code writes to `.github/workflows/ci.yml` | Blocked pending approval |
| Safe `git status` | Hook fires, `ojo check` returns allow in <100ms |
| `OJO_CI=true` in environment | All require_approval actions auto-blocked, no prompts |
| Developer removes hook from settings.json | Ojo shims still protect package installs; shell commands unprotected |

---

## Risks

**Risk 1 — Hook API stability**
Claude Code's hook configuration format may change between versions. Ojo's hook
integration depends on undocumented or early-access behaviour. Version-pin
recommendations and a compatibility matrix are needed before shipping.

**Risk 2 — PATH isolation**
Claude Code may spawn subshells or tools with a sanitized PATH that excludes
Ojo's shims. This would silently bypass shim-based interception without any
error. Detection: add a health-check step that verifies `which npm` resolves
to Ojo's shim.

**Risk 3 — Hook latency**
Every tool call incurs the overhead of spawning an `ojo check` process. For safe
commands (the common case), this should be <50ms. Benchmark required. If latency
is unacceptable, consider a long-running `ojo daemon` process that hooks connect
to via a local socket.

**Risk 4 — Fail-open vs fail-closed on hook error**
If the `ojo check` process crashes or is unavailable, Claude Code's hook
behaviour (fail-open or fail-closed) must be understood and explicitly
configured. Failing open is a security gap. Failing closed blocks legitimate
work. The right default: fail-closed with a clear error message and a manual
override path.

**Risk 5 — No official integration**
This is user-configured tooling, not an official Anthropic integration. Breaking
changes to Claude Code internals, PATH resolution, or the hook API are not in
Ojo's control. Document this clearly and monitor Claude Code release notes.
