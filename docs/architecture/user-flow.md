# User Flow Documentation

## Overview

This document describes the main end-to-end journeys expected for the product. Because the current renderer is still a lightweight shell, the flows below focus on the MVP-style experience: launch the app, navigate the main screens, manage catalog data, and configure basic settings.

## 1. Application launch and navigation

### Actor
- end user or administrator

### Flow
1. Start the desktop application.
2. Open the main navigation and move between home, products, categories, and settings.
3. Use the app shell to reach the current functional area quickly.
4. Return to the start page after completing a task.

### Current implementation note
The router currently exposes the main screens in [src/renderer/src/app/router.tsx](../../src/renderer/src/app/router.tsx), so the experience is centered on navigation and screen entry rather than a fully completed workflow engine.

## 2. Catalog and inventory setup

### Actor
- inventory manager or administrator

### Flow
1. Open the products screen.
2. Review the current catalog entries.
3. Create or edit products, categories, and inventory-related metadata.
4. Move between catalog pages to keep product setup consistent.
5. Use the settings area for basic global configuration.

### Current implementation note
The current pages under [src/renderer/src/pages](../../src/renderer/src/pages) are still structural shells, but the underlying data model already includes company-scoped catalog entities such as products and categories in [src/main/db/schema.ts](../../src/main/db/schema.ts).

## 3. Company and configuration management

### Actor
- administrator or company owner

### Flow
1. Open the settings screen.
2. Review company-level preferences and operational defaults.
3. Update configuration values that affect the business context.
4. Keep the setup consistent before onboarding more advanced workflows.

## 4. Future business workflows

The product roadmap includes richer operational journeys such as:

- quote creation and order conversion
- purchase order and supplier workflows
- invoice generation and fiscal document handling
- audit and attachment workflows

These flows are already reflected in the product documentation under [docs/features](../features), but the current UI implementation is still in an earlier stage and should be introduced incrementally.

## User experience goals

- make commonly used operations simple and fast
- keep business data traceable as the app grows
- reduce manual error in catalog and configuration tasks
- preserve a clear path from setup to daily operations
