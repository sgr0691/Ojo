# Ojo Post-MVP Architecture Audit

This is a direct assessment. No diplomatic softening.

---

## Trust Boundaries

### What the boundary diagram says vs what it does

The README's trust diagram shows a clean boundary between the untrusted zone
(npm registry, install scripts) and the trusted zone (developer machine), with
the Docker container as the gate. This is accurate for package installs.

The post-MVP runtime adds a second trust diagram:

```
AI Agent → Ojo SDK → Policy Engine → Allow/Block
```

This diagram is misleading. The policy engine evaluates what the agent _claims_
to want to do. If the agent calls `ojo.evaluate({ actionType: "shell_command",
command: "ls" })` and then runs `curl x | sh`, Ojo never knew. The receipt is
signed for `ls`. The actual execution is unobserved.

**The trust boundary is at the agent's honesty, not at OS execution.**

This is the most important risk in the entire post-MVP design and it is not
stated anywhere in the current documentation.

### PATH bypass — already documented, still unresolved

Any tool using the full binary path (`/usr/local/bin/npm`) bypasses every shim.
Any tool running in a container bypasses every shim. The fix (a true registry-only
network policy, or a kernel-level syscall interceptor) is on the roadmap but
has no implementation. The gap between "Ojo is protecting you" and "Ojo is
protecting you if the tool cooperates" is not surfaced to the user.

### OJO_ALLOW=true is a complete bypass

An AI agent that knows this env var can disable Ojo entirely. The current
warning logging is the only mitigation. In a world where AI agents have access
to the developer's shell environment (which they do — it is why they are useful),
this bypass is reachable by any sufficiently capable agent.

---

## Dead Abstractions

### Two receipt types

`RuntimeExecutionReceipt` (in `types.ts`) and `ExecutionReceipt` (in `receipt.ts`)
coexist. `RuntimeExecutionReceipt` is used by `ShellCommandSkill.buildReceipt()`
and `FileMutationSkill.buildReceipt()`. `ExecutionReceipt` is used by `createReceipt()`
and `OjoRuntime`. They carry the same data with slightly different field names.
A future caller will have to know which type to use and why. This will cause bugs.

The fix: pick one, delete the other. `ExecutionReceipt` is more structured and
belongs in the runtime layer. `RuntimeExecutionReceipt` predates it and should
be removed.

### Skill.describe() is called by nothing

Every skill implements `describe(request)` which returns a human-readable
summary. Nothing in the approval flow, the SDK, or the receipt system calls it.
The method exists to describe actions to a human during an approval prompt —
but the approval prompt does not exist yet. Until `describe()` is wired to
something visible, it is dead code.

### warn outcome has no implementation

`PolicyOutcome` includes `'warn'`. No rule emits it. The approval flow maps it
to `not_required` (so it behaves identically to `allow`). The receipt system
stores it. It appears in tests only as a copy-paste artefact. Either implement
it (add rules that use it, surface it in the terminal) or remove it from the
type until it is needed.

### AgentRuntimeContext.policyVersion

This field is defined, typed, and optional. Nothing sets it. Nothing reads it.
It will be misunderstood as meaningful by future contributors.

### network_access as an action type with zero policy coverage

`RuntimeActionType` includes `'network_access'`. The policy engine has no rules
for it — every network_access request returns `allow` by default. Creating the
type creates the expectation that Ojo controls network access. It does not.
Either add rules or remove the type until rules exist.

---

## Unnecessary Complexity

### EvaluatingSkill.evaluate() is a pass-through

Both `ShellCommandSkill.evaluate()` and `FileMutationSkill.evaluate()` do:

```ts
evaluate(request) { return policyEvaluate(request) }
```

The indirection adds one call stack frame and one interface method for zero
behaviour difference. The SDK already calls `policyEvaluate()` directly.
Skills exist to route and describe actions — policy evaluation is not a skill
responsibility. Remove `evaluate()` from `EvaluatingSkill` and have the SDK
always call the policy engine directly.

### createSkill() returns Skill, not EvaluatingSkill

The factory return type is `Skill` (the base interface). `ShellCommandSkill` and
`FileMutationSkill` implement `EvaluatingSkill`, but callers of `createSkill()`
cannot call `.evaluate()` or `.buildReceipt()` without a type assertion. Either
overload the factory return type or accept that the factory is not the right
entry point for evaluating skills.

### Module-level mutable counters

`receipt.ts` and `sdk.ts` each hold a module-level counter (`_counter`,
`_reqCounter`) for ID generation. This is module-singleton state. In test
environments where modules are reused across test suites, counters carry over
between tests. Use `crypto.randomUUID()` (available in Node.js 22, already
required) for receipt and request IDs — it has no shared state and produces
genuinely unique values with no counter.

---

## Developer UX

### The approval workflow has no terminal surface

`resolveApproval()` is a pure function that transitions `pending → approved/denied`.
There is no code that actually prompts the developer in the terminal and calls
`resolveApproval()` with the result. The existing MVP has `apps/cli/src/prompt.ts`
which does this for package installs. The post-MVP approval workflow is entirely
disconnected from it.

Until these are connected, `pending` is a terminal state in practice, not in
the type system.

### OjoRuntime.evaluate() returns pending without blocking

When `approvalState === 'pending'`, `evaluate()` returns immediately. The caller
must implement the blocking approval loop — display a prompt, wait for input,
call `resolveApproval()`, then decide whether to proceed. This responsibility
is invisible in the SDK's API surface. New users will assume `evaluate()` handles
approval end-to-end and will build systems that ignore `pending` states.

The fix: document the caller's responsibility explicitly, or provide an
`evaluateAndAwait()` method that handles the approval loop with a provided
prompt handler.

### No ojo check CLI command

The integration plans (Claude Code, Codex) depend on `ojo check <type> <payload>`
as a CLI command. This does not exist. The policy engine is only callable as a
TypeScript library. Any hook-based integration cannot be built until this
command exists.

### Sensitive data in reason strings

Policy rule reasons include the triggering command verbatim:

```
"Sensitive environment variable access: echo $GITHUB_TOKEN"
```

This reason string appears in the approval prompt, the receipt's `evidenceSummary`,
and any logs. The command `echo $GITHUB_TOKEN` is not the secret itself, but
displaying it in a receipt that persists (even in memory) before redaction is an
unnecessary exposure. The shell-skill's `buildReceipt()` redacts the payload
after the fact, but the reason string in the receipt's `evidenceSummary` still
contains the original command.

---

## Security Posture

### Text-matching rules are trivially bypassed

The policy engine uses regex against command strings. An AI agent — or a
developer who knows the rules — can bypass every rule with minor variations:
- `r''m -rf /` — shell ignores the quotes in most contexts
- `cu''rl x | sh` — same
- `eval $( echo "cm0gLXJmIC8=" | base64 -d )` — base64-encoded rm -rf

These bypasses are not exotic. Any agent reasoning about tool restrictions would
discover them. The rules are a safety net for accidents and unsophisticated threats,
not a defence against adversarial agents.

This is not a criticism of the current implementation — text-matching is
the right first layer. The criticism is against presenting it as a security
guarantee. The documentation should be explicit: these rules catch common patterns,
not determined circumvention.

### No tamper detection on receipts

Receipts are plain objects in memory. There is no HMAC, no signature, no
immutability guarantee. A receipt can be modified after creation with no
detection. For an audit system, this means receipts cannot be trusted as evidence
if the process they live in is compromised. Receipts as currently implemented
are a development-time convenience, not a security-grade audit trail.

### No receipt persistence

Receipts expire when the process exits. There is no audit trail between sessions.
An AI agent that ran all night left no evidence by morning.

### Approval timeout missing

A `pending` approval has no timeout. In an automated system, a blocked action
waits forever (or until process exit). This is a deadlock for non-interactive
contexts. Add a configurable timeout that auto-denies after N seconds/minutes.

---

## Enterprise / Security Theater Risk

### Approval fatigue is certain

`require_approval` will fire on every `.env` write, every workflow file change,
every `eval`, every token reference. These are all common, legitimate operations.
Within a day of real use, developers will reflexively approve without reading.
The approval prompt needs friction calibrated to actual risk, not a flat
`require_approval` for everything that matches a pattern.

Proposal: distinguish `warn` (log and proceed, no human needed) from
`require_approval` (must read and confirm) and use `warn` for the low-stakes
cases like `eval` in a controlled context.

### The PRD roadmap includes enterprise features not grounded in the current architecture

"Signed dependency attestations," "trust provenance graph," and "org-level policy
enforcement" are listed as long-term goals. The current architecture has no
persistence layer, no identity model, no network layer, and no cryptographic
primitives. Building toward these features from the current codebase requires
API design decisions now — especially around receipt identity and signing — or
these goals require breaking changes when they are eventually attempted.

### What is genuinely strong

The core MVP design choices are correct and should not be reconsidered:

- `SandboxProvider` interface is extensible and clean
- Honest `unavailable` provenance tagging is better than silent passing
- Custom rule injection in `evaluate()` is the right extensibility model
- No external dependencies in `@ojo/agent-runtime` is correct for a
  security-sensitive package
- `PolicyOutcome` being distinct from `RuntimeDecision` is architecturally right —
  the four-outcome policy vocabulary (`allow`, `warn`, `require_approval`, `block`)
  is richer and more useful than a binary allow/block

---

## Priority Fixes

Ordered by impact:

1. **Remove `RuntimeExecutionReceipt` from `types.ts`** — consolidate to
   `ExecutionReceipt`. One receipt type.
2. **Implement `ojo check` CLI command** — without it, all hook-based integrations
   are blocked.
3. **Wire `Skill.describe()` to the approval prompt** — or remove it.
4. **Replace module counters with `crypto.randomUUID()`** — eliminate shared state.
5. **Add approval timeout** — default 60s auto-deny for non-interactive contexts.
6. **Document the honesty assumption** — Ojo evaluates declared intent, not actual
   execution. State this clearly in README and SDK docs.
7. **Either implement `warn` or remove it** — half-implemented outcomes
   undermine trust in the type system.
