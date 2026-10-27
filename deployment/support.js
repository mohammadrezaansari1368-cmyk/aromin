/* Capability stays in memory; no storage, analytics, HTML interpolation or URL queries. */
(() => {
  'use strict';
  const token = location.hash.slice(1);
  history.replaceState(null, '', location.pathname);
  const byId = id => document.getElementById(id);
  const messages = byId('messages'), error = byId('error'), composer = byId('composer');
  const input = byId('message'), send = byId('send'), submit = byId('submit');
  let sessionId = '', step = 0, busy = false, statusTimer;
  const poll = async () => {
    const active = sessionId;
    try {
      const j = await call('status', { sessionId: active });
      if (active !== sessionId) return;
      byId('result').textContent = j.resultNote || '';
      if (j.status === 'done' || j.status === 'failed') { byId('restart').hidden = false; return; }
      statusTimer = setTimeout(poll, 10000);
    } catch (_) { if (active === sessionId) statusTimer = setTimeout(poll, 30000); }
  };
  byId('restart').addEventListener('click', async () => {
    clearTimeout(statusTimer); lock(true); error.textContent = '';
    try { const j = await call('session', {}); messages.replaceChildren(); byId('confirmation').hidden = true; byId('restart').hidden = true; advance(j); }
    catch (e) { error.textContent = e.message; } finally { lock(false); }
  });
  const bubble = (text, role) => {
    const el = document.createElement('p'); el.className = 'bubble ' + role; el.textContent = text;
    messages.appendChild(el); el.scrollIntoView({ block: 'nearest' });
  };
  const lock = value => { busy = value; input.disabled = value; send.disabled = value; submit.disabled = value; };
  const call = async (action, body) => {
    const r = await fetch('/api/support/' + action, { method: 'POST', credentials: 'omit', cache: 'no-store', headers: { 'Content-Type': 'application/json', 'X-Support-Link': token }, body: JSON.stringify(body) });
    const j = await r.json(); if (!r.ok || !j.ok) throw new Error(j.error || 'ارتباط برقرار نشد.'); return j;
  };
  const advance = j => {
    sessionId = j.sessionId; step = j.step; input.maxLength = j.maxLength || 2000;
    bubble(j.question, 'assistant');
    byId('progress').textContent = 'مرحله ' + Math.min(j.step + 1, j.totalSteps || 7).toLocaleString('fa-IR') + ' از ' + (j.totalSteps || 7).toLocaleString('fa-IR');
    composer.hidden = j.complete; submit.hidden = !j.complete;
  };
  composer.addEventListener('submit', async event => {
    event.preventDefault(); if (busy || !input.value.trim()) return;
    const text = input.value.trim(); lock(true); error.textContent = '';
    try {
      const isQuestion = byId('question').checked;
      const j = await call(isQuestion ? 'question' : 'message', { sessionId, message: text, ...(isQuestion ? {} : { expectedStep: step }) });
      bubble(text, 'customer'); input.value = '';
      if (isQuestion) bubble(j.answer, 'assistant'); else advance(j);
    } catch (e) { error.textContent = e.message; } finally { lock(false); if (!composer.hidden) input.focus(); }
  });
  submit.addEventListener('click', async () => {
    if (busy) return; lock(true); error.textContent = '';
    try {
      const j = await call('submit', { sessionId });
      byId('reference').textContent = j.reference; byId('confirmation').hidden = false;
      submit.hidden = true; byId('progress').textContent = 'در صف پشتیبانی'; statusTimer = setTimeout(poll, 10000);
      byId('confirmation').scrollIntoView({ block: 'nearest' });
    } catch (e) { error.textContent = e.message; } finally { lock(false); }
  });
  lock(true);
  if (!token) { error.textContent = 'لینک معتبر پشتیبانی را از کسب‌وکار دریافت کنید.'; composer.hidden = true; return; }
  call('session', {}).then(advance).catch(e => { error.textContent = e.message; composer.hidden = true; }).finally(() => lock(false));
})();
