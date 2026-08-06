# Testing Guide

The project already includes strong static validation through type checking and builds, but it would benefit from a clearer testing strategy as the product grows.

## Recommended testing layers

### Unit tests

Use unit tests for isolated logic such as helpers, parsers, and small domain utilities. A lightweight setup based on Vitest is a good fit for this codebase.

### Component tests

Use component tests for shared UI primitives and page-level interactions. React Testing Library is a strong choice for verifying behavior rather than implementation details.

### End-to-end tests

Use end-to-end tests for critical flows such as creating records, navigating between screens, and handling desktop-specific interactions. Playwright is a solid option for Electron-based workflows.

## Current baseline

At the moment, the project relies mainly on:

- typecheck validation
- build validation
- manual verification during local development

As the application grows, the next step is to formalize automated coverage around the most important product flows.

## Suggested priorities

1. Add tests for shared utilities and data transformation helpers.
2. Cover the most important page flows with component tests.
3. Add end-to-end tests for the core business journeys once the UI stabilizes.
4. Add CI checks so pull requests fail fast when regressions are introduced.
