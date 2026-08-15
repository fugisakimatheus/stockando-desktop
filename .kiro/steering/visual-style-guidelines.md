---
inclusion: fileMatch
fileMatchPattern: "**/*.{ts,tsx,css,md}"
---

# Visual Style Guidelines

Apply consistent visual design across the Electron + React app in both light and dark modes.

## Core Principles

- Prefer subtle, polished visuals over heavy decoration
- Treat light and dark modes as two intentional variants of the same design system
- Keep contrast high enough for readability and accessibility
- Use glassmorphism sparingly — only on surfaces that benefit from depth and separation
- Use gradients as accents, not as the dominant visual language

## Light Mode

- Use clean, bright surfaces with strong contrast between background, foreground, and interactive elements
- Favor neutral backgrounds with depth through borders, shadows, and soft elevation
- Keep text dark and clear with sufficient contrast for body copy and labels
- Use accent colors conservatively for primary actions and important highlights

## Dark Mode

- Keep the dark theme rich and balanced — not purely black
- Use layered tones instead of flat black to preserve depth and readability
- Ensure interactive states remain obvious through contrast, borders, and subtle highlights
- Do not use low-contrast gray text on gray backgrounds

## Glassmorphism

Use only when it improves perceived depth without hurting clarity.

Recommended usage:
- Floating panels, hero cards, modal shells, side panels, overlay surfaces
- Contexts where background should remain visible but content needs separation

Constraints:
- Keep blur subtle and controlled
- Maintain strong borders and enough contrast
- Do not overuse transparency on large areas
- Never rely on blur alone for readability

## Gradients

Use as a restrained accent layer only.

Recommended usage:
- Subtle background glows
- Highlight states on buttons or cards
- Hero sections or key visual moments

Constraints:
- Use one dominant color family per surface
- Prefer soft, low-saturation gradients over vivid, noisy ones
- Keep gradients subtle enough not to compete with content

## UI Patterns to Prefer

- Rounded corners for cards, panels, and inputs
- Soft shadows for elevation
- Clear borders to separate surfaces
- Reduced visual noise in dense content areas
- Consistent spacing and rhythm across screens

## Patterns to Avoid

- Heavy blur on large surfaces
- Overly saturated gradients everywhere
- Low-contrast text
- Decorative effects that reduce readability
- Mixing too many accent colors in one surface

## Implementation Guidance

- Start with existing token-based theme values
- Prefer Tailwind utilities over one-off custom CSS
- Keep new visual effects layered and subtle
- Ensure all styling works in both light and dark modes
