# Testing Guide

The project already includes strong static validation through type checking (TypeScript strict mode) and build-time validation. A formal testing framework has not yet been configured, but the intended approach is documented below for when it is introduced.

## Intended testing stack

| Layer | Tool | Purpose |
|-------|------|---------|
| Unit | Vitest | Isolated logic, helpers, and pure functions |
| Component | Vitest + React Testing Library | Shared UI primitives and page interactions |
| End-to-end | Playwright (Electron support) | Full user flows across the desktop app |

## Recommended testing layers

### Unit tests

Use unit tests for isolated logic such as helpers, parsers, data transformations, and small domain utilities. Vitest is the chosen test runner because it shares the Vite configuration and provides fast feedback.

### Component tests

Use component tests for shared UI primitives and page-level interactions. React Testing Library is a strong choice for verifying behavior rather than implementation details.

### End-to-end tests

Use end-to-end tests for critical flows such as creating records, navigating between screens, and handling desktop-specific interactions. Playwright with Electron support is a solid option for these workflows.

## Current baseline

At the moment, the project relies on:

- `pnpm typecheck` — TypeScript type validation for both node and web targets
- `pnpm lint` — oxlint static analysis
- `pnpm build` — full build pipeline validation
- manual verification during local development

No test runner or test configuration files exist yet. When introduced, Vitest should be configured to align with the existing electron-vite and path alias setup.

## Suggested priorities

1. Add Vitest with path alias support and basic configuration.
2. Add tests for shared utilities and data transformation helpers.
3. Cover the most important page flows with component tests.
4. Add end-to-end tests for the core business journeys once the UI stabilizes.
5. Add CI checks so pull requests fail fast when regressions are introduced.

## Path alias support

When configuring Vitest, ensure the following aliases are resolved:

```ts
resolve: {
  alias: {
    '@renderer': resolve('src/renderer/src'),
    '@app': resolve('src/renderer/src/app'),
    '@pages': resolve('src/renderer/src/pages'),
    '@shared': resolve('src/renderer/src/shared'),
  }
}
```
