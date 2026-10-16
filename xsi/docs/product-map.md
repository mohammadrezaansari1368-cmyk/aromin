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
| Record operations | UNKNOWN | Create/import/export, received/used credit, purchases, sent messages, add credit, edit and delete effects not exercised; local actions disabled |
| Permissions | UNKNOWN | Product-specific brand-manager labels observed; role visibility/enforcement not established |
| Historical desk navigation | BLOCKED | target_unavailable / target_not_allowed; never retried |

## Filter state and local matching

CONFIRMED: SMS opt-out has yes / middle SMS opt-out label / no; trust has trusted / all / manager-blocked; fixed group has yes / middle fixed-group label / no; registration has all / SMS; activity has active / deleted. Every option was selected through its visible label and restored to the original selections.

CONFIRMED: Starting selections were the middle SMS, trust and fixed-group options, all registration sources and active customers. They are snapshot values, not universal defaults.

INFERRED: For local synthetic fixtures only, middle SMS/fixed options mean unrestricted; other options match synthetic Boolean/category fields. Search matches generated name, fixture ID or test phone. Exact SmartX matching fields, normalization, sorting and backend predicate semantics remain UNKNOWN.

INFERRED: Local changes reset page to one, page bounds are clamped and first/last boundaries are disabled. These usability rules are independent choices where exact reference semantics were not exercised.

## Menus and route inventory

CONFIRMED: Branch menu labels include settings, groups, advanced grouping, club condition profiles/conditions, new customers, customer list, finance and assistant. Brand and agency sections are also present in the accessibility tree; hidden content may be included.

CONFIRMED: Same-origin link templates include /BranchPanel/CustomerActivities/AdvancedGrouping, /BranchPanel/ConditionSetting/Index/:id, /BranchPanel/Conditions/Index/:id, /BranchPanel/Groups, /BrandPanel/Finance/BranchList/:id and /HostPanel/Dashboard/Index/:id. These were inventoried, not visited. Query values and customer identifiers are omitted.

UNKNOWN: Sorting, first/last reference edge cases, loading/error presentation, data validation, authentication outcomes, exports and mutations. No customer values or business totals are recorded here.
