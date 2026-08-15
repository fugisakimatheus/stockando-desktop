# Data Layer Guide

This document describes the current persistence model and the responsibilities of the local data layer.

## Storage approach

The application uses SQLite through Drizzle ORM and better-sqlite3, with the main process acting as the orchestration boundary for database access and local services.

## Schema responsibilities

The current schema is centered on a company-scoped model with entities such as:

- companies and company settings
- users and roles
- customers and suppliers
- categories, units of measure, products, warehouses, and stock
- invoices, payments, and audit-oriented records

This structure favors an operational desktop workflow with strong tenant scoping and traceability.

## Design principles

- Each important entity is scoped to a company.
- Inventory operations remain explicit and auditable.
- The database is the system of record for transactional data.
- Main-process code should remain the primary owner of persistence concerns.

## Current implementation notes

- The schema definition lives in src/main/db/schema.ts.
- The local HTTP service (Fastify) is started from src/main/server.ts.
- The renderer should consume data through the preload bridge and application-level APIs rather than interacting with the database directly.

## Recommended follow-up

As the application grows, it will be helpful to add migration documentation and a more explicit service/repository layer for domain-specific persistence logic.
