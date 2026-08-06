---
description: Apply consistent visual design guidelines for the Electron + React app, including light/dark modes, glassmorphism, and gradients.
applyTo: '**/*.{ts,tsx,css,md}'
---

# Visual style guidelines

## Purpose

Keep the interface visually cohesive, modern, and accessible while preserving the current simplicity of the product.

## Core principles

- Prefer subtle, polished visuals over heavy decoration.
- Use light and dark modes as two intentional variants of the same design system, not as unrelated themes.
- Keep contrast high enough for readability and accessibility.
- Use glassmorphism sparingly and only on surfaces that benefit from depth and separation.
- Use gradients as accents, not as the dominant visual language.

## Light mode

- Use clean, bright surfaces with strong contrast between background, foreground, and interactive elements.
- Favor neutral backgrounds with a small amount of depth through borders, shadows, and soft elevation.
- Keep text dark and clear, with enough contrast for body copy and labels.
- Use accent colors conservatively for primary actions and important highlights.

## Dark mode

- Keep the dark theme rich and balanced, not purely black.
- Use layered tones instead of flat black surfaces to preserve depth and readability.
- Ensure interactive states remain obvious through contrast, borders, and subtle highlights.
- Avoid low-contrast gray text on gray backgrounds.

## Glassmorphism

Use glassmorphism only when it improves perceived depth without hurting clarity.

Recommended usage:
- floating panels, hero cards, modal shells, side panels, or overlay surfaces
- contexts where the background should remain visible but the content needs separation

Recommended constraints:
- keep blur subtle and controlled
- maintain strong borders and enough contrast
- avoid overusing transparency on large areas
- never rely on blur alone for readability

## Gradients

Use gradients as a restrained accent layer.

Recommended usage:
- subtle background glows
- highlight states on buttons or cards
- hero sections or key visual moments

Recommended constraints:
- use one dominant color family per surface
- prefer soft, low-saturation gradients over vivid, noisy ones
- keep the gradient subtle enough not to compete with content

## UI patterns to prefer

- rounded corners for cards, panels, and inputs
- soft shadows for elevation
- clear borders to separate surfaces
- reduced visual noise in dense content areas
- consistent spacing and rhythm across screens

## Patterns to avoid

- heavy blur on large surfaces
- overly saturated gradients everywhere
- low-contrast text
- decorative effects that reduce readability
- mixing too many accent colors in one surface

## Implementation guidance

When styling new UI:
- start with the existing token-based theme values
- prefer Tailwind utilities over one-off custom CSS when possible
- keep new visual effects layered and subtle
- ensure the result works in both light and dark modes
