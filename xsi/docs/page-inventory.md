# SmartX page inventory

Scope is limited to pages and destination templates directly observed in the existing REA evidence ledger. It does not claim full product coverage. `Progress` tracks whether a destination is inspected, queued, or blocked; `Discovery status` uses the evidence status vocabulary.

| Module | Page | Observed URL pattern | Discovery status | Evidence | Unchecked states | Blocker | Progress |
|---|---|---|---|---|---|---|---|
| Authentication | Login | `https://desk.smartx.ir/` (dashboard request resolved here while unauthenticated) | CONFIRMED | `ev_3a2f67f3c01cbdf9c021ced7d7c80c6345ae845923e219582692b3f90afeefd5`; `ev_bc74584638bea89133196c68ee3195d1baea58ffc0ca86319fdb879d8c79ad9d` | Login outcomes, OTP delivery, errors | Live behavior beyond visible controls not exercised | inspected |
| Dashboard | Desk dashboard | `https://desk.smartx.ir/dashboard` (authenticated dashboard evidence; an earlier separate navigation was rejected) | CONFIRMED | `ev_ef82f8ec620d8256e7cbb70f9cc379531e9bd54511eeb7a611a4f557395b6ead`; rejected navigation `target_not_allowed` in evidence.md | All dashboard links, chart definitions, selector outcomes | Current CDP endpoint unavailable | inspected |
| Branch customers | Customer activities/list | `https://club.smartx.ir/BranchPanel/CustomerActivities/Index/:branchId` | CONFIRMED | `ev_cff5113dc1dfdca6f531c8758d2132a4933f9181eeb7ecdd5d511627178f3b8d`; search `ev_dd09579b20fd42862b800cddab9c3faff10b53a65ffeb782d9ee25a88e0c21c2`; size `ev_936befa7acd2e8291fe330954162b36f886eb05e0201e6b85e958fbed06c5a43`; page `ev_9a1c01702520b5b5718b921da986ef5ead67f5b6fb53f0db9692a78552346c44`; menu `ev_73dad14ba7c1576590512bb16598b3e3244ced23d61e6edef7aaa007c354bd63` | Exact predicates, sort, record actions and remaining menus | Current CDP endpoint unavailable | inspected |
| Branch customers | Advanced grouping | `https://club.smartx.ir/BranchPanel/CustomerActivities/AdvancedGrouping` | BLOCKED | Link template observed in `ev_cff5113dc1dfdca6f531c8758d2132a4933f9181eeb7ecdd5d511627178f3b8d` | Page content, forms, validation, transitions | CDP `endpoint_unreachable` | blocked |
| Club conditions | Condition profile settings | `https://club.smartx.ir/BranchPanel/ConditionSetting/Index/:id` | BLOCKED | Link template observed in `ev_cff5113dc1dfdca6f531c8758d2132a4933f9181eeb7ecdd5d511627178f3b8d` | Page content, tabs, forms, save behavior | CDP `endpoint_unreachable` | blocked |
| Club conditions | Conditions | `https://club.smartx.ir/BranchPanel/Conditions/Index/:id` | BLOCKED | Link template observed in `ev_cff5113dc1dfdca6f531c8758d2132a4933f9181eeb7ecdd5d511627178f3b8d` | Page content, filters, forms, transitions | CDP `endpoint_unreachable` | blocked |
| Groups | Branch groups | `https://club.smartx.ir/BranchPanel/Groups` | BLOCKED | Link template observed in `ev_cff5113dc1dfdca6f531c8758d2132a4933f9181eeb7ecdd5d511627178f3b8d` | List, search, details, assignment and management | CDP `endpoint_unreachable` | blocked |
| Finance | Branch finance | `https://club.smartx.ir/BrandPanel/Finance/BranchList/:id` | BLOCKED | Link template observed in `ev_cff5113dc1dfdca6f531c8758d2132a4933f9181eeb7ecdd5d511627178f3b8d` | Metrics, date ranges, tables, permissions and actions | CDP `endpoint_unreachable` | blocked |
| Host/agency | Host dashboard | `https://club.smartx.ir/HostPanel/Dashboard/Index/:id` | BLOCKED | Link template observed in `ev_cff5113dc1dfdca6f531c8758d2132a4933f9181eeb7ecdd5d511627178f3b8d` | Page content and accessible scope | CDP `endpoint_unreachable` | blocked |

## Destinations with no observed URL

CONFIRMED: Existing menu/accessibility evidence contains labels for settings, new customers, assistant, brand and agency sections, and dashboard product links. Their exact hrefs or whether they open a page, dialog, or another tab were not retained reliably. They are recorded as unresolved candidates in `discovery-coverage.md`; no route is guessed and they are not included in the 3/9 concrete-pattern count.

## Deduplication and coverage

CONFIRMED: The current deduplicated inventory has 9 concrete page patterns: 3 inspected and 6 blocked pending CDP reconnection. This is an account/session snapshot, not a claim that every SmartX product page is included. The menu must be reconciled again after the authenticated tab is reachable.

BLOCKED: On 2026-10-16, REA returned `provider_unavailable`, reason `endpoint_unreachable`, for `http://127.0.0.1:9222`. A local shell probe also found no listener on 9222 and failed to connect to `/json/version`; Chrome processes existed. No page inspection followed that failed discovery call.
