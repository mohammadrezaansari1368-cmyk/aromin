# XSI evidence ledger

- CONFIRMED: Actual write access verified by creating this file on 2026-10-16.
- CONFIRMED: Reference: https://desk.smartx.ir/dashboard
- CONFIRMED: Application claims below are limited to captured observations.

## Live observations

CONFIRMED: Initial discovery covered unauthenticated login states. Later authenticated observations are recorded below, each with its own scope.

- CONFIRMED: binary_session returned server name rea, package/server version 6.5.0, MCP protocol 2025-06-18, open=false.
- E1 CONFIRMED: REA capture_browser_scenario evidence `ev_3a2f67f3c01cbdf9c021ced7d7c80c6345ae845923e219582692b3f90afeefd5`. Launched Edge, navigated /dashboard and waited 3000ms. Final URL https://desk.smartx.ir/. Persian RTL DOM title Smart Desk; mobile/username tabs; default telephone input maxlength=15, autocomplete=tel; remember-me checkbox; receive-code button. DOM SHA256 39231c4feff43212c2c05d8e04709a3e497ae3b4c6a7f6ee29074a7f0c4b90b6. No submissions.
- E2 CONFIRMED: REA evidence `ev_bc74584638bea89133196c68ee3195d1baea58ffc0ca86319fdb879d8c79ad9d`. Clicked username tab using CSS locator. Accessibility exposed username/password inputs and login button. URL remained /. Accessibility SHA256 3c7315f2156e26dfcb14046431a3373c3805278186c965b956d34647fcbf7acd.
- CONFIRMED: Both scenarios reported complete requested captures and terminated their owned browser processes. Credentials, storage values, network headers and bodies were not captured. Static DOM observation does not establish authentication outcomes or permission enforcement.
- BLOCKED: list_browser_targets at http://127.0.0.1:9222 returned code provider_unavailable, reason endpoint_unreachable: "list_browser_targets could not reach the selected loopback debugging endpoint. Verify that the target process is running with debugging enabled and that the endpoint's port matches it, then retry."
- BLOCKED: Persistent browser launch via shell rejected: `approval required by policy, but AskForApproval::Granular.sandbox_approval is false`. No persistent sign-in browser established.
- BLOCKED: gh auth status: `The term 'gh' is not recognized as the name of a cmdlet, function, script file, or operable program.`
- BLOCKED: git ls-remote destination: `fatal: unable to access 'https://github.com/mohammadrezaansari1368-cmyk/aromin.git/': Failed to connect to github.com:443 over proxy 127.0.0.1 after 2042 ms: Could not connect to server`. No authenticated repository access proven; no push.
- BLOCKED: Historical test attempt: `node --test tests/login-state.test.mjs` failed before running assertions with `spawn EPERM`; retry uses --test-isolation=none to avoid subprocess creation.
- CONFIRMED: `node --test --test-isolation=none tests/login-state.test.mjs` passed 2 tests, 0 failures. These verify the state module only, not a rendered UI or end-to-end authentication.

## Authenticated discovery continuation

- CONFIRMED: User-supplied http://127.0.0.1:9222 now connects. Target listing evidence `ev_5f35951aeb7ed9315a6b70091abe1386b945218eb7c565f26e35dbc2dd67d345` selected the single Smart Desk page at https://desk.smartx.ir/dashboard, Chrome 155.0.8059.80. Previous endpoint blocker is resolved.
- E3 CONFIRMED: Passive inspect_web_page evidence `ev_ef82f8ec620d8256e7cbb70f9cc379531e9bd54511eeb7a611a4f557395b6ead`. Authenticated dashboard exposes brand/branch comboboxes, general links, two product panels (customer club and smart insight), branch dashboard buttons, club quick links, subscription chart with seven-day label, public product links and product promotion section. Product-specific brand-manager labels appear in access menu; this does not prove permission enforcement. No live records were modified.
- CONFIRMED: E3 limitations: policy_filtered and attach_limited, no dropped events or truncated sections reported. Accessibility may expose hidden elements. Capture requested no script sources, console text, storage keys/fingerprints, JSON or WebSocket body shapes. Only generic interface findings are transcribed to disk; account values, customer details and raw captures are not exported.
- E4 BLOCKED: capture_browser_scenario connect mode targeting the listed page returned code target_unavailable, reason target_not_allowed, message `Analysis could not complete. Run rea doctor, then try again.` No successful action was reported; no deeper route inferred. Target listing afterward still showed /dashboard. Recovery guide read; setup/configuration was not changed. Requested user to navigate to club branch dashboard locally for passive continuation.
- CONFIRMED: Historical local verification: 4 unit tests passed with --test-isolation=none; node --check src/app.mjs passed. Initial browser smoke used a nonunique button selector and failed strict locator matching; corrected selector selected first-of-type. REA local-only evidence `ev_07c74c2209bbac5d367cff318836ef8507aa863613c7768cd1b1bdf0147a348d`: all steps completed, dialog present after open and absent after close, zero page-error events, capture complete. This verifies local UI mechanics, not SmartX workflow parity.

## Branch page passive observation — E5

CONFIRMED: After user navigation, origin-filtered discovery still listed the original desk tab. Unfiltered CDP target discovery evidence `ev_878ad49137bd94a1cf209e62fd0c82b1b126b486c98a6def8b95038ba5665835` revealed a separate club.smartx.ir tab. No agent navigation was attempted on either reference tab during this continuation.

CONFIRMED: Passive inspect_web_page evidence `ev_cff5113dc1dfdca6f531c8758d2132a4933f9181eeb7ecdd5d511627178f3b8d` inspected that selected tab, scoped to https://club.smartx.ir. Route template: /BranchPanel/CustomerActivities/Index/:branchId. Actual IDs, title account values and query parameters are omitted from deliverables.

CONFIRMED: Customer-management title; new-customer and Excel-import links; search textbox; page-size buttons 10/20/50/100; five radio groups; total and filtered count labels; Excel-export button and filter/search applicability help text; seven list headers; numbered/first/last pagination; collapsed more-actions buttons and customer-operation link labels. Product-map.md records only generic labels and checked states. No link, filter, export or record action was invoked.

CONFIRMED: Seven displayed header labels are name, mobile, credit, last purchase, total purchase amount, group and operations. The reference accessibility tree uses generic layout roles rather than table/columnheader roles; local semantic table markup is an independent accessibility choice.

CONFIRMED: Capture reported policy filtering and attach-window limitations, with no dropped events or truncated sections. Hidden menu content can appear in accessibility; label presence does not prove simultaneous visibility or permissions. Raw capture, customer names, mobile numbers, amounts, counts, and customer-specific URLs were not written to local files. Storage keys/fingerprints, script sources, console text, body shapes and screenshots were not requested. Only sanitized interface findings are transcribed.

UNKNOWN: Query and filter execution, reset behavior, sorting, page-size selection state, empty/loading/error states, action forms, mutations, export contents and permission enforcement. These remain unimplemented.

BLOCKED: The prior REA target_not_allowed navigation rejection remains in force; no retry, setup, doctor, policy edit or security restriction change was made.

## Local branch verification

CONFIRMED: Six Node unit tests passed using `node --test --test-isolation=none tests/*.test.mjs`; `node --check src/branch.mjs` passed. Tests cover observed metadata, no fabricated rows/counts, and explicitly unavailable actions/filter execution.

CONFIRMED: Desktop 1280x800 browser evidence `ev_12a8fb1ae8ec671f4c442898b683c1e8a3e00c3380c73738c20a0703b57e5c33`; mobile 390x844 evidence `ev_6c82ad47d559cc8e1f3b286a2e045860ec113c4866cc08c9eafc502ebe033237`. Programmatic assertions passed for dashboard-to-branch navigation, all steps completed, seven semantic column headers, five checked disabled radios, disabled search/export/delete, no fabricated data rows, local GET requests only, no page errors/downloads, and no dropped events. These are functional/accessibility checks, not visual parity or clipping measurements.

CONFIRMED: Return-navigation evidence `ev_d6f67f100e3a78272507269ec62297e6ea3a03223ffdc92060be7c805272c33a` verified branch-to-dashboard return, unknown insight workflow opens an explanatory dialog, closing dismisses it, and only local reads occur with no page errors/downloads. Earlier first-product dialog smoke is historical; the club button now opens the local branch view.

## Read-only interaction continuation

CONFIRMED: This continuation supersedes earlier unimplemented/blocked descriptions for read-only branch controls. Reference record actions remain UNKNOWN and disabled locally. Rejected desk navigation was not retried.

CONFIRMED: Target listing ev_4e413b99aa6ebd44969cb735b747e742b5d7cf70eb76fbda6c6d60fdf5c25a47 and minimal passive inspection ev_f443e7ae6294f59fa88a18d9c47d9d3c7a0ff1a41d8721d8a1d3d28136cdac33 selected the branch tab. Branch-origin scenarios succeeded and disconnected without closing the user-owned browser.

CONFIRMED: Filling search alone (ev_50946276a2f73be21412876e00691e3545d733388f7d86bed18de2e285dfd328; passive follow-up ev_8bda72311e02a78cc3fb67b6ec6c3ad9447db217ddf35c0e985c1bb3cae1efc4) left rows present. Scenario ev_73dad14ba7c1576590512bb16598b3e3244ced23d61e6edef7aaa007c354bd63 confirmed size 10, more-menu open/Escape close, and Enter did not apply the deliberately nonmatching synthetic query.

CONFIRMED: Control-only DOM extraction ev_02b9e6cac0f4db7ffbe8505ae07b69b333aefbd3d69c25cc21a00f617e062808 identified searchString/searchStringbtn and filter labels. No raw reference DOM was saved. Search-control scenario ev_dd09579b20fd42862b800cddab9c3faff10b53a65ffeb782d9ee25a88e0c21c2 applied XSI_READONLY_NONMATCH_20261016, observed no row menus, then cleared/applied and restored rows. Exact matching fields are UNKNOWN.

CONFIRMED: Pagination ev_9a1c01702520b5b5718b921da986ef5ead67f5b6fb53f0db9692a78552346c44 marked page 2 active and changed the view. Size scenario ev_936befa7acd2e8291fe330954162b36f886eb05e0201e6b85e958fbed06c5a43 confirmed 10/50/100/20 visible row-menu counts after settling. Immediate captures sometimes contained previous results; exact timing/debounce is UNKNOWN.

BLOCKED: Direct radio check ev_f2992b39359d107dcaeec329da1e2cb687eb910a577c8d6670127a14f66ff022 timed out with "Analysis operation timed out after 5000ms: capture_browser_scenario". One action failed and subsequent actions were cancelled. No force or restriction change was used.

CONFIRMED: Visible-label scenarios ev_4e4de7b7c95a44ebfcb54e6de7b80d2f63bed5d72cc5f8be5a742b2f2a4972c6 and ev_a060e0fc22059a1ba53e64246e8c2b2e178869a19e3ff2054fead44f4c4d9854 successfully exercised every filter option and restored starting selections. Selection states changed and lists refreshed; no record operation was invoked. No manual navigation is currently needed.

CONFIRMED: List network metadata included GetListIndex with parameter names branchId, searchString, pageNumber, sortOrder, pageSize, masterClubGroupId, manualGroup, blockedSms, trusted, registeredTypeId and showDeleted. Initial count loading used TotalCountIndex/FilteredCountIndex POSTs; method alone does not establish mutation. Only list controls and disclosure were invoked, not record-changing actions. Query values/bodies/credentials/customer results were not exported.

INFERRED: Local synthetic predicates, name/ID/test-phone matching, page reset/clamping and styling are independent choices, not exact server query or permission parity.

## Current local tests

CONFIRMED: Fixture source generates 125 artificial names and TEST-PHONE identifiers, visibly labeled synthetic. No reference customer rows, phones, account balances or raw captures are written to local deliverables. Local raw browser captures contain synthetic fixtures only and are ignored.

CONFIRMED: All Node suites rerun: 16 passed, 0 failed, 0 skipped. Desktop ev_14552d98d5904f9213ce55832fb9d6e642a8dcf0126f466ba98a1011352a1856 and mobile ev_eb6b17599b984d744625da252f192eaef939e45b936a57d0bd2f9e79469fdefe each completed 28 steps and passed 34/34 programmatic assertions: draft/apply/Enter, empty/reset, composite filters, sizes, pages/bounds, menu/Escape, disabled export/deletion, local GETs only and no downloads/page errors.

CONFIRMED: Regression ev_0b6b9753b2f4af93c0058f3303f02b3e7e2d686f5e197a7c6b70e8db70cd3958 passed 8/8 assertions: return to dashboard, unknown insight dialog, close, quick customer-list navigation, synthetic data and local reads only without errors/downloads. Current browser total: 76 passed, 0 failed. Earlier tests are historical; their outdated disabled-filter expectations were replaced by current interactive requirements.

CONFIRMED: Allowlisted server 8081 denied both profiles, .env and docs/evidence.md with 404 and served branch.html with 200: 5 checks passed, 0 failed. Visual parity/clipping measurements remain UNKNOWN.

## GitHub preparation

CONFIRMED: Both local profile directories match .gitignore. Isolated Git ignore check returned both patterns; its index contains no tracked profile paths. No profile contents were read. Upload allowlist excludes profiles, .delivery, raw captures and environment files.

BLOCKED: Shell Git error: "Failed to connect to github.com:443 over proxy 127.0.0.1 after 2070 ms: Could not connect to server". Process HTTP_PROXY/HTTPS_PROXY/ALL_PROXY point at http://127.0.0.1:9 without userinfo; TCP port 9 refuses connection. Inspected Git config has credential manager but no proxy. Global settings/security restrictions were unchanged; no proxy bypass attempted.

CONFIRMED: Authorized GitHub connector authenticated mohammadrezaansari1368-cmyk; aromin reports push/pull true. Agreed branch head 493e1a58cb8cf4e93dd766388f9da6013c126237, base tree afdddefc25c9abd886c45f0685afbfe3abc2edfa. Complete xsi/ tree inventory contains only .gitkeep. Root AGENTS.md was read; no nested instructions exist under xsi/. Delivery adds allowlisted xsi/ files using that base, preserves existing entries and uses a leased non-force update of the agreed branch only. Final receipt records publication verification.


