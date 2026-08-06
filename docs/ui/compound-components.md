# Compound Components

Prefer compound or composer patterns when a UI surface has multiple coordinated parts or when callers need to arrange markup instead of decoding a long list of props. In this repository, that guidance applies to app-local UI under the renderer pages and to reusable UI in the shared layer.

**Audience:** anyone building multi-part UI in this Electron + React + TypeScript app. **Type:** how-to + policy.

## What the current project looks like

The renderer code is organized around a small structure:

- pages live under [src/renderer/src/pages](../../src/renderer/src/pages)
- shared UI primitives live under [src/renderer/src/shared/ui](../../src/renderer/src/shared/ui)
- shared helpers live under [src/renderer/src/shared/lib](../../src/renderer/src/shared/lib)

The current pages are still mostly shell screens, so the default is still a plain component unless a screen grows into a richer surface.

## Policy

1. Default to a compound pattern when a surface has multiple coordinated parts, such as header, body, actions, footer, or sections.
2. Apply the same preference to app-local UI under [src/renderer/src/pages](../../src/renderer/src/pages) and reusable UI under [src/renderer/src/shared/ui](../../src/renderer/src/shared/ui).
3. Prefer JSX structure over prop-driven layout flags. Children and namespaced parts describe structure; props carry data.
4. Do not force the pattern for a single fixed layout with no shared state. A plain component is the right choice for simple screens.

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

- the call site reads like the rendered UI
- new layout variations do not require another prop
- shared state can live in one context instead of being threaded through props

## Reference anatomy

The minimal pattern is:

1. **context + guard hook** — the context defaults to `null`, and the hook throws outside the provider
2. **root or provider** — owns or injects shared state and memoizes the context value
3. **sub-parts** — read the context, render, and optionally report events upward

For richer surfaces, structure the context into three buckets:

- `state`: reactive data the parts render
- `actions`: callbacks grouped by responsibility
- `meta`: non-reactive handles such as refs and shared values

This avoids putting refs or animated handles into reactive state and prevents unnecessary re-renders.

Export only the namespace that represents the compound. For example:

```tsx
export const SettingsCard = Object.assign(SettingsCardRoot, {
  Header: SettingsCardHeader,
  Body: SettingsCardBody,
  Footer: SettingsCardFooter
})
```

## Project-specific guidance

This repository already has a clear placement convention:

- page-specific compounds: [src/renderer/src/pages/products/ui/products-page.tsx](../../src/renderer/src/pages/products/ui/products-page.tsx), [src/renderer/src/pages/categories/ui/categories-page.tsx](../../src/renderer/src/pages/categories/ui/categories-page.tsx), and the other page folders
- reusable compounds: [src/renderer/src/shared/ui](../../src/renderer/src/shared/ui)
- shared utilities: [src/renderer/src/shared/lib](../../src/renderer/src/shared/lib)

Use that structure when introducing a compound:

- keep page-specific compounds close to the page that owns them
- move a compound to the shared UI layer only when multiple pages need it
- follow the local conventions already used in the repo: named exports, functional components, and TypeScript

## When to use which pattern

| Pattern | Use when | Avoid when |
|---------|----------|------------|
| **compound** (`Root` + `Item`) | parts share state or a consumer needs to arrange the parts | the UI is a single fixed leaf |
| **composer** (`Provider` + parts, `state` / `actions` / `meta`) | the surface is richer and may need shared state, callbacks, and non-reactive handles | a single scalar value is enough |
| **plain children** | the surface mostly slots content without internal coordination | parts need to talk to each other |
| **config props** | the layout is fixed and data-driven | consumers need custom markup between sections |

Rule of thumb: if a component is starting to grow `show*`, `*Position`, `*Slot`, or `render*` props, switch to parts and context.

## Anti-patterns

| Mistake | Fix |
|---------|-----|
| config monolith with `show*`, `*Slot`, or `render*` props | prefer namespaced parts and children |
| context without a guard | default to `null` and throw outside the provider |
| fresh context object every render | memoize the context value on real dependencies |
| exporting every sub-part as a top-level API | export the compound namespace only |
| putting refs or animated values in state | keep them in `meta` or local refs |
| using compound for trivial leaf components | keep it simple with a plain component |

## Checklist

- [ ] prefer compound/composer when the UI has multiple coordinated parts
- [ ] context defaults to `null` and has a guard hook
- [ ] context value is memoized
- [ ] the public export is the namespaced compound only
- [ ] the component fits the current folder structure in the renderer
- [ ] the call site reads like the UI instead of a prop puzzle

## Related

- [docs/architecture/feature-sliced-design.md](../architecture/feature-sliced-design.md) for placement rules in the renderer
- [docs/adr/README.md](../adr/README.md) for project decision records
- [src/renderer/src/shared/ui](../../src/renderer/src/shared/ui) for reusable primitives
