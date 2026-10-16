import { branchFilters, pageSizes } from './branch-model.mjs';
export function initialBranchState() {
  return { draft: '', query: '', page: 1, pageSize: 20, filters: Object.fromEntries(branchFilters.map(f => [f.id, f.selected])) };
}
export function transition(state, event) {
  switch (event.type) {
    case 'draft': return { ...state, draft: String(event.value) };
    case 'search': return { ...state, query: state.draft.trim(), page: 1 };
    case 'size':
      if (!pageSizes.includes(event.value)) throw new RangeError('Unsupported page size');
      return { ...state, pageSize: event.value, page: 1 };
    case 'page':
      if (!Number.isInteger(event.value) || event.value < 1) throw new RangeError('Invalid page');
      return { ...state, page: event.value };
    case 'filter': {
      const filter = branchFilters.find(f => f.id === event.id);
      if (!filter || !Number.isInteger(event.value) || event.value < 0 || event.value >= filter.options.length) throw new RangeError('Invalid filter');
      return { ...state, filters: { ...state.filters, [event.id]: event.value }, page: 1 };
    }
    default: throw new RangeError('Unimplemented action');
  }
}
// Independent synthetic matching rules; exact SmartX matching is UNKNOWN.
export function selectBranchView(records, state) {
  if (records.some(row => row.synthetic !== true)) throw new Error('Synthetic fixtures only');
  const f = state.filters;
  const matches = records.filter(row => (!state.query || `${row.name} ${row.mobile} ${row.id}`.includes(state.query))
    && (f.sms === 1 || row.smsBlocked === (f.sms === 0))
    && (f.trust === 1 || row.trust === (f.trust === 0 ? 'trusted' : 'blocked'))
    && (f.fixed === 1 || row.fixed === (f.fixed === 0))
    && (f.source === 0 || row.source === 'sms') && row.deleted === (f.active === 1));
  const pages = Math.max(1, Math.ceil(matches.length / state.pageSize));
  const page = Math.min(state.page, pages);
  return { total: records.length, filtered: matches.length, pages, page, rows: matches.slice((page - 1) * state.pageSize, page * state.pageSize) };
}
