# Performance UI v2 — INVENTORY (discovery)

## Entry points
- `frontend/src/components/performance/PerformancePage.tsx` → default export now renders `features/performance/v2/PerformancePageV2.tsx` unless `VITE_PERF_UI=v1` (then the PR #9 workspace + N21, unchanged).
- v1 review/settings/classic views (`ExistingPerformance`, `PerfSettingsCard`) are passed in as render props and reused unchanged.

## Real API types (`deployment/server.py` `performance_read`, `deployment/aromin_performance.py`)
| endpoint | params | response (actual) |
|---|---|---|
| `/api/performance/directory` | tenant | `{people:[{id,name,role,unit,inactive,employmentKnown}], role, scope:'organization'|'unit'|'self', updatedAt}` |
| `/api/performance/source` | tenant | `{full:{people:[{id,name,role,inactive,perf:{dailyTasks,dayStatus,dayType}}]}}` (feeds local attendance via `usePerformance`) |
| `/api/performance/summary` | tenant, person, unit, start, end | `{people:[{…person, metrics:[Metric], tasks:number|null, issues}], groups:[{unit,people,metrics}], issues:[{personId,reason}], notes, updatedAt, period}` |
| `/api/performance/daily` | tenant, **person (required)**, start, end, metric ∈ tasks / contracts / finance_documents | `{days:[{date,value,status}], metric, unit, issues, updatedAt}` — **no `presentMin`** |
| `/api/performance/details` | + metric, offset, limit≤200 | `{rows:[{id,date,personId,metric,value,unit,source,note,fiscalYear?}], total, offset, limit}` |

Metric: `{id,label,unit,definition,value,numerator,denominator,status:'valid'|'partial'|'no_data',target:null,period,updatedAt,coverage:{records,issues},source[],detailsMetric}`.
Axes per unit: sales = activity, efficiency, conversion, contract_average · support = activity, efficiency, resolution, quality · finance = finance_documents, efficiency, accuracy, effectiveness.

### Differences from the prompt's table (§3)
- Status names: `no_data`→`not_computable`, `not_applicable`→`irrelevant` (adapter); `error` never sent today.
- `target` is always `null` → gauges show «بدون هدف», no red zone.
- `/daily` has no `presentMin`; attendance minutes come only from the attendance file in this browser (`usePerformance`).
- No endpoint for effective-effort hours, rewards/points, last-import time, holidays/leave per day. → reserve gauge parked, reward ticket never rendered, health bar shows data `updatedAt`, heatmap streaks «—».
- No all-units aggregate in `summary` (only `groups` per unit) → «همهٔ واحدها» shows no cabin gauge, only the leaderboard.
- `contract_average` is the only sales metric with data; `activity/efficiency/conversion` are `no_data` in the engine today.

## Gauges already in the app
`components/dashboard/gauges/AnalogGauge.tsx`, `components/analytics/StarlightCluster.tsx` (3D/canvas, dashboard-specific). v2 `PerfGauge` is a new lightweight SVG (transform-only motion, `role=meter`) with the same look language; no new library.

## Metric → import file (`data/clusterConfig.ts` `IMPORT_SOURCE`)
activity ← تماس و ویزیت جولیو · efficiency ← تماس + اشخاص · conversion ← معاملات (تاریخچهٔ مراحل) · contract_average/contracts ← معاملات جولیو · finance_documents ← دفتر فروش (تأیید مالی) · tasks ← وظایف جولیو · presence ← فایل حضور · effort ← حضور + وظایف · resolution/quality ← تیکت‌ها · accuracy/effectiveness ← اسناد مالی.

## ui-ux-pro-max (style summary applied)
Dark luxury instrument cluster: near-black graded panel, brushed-metal ring on the primary dial, single brand-pink accent with soft glow, thin needles, tabular numerals, ≤2-word labels; motion limited to transform/opacity with `prefers-reduced-motion` fallbacks; RTL layout, 44px touch targets in the phone dock; contrast checked on dark panel (light ink #f3eef6 on #0c0a0f).
Not available here: the `iframer` skill → isolated states are covered by the Playwright run (`tests/browser/perf-v2.cjs`) at 1440/390 × light/dark instead of a dev lab route.
