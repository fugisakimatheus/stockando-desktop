# Build and Release Guide

This document covers the packaging and release workflow for the desktop application.

## Build commands

```bash
pnpm build
```

Platform-specific packaging commands are available through the project scripts:

```bash
pnpm build:win
pnpm build:mac
pnpm build:linux
```

## Output expectations

The build pipeline compiles the main and renderer processes, then packages the application with Electron Builder.

## Release checklist

1. Run the typecheck and build commands successfully.
2. Validate the app on the target OS.
3. Review packaging artifacts and signing configuration if required.
4. Update release notes and any user-facing documentation when the product changes.

## Notes

- Packaging behavior is configured through electron-builder.yml.
- The app uses the Electron main process and preload bridge to keep desktop integrations isolated from the renderer.
- Platform-specific issues should be investigated separately because packaging behavior may differ between Windows, macOS, and Linux.
