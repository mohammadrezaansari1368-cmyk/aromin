/* AROMIN's own character and interface. No Coucou/Mochi artwork or sounds. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const root = $('avatar-button'), input = $('message-input'), log = $('chat-log');
  const state = { csrf: null, conversation: null, task: null, busy: false, pending: null, cursor: 0,
    poll: null, seen: new Set(), mood: 'idle' };
  const errors = {
    agent_not_configured: 'اتصال به ایجنت هنوز تنظیم نشده است. این رابط پاسخ ساختگی تولید نمی‌کند.',
    local_session_required: 'نشست اتصال معتبر نیست. صفحه را دوباره باز کن.',
    agent_unreachable: 'سرویس آرومین در دسترس نیست. اتصال را بررسی کن.',
    agent_outcome_unconfirmed: 'پاسخ در مهلت اتصال دریافت نشد. نتیجه نامشخص است؛ تلاش دوبارهٔ همین پیام با همان شناسه انجام می‌شود.',
    agent_auth_failed: 'سرویس، دسترسی این رابط را تأیید نکرد. تنظیم اتصال نیاز به بررسی دارد.',
    agent_permission_denied: 'دسترسی لازم برای این درخواست وجود ندارد.',
    agent_task_conflict: 'این گفتگو یک کار فعال دارد. پس از پایان آن دوباره بررسی کن.',
    agent_rate_limited: 'سرویس موقتاً درخواست‌های جدید را محدود کرده است. کمی بعد دوباره امتحان کن.',
    agent_request_failed: 'ایجنت نتوانست درخواست را کامل کند. پاسخ موفقی ثبت نشده است.',
    invalid_agent_response: 'پاسخ سرویس قابل تأیید نیست. نتیجهٔ موفق نمایش داده نمی‌شود.'
  };
  function mood(name, label) {
    state.mood = name;
    root.className = `avatar-button ${name}`;
    $('mood-label').textContent = label;
  }
  function notice(text) {
    $('connection-notice').hidden = !text;
    $('connection-notice').textContent = text || '';
  }
  function message(role, text, id) {
    if (id && state.seen.has(id)) return;
    if (id) state.seen.add(id);
    $('welcome').hidden = true;
    const el = document.createElement('article');
    el.className = `message ${role}`;
    const meta = document.createElement('div'); meta.className = 'message-meta';
    meta.textContent = role === 'user' ? 'شما' : role === 'error' ? 'وضعیت اتصال' : '✦ آرو';
    const content = document.createElement('div'); content.className = 'message-content';
    content.textContent = text; // All model/user text stays inert. No HTML injection.
    el.append(meta, content); log.append(el);
    log.scrollTop = log.scrollHeight;
  }
  function busy(value) {
    state.busy = value;
    $('send-button').disabled = value;
    $('new-chat').disabled = value;
    $('composer').setAttribute('aria-busy', String(value));
    $('send-button').firstElementChild.textContent = value ? 'در انتظار' : 'ارسال';
  }
  function taskLabel(text) {
    $('task-strip').hidden = !text;
    $('task-label').textContent = text || '';
  }
  async function api(path, options = {}) {
    if (!state.csrf) throw new Error('agent_not_configured');
    const response = await fetch(path, { ...options, headers: {
      'Content-Type': 'application/json', 'X-Companion-CSRF': state.csrf, ...options.headers
    }, credentials: 'same-origin' });
    const body = await response.json();
    if (path === 'bridge/chat' && body.conversation_id) state.conversation = body.conversation_id;
    if (!response.ok) throw new Error(typeof body.detail === 'string' ? body.detail : 'agent_request_failed');
    return body;
  }
  async function status() {
    try {
      const response = await fetch('bridge/status', { credentials: 'same-origin' });
      if (!response.ok) throw new Error('unreachable');
      const data = await response.json();
      $('online-marker').classList.toggle('connected', data.ready);
      if (!data.configured) {
        $('connection-label').textContent = 'رابط آماده است · اتصال ایجنت تنظیم نشده';
        notice(errors.agent_not_configured);
      } else if (!data.reachable || !data.ready) {
        $('connection-label').textContent = 'سرویس در دسترس نیست';
        notice(errors.agent_unreachable);
      } else if (data.provider === 'mock') {
        $('connection-label').textContent = 'حالت آزمایشی · مدل mock';
        notice('سرویس در حالت آزمایشی است. پاسخ‌ها از مدل واقعی دریافت نمی‌شوند.');
      } else {
        $('connection-label').textContent = data.profile === 'aromin-companion' ?
          'دستیار تخصصی آرومین · سرویس در دسترس' : 'سرویس آرومین در دسترس';
        notice('');
      }
    } catch (_) {
      $('connection-label').textContent = 'پیش‌نمایش رابط · اتصال فعال نیست';
      notice('برای پاسخ واقعی، رابط باید از طریق سرویس اتصال آرومین اجرا شود.');
    }
  }
  async function init() {
    try {
      const response = await fetch('bridge/session', { credentials: 'same-origin' });
      if (!response.ok) throw new Error('session');
      state.csrf = (await response.json()).csrf;
    } catch (_) { state.csrf = null; }
    await status();
  }
  async function refreshConversation() {
    const conversation = state.conversation;
    if (!conversation) return;
    for (let page = 0; page < 10; page++) {
      const data = await api(`bridge/conversations/${conversation}?cursor=${state.cursor}`);
      if (state.conversation !== conversation) return;
      for (const item of data.messages) {
        if (item.role === 'assistant') message('assistant', item.content, item.id);
        state.cursor = Math.max(state.cursor, item.seq);
      }
      if (!data.next_cursor || !data.messages.length) break;
    }
  }
  async function poll() {
    const taskId = state.task;
    if (!taskId) return;
    try {
      const task = await api(`bridge/tasks/${taskId}`);
      if (state.task !== taskId) return;
      if (task.status === 'succeeded') {
        await refreshConversation();
        if (state.task !== taskId) return;
        mood('happy', 'نتیجه آماده شد'); taskLabel('پاسخ در گفتگو ثبت شد');
        state.task = null;
      } else if (['failed', 'dead', 'cancelled'].includes(task.status)) {
        const label = task.status === 'cancelled' ? 'کار لغو شده است' : 'کار با خطا متوقف شده است';
        mood('error', label); taskLabel(label); state.task = null;
      } else {
        const waiting = task.status === 'waiting';
        mood(waiting ? 'approval' : 'thinking', waiting ? 'منتظر ادامهٔ مجاز هستم' : 'در حال پیگیری کار');
        taskLabel(waiting ? 'در انتظار تأیید یا ادامهٔ مجاز · اقدام خودکار انجام نمی‌شود' : 'کار در سرویس آرومین ادامه دارد');
        state.poll = setTimeout(poll, 3000);
      }
    } catch (error) {
      if (state.task !== taskId) return;
      taskLabel('وضعیت کار دریافت نشد؛ بررسی بعدی تا چند ثانیهٔ دیگر');
      state.poll = setTimeout(poll, 5000);
    }
  }
  $('composer').addEventListener('submit', async event => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text || state.busy) return;
    const retry = state.pending && state.pending.message === text;
    const clientId = retry ? state.pending.id : crypto.randomUUID();
    state.pending = { message: text, id: clientId };
    if (!retry) message('user', text, `local-${clientId}`);
    input.value = ''; busy(true); mood('thinking', 'به سؤالت فکر می‌کنم');
    taskLabel('در انتظار پاسخ واقعی ایجنت آرومین');
    try {
      const body = await api('bridge/chat', { method: 'POST', body: JSON.stringify({
        message: text, conversation_id: state.conversation, client_msg_id: clientId, channel: 'api'
      }) });
      state.seen.add(body.user_message_id);
      state.pending = null;
      if (body.status === 'waiting_approval') {
        state.task = body.task_id;
        mood('approval', 'این کار به تأیید مجاز نیاز دارد');
        taskLabel('در انتظار تأیید · رابط اقدام را خودکار تأیید نمی‌کند');
        if (state.poll) clearTimeout(state.poll);
        state.poll = setTimeout(poll, 3000);
      } else if (body.message) {
        message('assistant', body.message.content, body.message.id);
        state.cursor = Math.max(state.cursor, body.message.seq);
        mood('responding', 'پاسخ آماده است'); taskLabel('پاسخ در ایجنت ثبت شد');
      } else throw new Error('invalid_agent_response');
    } catch (error) {
      message('error', errors[error.message] || 'اتصال برقرار نشد. هیچ پاسخ ساختگی تولید نشده است.');
      mood('error', 'اتصال نیاز به بررسی دارد'); taskLabel('پاسخ موفق دریافت نشد');
      if (!input.value) input.value = text;
    } finally { busy(false); input.focus(); }
  });
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault(); $('composer').requestSubmit();
    }
  });
  document.querySelectorAll('[data-prompt]').forEach(button => button.addEventListener('click', () => {
    input.value = button.dataset.prompt; input.focus();
    if (!state.busy) mood('happy', 'شنونده‌ام');
  }));
  $('new-chat').addEventListener('click', () => {
    if (state.busy) return;
    if (state.poll) clearTimeout(state.poll);
    state.conversation = null; state.task = null; state.pending = null; state.cursor = 0; state.seen.clear();
    log.querySelectorAll('.message').forEach(el => el.remove());
    $('welcome').hidden = false; input.value = ''; taskLabel(''); mood('happy', 'از یک سؤال تازه شروع کنیم');
    status(); input.focus();
  });
  $('island-toggle').addEventListener('click', () => {
    const expanded = $('island-toggle').getAttribute('aria-expanded') !== 'true';
    $('island-toggle').setAttribute('aria-expanded', String(expanded));
    $('workspace').hidden = !expanded;
  });
  root.addEventListener('click', () => {
    if (!state.busy && !state.task) mood('happy', 'سلام! من اینجام.');
  });
  document.addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse') return;
    const rect = $('avatar').getBoundingClientRect();
    const x = Math.max(-4, Math.min(4, (event.clientX - rect.left - rect.width / 2) / 60));
    const y = Math.max(-3, Math.min(3, (event.clientY - rect.top - rect.height / 2) / 80));
    root.style.setProperty('--eye-x', `${x}px`); root.style.setProperty('--eye-y', `${y}px`);
  });
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let motion = !reduced.matches;
  function motionState() {
    document.body.classList.toggle('reduce-motion', !motion);
    $('motion-toggle').setAttribute('aria-pressed', String(motion));
    $('motion-toggle').textContent = motion ? 'حرکت روشن' : 'حرکت خاموش';
  }
  $('motion-toggle').addEventListener('click', () => { motion = !motion; motionState(); });
  document.addEventListener('visibilitychange', () => root.classList.toggle('paused', document.hidden));
  motionState(); init();
})();
