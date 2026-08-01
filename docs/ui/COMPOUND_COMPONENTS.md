# Compound Components

Prefer compound or composer patterns when a UI surface has multiple coordinating parts or when callers need to arrange markup instead of decoding a long list of props. In this repository, that guidance applies to app-local UI under the renderer pages and to reusable UI in the shared layer.

**Audience:** anyone building multi-part UI in this Electron + React + TypeScript app. **Type:** how-to + policy.

## What the current project looks like

The renderer code is organized around a small, feature-based structure:

- Pages live under [src/renderer/src/pages](../../src/renderer/src/pages)
- Shared UI primitives live under [src/renderer/src/shared/ui](../../src/renderer/src/shared/ui)
- Shared helpers live under [src/renderer/src/shared/lib](../../src/renderer/src/shared/lib)
- The current pages are simple shells for home, products, categories, and settings, so the default is still a plain component unless a screen grows into a richer surface.

## Policy

1. Default to compound when a surface has multiple coordinated parts, such as header, body, actions, footer, or sections.
2. Apply the same preference to app-local UI under [src/renderer/src/pages](../../src/renderer/src/pages) and reusable UI under [src/renderer/src/shared/ui](../../src/renderer/src/shared/ui).
3. Prefer JSX structure over prop-driven layout flags. Children and namespaced parts describe structure; props carry data.
4. Do not force the pattern for a single fixed layout with no shared state. A plain component is still the right choice for simple screens.

## Why this helps

A prop monolith makes the call site hard to read because the layout is hidden behind flags and render callbacks.

```tsx
// Avoid: layout hidden behind props
<SettingsCard
  showHeader
  showActions
  renderFooter={() => <Button>Save</Button>}
/>
```

```tsx
// Prefer: structure is visible in JSX
<SettingsCard.Provider state={{ isDirty: true }}>
  <SettingsCard.Header />
  <SettingsCard.Body />
  <SettingsCard.Footer />
</SettingsCard.Provider>
```

Benefits:

- The call site reads like the rendered UI.
- New layout variations do not require another prop.
- Shared state can live in one context instead of being threaded through props.

## When to use which pattern

| Pattern | Use when | Avoid when |
|---------|----------|------------|
| **Compound** (`Root` + `Item`) | Parts share state or a consumer needs to arrange the parts | The UI is a single fixed leaf |
| **Composer** (`Provider` + parts, `state` / `actions` / `meta`) | The surface is richer and may need shared state, callbacks, and non-reactive handles | A single scalar value is enough |
| **Presentational parts** | There is no shared React state and the composition is layout-only | The parts must coordinate state |
| **Plain children** | The surface mostly slots content without internal coordination | Parts need to talk to each other |
| **Config props** | The layout is fixed and data-driven | Consumers need custom markup between sections |

Rule of thumb: if a component is starting to grow `show*`, `*Position`, `*Slot`, or `render*` props, switch to parts and context.

## Anatomy (minimal)

The pattern is simple:

1. **Context + guard hook** — the context defaults to `null`, and the hook throws outside the provider.
2. **Root or Provider** — owns or injects shared state and memoizes the context value.
3. **Sub-parts** — read the context, render, and optionally report events upward.

Export only the namespace that represents the compound. For example:

```tsx
export const SettingsCard = Object.assign(SettingsCardRoot, {
  Header: SettingsCardHeader,
  Body: SettingsCardBody,
  Footer: SettingsCardFooter,
})
```

## Project-specific guidance

This repository already has a clear placement convention:

- Page-specific UI: [src/renderer/src/pages/products/ui/products-page.tsx](../../src/renderer/src/pages/products/ui/products-page.tsx), [src/renderer/src/pages/categories/ui/categories-page.tsx](../../src/renderer/src/pages/categories/ui/categories-page.tsx), and the other page folders.
- Reusable UI: [src/renderer/src/shared/ui](../../src/renderer/src/shared/ui)
- Shared utilities: [src/renderer/src/shared/lib](../../src/renderer/src/shared/lib)

Use that structure when introducing a compound:

- Keep page-specific compounds close to the page that owns them.
- Move a compound to the shared UI layer only when multiple pages need it.
- Follow the local conventions already used in the repo: named exports, functional components, and TypeScript.

## Current repo fit

The current app is still small and mostly presentational. The existing pages in [src/renderer/src/pages/home/ui/home-page.tsx](../../src/renderer/src/pages/home/ui/home-page.tsx), [src/renderer/src/pages/products/ui/products-page.tsx](../../src/renderer/src/pages/products/ui/products-page.tsx), [src/renderer/src/pages/categories/ui/categories-page.tsx](../../src/renderer/src/pages/categories/ui/categories-page.tsx), and [src/renderer/src/pages/settings/ui/settings-page.tsx](../../src/renderer/src/pages/settings/ui/settings-page.tsx) do not need a compound API yet.

Introduce one when a screen evolves into something like:

- a page shell with header, content, and footer
- a form panel with sections and actions
- a toolbar with filters, actions, and status
- a dialog body with a reusable action row

## Anti-patterns

| Mistake | Fix |
|---------|-----|
| Config monolith with `show*`, `*Slot`, or `render*` props | Prefer namespaced parts and children |
| Context without a guard | Default to `null` and throw outside the provider |
| Fresh context object every render | Memoize the context value on real dependencies |
| Exporting every sub-part as a top-level API | Export the compound namespace only |
| Putting refs or animated values in state | Keep them in `meta` or local refs |
| Using compound for trivial leaf components | Keep it simple with a plain component |

## Checklist

- [ ] Prefer compound/composer when the UI has multiple coordinated parts
- [ ] Context defaults to `null` and has a guard hook
- [ ] Context value is memoized
- [ ] The public export is the namespaced compound only
- [ ] The component fits the current folder structure in the renderer
- [ ] The call site reads like the UI instead of a prop puzzle

## Related

- [docs/adr/README.md](../adr/README.md) for project decision records
- [docs/adr/template.md](../adr/template.md) if a new architectural decision should be captured
- [src/renderer/src/shared/ui](../../src/renderer/src/shared/ui) for reusable primitives
