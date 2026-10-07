# Spec under inspection (host-authored, Claude) — base a113756 → 9599ffe

## A. Publishing fixes (commit 3d510b2)
Unapproved scheduled-publishing drafts expire to MISSED 48h after their slot; rotation cooldown reads tg_posts with TELEGRAM_TENANT; channel visual logo must not overlap the product photo.

## B. Excel import: fiscal year / sale date / time (user-confirmed contract)
- Real Joolio export: one sheet, one header row, no merged cells. Column «تغییر مرحله» holds text "HH:MM:SS YYYY/MM/DD" (e.g. "16:32:51 1405/06/31"). Stable deal id = column «معامله».
- Fiscal year, full Jalali sale date and time all come from that one cell: fy = year of the valid date, accepted only if the fiscal year exists in the model (full.years / full.fy). A «سال مالی» column, «ورود», file name and system time are never sources and never override. No guessing, no fallback, no auto-creation of fiscal years.
- Persian/Arabic/Latin digits; real Jalali validation (month lengths, leap Esfand 30); invalid/empty never replaced by now. Raw value preserved (stageChangedAt). Non-text cells are not guessed.
- Column detection by normalized header (ی/ي, ک/ك, spaces, ZWNJ), not by position; missing or duplicated → clear error. Errors include source, sheet, row, column, raw value, reason.
- Preview, final import, ledger display and reports use the same shared logic (frontend/src/lib/stage-change.ts; Python twin deployment/aromin_stage.py, both tested against deployment/tests/fixtures/stage_change_vectors.json). Preview == commit.
- Historical fix without re-upload (deployment/fix_stage_dates.py; source extractor tools/extract_stage_source.py): stable identity only (stored raw, else deal number + funnel state + customer-name hash); ambiguous/missing source reported, never overwritten; idempotent; dry-run default; --apply with backup, FOR UPDATE transaction, before/after audit table; --rollback that never overwrites later user edits. Only saleDate, saleTime, month (derived), stageChangedAt (if empty) may change. Locked docs (submitted/approved/closed) never change: only their empty date/time is filled in the saleDates/saleTimes maps. finState/finApproval/finAudit/finBy/stages/weights/mgrShare/funnel/amount untouched. Fiscal-year mismatches reported, not moved.

## C. Ledger UI and finance approval
- Stage roles with 7 weights (5/10/20/15/35/10/5), manager share, finance approval + accountant controls moved from grid rows into a collapsible section at the bottom of the document panel, closed by default, keyboard accessible, RTL; closing must not reset values or drop fields from the payload; existing per-record values preserved.
- Finance approval editing restored (checkbox + person select; example name must not be hardcoded). finBy settable only via authenticated POST /api/c1/finance-by: finance or manager roles; once set only manager may change/clear; person must be an active finance/accmgr person; locked doc → 409; acting user recorded separately from selected person. /api/state rejects any finBy change (added to server fields on both sides).

## D. Packaging/startup
install/rollback/package include new files; _startup LIKE query parameterized (latent crash when Telegram unconfigured).

## Proof
frontend: `npx vitest run` (118), `npx tsc -b`; backend: `python -m unittest discover -s deployment/tests` (63; 1 pre-existing Windows-only failure, MariaDB tests in tests/integration run separately: 5 + 14 + browser 14).
