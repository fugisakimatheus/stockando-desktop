# Product Vision and Requirements

## 1. Product vision

The product is a desktop business application for small and mid-sized retail and distribution companies. It combines local-first data storage, a clear desktop experience, and a modular architecture that can grow from a usable MVP into a complete operational platform.

### Architecture overview

- Electron for the desktop shell
- React and TypeScript for the user experience
- SQLite through Drizzle for local persistence
- Clear separation between main, preload, and renderer layers

## 2. Product decisions

- The first release supports multi-company usage from the beginning
- The MVP remains local-only and relies on SQLite as the primary persistence layer
- Fiscal functionality will be developed fully, including document generation and compliance-oriented workflows
- The product targets both retail and distribution use cases
- Inventory accuracy is prioritized over sales automation for the first usable version
- Performance is a first-class requirement across all phases

## 3. Project objectives

- Deliver a practical MVP quickly with a clear path to expansion
- Support multi-company usage from the initial release with strong company scoping and isolation
- Keep the product local-first and desktop-oriented using SQLite as the primary persistence layer
- Prioritize inventory accuracy and transactional correctness over convenience automation
- Support catalog, inventory, sales, purchasing, finance, and fiscal workflows in a modular way
- Preserve a simple and maintainable architecture as the application grows
- Ensure the experience remains usable for daily operations, not only for data entry
- Keep the application responsive for inventory-heavy and document-heavy operations on standard desktop hardware

## 4. Scope by area

| Area | Description |
|------|-------------|
| Foundation and platform | App shell, navigation, auth, multi-company, database, settings |
| Catalog and inventory | Categories, products, warehouses, stock, movements, reconciliation |
| Sales and commercial | Customers, quotes, orders, payments, conversions |
| Purchasing and suppliers | Suppliers, purchase orders, delivery tracking, payment status |
| Finance and fiscal | Payments, installments, fiscal documents, compliance |
| Audit and attachments | Change history, document attachments, traceability |

## 5. Functional requirements

### 5.1 Core system requirements

- The application must run locally as a desktop app with no mandatory external service dependency
- Data must remain available even when the machine is offline or disconnected from network services
- User actions must be scoped to a company context, and switching companies must be fast and explicit
- Each company must have isolated data, settings, and operational workflows
- Core entities must be auditable, traceable, and recoverable after restart or migration
- The system must support incremental feature rollout without rewriting the base architecture
- The base experience must remain responsive during startup, navigation, and local data access

### 5.2 Catalog and inventory requirements

- Create, read, update, and delete categories, units of measure, products, warehouses, and stock locations
- Support stock movement records, balances, transfers, and stock adjustments with reasons and responsible users
- Maintain clear references between products, categories, warehouses, units, and movement history
- Preserve inventory accuracy with validation rules, reconciliation support, and auditable correction flows
- Support both retail and distribution-oriented inventory behavior without breaking consistency
- Prevent inconsistent stock states when creating, converting, or correcting documents

### 5.3 Sales requirements

- Create and manage customers, quotes, sales orders, and order items
- Support item lines, quantities, pricing, discounts, totals, and status transitions
- Convert quotations into sales orders while keeping the original context and related inventory references intact
- Track order status, payment status, and document history clearly
- Support partial or complete payment registration without introducing inconsistent balances
- Keep list and form interactions smooth even for documents with many item lines

### 5.4 Purchasing requirements

- Register suppliers and create purchase orders for incoming inventory
- Support purchase order lines, quantities, costs, delivery expectations, and payment status
- Track partial receipts and maintain consistency between purchase activity and stock movement
- Preserve company scoping and link procurement activity to the correct inventory and financial context

### 5.5 Finance and fiscal requirements

- Track financial status at the order, document, and payment level
- Associate payment activity with business transactions and maintain consistent balances
- Support fiscal document generation, validation, lifecycle states, and document references
- Maintain consistency between inventory, commercial documents, and financial records
- Preserve historical fiscal data in a way that remains usable for review and compliance workflows

### 5.6 Audit and attachment requirements

- Retain a history of meaningful changes for critical entities such as stock, orders, payments, and fiscal documents
- Allow attachments to important records without blocking the core workflow
- Expose audit context and related attachments in a lightweight and query-efficient way
- Keep audit and attachment operations from becoming a bottleneck for everyday use

## 6. Non-functional requirements

- **Performance**: the app should remain responsive for common catalog, inventory, and transaction operations, even with larger datasets
- **Responsiveness**: initial startup, route changes, list loading, and form interaction should feel immediate and avoid visible stalls
- **Reliability**: critical business data must be stored safely, written atomically where needed, and recovered consistently after restart or interruption
- **Security**: access control, company isolation, and sensitive data handling should be treated seriously from the start
- **Maintainability**: modules should be organized so that future features can be added without major structural changes
- **Testability**: core flows should be covered by automated tests as the product grows, especially inventory, stock movement, and fiscal document flows
- **Usability**: common actions should be simple, predictable, and optimized for desktop interaction
- **Scalability**: the architecture should support larger catalogs, longer histories, and more document lines without major rework
- **Observability**: important errors, slow operations, and validation failures should be visible and diagnosable during development and support

## 7. Technical principles

- Keep business rules in the Electron main-process layer whenever they affect persistence, validation, or transactional consistency
- Keep the preload bridge narrow and typed, exposing only the API surface required by the renderer
- Use TanStack Query for remote or async data access patterns, with explicit caching and invalidation strategies
- Use Drizzle ORM and SQLite for local-first persistence, with indexes and query patterns aligned to the business entities in the schema
- Prefer shared UI primitives from the renderer shared layer for tables, forms, dialogs, filters, and empty states
- Optimize for desktop responsiveness by minimizing unnecessary re-renders, keeping lists virtualized or paginated where needed, and avoiding heavy work in the renderer thread
- Use typed preload APIs and avoid leaking main-process internals into the renderer
- Keep module boundaries clear between pages, shared UI, shared API, and shared lib layers
- Use Tailwind utilities consistently and prefer shared primitives over ad-hoc styling
- Use Sonner and similar feedback patterns for non-blocking success and error states
- Use Electron-safe patterns for file access, local persistence, and app lifecycle events
- Use React Aria and Base UI primitives where accessibility and desktop interaction quality matter

## 8. Performance and optimization checklist

- Profile route transitions and initial load times during each phase
- Keep the number of IPC calls low and batch related reads where it makes sense
- Prefer indexed queries and constrained result sets over full-table scans for operational modules
- Use pagination, virtualization, or lazy loading for large lists and histories
- Keep component renders predictable by memoizing only where it clearly improves performance
- Ensure loading, empty, and error states are explicit to avoid UX stalls and hidden failures

## 9. Development phases overview

| Phase | Focus | Sprint estimate |
|-------|-------|-----------------|
| Phase 0 | Foundation and MVP shell | Sprints 1-2 |
| Phase 1 | Catalog and inventory management | Sprint 3 |
| Phase 2 | Sales and purchasing flows | Sprint 4 |
| Phase 3 | Finance, fiscal, and auditability | Sprint 5 |
| Phase 4 | Reporting, automation, and integrations | Sprint 6 |

## 10. MVP recommendation

A strong MVP should include:

1. Foundation and app shell with multi-company support
2. Local SQLite bootstrap, company context, and settings
3. Product, category, warehouse, and stock management
4. Inventory accuracy controls, stock adjustments, and movement history
5. Basic sales and purchase order flows for retail and distribution scenarios
6. Full fiscal module support, including document generation and compliance workflows
7. Audit, attachments, and basic reporting for operational visibility

## 11. Related plans

- [Phase 0 - Foundation and MVP Shell](./phase-0-foundation-and-mvp-shell.md)
- [Phase 1 - Catalog and Inventory Management](./phase-1-catalog-and-inventory.md)
- [Phase 2 - Sales and Purchasing Flows](./phase-2-sales-and-purchasing.md)
- [Phase 3 - Finance, Fiscal, and Auditability](./phase-3-finance-fiscal-and-auditability.md)
- [Phase 4 - Reporting, Automation, and Integrations](./phase-4-reporting-automation-and-integrations.md)
- [Backup Feature](./backup-feature-plan.md)
