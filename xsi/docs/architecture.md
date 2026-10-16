# XSI architecture

CONFIRMED: XSI is a dependency-free static frontend with isolated state modules. It does not integrate with SmartX APIs, copy authentication storage or submit live records.

| Component | Status | Responsibility |
|---|---|---|
| index.html / src/app.mjs | CONFIRMED | Independent RTL dashboard; local club/customer-list navigation to branch.html; unknown destinations show an explanatory dialog |
| branch.html / src/branch.mjs | CONFIRMED | Customer-list controls, semantic headers, synthetic rows, accessible radio groups and expandable action disclosures |
| src/branch-state.mjs | CONFIRMED | Explicit draft/apply search, combined local filter state, page-size selection, page slicing and bounds |
| src/synthetic-data.mjs | CONFIRMED | 125 deterministic generated fixtures marked synthetic; names explicitly artificial; TEST-PHONE identifiers are not valid phone numbers |
| src/branch-model.mjs | CONFIRMED | Observed labels and selections; unverified record operations disabled |
| src/login-state.mjs | CONFIRMED | Observed login tab metadata only; no credential processing |
| serve.mjs | CONFIRMED | Loopback-only allowlisted static server on port 8081; browser profiles, environment files and docs are not served |
| tests | CONFIRMED | Node state tests plus reproducible REA browser scenario and evidence verifier |

INFERRED: Synthetic matching predicates, search fields, page-reset rules, independent layout and semantic table markup are implementation choices. They do not establish the reference's backend contracts.

UNKNOWN: SmartX backend architecture, permissions, validation, mutation rules, exact query matching and authentication lifecycle. These integrations remain unimplemented.

CONFIRMED: UI mutations only affect in-memory synthetic view state. There are no application fetch calls, record-write handlers, persisted customer rows or local credentials.

CONFIRMED: Delivery uses the existing GitHub branch tree as its base and changes paths under xsi/ only, preserving the remote .gitkeep and all unrelated repository content. The user-requested persistent D:\\xsi deliverables and five documentation files take precedence over the destination AGENTS.md defaults concerning temporary clones and minimal documentation. No permanent clone of the destination is created.

BLOCKED: Shell Git networking still fails through the process proxy. The independently authorized GitHub connector verifies identity and repository access and supplies Git tree/commit/ref operations without changing shell/global network settings.
