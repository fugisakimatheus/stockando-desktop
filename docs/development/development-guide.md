# Development Guide

This document summarizes the day-to-day workflow for working on the Electron desktop application.

## Prerequisites

- Node.js 24.18 or newer
- pnpm 11.13 or newer
- a recent version of VS Code

## Installation

```bash
pnpm install
```

## Running the app locally

```bash
pnpm dev
```

The development command starts Electron with Vite and the local renderer process.

## Common commands

```bash
pnpm lint
pnpm typecheck
pnpm build
```

## Project structure at a glance

- src/main — Electron main process, database bootstrap, and local services
- src/preload — secure bridge exposed to the renderer
- src/renderer — React UI, pages, and shared interface components

## Working conventions

- Keep main-process logic close to app lifecycle and persistence concerns.
- Keep UI code focused on rendering and interaction rather than direct database access.
- Prefer shared UI primitives for repeated interface patterns.
- Keep documentation in sync when introducing new modules or workflow changes.

## Troubleshooting

- If the app fails to start, confirm that dependencies were installed successfully.
- If the renderer cannot connect to the local server, verify the main process started the Fastify service.
- If type errors appear, run pnpm typecheck to inspect the current issue set.
