# Performance UI v2 — HANDOFF (Claude Code, 2026-10-10)

Codex's own v2 commits never reached GitHub (they stayed in its cloud workspace), so v2 was rebuilt from the prompt on top of `main` 3.9.53. Frontend only; `git diff` on `deployment/` = 0.

## Files
- `frontend/src/features/performance/v2/` — `PerformancePageV2.tsx`, `perf-v2.css`
  - `data/` types · adapters (raw → ViewModel; status mapping; never 0 for not-computable) · hooks (AbortController + cache; Excel export with the same 200-row `/details` paging and columns as v1) · clusterConfig (unit → gauges, metric → import file)
  - `lib/` gaugeMath · statusVisual
  - `cluster/` PerfGauge (chrono / reserve / mini, `role=meter`) · InstrumentCluster (+ hexagonal TFT)
  - `ui/` primitives (BentoCard, TactileButton, ScrambleText, CountUp, ScrollFadeList, DynamicButton, RewardTicket, AromLoader) · PersonPicker (listbox + 10-segment LED card)
  - `sections/` CommandBar (+ DriveModeSelector, phone dock) · TrendChart · TeamLeaderboard · YearHeatmap · DataHealthBar · MetricDrawer (+ CalcReceipt)
  - `__tests__/v2.test.ts`
- `frontend/src/components/performance/PerformancePage.tsx` — v2 by default; `VITE_PERF_UI=v1` renders the previous workspace (+ N21) unchanged.
- `frontend/tests/browser/perf-v2.cjs` (new); `performance-workspace.cjs` now honours `TEST_URL` (run it against a `VITE_PERF_UI=v1` server).

## Metric → component → endpoint → import source
| metric | component | endpoint | import |
|---|---|---|---|
| unit main (sales/support: activity · finance: finance_documents) | chrono gauge | summary | تماس/ویزیت · دفتر فروش |
| efficiency, conversion / resolution / accuracy | mini gauges | summary | تماس+اشخاص · معاملات · تیکت · اسناد |
| presence (minutes ÷ 450 per worked day) | mini gauge | local attendance (`usePerformance`) | فایل حضور |
| effort (3.9.55) | EffortPanel: 0–9 h dial, 6 h target, zones <4/4–6/6–7.5/>7.5, rings calls/tasks/sales, figures, peak strip | source → `full.people[].perf`, `perfSet`, `perfCfg`, `callHours` (scoped projection) | لاگ تماس + وظایف جولیو (importers unchanged) |
| contracts count / average | TFT | summary `contract_average` | معاملات |
| workdays | TFT | local attendance | فایل حضور |
| daily trend / year map | TrendChart, YearHeatmap | daily (tasks, contracts, finance_documents) | وظایف · معاملات · دفتر فروش |
| issues, updatedAt | DataHealthBar | summary | — |
| records + receipt + Excel | MetricDrawer | details | — |

## Differences from the prompt / risks
- No `target`, effort hours, rewards, last-import time, per-day holiday/leave, all-units aggregate, or `presentMin` in `/daily` → shown as «بدون هدف», parked gauge, hidden ticket, data `updatedAt`, «—» streaks, no cabin gauge for «همهٔ واحدها» (see INVENTORY).
- Presence rate is computed from this browser's attendance file only (same limitation as v1).
- One commit instead of ten step commits (steps were done in one session).
- `iframer` not available; states verified with Playwright instead. Lighthouse not run.
- N21 sample skyline is removed from v2 (prompt rule 2); it remains in v1.

## Verification
vitest 156 (+11 v2) · tsc · lint (old `widget.js` warnings only) · build · browser: perf-v2 (cabin, keyboard picker, gauge→trend, receipt, heatmap, health, modes, 1440/390 × light/dark, no overflow, no «۰» for not-computable) + 5 ledger tests on v2 server; performance-workspace + skyline on a v1 server.
Screenshots: `docs/perf-ui-v2/screenshots/v2-{purple,blue}-{light,dark}-{1440,390}.png`.
Visible text (manager default view, synthetic fixture): v1 2,317 → v2 320 characters (−86%).

## Rollback to v1
Build with `VITE_PERF_UI=v1` (e.g. `VITE_PERF_UI=v1 npm run build`), or revert this commit.

## 3.9.55 — ui/cabin-effort-tracker
- Theme: every cabin colour is a theme token (`perf-v2.css`, PerfGauge ring stops via `var(--pv-ring-*)`); canvas palette read with getComputedStyle and recomputed by a MutationObserver on `data-theme`/`data-mode`/`class`/`style`.
- Effort: `lib/effort.ts` = 1:1 port of legacy `effortOf` — perDay = (talkIn+talkOut, else talkMin + Σmin(taskMin, taskCapMin=30)) ÷ 60 ÷ activeDays; zones as legacy. `cluster/EffortPanel.tsx` (cabin + person view). Server: `/api/performance/source` projects only `perf` effort fields, `perfSet` targets, `perfCfg` (taskCapMin/taskTarget/callTarget), `callstats.hours`, under the existing employee scope.
- Yearly map: `components/ui/contribution-skyline.tsx` restored from 0046a99 (N21, 3.9.52) with a minimal patch (Jalali month labels, Saturday week start, `startDate`, `labels`); wrapped by `ui/CalendarMap2D3D.tsx` (tokens, Persian, real data).
- Task tracker: `sections/TaskTracker.tsx` — year → quarter → month drill, values count / % of target (monthly target ÷ working days, Fridays + attendance holidays excluded); hours disabled (task minutes are undated in the engine).
- Limits: perf aggregates are undated (effort ignores the period filter); no sales-count target (sales ring «—»); legacy classic effortCard not replaced (vanilla page).
