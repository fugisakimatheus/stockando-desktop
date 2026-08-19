# Development Guide

This document summarizes the day-to-day workflow for working on the Electron desktop application.

## Prerequisites

- Node.js 24.18 or newer
- pnpm 11.13 or newer
- a recent version of VS Code (or Kiro IDE)

## Tech stack overview

| Layer | Technology | Version |
|-------|-----------|---------|
| Desktop shell | Electron | 39.x |
| Bundler | electron-vite (Vite 7) | 5.x |
| UI framework | React | 19.x |
| Language | TypeScript | 5.9+ |
| Styling | Tailwind CSS v4 + tw-animate-css | 4.x |
| UI primitives | shadcn/ui (aria-nova style) | 4.x |
| Routing | TanStack Router | 1.x |
| Server state | TanStack React Query | 5.x |
| Tables | TanStack React Table | 8.x |
| ORM | Drizzle ORM + better-sqlite3 | 0.45+ |
| Local HTTP | Fastify | 5.x |
| Linting | oxlint | 1.75+ |
| Formatting | oxfmt | 0.60+ |
| Package manager | pnpm | 11.13+ |

## Installation

```bash
pnpm install
```

## Running the app locally

```bash
pnpm dev
```

The development command starts Electron via electron-vite, which handles HMR for the renderer process and watches the main process for changes.

## Common commands

| Command | Purpose |
|---------|---------|
| `pnpm dev` | Start the app in development mode |
| `pnpm lint` | Run oxlint for static analysis |
| `pnpm format` | Run oxlint --fix and oxfmt --write |
| `pnpm typecheck` | Type-check both node and web targets |
| `pnpm test --run` | Run the test suite (single execution) |
| `pnpm test` | Run tests in watch mode |
| `pnpm build` | Full typecheck + electron-vite build |
| `pnpm build:win` | Package for Windows |
| `pnpm build:mac` | Package for macOS |
| `pnpm build:linux` | Package for Linux |

## Project structure at a glance

```text
src/
├── main/                  # Electron main process, Fastify server, DB
│   ├── api/               # Error handler, error classes, response types
│   ├── db/                # Drizzle schema, migrations, seed
│   ├── lib/               # Shared utilities (timestamps, etc.)
│   ├── routes/            # Fastify route modules (REST API endpoints)
│   ├── services/          # Domain services (CRUD, stock operations)
│   ├── index.ts           # Electron bootstrap and window creation
│   └── server.ts          # Local Fastify HTTP service (127.0.0.1:3000)
├── preload/               # Secure IPC bridge
└── renderer/
    └── src/
        ├── app/           # Router, providers, shell, styles
        ├── pages/         # Route-level screen modules with colocated hooks
        └── shared/        # ui/, hooks/, lib/, api/
```

## Path aliases

| Alias | Maps to |
|-------|---------|
| `@main/*` | `./src/main/*` |
| `@preload/*` | `./src/preload/*` |
| `@renderer/*` | `./src/renderer/src/*` |
| `@app/*` | `./src/renderer/src/app/*` |
| `@pages/*` | `./src/renderer/src/pages/*` |
| `@shared/*` | `./src/renderer/src/shared/*` |

Use these aliases in import statements instead of relative paths.

## Linting and formatting

The project uses [oxlint](https://oxc.rs/docs/guide/usage/linter) for fast static analysis and [oxfmt](https://oxc.rs/docs/guide/usage/formatter) for formatting. Configuration lives in `.oxlintrc.json` and `.oxfmtrc.json` at the project root.

```bash
pnpm lint          # check only
pnpm format        # fix + format
```

## Working conventions

- Keep main-process logic close to app lifecycle and persistence concerns.
- Keep UI code focused on rendering and interaction rather than direct database access.
- Prefer shared UI primitives for repeated interface patterns.
- Keep documentation in sync when introducing new modules or workflow changes.
- Use the shadcn CLI (`pnpm dlx shadcn@latest add <component>`) to add new UI primitives; they land in `src/renderer/src/shared/ui`.

## Troubleshooting

- If the app fails to start, confirm that dependencies were installed successfully with `pnpm install`.
- If the renderer cannot connect to the local server, verify the main process started the Fastify service on port 3000.
- If type errors appear, run `pnpm typecheck` to inspect the current issue set.
- If linting or formatting fails unexpectedly, check that oxlint and oxfmt configs are valid JSON.
