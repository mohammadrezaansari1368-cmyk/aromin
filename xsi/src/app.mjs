import { products, generalLinks, resolvePanel } from './dashboard-model.mjs';
const dialog = document.querySelector('#details');
function showUnknown(title, actions = []) {
  document.querySelector('#detail-title').textContent = title;
  const container = document.querySelector('#detail-actions');
  container.replaceChildren(...actions.map(label => {
    const item = document.createElement('p'); item.textContent = label; return item;
  }));
  dialog.showModal();
}
document.querySelector('#general').replaceChildren(...generalLinks.map(label => {
  const button = document.createElement('button'); button.textContent = label;
  button.onclick = () => showUnknown(label); return button;
}));
document.querySelector('#products').replaceChildren(...products.map(product => {
  const card = document.createElement('section');
  const heading = document.createElement('h2'); heading.textContent = product.title;
  const license = document.createElement('p'); license.textContent = 'وضعیت لایسنس: نامشخص';
  const button = document.createElement('button'); button.textContent = 'داشبورد شعبه';
  button.onclick = () => {
    if (product.id === 'club') { window.location.href = './branch.html'; return; }
    const panel = resolvePanel(product.id); showUnknown(panel.title, panel.actions);
  };
  card.append(heading, license, button);
  if (product.actions.length) {
    const title = document.createElement('h3'); title.textContent = 'دسترسی سریع'; card.append(title);
    for (const label of product.actions) {
      const link = document.createElement('button'); link.textContent = label;
      link.onclick = () => { if (label === 'ليست مشتريان شعبه') window.location.href = './branch.html'; else showUnknown(label); };
      card.append(link);
    }
  }
  return card;
}));
document.querySelector('#close').onclick = () => dialog.close();
document.querySelector('#notifications').onclick = () => showUnknown('اعلان‌ها');
document.querySelectorAll('.unknown').forEach(button => { button.onclick = () => showUnknown(button.textContent); });
