---
inclusion: fileMatch
fileMatchPattern: "**/main/**/*.{ts,js},**/preload/**/*.{ts,js}"
---

# Electron Process Boundaries

Rules for maintaining clean separation between main, preload, and renderer processes.

## Process Roles

| Process | Location | Responsibilities |
|---------|----------|-----------------|
| Main | `src/main/` | App lifecycle, window management, database, Fastify server, IPC handlers |
| Preload | `src/preload/` | Narrow bridge; exposes safe APIs to the renderer via `contextBridge` |
| Renderer | `src/renderer/` | React UI, routing, user interaction, API consumption |

## Main Process Rules

- Owns all persistence concerns (SQLite, Drizzle ORM, file system access).
- Starts and stops the local Fastify HTTP server.
- Creates and manages `BrowserWindow` instances.
- Registers IPC handlers via `ipcMain.on` / `ipcMain.handle`.
- Must not import React, DOM APIs, or renderer-specific code.

## Preload Rules

- Must remain minimal and intentionally narrow.
- Expose only the APIs the renderer genuinely needs via `contextBridge.exposeInMainWorld`.
- Currently exposes `electron` (from `@electron-toolkit/preload`) and a placeholder `api` object.
- Must not contain business logic, database queries, or heavy computation.
- Must not expose unrestricted access to Node.js built-ins or the file system.

## Renderer Rules

- Must not import from `electron`, `better-sqlite3`, `drizzle-orm`, or Node.js built-ins.
- Consumes data exclusively through the local HTTP API or the preload bridge.
- Accesses Electron APIs only through the `window.electron` / `window.api` globals exposed by preload.
- Must not start servers, open files, or perform OS-level operations directly.

## IPC Guidelines

- Keep IPC channels purpose-driven and named with a domain prefix: `'app:getVersion'`, `'db:getProducts'`.
- Prefer `ipcMain.handle` + `ipcRenderer.invoke` (async request/response) over fire-and-forget `send`/`on`.
- Validate inputs on the main-process side before performing operations.
- Return typed, serializable results — no circular references or class instances.

## Security Defaults

- Context isolation is enabled (`contextIsolated: true`).
- Node integration is disabled in the renderer.
- The preload script runs in a sandboxed bridge — keep it that way.
- External URLs are opened via `shell.openExternal` rather than loading in the app window.

## Do

- Keep database and file-system concerns exclusively in main.
- Keep the preload surface small and auditable.
- Prefer the HTTP API over IPC for most renderer-to-main data flows (simpler to test and reason about).
- Document new IPC channels when they are introduced.

## Do Not

- Do not expose `require` or `__dirname` to the renderer.
- Do not disable context isolation or enable node integration.
- Do not put rendering logic in main or preload.
- Do not expand the preload API without a clear need and documentation.
