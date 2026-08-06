# Company and User Management

## Purpose

This module manages the organizational and access foundations of the system. It allows the application to support multiple companies and maintain structured access for different users.

## Main Resources

### Companies
- store the company identity and legal information
- hold core status and timestamps
- represent the top-level business entity in the model

### Company Settings
- contain company-specific defaults
- manage currency, fiscal environment, tax regime, and invoice series
- provide a single source of company configuration

### Users
- represent employees or administrators of a company
- store name, email, password hash, role, and status
- support company-level access boundaries

### Roles and Permissions
- define reusable roles for the application
- allow the system to grant permissions per functional area
- support safer and more structured access control

## Expected Workflows

- create and update company profiles
- define company settings per tenant
- register users and assign roles
- manage access to sales, inventory, purchasing, finance, and fiscal functions

## Notes

This layer is foundational. Most other modules depend on the company context and user identity.
