---
description: Prefer compound/composer components for multi-part UI in this Electron + React app, using shared context and namespaced parts when the surface has coordinated sections.
applyTo: '**/*.{tsx,jsx}'
---

# Compound Components — prefer when it fits

When creating or evolving UI with multiple coordinating parts, or when callers need to arrange markup between sections, prefer compound or composer components over a config monolith (`show*`, `*Slot`, `render*`).

This applies to app-local UI under [src/renderer/src/pages](../../src/renderer/src/pages) and reusable UI under [src/renderer/src/shared/ui](../../src/renderer/src/shared/ui). The current app is still relatively simple, so a plain component is still appropriate for single-purpose screens.

Full guide: [docs/ui/COMPOUND_COMPONENTS.md](../../docs/ui/COMPOUND_COMPONENTS.md) · Skills: [compound-components](../../.agents/skills/compound-components/SKILL.md)

## Do

```tsx
// ✅ Structure in JSX; shared state via context
export const SettingsCard = {
  Provider: SettingsCardProvider,
  Header: SettingsCardHeader,
  Body: SettingsCardBody,
  Footer: SettingsCardFooter,
}

<SettingsCard.Provider state={{ isDirty: true }}>
  <SettingsCard.Header />
  <SettingsCard.Body />
  <SettingsCard.Footer />
</SettingsCard.Provider>
```

- Context defaults to `null`; the guard hook throws outside the provider
- Memoize the context value with `useMemo`
- Rich composers use `{ state, actions, meta }`; keep refs only in `meta`
- Export only the namespaced compound (`Object.assign` or an object literal)
- Keep the root or provider uncontrolled by default; lift `value` + `onValueChange` only when a sibling needs it
- Use named exports and keep the implementation aligned with the current renderer structure

## Don't

```tsx
// ❌ Config monolith — every layout tweak becomes another prop
<SettingsCard
  showHeader
  showActions
  renderFooter={() => <Button>Save</Button>}
/>
```

- ❌ Prop-drill shared state through every part
- ❌ Export `FooRoot` / `FooItem` as the public API when `Foo.Item` is the better shape
- ❌ Put refs or animated values in `state`
- ❌ Force compound on a single fixed leaf with no shared state — plain component is fine

## When

| Fit | Pattern |
|-----|---------|
| Parts share selection or UI state | Compound `Root` + `Item` |
| Rich surface with state that may live above the component | Composer `Provider` + `state` / `actions` / `meta` |
| Layout-only composition with no shared React state | Presentational parts are fine |
| Fixed data-driven list with no custom markup between items | Config `items={[…]}` is fine |

## Project-specific guidance

- Prefer compounds for page shells, form panels, toolbars, dialogs, or sections that need coordinated parts.
- Keep page-specific compounds close to the owning page under [src/renderer/src/pages](../../src/renderer/src/pages).
- Move a compound to [src/renderer/src/shared/ui](../../src/renderer/src/shared/ui) only when multiple pages need it.
- Keep the implementation simple and aligned with the current app architecture: React, TypeScript, and the local shared UI layer.
