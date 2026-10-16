# XSI unknowns and blockers

| ID | Status | Missing evidence / dependency |
|---|---|---|
| U1 | CONFIRMED | Existing list/search/filter/page/menu evidence reused; completed discovery was not rerun |
| U2 | BLOCKED | Reference customer form has no reliable new evidence; manual action requested: open «مشتری جدید», leave unsaved, reply ready |
| U3 | UNKNOWN | SmartX field validation, duplicates, additional profile fields and edit/create submission results; no reference submission performed |
| U4 | UNKNOWN | Groups, eligibility, assignment and group-management forms; local assignment disabled |
| U5 | UNKNOWN | Credit calculations, permission to alter credit, received/used credit and purchase-history schema; local financial writes/history remain disabled |
| U6 | UNKNOWN | Exact reference role enforcement, matching predicates, sort/reset behavior, loading/error copy and visual parity |
| U7 | INFERRED | XSI minimum field validation, ownership policy, credential/session policy and category matching are explicit local design choices |
| U8 | BLOCKED | Shell browser launch: browserType.launch: spawn EPERM. No escalation, security edit or restriction bypass attempted |
| U9 | BLOCKED | Existing Chrome CDP websocket check: browserType.connectOverCDP: Timeout 5000ms exceeded; websocket connected but handshake did not complete |
| U10 | CONFIRMED | REA 6.5.0 remains connected; its permitted owned-browser launch works for local tests, independently of the stalled reference tab |
| U11 | BLOCKED | Existing shell Git proxy blocker remains; global settings unchanged |
| U12 | CONFIRMED | Authorized GitHub connector verifies identity, repository push access and agreed branch |
| U13 | CONFIRMED | One test rerun aborted with native OOM; after completed test server shutdown, full bounded-heap rerun passed 30/30. Resource capacity under sustained load remains UNKNOWN |

CONFIRMED: The first new-form scenario result was not retained because the orchestration tried to store an undefined evidence_id ("Unable to store newCustomerEvidenceId. Only plain serializable objects can be stored."). Its outcome cannot be claimed. The follow-up passive inspection remained pending and was cancelled after extended waiting; no specific REA server error was received. The separate CDP timeout above is an observed client diagnostic, not an invented server message.

CONFIRMED: One precise manual request is pending. No rejected desk navigation was retried, no setup rerun, no SmartX form submitted, no live credit/customer record changed, and no profile/security/global proxy setting was modified.

UNKNOWN: Full reference workflow reconstruction remains incomplete. The next priority is read-only inspection of the new-customer form after the requested manual action, then its group/credit/purchase read views, before expanding local workflows.

## Reconnection audit — 2026-10-16 17:15 UTC

| ID | Status | Missing evidence / dependency |
|---|---|---|
| U14 | BLOCKED | REA list_browser_targets returned `provider_unavailable`, details.reason `endpoint_unreachable`; local port 9222 had no listener |
| U15 | UNKNOWN | Chrome processes existed, but current authenticated target and login state cannot be determined while CDP is unavailable |
| U16 | CONFIRMED | Current discovered queue: 3 inspected / 9 concrete route patterns; six linked pages blocked; menu candidates without href are separate |
| U17 | BLOCKED | User-provided Chrome launch on loopback CDP port 9222 self-terminated: Crashpad and Mojo returned `Access is denied. (0x5)`; port remains unbound |

BLOCKED: One manual step is required: restore the existing Chrome session with debugging bound only to `127.0.0.1:9222`, open the locally authenticated SmartX tab, and reply `ready`. Do not send credentials or cookies. After reconnection, relist once and continue from the first uninspected destination.
