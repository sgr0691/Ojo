# Ojo — Codex Integration Plan

## What Ojo Can and Cannot Know About Codex

Codex (OpenAI's coding agent, including the Codex CLI and GitHub Copilot
Workspace) is an external system. Its internal tool execution model, sandbox
architecture, and extension points are not publicly documented in sufficient
detail to design a deep integration. This plan avoids assumptions about Codex
internals and focuses only on observable, OS-level integration surfaces.

---

## What Ojo's Existing Shims Already Intercept

Any command that Codex runs through a normal shell process inherits the
developer's PATH. If Ojo's shims are installed, the following are intercepted
transparently with no Codex-specific work:

- `npm install` / `npm i` / `npm add`
- `pnpm add` / `pnpm install`
- `bun add` / `bun install`

This is the same guarantee as for any other tool — it depends entirely on Ojo's
shims being earlier in PATH than the real package manager binaries.

---

## Runtime Interception Paths

### Path 1 — PATH Shims (operational, limited scope)

**What it catches:** Package install commands executed via a shell that inherits
the developer's PATH.

**What it misses:** Package installs executed via full binary path
(`/usr/local/bin/npm install`), via a containerised environment with its own
PATH, or via Codex's internal tool runner if it does not spawn a user shell.

**Reliability:** Unknown without testing against the specific Codex runtime.
The first integration task is to verify that `which npm` inside a Codex-spawned
shell resolves to Ojo's shim, not the real npm.

### Path 2 — `ojo check` CLI Command (for shell command evaluation)

A future `ojo check shell "<command>"` CLI command would allow any tool to query
Ojo's policy engine before executing a shell command. Codex could be configured
(via a system prompt, a project-level instruction file, or a Codex configuration
file) to call this before executing shell commands.

This is fully voluntary — there is no mechanism to force Codex to call `ojo check`
without Codex exposing a pre-execution hook API.

### Path 3 — Wrapper Script

A wrapper script around the shell binary could intercept all shell command
executions. Example: replace `/bin/bash` in the user's shell config with a
script that calls `ojo check` before delegating to the real bash.

**This is not recommended.** It is fragile, invasive, and will break legitimate
shell operations (scripts that rely on bash internals, subshell behaviour, etc.).
It also creates a single point of failure for the entire developer environment.
Document it as possible but unsupported.

### Path 4 — Codex Sandbox Integration (if Codex exposes one)

If a future version of Codex supports pluggable sandbox providers or pre-execution
hooks at the agent SDK level, Ojo's `SandboxProvider` interface or
`OjoRuntime.evaluate()` could be wired in. This requires Codex to expose the
integration point — it cannot be done from Ojo's side alone.

---

## What Ojo Cannot Control

| Codex Action | Ojo Coverage | Reason |
|---|---|---|
| `npm install` via shell | ✅ PATH shim (if PATH intact) | Shell inherits dev PATH |
| `npm install` via full path | ❌ None | Shim not in effect |
| Shell command (rm -rf, curl) | ❌ None without hook | No interception mechanism |
| File reads | ❌ None | OS-level read, no intercept point |
| File writes | ❌ None | Same |
| Outbound HTTP from Codex process | ❌ None | No network proxy |
| Codex's own API calls to OpenAI | ❌ Out of scope | Not Ojo's domain |
| Commands run inside Codex's sandbox | ❌ Depends on sandbox | Unknown internals |

---

## Known Unknowns

The following cannot be resolved without direct testing against the Codex runtime:

1. Does Codex spawn shell commands through the user's login shell (which inherits
   PATH) or through a minimal environment?
2. Does Codex have a pre-execution hook API similar to Claude Code?
3. Does Codex use a containerised environment that would isolate it from Ojo's shims?
4. Does Codex support project-level instruction files (like CLAUDE.md) that could
   instruct the agent to call `ojo check`?

These questions must be answered empirically. The integration plan cannot move
past Path 1 without this information.

---

## Recommended First Steps

1. Verify shim interception: run Codex on a project with Ojo installed and
   trigger `npm install` — confirm Ojo's shim fires.
2. Capture Codex's shell environment: log `PATH` and `env` from inside a
   Codex-spawned shell to understand what it inherits.
3. Identify any Codex configuration files or instruction mechanisms
   (equivalent to CLAUDE.md) that could carry `ojo check` instructions.
4. Do not attempt wrapper-script or LD_PRELOAD approaches until shim and
   hook paths are exhausted.

---

## What to Avoid

- Do not make assumptions about Codex's internal tool runner
- Do not intercept at the OS kernel level (ptrace, seccomp, LD_PRELOAD) —
  this is fragile, requires elevated permissions, and is outside Ojo's scope
- Do not claim Codex integration works until empirically verified on the
  specific Codex version and runtime in use
