# Discovery coverage and queue

The queue is deduplicated from the existing REA evidence. Process status is separate from evidence status. `queued`, `inspected`, and `blocked` describe queue progress; discovery status is one of CONFIRMED, INFERRED, UNKNOWN, BLOCKED.

## Current coverage

CONFIRMED: 3 / 9 concrete observed URL patterns have page-level evidence: login, dashboard and branch customer list. 6 / 9 are blocked from page inspection by the unavailable CDP endpoint. This count covers this account's previously observed destinations only. Menu candidates without an observed href are tracked separately, so they do not inflate the denominator.

| Priority | Module/page | Evidence IDs and tool | Discovery status | Progress | Next permitted observation |
|---|---|---|---|---|---|
| P0 | Login | `ev_3a2f67f3c01cbdf9c021ced7d7c80c6345ae845923e219582692b3f90afeefd5`, `ev_bc74584638bea89133196c68ee3195d1baea58ffc0ca86319fdb879d8c79ad9d`; REA `capture_browser_scenario` | CONFIRMED | inspected | Observe only if auth surface remains reachable; never request or trigger OTP |
| P0 | Desk dashboard | `ev_ef82f8ec620d8256e7cbb70f9cc379531e9bd54511eeb7a611a4f557395b6ead`; REA `inspect_web_page` | CONFIRMED | inspected | Reconcile actual menu and links after reconnect |
| P0 | Branch customer list and controls | `ev_cff5113dc1dfdca6f531c8758d2132a4933f9181eeb7ecdd5d511627178f3b8d`, `ev_dd09579b20fd42862b800cddab9c3faff10b53a65ffeb782d9ee25a88e0c21c2`, `ev_4e4de7b7c95a44ebfcb54e6de7b80d2f63bed5d72cc5f8be5a742b2f2a4972c6`, `ev_936befa7acd2e8291fe330954162b36f886eb05e0201e6b85e958fbed06c5a43`, `ev_9a1c01702520b5b5718b921da986ef5ead67f5b6fb53f0db9692a78552346c44`, `ev_73dad14ba7c1576590512bb16598b3e3244ced23d61e6edef7aaa007c354bd63`; REA `inspect_web_page` and `capture_browser_scenario` | CONFIRMED | inspected | Continue with unsaved customer form and remaining safe row details |
| P1 | Groups | `ev_cff5113dc1dfdca6f531c8758d2132a4933f9181eeb7ecdd5d511627178f3b8d`; observed link template | BLOCKED | blocked | Read list/details; stop before membership writes |
| P1 | Advanced grouping | `ev_cff5113dc1dfdca6f531c8758d2132a4933f9181eeb7ecdd5d511627178f3b8d`; observed link template | BLOCKED | blocked | Inspect controls/forms without submit |
| P1 | Condition profile settings | `ev_cff5113dc1dfdca6f531c8758d2132a4933f9181eeb7ecdd5d511627178f3b8d`; observed link template | BLOCKED | blocked | Inspect tabs/forms without saving |
| P1 | Conditions | `ev_cff5113dc1dfdca6f531c8758d2132a4933f9181eeb7ecdd5d511627178f3b8d`; observed link template | BLOCKED | blocked | Inspect read-only |
| P1 | Branch finance | `ev_cff5113dc1dfdca6f531c8758d2132a4933f9181eeb7ecdd5d511627178f3b8d`; observed link template | BLOCKED | blocked | Inspect metrics/history only; do not pay/change credit |
| P2 | Host dashboard | `ev_cff5113dc1dfdca6f531c8758d2132a4933f9181eeb7ecdd5d511627178f3b8d`; observed link template | BLOCKED | blocked | Inspect only if it remains in this account's observed menu |
| P1 | Settings menu candidate (href unresolved) | `ev_ef82f8ec620d8256e7cbb70f9cc379531e9bd54511eeb7a611a4f557395b6ead`, `ev_cff5113dc1dfdca6f531c8758d2132a4933f9181eeb7ecdd5d511627178f3b8d` | UNKNOWN | queued | Capture actual href/open state without changing a setting |
| P1 | New-customer menu candidate (href unresolved) | `ev_cff5113dc1dfdca6f531c8758d2132a4933f9181eeb7ecdd5d511627178f3b8d`; menu label | BLOCKED | blocked | Open unsaved form, inspect then close without saving |
| P2 | Assistant menu candidate (href unresolved) | `ev_ef82f8ec620d8256e7cbb70f9cc379531e9bd54511eeb7a611a4f557395b6ead`, `ev_cff5113dc1dfdca6f531c8758d2132a4933f9181eeb7ecdd5d511627178f3b8d` | UNKNOWN | queued | Determine destination only; do not send/schedule messages |
| P2 | Smart insight/product links (href unresolved) | `ev_ef82f8ec620d8256e7cbb70f9cc379531e9bd54511eeb7a611a4f557395b6ead`; REA `inspect_web_page` | UNKNOWN | queued | Capture visible href, deduplicate, inspect if allowed |
| P2 | Brand/agency sections | `ev_ef82f8ec620d8256e7cbb70f9cc379531e9bd54511eeb7a611a4f557395b6ead`, `ev_cff5113dc1dfdca6f531c8758d2132a4933f9181eeb7ecdd5d511627178f3b8d` | UNKNOWN | queued | Expand/read labels and hrefs; do not infer permissions |

## Blocker record

BLOCKED: REA `list_browser_targets` against `http://127.0.0.1:9222` returned `provider_unavailable` with details reason `endpoint_unreachable`. A single local shell diagnostic found no TCP listener on port 9222; `/json/version` returned `WebException: Unable to connect to the remote server`. Chrome processes were present. This does not establish whether the authenticated SmartX tab is still open or logged in. No blind retry, setup, policy change, external bind or secret extraction was performed.

BLOCKED: To resume, start/restore the existing Chrome session with DevTools bound only to `127.0.0.1:9222`, open the already-authenticated SmartX tab locally, then reply `ready`. Do not send credentials or cookies. After that action, relist once and continue from the queue's first uninspected destination.

UNKNOWN: Historical REA Evidence IDs and operation names are preserved in `evidence.md`; their exact capture clock times were not retained in earlier notes. The current failed call time is 2026-10-16 17:15 UTC and it has no Evidence ID because REA returned an operation error.

BLOCKED: At 17:29 UTC, the user-provided local Chrome launch emitted Crashpad and Mojo `Access is denied. (0x5)` errors and self-terminated. The subsequent port check still found no 9222 listener. No authenticated state or page is available to inspect; do not retry the same launch blindly.

## XSI gaps by priority

| Priority | Gap | XSI state |
|---|---|---|
| P0 | Inspect unsaved customer form, validation affordances and safe details | BLOCKED by CDP |
| P1 | Groups, assignment and advanced grouping | UNKNOWN and unimplemented |
| P1 | Credit definitions, read-only balance/history and permissions | UNKNOWN and deliberately unimplemented |
| P1 | Purchase-history fields, units and route | UNKNOWN and unimplemented |
| P2 | Dashboard metrics, selectors, conditions, finance and host/agency views | UNKNOWN and unimplemented |
| P2 | SmartX role enforcement and exact visual/layout parity | UNKNOWN |

No implementation expansion is justified until the accessible reference pages and forms have been inspected.
