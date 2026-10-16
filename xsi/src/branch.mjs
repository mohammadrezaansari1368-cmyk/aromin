import { branchColumns, pageSizes, branchFilters, unavailableActions, branchMenu } from './branch-model.mjs';
import { initialBranchState, transition, selectBranchView } from './branch-state.mjs';
import { syntheticCustomers } from './synthetic-data.mjs';
let state = initialBranchState();
let openMenu = null;
function disabledButton(text) {
  const button = document.createElement('button'); button.textContent = text;
  button.disabled = true; button.title = 'پیاده‌سازی نشده؛ رفتار تأیید نشده است'; return button;
}
function closeMenu() {
  if (!openMenu) return;
  openMenu.content.hidden = true; openMenu.button.setAttribute('aria-expanded', 'false'); openMenu = null;
}
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && openMenu) { const button = openMenu.button; closeMenu(); button.focus(); }
});
document.addEventListener('click', event => { if (openMenu && !openMenu.wrapper.contains(event.target)) closeMenu(); });
function dispatch(event) { closeMenu(); state = transition(state, event); renderResults(); }
document.querySelector('#branch-menu').replaceChildren(...branchMenu.map(text => {
  if (text !== 'لیست مشتریان') return disabledButton(text);
  const current = document.createElement('span'); current.textContent = text;
  current.setAttribute('aria-current', 'page'); return current;
}));
document.querySelector('#primary-actions').replaceChildren(...unavailableActions.slice(0, 3).map(disabledButton));
document.querySelector('#row-actions').replaceChildren(...unavailableActions.slice(3).map(disabledButton));
document.querySelector('#search').addEventListener('input', event => { state = transition(state, { type: 'draft', value: event.target.value }); });
document.querySelector('#apply-search').onclick = () => dispatch({ type: 'search' });
document.querySelector('#page-sizes').append(...pageSizes.map(size => {
  const button = document.createElement('button'); button.textContent = String(size); button.dataset.size = String(size);
  button.onclick = () => dispatch({ type: 'size', value: size }); return button;
}));
document.querySelector('#branch-filters').replaceChildren(...branchFilters.map(filter => {
  const group = document.createElement('fieldset');
  const legend = document.createElement('legend'); legend.textContent = filter.label; group.append(legend);
  filter.options.forEach((text, index) => {
    const label = document.createElement('label');
    const input = document.createElement('input'); input.type = 'radio'; input.name = filter.id;
    input.checked = index === filter.selected; input.value = String(index);
    input.onchange = () => dispatch({ type: 'filter', id: filter.id, value: index });
    label.append(input, document.createTextNode(text)); group.append(label);
  });
  return group;
}));
document.querySelector('#customer-columns').replaceChildren(...branchColumns.map(text => {
  const th = document.createElement('th'); th.scope = 'col'; th.textContent = text; return th;
}));
function rowMenu(row) {
  const wrapper = document.createElement('div'); wrapper.className = 'row-menu';
  const button = document.createElement('button'); button.textContent = 'سایر'; button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', `menu-${row.id}`);
  const content = document.createElement('div'); content.id = `menu-${row.id}`; content.hidden = true; content.className = 'menu-content';
  content.append(...unavailableActions.slice(3).map(disabledButton));
  button.onclick = () => {
    const wasOpen = openMenu?.button === button; closeMenu();
    if (!wasOpen) { content.hidden = false; button.setAttribute('aria-expanded', 'true'); openMenu = { wrapper, button, content }; }
  };
  wrapper.append(button, content); return wrapper;
}
function renderResults() {
  const view = selectBranchView(syntheticCustomers, state);
  state = { ...state, page: view.page };
  document.querySelector('#total-count').textContent = `تعداد کل (مصنوعی): ${view.total}`;
  document.querySelector('#filtered-count').textContent = `تعداد فیلتر شده ها (مصنوعی): ${view.filtered}`;
  document.querySelectorAll('[data-size]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.size) === state.pageSize)));
  const rows = view.rows.map(row => {
    const tr = document.createElement('tr'); tr.dataset.syntheticId = row.id;
    for (const value of [row.name, row.mobile, row.credit.toLocaleString('fa-IR'), row.lastPurchase, row.totalPurchase.toLocaleString('fa-IR'), row.group]) {
      const td = document.createElement('td'); td.textContent = value; tr.append(td);
    }
    const actions = document.createElement('td'); actions.append(rowMenu(row)); tr.append(actions); return tr;
  });
  if (!rows.length) {
    const tr = document.createElement('tr'); const cell = document.createElement('td'); cell.colSpan = 7;
    cell.textContent = 'هیچ ردیفی در داده‌های مصنوعی مطابق نیست.'; tr.append(cell); rows.push(tr);
  }
  document.querySelector('#customer-rows').replaceChildren(...rows);
  const pages = [...new Set([1, view.page - 1, view.page, view.page + 1, view.pages])].filter(page => page >= 1 && page <= view.pages).sort((a, b) => a - b);
  const makePage = (label, page, boundary = false) => {
    const button = document.createElement('button'); button.textContent = label;
    if (!boundary && page === view.page) button.setAttribute('aria-current', 'page');
    button.disabled = boundary && page === view.page;
    button.onclick = () => dispatch({ type: 'page', value: page }); return button;
  };
  const buttons = [makePage('صفحه اول', 1, true)];
  pages.forEach((page, index) => {
    if (index && page - pages[index - 1] > 1) buttons.push(document.createTextNode('…'));
    buttons.push(makePage(String(page), page));
  });
  buttons.push(makePage('صفحه آخر', view.pages, true));
  document.querySelector('#pagination').replaceChildren(...buttons);
}
renderResults();
