# ADR-0001: Database schema foundation for stock, POS, and fiscal documents

**Date**: 2026-08-01
**Status**: proposed
**Deciders**: Project maintainers

## Context

The application is evolving from a simple starter Electron app into a desktop system that needs to support stock control, sales workflows, and fiscal document issuance for NF-e and NFC-e. The initial schema was just a placeholder user table, so a more complete foundational model is required to support company configuration, inventory, orders, payments, and fiscal documents without creating a rigid structure too early.

## Decision

We will introduce a foundational Drizzle schema in the main-process database layer with core entities for companies, users, customers, products, inventory, orders, payments, tax rules, digital certificates, and fiscal documents. The initial model will be company-centric, normalized enough for implementation, and designed to support gradual expansion into purchasing, accounting, and integrations.

## Alternatives Considered

### Alternative 1: Keep the current placeholder schema only
- **Pros**: Minimal upfront effort and no structural churn.
- **Cons**: Blocks the implementation of inventory, sales, and fiscal flows; forces repetitive rework later.
- **Why not**: Rejected because the current scope already requires these domain entities.

### Alternative 2: Introduce a fully normalized enterprise-grade schema immediately
- **Pros**: Strong long-term extensibility and clearer domain boundaries.
- **Cons**: Higher implementation cost and more complexity for the initial release.
- **Why not**: Rejected because the first implementation should stay pragmatic and incrementally evolve.

## Consequences

### Positive
- The core entities required for stock, POS, and fiscal workflows are now represented in the schema.
- The database structure can be extended incrementally without rewriting the foundation.
- The model better aligns with the current Electron + Drizzle architecture.

### Negative
- The initial schema remains intentionally pragmatic and may need refinement as business rules become clearer.
- Some advanced capabilities such as multi-warehouse logistics or complex tax scenarios are not yet fully modeled.

### Risks
- The schema may need adjustment once real business rules and fiscal integration details are finalized.
- The initial design should be reviewed regularly as new modules are introduced.

### Implementation refinement
- The first schema iteration has been strengthened with company-scoped uniqueness constraints, stronger cascading rules for company-owned records, and indexes that improve integrity and query performance for inventory and fiscal workflows.
- These refinements preserve the pragmatic MVP structure while making the model more reliable for multi-company and operational use.
