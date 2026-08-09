# Application Development Plan

## 1. Product vision

The product is a desktop business application for small and mid-sized retail and distribution companies. It should combine local-first data storage, a clear desktop experience, and a modular architecture that can grow from a usable MVP into a more complete operational platform.

The current architecture already points to a strong direction:

- Electron for the desktop shell
- React and TypeScript for the user experience
- SQLite through Drizzle for local persistence
- a clear separation between main, preload, and renderer layers

## 2. Project objectives

The development plan should prioritize the following goals:

- deliver a practical MVP quickly and with a clear path to expansion
- support multi-company usage from the initial release, with strong company scoping and isolation
- keep the product local-first and desktop-oriented, using SQLite as the primary persistence layer
- prioritize inventory accuracy and transactional correctness over convenience automation
- support catalog, inventory, sales, purchasing, finance, and fiscal workflows in a modular way
- preserve a simple and maintainable architecture as the application grows
- ensure the experience remains usable for daily operations, not only for data entry
- keep the application responsive for inventory-heavy and document-heavy operations, even on standard desktop hardware

## 3. Scope by area

### 3.1 Foundation and platform

This layer is responsible for the base experience of the application.

Core features:
- application shell and navigation
- authentication and user session handling
- multi-company selection and context management
- company-scoped configuration and system settings
- local database initialization, migrations, and maintenance with SQLite
- basic validation, error handling, and logging
- performance-sensitive startup and bootstrap paths

### 3.2 Catalog and inventory

This is one of the core operational modules of the product.

Core features:
- categories and hierarchical organization
- units of measure
- products and SKUs
- warehouses and stock locations
- stock balance tracking
- stock movements and adjustments
- inventory accuracy controls, validation, and reconciliation workflows
- support for both retail and distribution scenarios, including stock behavior differences

### 3.3 Sales and commercial operations

This module covers the customer-facing commercial workflow.

Core features:
- customer management
- quote creation and lifecycle
- quote item management
- quote-to-order conversion
- sales orders and status tracking
- order payments and partial settlement

### 3.4 Purchasing and suppliers

This module complements the sales side with procurement workflows.

Core features:
- supplier registration
- purchase order creation
- purchase order items and quantities
- expected delivery tracking
- payment status visibility

### 3.5 Finance and fiscal operations

This module supports monetary and regulatory workflows.

Core features:
- payment tracking
- installment and settlement handling
- full fiscal document management and lifecycle handling
- document generation, validation, and compliance-oriented workflows
- document references and status history
- integration points for future fiscal services

### 3.6 Audit and attachments

This area strengthens traceability and compliance.

Core features:
- change history and audit records
- document attachments for entities
- relationship between business records and supporting files
- auditing workflows for critical operations

## 4. Recommended development phases

### Phase 0 - Foundation and MVP shell

Goal: establish the base experience and make the app usable as a desktop product.

Planned work:
- finalize the app shell and navigation structure
- implement company and user context
- define the main screens for home, catalog, settings, and future modules
- wire the database layer and initial seed data
- create the base UI patterns for forms, tables, dialogs, and empty states

Deliverables:
- working desktop application
- stable routing and layout
- initial company and settings setup flow

### Phase 1 - Catalog and inventory management

Goal: deliver the first operational module for daily business use.

Planned work:
- categories and products
- units of measure
- warehouse and stock setup
- stock movement records and adjustments
- basic search, filters, and listing views

Deliverables:
- usable product catalog
- product inventory visibility
- stock movement history

### Phase 2 - Sales and purchasing flows

Goal: expand the application into commercial operations.

Planned work:
- customer management
- quote and order creation
- purchase order and supplier workflows
- item-level details and totals
- status transitions and basic validations

Deliverables:
- end-to-end quote and order workflow
- supplier and purchase order management
- stronger business process coverage

### Phase 3 - Finance, fiscal, and auditability

Goal: make the system more complete for real daily operations.

Planned work:
- payments and financial status tracking
- fiscal document management
- attachments and audit trail support
- stronger validation and business rules

Deliverables:
- traceable transactional records
- better financial visibility
- more compliance-oriented workflows

### Phase 4 - Reporting, automation, and integrations

Goal: evolve from a transactional tool into a business platform.

Planned work:
- dashboards and business reports
- export/import flows
- automation rules and reminders
- integrations with external services and fiscal providers

Deliverables:
- management reporting
- broader operational automation
- future-ready extension points

## 5. Functional requirements

### 5.1 Core system requirements

- the application must run locally as a desktop app with no mandatory external service dependency
- data must remain available even when the machine is offline or disconnected from network services
- user actions must be scoped to a company context, and switching companies must be fast and explicit
- each company must have isolated data, settings, and operational workflows
- core entities must be auditable, traceable, and recoverable after restart or migration
- the system must support incremental feature rollout without rewriting the base architecture
- the base experience must remain responsive during startup, navigation, and local data access

### 5.2 Catalog and inventory requirements

- create, read, update, and delete categories, units of measure, products, warehouses, and stock locations
- support stock movement records, balances, transfers, and stock adjustments with reasons and responsible users
- maintain clear references between products, categories, warehouses, units, and movement history
- preserve inventory accuracy with validation rules, reconciliation support, and auditable correction flows
- support both retail and distribution-oriented inventory behavior without breaking consistency
- prevent inconsistent stock states when creating, converting, or correcting documents

### 5.3 Sales requirements

- create and manage customers, quotes, sales orders, and order items
- support item lines, quantities, pricing, discounts, totals, and status transitions
- convert quotations into sales orders while keeping the original context and related inventory references intact
- track order status, payment status, and document history clearly
- support partial or complete payment registration without introducing inconsistent balances
- keep list and form interactions smooth even for documents with many item lines

### 5.4 Purchasing requirements

- register suppliers and create purchase orders for incoming inventory
- support purchase order lines, quantities, costs, delivery expectations, and payment status
- track partial receipts and maintain consistency between purchase activity and stock movement
- preserve company scoping and link procurement activity to the correct inventory and financial context

### 5.5 Finance and fiscal requirements

- track financial status at the order, document, and payment level
- associate payment activity with business transactions and maintain consistent balances
- support fiscal document generation, validation, lifecycle states, and document references
- maintain consistency between inventory, commercial documents, and financial records
- preserve historical fiscal data in a way that remains usable for review and compliance workflows

### 5.6 Audit and attachment requirements

- retain a history of meaningful changes for critical entities such as stock, orders, payments, and fiscal documents
- allow attachments to important records without blocking the core workflow
- expose audit context and related attachments in a lightweight and query-efficient way
- keep audit and attachment operations from becoming a bottleneck for everyday use

## 6. Non-functional requirements

- performance: the app should remain responsive for common catalog, inventory, and transaction operations, even with larger datasets
- responsiveness: initial startup, route changes, list loading, and form interaction should feel immediate and avoid visible stalls
- reliability: critical business data must be stored safely, written atomically where needed, and recovered consistently after restart or interruption
- security: access control, company isolation, and sensitive data handling should be treated seriously from the start
- maintainability: modules should be organized so that future features can be added without major structural changes
- testability: core flows should be covered by automated tests as the product grows, especially inventory, stock movement, and fiscal document flows
- usability: common actions should be simple, predictable, and optimized for desktop interaction
- scalability: the architecture should support larger catalogs, longer histories, and more document lines without major rework
- observability: important errors, slow operations, and validation failures should be visible and diagnosable during development and support

## 7. MVP recommendation

A strong MVP should include:

1. foundation and app shell with multi-company support
2. local SQLite bootstrap, company context, and settings
3. product, category, warehouse, and stock management
4. inventory accuracy controls, stock adjustments, and movement history
5. basic sales and purchase order flows for retail and distribution scenarios
6. full fiscal module support, including document generation and compliance workflows
7. audit, attachments, and basic reporting for operational visibility

This provides a meaningful first release while keeping the initial scope focused on inventory accuracy, fiscal completeness, and local desktop reliability.

## 8. Suggested implementation order

1. finish the base shell and navigation with multi-company context
2. implement local SQLite bootstrap, company configuration, and settings
3. build the catalog and inventory module with strong inventory accuracy controls
4. add sales and purchase flows for both retail and distribution scenarios
5. implement the full fiscal module, including document generation and compliance rules
6. add audit, attachments, and operational visibility features
7. then expand reporting and integrations

## 9. Implementation task breakdown

This section translates the business plan into a technical execution guide grounded in the current stack and architecture. It also makes performance and optimization requirements explicit so the implementation can remain responsive even as the data model and UI grow.

### 9.0 Technical principles

- keep business rules in the Electron main-process layer whenever they affect persistence, validation, or transactional consistency
- keep the preload bridge narrow and typed, exposing only the API surface required by the renderer
- use React Query for remote or async data access patterns, with explicit caching and invalidation strategies
- use Drizzle ORM and SQLite for local-first persistence, with indexes and query patterns aligned to the business entities in the schema
- prefer shared UI primitives from the renderer shared layer for tables, forms, dialogs, filters, and empty states instead of repeating layout logic
- optimize for desktop responsiveness by minimizing unnecessary re-renders, keeping lists virtualized or paginated where needed, and avoiding heavy work in the renderer thread

### 9.1 Phase 0 - Foundation and MVP shell

#### Backend
- define and evolve the Drizzle schema for companies, users, settings, and core audit tables
- implement main-process initialization, seed data, and migration hooks
- expose minimal preload IPC endpoints for company context, settings, and app bootstrap
- enforce basic validation and error handling for startup and configuration flows
- keep database reads and writes batched and deterministic to avoid startup lag

#### Frontend
- build the app shell, route structure, home screen, and initial settings experience
- create shared layout, form, table, dialog, and empty-state patterns under the renderer shared layer
- connect screens to typed API helpers and shared query hooks
- use React Query for loading, caching, and invalidation of settings and company context data
- adopt a lightweight state model that keeps UI state local and avoids unnecessary global state churn

#### Performance focus
- ensure initial route loading is fast and that shell navigation remains responsive
- avoid blocking the UI during startup by separating bootstrap work and lazy-loading non-critical screens

### 9.2 Phase 1 - Catalog and inventory management

#### Backend
- implement CRUD workflows for categories, units of measure, products, warehouses, and stock movements
- maintain stock balances from movement history and support stock adjustments with reasons and responsible users
- preserve company scoping and ensure quantities and references remain consistent
- add indexes and query patterns for product, warehouse, and stock lookups to keep inventory operations efficient
- use transactional write patterns where stock updates and movement records must remain consistent

#### Frontend
- build list/detail screens for categories, products, warehouses, and stock movements
- add inventory adjustment flows with validation and feedback
- use shared UI components for forms, tables, filters, and empty states
- use TanStack Table for large list views and pagination to avoid rendering too much data at once
- use React Query caching and pagination-aware invalidation for product and inventory lists

#### Performance focus
- keep product and stock lists responsive with server-side or query-level pagination and lightweight filters
- avoid full-page re-renders when editing inventory rows or changing filters
- measure list render cost and optimize repeated table cell rendering where necessary

### 9.3 Phase 2 - Sales and purchasing flows

#### Backend
- implement customer, supplier, quote, sales order, purchase order, and item-level persistence
- enforce status transitions, totals, and quote-to-order conversion rules
- keep inventory and financial references consistent when commercial transactions change
- consolidate calculation logic in the main-process layer so totals are not recomputed inconsistently in multiple places
- use deterministic serialization and validation around quote/order conversions to reduce edge-case bugs

#### Frontend
- create screens for customers, quotes, sales orders, suppliers, and purchase orders
- add item rows, totals, status controls, and conversion actions with clear error states
- keep the experience aligned with the desktop-first visual and interaction patterns
- use memoization and composition for complex forms and detail panels to reduce rerender costs
- use React Query for fetching order summaries, items, and related entities with targeted invalidation after mutations

#### Performance focus
- keep forms responsive while editing multi-item transactions
- avoid unnecessary refetches after local mutations and use optimistic updates only where they are safe and clearly reversible
- ensure tables and nested item editors stay smooth even with larger documents

### 9.4 Phase 3 - Finance, fiscal, and auditability

#### Backend
- add payment, installment, fiscal-document, attachment, and audit-log support
- ensure financial and fiscal records remain connected to the underlying order and inventory context
- persist meaningful change history for critical business operations
- keep audit and attachment operations asynchronous where possible so the user flow is not blocked by file or logging work
- optimize queries for financial summaries and reference lookups over large histories

#### Frontend
- build financial and document review screens, attachment handling, and audit-history views
- present lifecycle states clearly for orders, documents, payments, and related records
- keep history and attachment panels lightweight, with lazy loading or paged lists for large records

#### Performance focus
- avoid loading full audit histories on first render when a compact preview is enough
- defer heavy document or attachment rendering until the user opens the detail view

### 9.5 Phase 4 - Reporting, automation, and integrations

#### Backend
- expose reporting queries for summaries, exports, and operational metrics
- add import/export hooks and automation rule evaluation points
- isolate integrations behind the main-process boundary so the renderer remains stable
- use batched queries and cacheable aggregates for dashboards to avoid slow report generation on each open

#### Frontend
- build dashboard and reporting screens with summary cards, filters, and export actions
- add import and automation configuration flows in a simple desktop-oriented experience
- use chart components carefully and avoid overloading dashboards with too many live calculations

#### Performance focus
- compute heavy analytics in the main process or via cached aggregates where possible
- keep dashboard refreshes controlled with debounced filters and limited re-render frequency
- ensure exports and imports do not block the UI thread for long periods

### 9.6 Implementation patterns to prioritize

- use typed preload APIs and avoid leaking main-process internals into the renderer
- keep module boundaries clear between pages, shared UI, shared API, and shared lib layers
- use Tailwind utilities consistently and prefer shared primitives over ad-hoc styling
- use Sonner and similar feedback patterns for non-blocking success and error states
- use Electron-safe patterns for file access, local persistence, and app lifecycle events
- use React Aria and Base UI primitives where accessibility and desktop interaction quality matter
- use TanStack React Query Devtools and React Devtools during implementation to inspect loading, caching, and render behavior

### 9.7 Performance and optimization checklist

- profile route transitions and initial load times during each phase
- keep the number of IPC calls low and batch related reads where it makes sense
- prefer indexed queries and constrained result sets over full-table scans for operational modules
- use pagination, virtualization, or lazy loading for large lists and histories
- keep component renders predictable by memoizing only where it clearly improves performance
- ensure loading, empty, and error states are explicit to avoid UX stalls and hidden failures

### 9.8 Suggested execution order

1. complete the foundation shell and company/settings setup
2. implement catalog and inventory management
3. add sales and purchasing flows
4. add finance, fiscal, and audit features
5. expand reporting, automation, and integrations

This section turns the product plan into an execution guide. Each phase should produce a working increment that can be reviewed, tested, and extended without breaking the current architecture.

### 9.1 Phase 0 - Foundation and MVP shell

#### Backend
- define and evolve the Drizzle schema for multi-company support, users, settings, inventory basics, and audit metadata
- implement main-process initialization, migrations, seed data, and startup safeguards for SQLite
- expose a narrow and typed preload API for app bootstrap, company switching, settings, and initial queries
- enforce validation, error handling, and transactional safety for startup and configuration flows
- keep database reads and writes deterministic and low-latency during bootstrap

#### Frontend
- build the desktop shell, route structure, home screen, and company selection experience
- create shared primitives for layout, forms, tables, dialogs, filters, and empty states in the renderer shared layer
- connect screens to typed API helpers and shared query hooks with lightweight local state where appropriate
- keep the shell modular so new modules can be added without major UI restructuring

#### Performance focus
- ensure the first launch and route transitions remain responsive by lazy-loading non-critical screens
- avoid blocking the UI with heavy initialization work during startup

#### Validation
- verify the app launches cleanly and the base screens render without runtime errors
- validate that company switching, settings save, and local persistence work end to end

### 9.2 Phase 1 - Catalog and inventory management

#### Backend
- implement CRUD workflows for categories, units of measure, products, warehouses, and stock locations
- implement stock movement and adjustment workflows with reasons, responsible users, and audit context
- maintain stock balances from movement history and enforce inventory consistency rules
- add indexes and query patterns for product, warehouse, and stock lookups to keep operations efficient
- use transactional write patterns where stock updates and movement records must remain consistent

#### Frontend
- build list and detail screens for categories, products, warehouses, stock locations, and movement history
- add validation-rich inventory adjustment and transfer flows with clear feedback states
- use shared UI components for forms, tables, filters, empty states, and detail panels
- use TanStack Table for larger inventory lists with pagination and lightweight filtering
- use React Query caching and targeted invalidation for catalog and inventory data

#### Performance focus
- keep inventory lists responsive with pagination, constrained result sets, and efficient table rendering
- avoid unnecessary full-page re-renders when editing rows or changing filters
- profile list and form interactions and optimize repeated rendering where needed

#### Validation
- verify stock balances update correctly after adjustments and movement entry
- validate that product, category, warehouse, and movement data are editable and retrievable

### 9.3 Phase 2 - Sales and purchasing flows

#### Backend
- implement customer, supplier, quote, sales order, purchase order, and item-level persistence
- enforce status transitions, totals, and quote-to-order conversion rules without breaking inventory integrity
- keep inventory, order, payment, and financial references consistent when commercial transactions change
- consolidate calculation and validation logic in the main-process layer to reduce drift and inconsistencies
- use deterministic serialization and validation around conversions and document updates

#### Frontend
- create screens for customers, quotes, sales orders, suppliers, and purchase orders
- add item rows, totals, status controls, payment states, and conversion actions with clear error handling
- keep the experience aligned with desktop-first interaction patterns and shared UI conventions
- use memoization and composition for complex forms and detail panels to reduce rerender costs
- use React Query for fetching order summaries, items, and related entities with targeted invalidation after mutations

#### Performance focus
- keep forms responsive while editing multi-item transactions
- avoid unnecessary refetches after local mutations and use optimistic updates only where they are clearly safe
- ensure nested item editors and large transaction tables stay smooth under real usage

#### Validation
- verify that quotes can be created, edited, and converted into orders without inconsistent state
- validate that purchase orders and payments are stored with correct totals, statuses, and references

### 9.4 Phase 3 - Finance, fiscal, and auditability

#### Backend
- add payment, installment, fiscal-document, attachment, and audit-log support
- ensure financial and fiscal records remain connected to the underlying order and inventory context
- persist meaningful change history for critical business operations and document lifecycle changes
- keep audit and attachment operations asynchronous where possible so the user flow is not blocked
- optimize queries for financial summaries, document history, and reference lookups over larger datasets

#### Frontend
- build financial review, fiscal document, attachment, and audit-history screens
- present lifecycle states clearly for orders, documents, payments, and related records
- keep history and attachment panels lightweight with lazy loading or paged list behavior for large records

#### Performance focus
- avoid loading full audit histories on first render when a compact preview is enough
- defer heavy document or attachment rendering until the user opens the detail view
- keep review screens responsive even when long histories are present

#### Validation
- verify that document, payment, and fiscal states are updated consistently
- validate that attachments and audit records are associated with the correct entities

### 9.5 Phase 4 - Reporting, automation, and integrations

#### Backend
- expose reporting queries for summaries, exports, and operational metrics
- add import/export hooks and automation rule evaluation points
- isolate integrations behind the main-process boundary so the renderer remains stable
- use batched queries and cacheable aggregates for dashboards to avoid slow report generation on each open

#### Frontend
- build dashboard and reporting screens with summary cards, filters, and export actions
- add import and automation configuration flows in a simple desktop-oriented experience
- use chart components carefully and avoid overloading dashboards with too many live calculations

#### Performance focus
- compute heavy analytics in the main process or via cached aggregates where possible
- keep dashboard refreshes controlled with debounced filters and limited re-render frequency
- ensure export and import flows do not block the UI thread for long periods

#### Validation
- verify reporting output reflects the underlying transactional data correctly
- validate that import/export flows complete without data corruption

### 9.6 Suggested execution order

1. complete the foundation shell and multi-company setup
2. implement local SQLite bootstrap, company configuration, and settings
3. build the catalog and inventory module with strong accuracy controls
4. add sales and purchasing flows for retail and distribution scenarios
5. implement the full fiscal module, including document generation and compliance rules
6. add audit, attachments, and operational visibility features
7. expand reporting, automation, and integrations

## 10. Prioritized execution backlog

The following backlog is intended to be used as the implementation checklist for the first delivery milestones. It is organized by priority, expected outcome, and acceptance criteria.

### P0 - Foundation and core shell

Priority: must-have for the first usable release.

- [ ] create the Electron app shell, navigation, and route structure
- [ ] implement the typed preload bridge for app bootstrap, multi-company context, and settings
- [ ] define the initial Drizzle schema for companies, users, settings, and audit metadata
- [ ] implement database initialization, migrations, and seed data for a local-first SQLite startup flow
- [ ] build the home screen, company selection flow, and initial settings experience
- [ ] create shared layout, form, table, dialog, and empty-state primitives in the renderer shared layer
- [ ] verify launch, navigation, and local persistence behavior end to end
- [ ] ensure startup and navigation remain responsive with lazy loading and bounded bootstrap work

Definition of done:
- the app opens without runtime errors
- company and settings data can be created and read locally
- the base shell is stable enough for feature work to be added incrementally

### P1 - Catalog and inventory

Priority: core operational module for the MVP.

- [ ] add CRUD screens for categories and units of measure
- [ ] add CRUD screens for products, warehouses, and stock locations
- [ ] implement stock movement entry and inventory adjustment workflows
- [ ] maintain stock balances from movement history with validation, audit context, and reconciliation rules
- [ ] add search, filtering, and paginated list behavior for catalog and inventory views
- [ ] support both retail and distribution inventory behaviors where relevant
- [ ] ensure inventory actions remain responsive with indexed queries, constrained result sets, and efficient table rendering

Definition of done:
- products and stock can be created, edited, and listed reliably
- stock adjustments update balances correctly
- inventory screens remain responsive for standard catalog sizes

### P2 - Sales and purchasing workflows

Priority: important for daily commercial operations.

- [ ] implement customer and supplier management screens
- [ ] add quote creation, editing, and item-line management
- [ ] implement quote-to-order conversion with validation and status updates
- [ ] build sales order and purchase order screens with totals and status tracking
- [ ] add payment and settlement handling for orders and purchases
- [ ] support both retail and distribution transaction patterns without compromising inventory integrity
- [ ] keep commercial data consistent across inventory, order history, and financial references
- [ ] keep form interactions smooth even with multi-item documents and frequent updates

Definition of done:
- quotes can be converted into orders without inconsistent state
- purchase and sales workflows can be completed from start to finish
- totals and status transitions are reliable and testable

### P3 - Finance, fiscal, and traceability

Priority: important for stronger operational completeness.

- [ ] add payment, installment, and financial status tracking
- [ ] implement full fiscal document support, including generation, validation, and compliance-oriented workflows
- [ ] support fiscal document references and lifecycle states
- [ ] implement attachment handling for key business entities
- [ ] expose audit-history views for critical updates and state changes
- [ ] optimize history and attachment loading so large records remain usable
- [ ] keep fiscal and financial screens responsive when reviewing long document histories

Definition of done:
- financial and fiscal records remain linked to the underlying transaction context
- audit and attachment views load incrementally and stay responsive
- important changes are traceable without overwhelming the UI

### P4 - Reporting, automation, and integrations

Priority: stretch goals after the core workflows are stable.

- [ ] build dashboard and reporting screens with summary views and filters
- [ ] add import and export flows for bulk data handling
- [ ] create automation and reminder configuration hooks
- [ ] prepare integration points for external services and fiscal providers

Definition of done:
- summary views reflect real transactional data accurately
- imports and exports complete safely without corrupting local data
- integration points are isolated behind the main-process boundary

## 11. Suggested sprint roadmap

A practical delivery rhythm for the first implementation cycle could be:

- Sprint 1: foundation shell, typed IPC bridge, database bootstrap, and shared UI primitives
- Sprint 2: company/settings flow and initial catalog screens
- Sprint 3: inventory, stock movement, and adjustment workflows
- Sprint 4: sales quotes, orders, and supplier/purchase flows
- Sprint 5: finance, attachments, audit views, and stability improvements
- Sprint 6: reporting, import/export, and integration scaffolding

## 12. Product decisions adopted

The product direction is now aligned with the following decisions:

- the first release will support multi-company usage from the beginning
- the MVP will remain local-only and rely on SQLite as the primary persistence layer
- fiscal functionality will be developed fully, including document generation and compliance-oriented workflows
- the product will target both retail and distribution use cases
- inventory accuracy will be prioritized over sales automation for the first usable version

Performance remains a first-class requirement across all phases, especially for inventory, document history, and fiscal review flows.
