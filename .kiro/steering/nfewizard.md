---
inclusion: fileMatch
fileMatchPattern: "**/*.{ts,tsx,js}"
---

# NFeWizard Ecosystem

Node.js library for Brazilian fiscal automation with SEFAZ webservice integration. Keep the modular architecture intact — do not mix responsibilities across packages.

## Architecture Rules

- Preserve the modular package model; each package owns a single concern.
- Treat the library as a real fiscal solution — respect XML validation, A1 certificates, XSD schemas, SOAP envelopes, and environment configuration.
- Prefer clear, readable solutions compatible with Node.js/TypeScript.
- Use the JS-based schema validator as a fallback when the JDK is unavailable.

## Package Responsibilities

| Package | Scope | Key Constraints |
|---------|-------|-----------------|
| `@nfewizard/shared` | XML, HTTP, certificates, schemas, helpers | Keep generic and reusable; avoid coupling to NFe/NFCe-specific rules |
| `nfewizard-io` | NFe operations (authorization, DFe distribution, protocol queries, inutilization, status, events) | Preserve public API compatibility; document impact of behavior changes |
| `@nfewizard/nfce` | NFCe operations (authorization, cancellation) | Keep NFCe flow separate from NFe when logic differs; respect structured logging and environment config |
| `@nfewizard/danfe` | DANFE PDF generation (NFe, NFCe, NFSe) | Treat PDF generation as isolated; keep input/output flow clear |
| `@nfewizard/types` | Shared TypeScript types (NFe, NFCe, CTe, common structures) | Use explicit types; prefer typed imports; avoid `any` |

## Implementation Guidelines

- Write code in TypeScript with safe types and explicit interfaces.
- Keep schema validation and automatic SOAP envelope construction in `@nfewizard/shared`.
- Respect fiscal environment configuration: UF, certificate, CPF/CNPJ, environment, connection timeout.
- Include logging, error handling, and operational context for SEFAZ integrations.
- For environments without a JDK, prefer a JavaScript-based fallback configuration.

## Operational Notes

- A1 certificates are the expected scenario.
- Target Node.js 16+ environments.
- Official documentation and package repositories are the primary behavior reference.

## References

- [Official documentation](https://nfewizard-org.github.io/)
- [Shared package](https://github.com/nfewizard-org/nfewizard-io/tree/master/packages/shared)
- [nfewizard-io package](https://github.com/nfewizard-org/nfewizard-io/tree/master/packages/nfewizard-io)
- [nfce package](https://github.com/nfewizard-org/nfewizard-io/tree/master/packages/nfce)
- [danfe package](https://github.com/nfewizard-org/nfewizard-io/tree/master/packages/danfe)
- [types package](https://github.com/nfewizard-org/nfewizard-io/tree/master/packages/types)
