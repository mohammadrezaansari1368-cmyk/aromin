# XSI product map

CONFIRMED: Reference origins are https://desk.smartx.ir and https://club.smartx.ir. Discovery date: 2026-10-16. Evidence IDs are in evidence.md.

| Area | Status | Observed behavior |
|---|---|---|
| Login | CONFIRMED | Unauthenticated /dashboard resolves to /; Persian RTL; mobile and username tabs; remember-me; code-request or username/password login controls |
| Authenticated dashboard | CONFIRMED | Brand/branch selectors; general links; customer-club and smart-insight panels; club quick links; subscription chart and product links |
| Branch list route | CONFIRMED | Separate tab on club.smartx.ir at /BranchPanel/CustomerActivities/Index/:branchId; identifiers omitted |
| List structure | CONFIRMED | Customer management; name, mobile, credit, last purchase, total purchase amount, group and operations headers; total/filtered count labels |
| Search | CONFIRMED | Filling and Enter did not apply the test query. Clicking adjacent search control applied a nonmatch and showed no rows; clear plus apply restored rows |
| Page sizes | CONFIRMED | 10/20/50/100 buttons produced corresponding visible row-menu counts after settling |
| Pagination | CONFIRMED | Selecting page 2 changed the view and marked page 2 active |
| Filters | CONFIRMED | Visible labels change radio selections and refresh results; reverting selections restores the prior view |
| More menu | CONFIRMED | Opens, exposes action labels, closes with Escape |
| Reference record operations | UNKNOWN | No reference create/import/export/credit/edit/delete submission; financial/history/group actions remain disabled locally |
| Local basic create | INFERRED | Independent XSI name/mobile form works end-to-end with API validation and persistence; not claimed as the reference form |
| Permissions | UNKNOWN | Product-specific brand-manager labels observed; role visibility/enforcement not established |
| Historical desk navigation | BLOCKED | target_unavailable / target_not_allowed; never retried |

## Filter state and local matching

## Customer-management coverage matrix — current vertical slice

| Reference page/workflow | Evidence ID | Discovery | Local implementation | Tests | Blocker / dependency |
|---|---|---|---|---|---|
| Customer list | ev_cff5113dc1dfdca6f531c8758d2132a4933f9181eeb7ecdd5d511627178f3b8d | CONFIRMED | CONFIRMED: authenticated API-backed local list | API owner scope + browser | Exact reference authorization UNKNOWN |
| Search apply/clear | ev_dd09579b20fd42862b800cddab9c3faff10b53a65ffeb782d9ee25a88e0c21c2 | CONFIRMED | CONFIRMED: API search; INFERRED: local matching fields | API combinations + browser | Exact matching UNKNOWN |
| Filters | ev_4e4de7b7c95a44ebfcb54e6de7b80d2f63bed5d72cc5f8be5a742b2f2a4972c6 | CONFIRMED | CONFIRMED: combined API filters; INFERRED: predicates | API + browser desktop/mobile | Reference predicates UNKNOWN |
| Page size/page 2 | ev_936befa7acd2e8291fe330954162b36f886eb05e0201e6b85e958fbed06c5a43; ev_9a1c01702520b5b5718b921da986ef5ead67f5b6fb53f0db9692a78552346c44 | CONFIRMED | CONFIRMED: server-side pagination | Unit/API/browser | Reset/bounds are INFERRED local rules |
| New customer form | No usable form evidence returned this turn | BLOCKED | CONFIRMED: independent minimal XSI name/mobile form; reference parity UNKNOWN | API create/422/409 + browser ev_39278a802cf22259bcd9c228fbd82295837aa5b7eaaaec0f7cd769c49a99bc54 | Await requested manual open; no reference submission |
| Validation | Reference rules not established | UNKNOWN | CONFIRMED: API field validation; INFERRED: XSI policy | Invalid input, extra fields, duplicate, digit normalization | Reference validation UNKNOWN |
| Groups | Label/link inventory in E5 | UNKNOWN | UNKNOWN: assignment/management disabled | Disabled-state checks | Group rules/forms unobserved |
| Credit | Row menu labels in E5 | UNKNOWN | UNKNOWN: writes disabled; no credit calculation | Unimplemented-route + disabled-state checks | Financial rules unobserved |
| Purchase history | Label inventory in E5 | UNKNOWN | UNKNOWN: disabled | Disabled-state checks | History schema unobserved |
| Local authentication/authorization | Independent XSI policy, not reference evidence | INFERRED | CONFIRMED: hashed login, session, CSRF, owner scoping | Anonymous/cross-owner/logout/restart tests | No SmartX role parity claim |
| Persistence | Local test evidence ev_39278a802cf22259bcd9c228fbd82295837aa5b7eaaaec0f7cd769c49a99bc54; ev_0907d61ad99ef553163e59225342660ab08fdf9eda4c1a6a74cd05d9a248112f | CONFIRMED | CONFIRMED: SQLite + separate demo DB | Server reopen and actual process restart/browser | Not a production deployment claim |
| Local error/loading/mobile form | ev_8818d67e409ed9885710ee2fafcc792d20c9341bed39342092faaf518d02880c | CONFIRMED | CONFIRMED: 500/retry, pending load and validation feedback | 9 browser assertions; screenshots reviewed | Reference wording/layout UNKNOWN |

CONFIRMED: SMS opt-out has yes / middle SMS opt-out label / no; trust has trusted / all / manager-blocked; fixed group has yes / middle fixed-group label / no; registration has all / SMS; activity has active / deleted. Every option was selected through its visible label and restored to the original selections.

CONFIRMED: Starting selections were the middle SMS, trust and fixed-group options, all registration sources and active customers. They are snapshot values, not universal defaults.

INFERRED: For local synthetic fixtures only, middle SMS/fixed options mean unrestricted; other options match synthetic Boolean/category fields. Search matches generated name, fixture ID or test phone. Exact SmartX matching fields, normalization, sorting and backend predicate semantics remain UNKNOWN.

INFERRED: Local changes reset page to one, page bounds are clamped and first/last boundaries are disabled. These usability rules are independent choices where exact reference semantics were not exercised.

## Menus and route inventory

CONFIRMED: Branch menu labels include settings, groups, advanced grouping, club condition profiles/conditions, new customers, customer list, finance and assistant. Brand and agency sections are also present in the accessibility tree; hidden content may be included.

CONFIRMED: Same-origin link templates include /BranchPanel/CustomerActivities/AdvancedGrouping, /BranchPanel/ConditionSetting/Index/:id, /BranchPanel/Conditions/Index/:id, /BranchPanel/Groups, /BrandPanel/Finance/BranchList/:id and /HostPanel/Dashboard/Index/:id. These were inventoried, not visited. Query values and customer identifiers are omitted.

UNKNOWN: Sorting, first/last reference edge cases, loading/error presentation, data validation, authentication outcomes, exports and mutations. No customer values or business totals are recorded here.
