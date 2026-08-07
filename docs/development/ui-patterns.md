# UI patterns and design system defaults

This document defines the recurring UI patterns that should be used when building new screens and components in this project.

## 1. Design principles

- keep the experience calm, polished, and professional
- prioritize clarity over visual noise
- favor consistent structure over one-off layouts
- make every screen work well in both light and dark mode
- keep interactions predictable and accessible

## 2. Layout pattern for pages

Use a common page structure for most route-level screens:

1. Page shell
   - use the shared page shell as the top-level container
   - keep the header, description, and actions aligned consistently
2. Content sections
   - group related content into sections with clear headings
   - use spacing and separators to show hierarchy
3. Supporting panels
   - use cards or widgets for summaries, metrics, filters, or quick actions

Recommended building blocks:

- PageShell for the overall page frame
- PageSection for grouped content blocks
- PageWidget for compact summaries or supporting information

## 3. Component composition pattern

Prefer composition over prop-heavy layouts.

Use a plain component for simple leaf UI.

Use a compound or composer pattern when a surface has coordinated parts such as:

- header, body, and footer
- form sections and actions
- list toolbar and content area
- detail view with summary and actions

Good rules:

- keep the JSX structure readable
- let children describe the layout
- keep shared state inside context when multiple parts need it
- avoid large prop objects with many `show*` or `render*` flags

## 4. Form patterns

Forms should feel structured and predictable.

Recommended structure:

- one section per logical group of fields
- clear labels and short helper text
- validation shown close to the field
- action area separated at the bottom or end of the form

Recommended behaviors:

- disable primary action while submitting
- show loading, success, and error states explicitly
- preserve draft values where appropriate

## 5. Data display patterns

For lists, tables, and inventory screens:

- show loading, empty, and error states explicitly
- keep table headers and primary actions visible and predictable
- use compact summaries for dense dashboards
- keep filters and bulk actions in a consistent toolbar area

For detail views:

- show the main object first
- place supporting information in secondary sections
- keep actions near the relevant content

## 6. Visual language

Use a restrained, modern visual system:

- rounded corners for panels and inputs
- soft borders and subtle shadows for depth
- calm accent colors for important actions
- gradients only as a light accent, not the main visual theme
- layered surfaces instead of heavy decoration

Default styling choices:

- prefer Tailwind utilities over ad-hoc style overrides
- keep spacing consistent using the shared spacing rhythm
- reuse shared primitives from the UI layer instead of creating local variants repeatedly

## 7. Interaction and feedback

Use consistent interaction patterns:

- primary actions for the main task
- secondary actions for supporting tasks
- destructive actions only when the user is intentionally changing or removing data
- dialogs and sheets for focused workflows
- toasts for short success or error feedback

Feedback should be immediate and understandable.

## 8. Accessibility defaults

Every screen should be usable without relying on visual styling alone.

Required defaults:

- visible focus states
- readable contrast in both themes
- keyboard support for interactive elements
- clear labels and error messages
- touch targets large enough for desktop use

## 9. Recommended implementation checklist

Before shipping a new UI surface, confirm that it:

- uses the shared page shell pattern when appropriate
- groups content into clear sections
- uses shared primitives instead of custom one-off styling
- follows the compound/composer pattern when multiple parts share state
- supports light and dark mode consistently
- includes clear empty, loading, and error states
- remains accessible and readable
