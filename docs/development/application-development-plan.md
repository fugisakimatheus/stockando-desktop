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
- keep the product company-centric and audit-friendly
- support catalog, inventory, sales, purchasing, finance, and fiscal workflows in a modular way
- preserve a simple and maintainable architecture as the application grows
- ensure the experience remains usable for daily operations, not only for data entry

## 3. Scope by area

### 3.1 Foundation and platform

This layer is responsible for the base experience of the application.

Core features:
- application shell and navigation
- authentication and user session handling
- company selection and context management
- configuration and system settings
- database initialization and maintenance
- basic validation, error handling, and logging

### 3.2 Catalog and inventory

This is one of the core operational modules of the product.

Core features:
- categories and hierarchical organization
- units of measure
- products and SKUs
- warehouses and stock locations
- stock balance tracking
- stock movements and adjustments

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
- fiscal document management
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

- the application must run locally as a desktop app
- data must remain available even without external services
- user actions must be scoped to a company context
- core entities must be auditable and traceable
- the system must support incremental feature rollout without rewriting the base architecture

### 5.2 Catalog and inventory requirements

- create, read, update, and delete categories and products
- support stock movement records and balances
- allow adjustment of inventory quantities with reasons and responsible users
- maintain clear references between products, categories, warehouses, and units

### 5.3 Sales requirements

- create and manage customers
- create quotations with items and totals
- convert quotations into sales orders
- track order status and payment status
- support partial or complete payment registration

### 5.4 Purchasing requirements

- register suppliers
- create purchase orders for incoming inventory
- track quantities, costs, delivery expectations, and payment status

### 5.5 Finance and fiscal requirements

- track financial status at the order or document level
- associate payment activity with business transactions
- support fiscal document references and lifecycle states
- maintain consistency between inventory, order, and financial records

### 5.6 Audit and attachment requirements

- retain a history of meaningful changes
- allow attachments to important records
- expose audit context for operational reviews

## 6. Non-functional requirements

- performance: the app should remain responsive for common catalog and transaction operations
- reliability: critical business data must be stored safely and recovered consistently
- security: access control and sensitive data handling should be treated seriously from the start
- maintainability: modules should be organized so that future features can be added without major structural changes
- testability: core flows should be covered by automated tests as the product grows
- usability: common actions should be simple, predictable, and optimized for desktop interaction

## 7. MVP recommendation

A strong MVP should include:

1. foundation and app shell
2. company and user context
3. product and category management
4. warehouse and stock tracking
5. basic sales order flow
6. basic purchase order flow
7. simple settings and configuration

This provides a meaningful first release without overloading the initial version with fiscal and reporting complexity.

## 8. Suggested implementation order

1. finish the base shell and navigation
2. implement company and configuration setup
3. build the catalog and inventory module
4. add sales order and quote flow
5. add purchase order flow
6. introduce finance and fiscal modules later
7. then expand reporting and integrations

## 9. Open questions for product refinement

The following points still need product decisions before the roadmap becomes fully concrete:

- should the first release focus on a single-company workflow or support multi-company usage from the beginning?
- should the MVP prioritize a local-only desktop experience, or should it include a simple sync/export strategy from the start?
- how much fiscal complexity should be included in the first release, especially for document generation and compliance workflows?
- should the product target retail, distribution, or both as the main use case?
- what is the priority between sales automation and inventory accuracy for the first usable version?

## 10. Summary

The current project already has a solid architectural foundation and a clear functional scope. The best path forward is to build the product in progressive phases: first the foundation, then catalog and inventory, then commercial flows, and only later the more complex finance, fiscal, and reporting layers.
