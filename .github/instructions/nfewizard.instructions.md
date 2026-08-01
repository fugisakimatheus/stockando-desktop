---
description: Instructions for working with the NFeWizard/NFe/NFCe ecosystem, including modular architecture, the main package, shared utilities, DANFE generation, and TypeScript types.
applyTo: '**/*.{ts,tsx,js}' # when provided, instructions will automatically be added to the request context when the pattern matches an attached file
---

<!-- Tip: Use /create-instructions in chat to generate content with agent assistance -->

# Instructions for the NFeWizard ecosystem

Use these guidelines when generating code, answering questions, or reviewing changes related to NFeWizard, NFe, NFCe, DANFE, and shared types.

## Project overview

NFeWizard is a Node.js library focused on Brazilian fiscal automation, with an emphasis on integration with SEFAZ webservices. The ecosystem is modular and separates responsibilities across packages dedicated to fiscal operations, shared utilities, DANFE generation, and TypeScript types.

Primary reference:
- [Official documentation](https://nfewizard-org.github.io/)

## Architecture and expected behavior

- Preserve the modular model of the project: do not mix responsibilities between packages.
- Treat the library as a real fiscal solution, with attention to compatibility, XML validation, and environment configuration.
- Prefer solutions that are clear, readable, and compatible with Node.js/TypeScript usage.
- Consider that fiscal flows may involve A1 certificates, XSD schemas, SEFAZ webservices, and PDF document generation.
- When schema validation is involved, respect the possibility of using the JS-based validator as a fallback when the JDK is not available.

## Packages and responsibilities

### Shared package (@nfewizard/shared)

This package contains shared utilities for the ecosystem, including XML, HTTP, certificates, schemas, and helper functions.

References:
- [Shared package](https://github.com/nfewizard-org/nfewizard-io/tree/master/packages/shared)
- [Shared package README](https://github.com/nfewizard-org/nfewizard-io/blob/master/packages/shared/README.md)

Guidelines:
- Keep generic and reusable utilities here.
- Avoid coupling this shared layer to NFe/NFCe-specific rules when the dependency is better kept local.
- Consider schema validation and SOAP envelope construction as core concerns of this package.

### Main NFe package (nfewizard-io)

This is the main package for NFe operations, including authorization, DFe distribution, protocol queries, inutilization, service status, events, and integration with SEFAZ.

References:
- [nfewizard-io package](https://github.com/nfewizard-org/nfewizard-io/tree/master/packages/nfewizard-io)
- [nfewizard-io README](https://github.com/nfewizard-org/nfewizard-io/blob/master/packages/nfewizard-io/README.md)

Guidelines:
- Treat this package as the layer for NFe fiscal operations.
- Preserve compatibility with the public API and the traditional issuance and query flow.
- When behavior changes, document the impact and keep consistency with the official examples.

### NFCe package (@nfewizard/nfce)

This package is specialized in NFCe operations, including authorization and cancellation, with a focus on electronic issuance for end consumers.

References:
- [nfce package](https://github.com/nfewizard-org/nfewizard-io/tree/master/packages/nfce)
- [nfce README](https://github.com/nfewizard-org/nfewizard-io/blob/master/packages/nfce/README.md)

Guidelines:
- Keep the NFCe flow separate from the main NFe flow when the logic differs.
- Consider structured logging, A1 certificates, and environment-specific configuration for NFCe.
- When suggesting or implementing changes, respect the fiscal context and the usage examples provided in the documentation.

### DANFE package (@nfewizard/danfe)

This package is responsible for generating DANFEs as PDF documents for NFe, NFCe, and in some cases NFSe.

References:
- [danfe package](https://github.com/nfewizard-org/nfewizard-io/tree/master/packages/danfe)
- [danfe README](https://github.com/nfewizard-org/nfewizard-io/blob/master/packages/danfe/README.md)

Guidelines:
- Treat PDF generation as an isolated and specialized responsibility.
- When working with DANFE, prefer structures that keep the input/output flow clear and compatible with usage examples.
- Consider that the format may vary between NFe, NFCe, and NFSe.

### Types package (@nfewizard/types)

This package provides shared TypeScript types for the ecosystem, including types for NFe, NFCe, CTe, and common structures.

References:
- [types package](https://github.com/nfewizard-org/nfewizard-io/tree/master/packages/types)
- [types README](https://github.com/nfewizard-org/nfewizard-io/blob/master/packages/types/README.md)

Guidelines:
- Use explicit types whenever possible.
- Prefer typed imports and avoid relying on any when the type can be modeled.
- Maintain consistency with the public types of the ecosystem.

## Implementation guidelines

- Write code in TypeScript, preferring safe types and explicit interfaces.
- When working with XML, keep schema validation and the possibility of automatic envelopes in mind.
- Respect fiscal environment configuration, including values such as UF, certificate, CPF/CNPJ, environment, and connection timeout.
- If the change involves SEFAZ integration, consider logging, error handling, and operational context.
- For environments without a JDK, prefer a JavaScript-based fallback configuration when appropriate.
- Keep examples and documentation consistent with the library’s official patterns.

## Operational notes

- A1 certificates are the expected scenario for the library.
- The project has been tested primarily on Node.js 16+ environments.
- The official documentation and package repositories should be treated as the primary reference for behavior and architecture.
