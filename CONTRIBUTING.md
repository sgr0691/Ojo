# Contributing to Ojo

Thank you for your interest in contributing to Ojo! This document provides
guidelines and instructions for contributing.

## Code of Conduct

All contributors must adhere to our [Code of Conduct](CODE_OF_CONDUCT.md).

## Getting Started

1. Fork the repository.
2. Clone your fork: `git clone https://github.com/sgr0691/Ojo.git`
3. Install dependencies: `pnpm install`
4. Build all packages: `pnpm build`
5. Run tests: `pnpm test`
6. Create a branch: `git checkout -b my-feature`

## Development Workflow

### Package structure

```
apps/cli/                  — CLI entrypoint + npm/pnpm/bun shims
packages/shared/           — Shared types (PackageSpec, OjoContext)
packages/interceptor/      — npm/pnpm/bun argument parsing
packages/providers/        — Sandbox provider abstraction + implementations
  ├── docker.ts            — DockerProvider (stable)
  ├── daytona.ts           — DaytonaProvider (experimental)
  └── cloudflare.ts        — CloudflareSandboxProvider (experimental)
packages/monitor/          — Behavioral evidence + provenance tracking
packages/risk-engine/      — Deterministic risk scoring + metadata fetcher
apps/cli/shim/             — bash shims for npm, pnpm, bun
```

### Running tests

```bash
# All tests (mocked, no Docker required)
pnpm test

# Specific package
pnpm --filter @ojo/providers test

# Docker compatibility tests (requires Docker running)
pnpm test:docker

# Watch mode
pnpm --filter @ojo/interceptor test:watch
```

### TypeScript

```bash
# Type checking across all packages
pnpm typecheck
```

### Linting

```bash
# Check formatting
pnpm format

# Fix formatting
pnpm format:fix
```

## Pull Request Guidelines

1. Keep changes focused. One feature per PR.
2. Add tests for new functionality.
3. Ensure all tests pass: `pnpm test && pnpm typecheck`
4. Update documentation if adding or changing user-facing features.
5. Mark experimental features with `@experimental` JSDoc tags.
6. If behavioral analysis provenance changes, update the signal table in README.md.
7. PRs should target the `main` branch.

## Adding a New Provider

1. Create `packages/providers/src/providers/<name>.ts`
2. Implement the `SandboxProvider` interface (see `docker.ts` as reference)
3. Add the provider to `packages/providers/src/registry.ts`
4. Write tests in `packages/providers/src/__tests__/<name>.test.ts`
5. Update the provider roadmap in `README.md`

## Adding a New Risk Rule

1. Add a check function in `packages/risk-engine/src/rules.ts`
2. Register the rule in `packages/risk-engine/src/index.ts` (DEFAULT_RULES array)
3. Write tests in `packages/risk-engine/src/__tests__/`
4. Document the rule in `README.md` (risk engine table + max score)

## Adding a New Metadata Signal

1. Extend the `fetchPackageMetadata` function or `checkPackageMetadata` rule
   in `packages/risk-engine/src/metadata.ts`
2. Update threshold tests and add sample fixture data
3. Update the metadata rule description in `README.md`

## Reporting Issues

- Use the [GitHub issue tracker](https://github.com/sgr0691/Ojo/issues)
- Include Ojo version, Node.js version, OS, and Docker version
- Include the full output with `--verbose` if applicable
- For security issues, see [SECURITY.md](SECURITY.md)
