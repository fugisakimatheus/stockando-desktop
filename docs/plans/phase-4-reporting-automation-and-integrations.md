# Phase 4 - Reporting, Automation, and Integrations

## Goal

Evolve from a transactional tool into a business platform. This phase adds dashboards, business reports, import/export flows, automation hooks, and integration points for external services.

## Sprint estimate

Sprint 6

## Deliverables

- Dashboard and reporting screens with summary views and filters
- Import and export flows for bulk data handling
- Automation and reminder configuration hooks
- Integration points for external services and fiscal providers
- Management reporting and broader operational automation

## Scope

### Backend

- Expose reporting queries for summaries, exports, and operational metrics
- Add import/export hooks and automation rule evaluation points
- Isolate integrations behind the main-process boundary so the renderer remains stable
- Use batched queries and cacheable aggregates for dashboards to avoid slow report generation on each open
- Prepare integration points for future fiscal services and external providers

### Frontend

- Build dashboard and reporting screens with summary cards, filters, and export actions
- Add import and automation configuration flows in a simple desktop-oriented experience
- Use chart components carefully and avoid overloading dashboards with too many live calculations

### Performance focus

- Compute heavy analytics in the main process or via cached aggregates where possible
- Keep dashboard refreshes controlled with debounced filters and limited re-render frequency
- Ensure export and import flows do not block the UI thread for long periods

## Backlog

### P4 - Stretch goals after core workflows are stable

- [ ] Build dashboard and reporting screens with summary views and filters
- [ ] Add import and export flows for bulk data handling
- [ ] Create automation and reminder configuration hooks
- [ ] Prepare integration points for external services and fiscal providers

## Validation criteria

- Summary views reflect real transactional data accurately
- Imports and exports complete safely without corrupting local data
- Integration points are isolated behind the main-process boundary
- Dashboard refreshes remain responsive with debounced filters
- Heavy analytics do not block the UI thread

## Dependencies

- Phase 0 (foundation shell)
- Phase 1 (catalog and inventory data for reporting)
- Phase 2 (sales and purchasing data for reporting)
- Phase 3 (finance and fiscal data for reporting)

## Technical notes

- Isolate integrations behind the main-process boundary so renderer stability is not affected
- Use cacheable aggregates for dashboard data to avoid recomputing on every open
- Use batched queries for report generation
- Keep import/export operations off the main renderer thread
- Chart components should be used carefully to avoid overloading dashboards
- Automation rules should be evaluated in the main process with clear trigger and action patterns
- Export formats should be practical (CSV, PDF) and aligned with standard business workflows
