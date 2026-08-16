---
inclusion: fileMatch
fileMatchPattern: "**/*.{tsx,jsx}"
---

# Compound Components

Prefer compound/composer components for multi-part UI with coordinated sections; use shared context and namespaced parts.

## When to Use

| Fit | Pattern |
|-----|---------|
| Parts share selection or UI state | Compound `Root` + `Item` |
| Rich surface with state that may live above the component | Composer `Provider` + `state` / `actions` / `meta` |
| Layout-only composition with no shared React state | Presentational parts are fine |
| Fixed data-driven list with no custom markup between items | Config `items={[…]}` is fine |

- Use compounds for page shells, form panels, toolbars, dialogs, or sections with coordinated parts.
- Keep page-specific compounds close to the owning page under `src/renderer/src/pages`.
- Move a compound to `src/renderer/src/shared/ui` only when multiple pages need it.
- A plain component is still appropriate for single-purpose screens or trivial leaves with no shared state.

## Do

- Context defaults to `null`; the guard hook throws outside the provider.
- Memoize the context value with `useMemo`.
- Rich composers use `{ state, actions, meta }`; keep refs only in `meta`.
- Export only the namespaced compound via `Object.assign` or an object literal.
- Keep the root or provider uncontrolled by default; lift `value` + `onValueChange` only when a sibling needs it.
- Use named exports aligned with the current renderer structure.

```tsx
// Structure in JSX; shared state via context
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

## Don't

- Do not prop-drill shared state through every part.
- Do not export `FooRoot` / `FooItem` as the public API — use `Foo.Item` shape instead.
- Do not put refs or animated values in `state` — they belong in `meta`.
- Do not force compound on a single fixed leaf with no shared state.

```tsx
// Config monolith — every layout tweak becomes another prop
<SettingsCard
  showHeader
  showActions
  renderFooter={() => <Button>Save</Button>}
/>
```

## References

- Full guide: [docs/ui/compound-components.md](../../docs/ui/compound-components.md)
- Skill: [.agents/skills/compound-components/SKILL.md](../../.agents/skills/compound-components/SKILL.md)
