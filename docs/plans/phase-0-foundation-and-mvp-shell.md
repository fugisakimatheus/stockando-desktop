# Phase 0 - Foundation and MVP Shell

## Goal

Establish the base experience and make the app usable as a desktop product. This phase delivers the structural foundation that all subsequent modules depend on.

## Sprint estimate

Sprints 1-2

## Deliverables

- Working desktop application with stable routing and layout
- Multi-company selection and context management
- Initial company and settings setup flow
- Shared UI primitives ready for feature modules
- Database layer initialized with seed data and migrations

## Scope

### Backend

- Define and evolve the Drizzle schema for companies, users, settings, and core audit tables
- Implement main-process initialization, migrations, seed data, and startup safeguards for SQLite
- Expose minimal preload IPC endpoints for company context, settings, and app bootstrap
- Enforce basic validation and error handling for startup and configuration flows
- Keep database reads and writes batched and deterministic to avoid startup lag

### Frontend

- Build the app shell, route structure, home screen, and initial settings experience
- Create shared layout, form, table, dialog, and empty-state patterns under the renderer shared layer
- Connect screens to typed API helpers and shared query hooks
- Use TanStack Query for loading, caching, and invalidation of settings and company context data
- Adopt a lightweight state model that keeps UI state local and avoids unnecessary global state churn
- Build the company selection flow and multi-company context management
- Keep the shell modular so new modules can be added without major UI restructuring

### Performance focus

- Ensure initial route loading is fast and that shell navigation remains responsive
- Avoid blocking the UI during startup by separating bootstrap work and lazy-loading non-critical screens

## Backlog

### P0 - Must-have for the first usable release

- [ ] Create the Electron app shell, navigation, and route structure
- [ ] Implement the typed preload bridge for app bootstrap, multi-company context, and settings
- [ ] Define the initial Drizzle schema for companies, users, settings, and audit metadata
- [ ] Implement database initialization, migrations, and seed data for a local-first SQLite startup flow
- [ ] Build the home screen, company selection flow, and initial settings experience
- [ ] Create shared layout, form, table, dialog, and empty-state primitives in the renderer shared layer
- [ ] Verify launch, navigation, and local persistence behavior end to end
- [ ] Ensure startup and navigation remain responsive with lazy loading and bounded bootstrap work

## Validation criteria

- The app opens without runtime errors
- Company and settings data can be created and read locally
- The base shell is stable enough for feature work to be added incrementally
- Company switching is fast and explicit
- Navigation between main routes is responsive
- Shared UI primitives render correctly across different screen states (loading, empty, error, populated)

## Dependencies

None - this is the foundation phase.

## Technical notes

- Use Electron-safe patterns for file access, local persistence, and app lifecycle events
- Keep the preload bridge narrow and typed
- Use TanStack Query for settings and company context with explicit caching
- Prefer shared UI primitives over ad-hoc layout implementations
- Ensure the database layer supports incremental schema evolution through migrations
