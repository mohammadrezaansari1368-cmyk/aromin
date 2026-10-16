# SmartX workflow map

Only sequences supported by recorded evidence are described as confirmed. Discovering a control does not confirm its resulting operation.

| Workflow | Observed sequence | Discovery status | Evidence | Unchecked behavior / next observation |
|---|---|---|---|---|
| Sign-in surface | Request dashboard unauthenticated → desk root → choose phone or username tab | CONFIRMED | `ev_3a2f67f3c01cbdf9c021ced7d7c80c6345ae845923e219582692b3f90afeefd5`, `ev_bc74584638bea89133196c68ee3195d1baea58ffc0ca86319fdb879d8c79ad9d` | OTP delivery, accepted credentials, role assignment and error states; do not trigger OTP |
| Dashboard navigation | Open authenticated dashboard → inspect brand/branch selectors, club/insight links and chart | CONFIRMED | `ev_ef82f8ec620d8256e7cbb70f9cc379531e9bd54511eeb7a611a4f557395b6ead` | Selector changes, destination pages, chart definition and time/unit semantics |
| Customer list search | Enter draft query → Enter leaves results unchanged → press adjacent search control → results update → clear and apply restores list | CONFIRMED | `ev_dd09579b20fd42862b800cddab9c3faff10b53a65ffeb782d9ee25a88e0c21c2` | Exact normalization, fields searched and backend matching predicate |
| Customer list filters | Select visible radio labels → list refreshes → restore original selections | CONFIRMED | `ev_4e4de7b7c95a44ebfcb54e6de7b80d2f63bed5d72cc5f8be5a742b2f2a4972c6`, `ev_a060e0fc22059a1ba53e64246e8c2b2e178869a19e3ff2054fead44f4c4d9854` | Predicate meaning for middle/default states, cross-filter semantics and authorization |
| Customer list paging | Choose page size 10/20/50/100; choose page 2 | CONFIRMED | `ev_936befa7acd2e8291fe330954162b36f886eb05e0201e6b85e958fbed06c5a43`, `ev_9a1c01702520b5b5718b921da986ef5ead67f5b6fb53f0db9692a78552346c44` | Sorting, first/last boundary behavior and exact result-count semantics |
| Customer row menu | Open “more” menu → inspect labels → Escape closes it | CONFIRMED | `ev_73dad14ba7c1576590512bb16598b3e3244ced23d61e6edef7aaa007c354bd63` | Each action's destination and whether it is read-only or writes data |
| New customer | Menu label is present; opening the unsaved form has no reliable retained evidence | BLOCKED | Menu in `ev_cff5113dc1dfdca6f531c8758d2132a4933f9181eeb7ecdd5d511627178f3b8d`; current connection error in evidence.md | Reconnect CDP; manually leave the unsaved form open if REA cannot reach the current session |
| Group management | Group link/menu destination is inventoried | UNKNOWN | `ev_cff5113dc1dfdca6f531c8758d2132a4933f9181eeb7ecdd5d511627178f3b8d` | List/detail/form structure, membership semantics, validation, permissions |
| Customer credit and purchase history | Finance/credit-related labels are present in list/menu inventory | UNKNOWN | `ev_cff5113dc1dfdca6f531c8758d2132a4933f9181eeb7ecdd5d511627178f3b8d` | Read-only details, units, definitions, history schema, permissions; no write action |
| Filters/search/page combination | Each control has observations; combinations were implemented/tested in XSI, but exact SmartX combined predicates were not independently established | INFERRED | Search `ev_dd09579b20fd42862b800cddab9c3faff10b53a65ffeb782d9ee25a88e0c21c2`; filters `ev_4e4de7b7c95a44ebfcb54e6de7b80d2f63bed5d72cc5f8be5a742b2f2a4972c6`; page size/page `ev_936befa7acd2e8291fe330954162b36f886eb05e0201e6b85e958fbed06c5a43`, `ev_9a1c01702520b5b5718b921da986ef5ead67f5b6fb53f0db9692a78552346c44` | Observe safe combinations after reconnect; do not use live customer values in notes |

## Safety boundary

CONFIRMED: Search, visible filters, page size, pagination, opening menus and unsaved forms are within the requested read-only scope. Form submission, credit edits, import/export, settings changes, messages, payments and destructive row actions are not part of discovery. Stop before a control that could perform one of those operations.

UNKNOWN: No authenticated role matrix has been established. Visible labels or menu entries do not prove that a role can complete an operation.
