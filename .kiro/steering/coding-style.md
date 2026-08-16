---
inclusion: fileMatch
fileMatchPattern: "**/*.{ts,tsx,js,jsx}"
---

# Coding Style

Practical coding conventions for day-to-day work in this Electron + React + TypeScript project.

## General Principles

- Keep code simple, explicit, and focused.
- Prefer small modules with a single responsibility.
- Favor clarity over clever abstractions.
- Match the patterns already established in the codebase.

## File and Naming

- File names: lowercase kebab-case (e.g., `page-shell.tsx`, `query-client.ts`).
- Components: PascalCase (e.g., `HomePage`, `PageShell`).
- Functions and variables: camelCase.
- Constants: camelCase or UPPER_SNAKE_CASE for true compile-time constants.
- Types and interfaces: PascalCase.

## Component Patterns

- Use functional components exclusively — no class components.
- Use named exports for all components.
- Return `React.JSX.Element` as explicit type when typing is needed.
- Keep components focused on a single responsibility.
- Prefer composition and children over large prop surfaces.

### Component file structure

```tsx
import { cn } from '@shared/lib/cn'
import type { ComponentPropsWithoutRef } from 'react'

function ExampleComponent({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
  return <div className={cn('base-classes', className)} {...props} />
}

export { ExampleComponent }
```

## Imports

- Use path aliases (`@app/`, `@pages/`, `@shared/`) instead of relative paths with `../`.
- Group imports: external packages first, then internal aliases, then relative.
- Use `import type { ... }` for type-only imports.

## Exports

- Named exports only — no `export default`.
- Re-export the public API through barrel `index.ts` files at page and shared boundaries.
- Keep internal implementation details unexported.

## Styling

- Use Tailwind CSS v4 utility classes for all styling.
- Use `cn()` from `@shared/lib/cn` to merge conditional classes.
- Prefer shared UI primitives over one-off styling.
- Keep long class strings readable — break across lines when helpful.
- Follow the visual style guidelines for light/dark mode, glassmorphism, and gradients.

## State and Data

- Use TanStack React Query for server state — never store fetched data in `useState`.
- Keep local UI state minimal (form inputs, toggles, open/close states).
- Lift state only when multiple components share the same source of truth.
- Use compound component context for multi-part UI coordination.

## Error Handling

- Handle loading, empty, and error states explicitly in all data-driven UI.
- Surface meaningful errors to the user or console in development.
- Use typed error objects when possible; avoid throwing strings.

## Linting and Formatting

- The project uses oxlint (`.oxlintrc.json`) for linting and oxfmt (`.oxfmtrc.json`) for formatting.
- Run `pnpm lint` and `pnpm format` before committing.
- Do not configure ESLint or Prettier — they are not used in this project.

## Do

- Keep it in the page if only one screen uses it.
- Extract to `@shared/ui` when multiple pages need the same component.
- Follow the existing page structure: `pages/<name>/index.ts` + `pages/<name>/ui/<name>-page.tsx`.
- Use the shadcn CLI to add new primitives rather than hand-rolling them.

## Do Not

- Do not use `var` — use `const` by default, `let` only when reassignment is needed.
- Do not use `enum` — prefer `as const` objects or union types.
- Do not add ESLint, Prettier, or Biome configs.
- Do not mix Electron main-process code with renderer UI.
- Do not introduce new architectural layers without proven need.
