---
inclusion: fileMatch
fileMatchPattern: "**/*.{ts,tsx}"
---

# TypeScript Conventions

Strict, safe TypeScript patterns for the Electron + React desktop application.

## Compiler Strictness

- The project uses TypeScript 5.9+ with strict mode enabled.
- Two compilation targets exist: `tsconfig.node.json` (main + preload) and `tsconfig.web.json` (renderer).
- Run `pnpm typecheck` to validate both targets before committing.

## Type Safety Rules

- Avoid `any` — use `unknown` and narrow with type guards when the type is uncertain.
- Avoid type assertions (`as X`) unless interfacing with untyped external APIs where a proper type is impractical.
- Prefer explicit return types on exported functions and public APIs.
- Use `satisfies` for compile-time validation without widening the type.
- Use discriminated unions for state machines, status fields, and variant types.

## Preferred Patterns

- Use `interface` for object shapes that may be extended; use `type` for unions, intersections, and utility compositions.
- Prefer `React.JSX.Element` as explicit return type for React components.
- Use `PropsWithChildren` from React for components accepting children.
- Use `ComponentPropsWithoutRef<'element'>` for components forwarding native props.
- Prefer `readonly` for arrays and objects that should not be mutated after creation.

## Naming Conventions

- Types and interfaces: PascalCase (e.g., `ProductRow`, `QueryOptions`).
- Type parameters: single uppercase letter or descriptive PascalCase prefixed with T (e.g., `T`, `TData`).
- Enum-like constants: prefer `as const` objects over TypeScript enums.

## Exports

- Use named exports exclusively — no default exports.
- Re-export public API through barrel `index.ts` files at the page and shared layer boundaries.
- Keep internal helpers unexported unless reuse is proven.

## Drizzle-Specific Types

- Use `typeof table.$inferSelect` for row read types.
- Use `typeof table.$inferInsert` for row write types.
- Keep schema types colocated with the schema definition in `src/main/db/`.

## Do Not

- Do not use `// @ts-ignore` or `// @ts-expect-error` without a descriptive comment explaining the reason.
- Do not cast DOM events or React events to `any`.
- Do not use `Function` type — use explicit signatures.
- Do not use `object` type — use `Record<string, unknown>` or a proper interface.
