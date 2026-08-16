# Style Guidelines and Project Patterns

This document captures the practical coding conventions that should guide day-to-day work in this project.

## 1. General principles

- Keep the code simple and explicit.
- Prefer clarity over clever abstractions.
- Favor small, focused modules over large, multi-responsibility files.
- Preserve the current Electron boundaries: main, preload, and renderer.

## 2. TypeScript guidelines

- Use strict TypeScript and prefer explicit types for function parameters and public APIs.
- Avoid unnecessary `any` and type assertions.
- Prefer interfaces or type aliases that describe the domain clearly.
- Export types when they are reused across modules.

## 3. Component patterns

- Prefer functional components.
- Use named exports for page components and shared UI primitives.
- Keep components focused on a single responsibility.
- Prefer composition over prop-heavy configuration.
- Use compound/composer patterns when a UI surface has multiple coordinated parts.

### Component structure

```tsx
function ExampleComponent() {
  return <div />
}

export { ExampleComponent }
```

## 4. Styling conventions

- Use Tailwind CSS v4 utility classes for UI styling.
- Keep class names readable and consistent.
- Prefer shared primitives from the UI layer rather than re-implementing visual patterns in each page.
- Use the `cn()` helper from `@shared/lib/cn` to merge conditional class names.
- Follow the shadcn/ui (aria-nova style) conventions for new primitives — components land in `src/renderer/src/shared/ui`.
- Avoid mixing too many style approaches in the same module.

## 5. File organization

- Keep page-specific UI under the matching page folder.
- Keep reusable UI in the shared UI layer.
- Keep helpers and utilities in the shared lib layer.
- Keep app-wide shell concerns in the app layer.
- Keep Electron-specific concerns in main or preload.

## 6. Data and state handling

- Keep data access concerns away from page components when they become reusable.
- Prefer typed API helpers in the shared layer for data-facing operations.
- Use TanStack React Query for server-state management (fetching, caching, mutations).
- Use TanStack Router for route-level data loading and URL state when appropriate.
- Keep local UI state minimal and focused.
- Lift state only when multiple components need the same source of truth.

## 7. Naming conventions

- Use descriptive names that reflect the business or UI role.
- Prefer camelCase for variables and functions.
- Prefer kebab-case for file names when the project needs path-based clarity.
- Keep component names PascalCase.

## 8. Error handling

- Handle loading, empty, and error states explicitly.
- Avoid silent failures in UI flows.
- Surface meaningful errors to the user or to the console in development.

## 9. Documentation expectations

- Update documentation when a feature or architectural decision changes.
- Keep the docs close to the code they describe.
- Prefer short, practical guides over overly abstract prose.

## 10. Suggested defaults for this project

- Start with simple page-local components.
- Extract to shared only when reuse is real and repeated.
- Keep the architecture predictable rather than over-engineered.
- Use compound components for richer UI surfaces, not for trivial leaf components.

## 11. Tooling-specific notes

### Linting and formatting

- Use oxlint (not ESLint) for static analysis — it is configured at `.oxlintrc.json`.
- Use oxfmt for formatting — it is configured at `.oxfmtrc.json`.
- Run `pnpm lint` and `pnpm format` before committing.

### React 19

- This project uses React 19 with the new JSX transform — no need to import React at the top of files.
- Use `React.JSX.Element` as the return type for components when explicit typing is needed.
- Prefer functional components exclusively.

### shadcn/ui

- The project uses the `aria-nova` style variant of shadcn/ui.
- Add new components via `pnpm dlx shadcn@latest add <component>`.
- Components are placed in `src/renderer/src/shared/ui` as configured in `components.json`.
- Icons come from `lucide-react`.
