# Visual style guidelines

This document defines the visual direction for the interface so new screens remain consistent, modern, and accessible.

## Design goals

- keep the product polished and professional
- favor clarity over visual noise
- support both light and dark modes with the same design language
- use subtle depth effects instead of heavy decoration

## Visual system

### Light mode

Light mode should feel clean, bright, and calm.

Recommended characteristics:
- bright neutral surfaces
- strong contrast for text and interactive elements
- soft borders and shadows for structure
- restrained accent colors for important actions

### Dark mode

Dark mode should feel rich, balanced, and comfortable for long sessions.

Recommended characteristics:
- layered dark surfaces instead of pure black
- enough contrast to preserve readability
- subtle highlights to show focus and hierarchy
- calm accent colors that do not feel aggressive

## Glassmorphism

Glassmorphism should be used sparingly and intentionally.

Use it for:
- floating panels
- overlay cards
- side panels
- modal surfaces
- dashboard sections that need a refined layered feel

Good practices:
- keep the blur subtle
- maintain clear borders and strong contrast
- preserve readability above all
- avoid making large areas too transparent

## Gradients

Gradients should be used as accents, not as the main visual theme.

Use gradients for:
- subtle background highlights
- hero sections
- button or card emphasis
- decorative emphasis in dashboards or featured surfaces

Good practices:
- keep them soft and low saturation
- prefer one dominant color family per surface
- avoid dramatic contrast that competes with content

## Component style patterns

- prefer rounded corners for panels and inputs
- use soft shadows for elevation
- keep spacing consistent across the app
- use borders to support separation without over-structuring surfaces
- keep the visual rhythm aligned across pages

## Accessibility requirements

- ensure readable contrast in both themes
- make focus states visible
- avoid decorative effects that reduce legibility
- test interactive states for clarity in light and dark mode

## Implementation defaults

When introducing a new visual treatment:
- start from the existing design tokens
- prefer Tailwind utilities and shared UI primitives
- keep effects subtle and layered
- verify that the result feels consistent in both themes
