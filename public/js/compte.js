/* Page compte : connexion / inscription / reset / historique. */
(function () {
  const $ = (id) => document.getElementById(id);
  function show(id) { ['auth-view', 'account-view', 'reset-view'].forEach((v) => $(v).classList.toggle('hidden', v !== id)); }
  function note(el, key, ok) { el.textContent = window.I18N.t(key); el.className = 'form-note ' + (ok ? 'is-success' : 'is-error'); el.hidden = false; }

  document.addEventListener('i18n:ready', init, { once: true });

  async function init() {
    // Lien magique de récupération ? (hash contient type=recovery)
    if (location.hash.includes('type=recovery')) { wireReset(); show('reset-view'); return; }

    wireTabs(); wireForms();
    let session = null;
    try { session = await window.AUTH.getSession(); } catch { renderUnavailable(); return; }
    if (session) { await renderAccount(); } else { show('auth-view'); }
  }

  function renderUnavailable() {
    show('auth-view');
    const n = $('auth-note'); n.textContent = window.I18N.t('account.unavailable'); n.className = 'form-note is-error'; n.hidden = false;
    $('login-form').classList.add('hidden'); $('signup-form').classList.add('hidden');
  }

  function wireTabs() {
    $('tab-login').addEventListener('click', () => { $('tab-login').classList.add('active'); $('tab-signup').classList.remove('active'); $('login-form').classList.remove('hidden'); $('signup-form').classList.add('hidden'); });
    $('tab-signup').addEventListener('click', () => { $('tab-signup').classList.add('active'); $('tab-login').classList.remove('active'); $('signup-form').classList.remove('hidden'); $('login-form').classList.add('hidden'); });
  }

  function wireForms() {
    $('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button[type=submit]');
      if (btn) btn.disabled = true;
      try {
        const f = new FormData(e.target);
        const { error } = await window.AUTH.signIn(f.get('email'), f.get('password'));
        if (error) { note($('auth-note'), 'account.error', false); return; }
        await renderAccount();
      } catch {
        note($('auth-note'), 'account.error', false);
      } finally {
        if (btn) btn.disabled = false;
      }
    });
    $('signup-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button[type=submit]');
      if (btn) btn.disabled = true;
      try {
        const f = new FormData(e.target);
        const { error } = await window.AUTH.signUp(f.get('email'), f.get('password'), f.get('name'));
        if (error) { note($('auth-note'), 'account.error', false); return; }
        note($('auth-note'), 'account.signup.check', true);
      } catch {
        note($('auth-note'), 'account.error', false);
      } finally {
        if (btn) btn.disabled = false;
      }
    });
    $('forgot-link').addEventListener('click', async (e) => {
      e.preventDefault();
      const link = e.target;
      const email = $('login-form').querySelector('[name=email]').value;
      if (!email) { note($('auth-note'), 'account.error', false); return; }
      link.style.pointerEvents = 'none';
      try {
        await window.AUTH.resetPassword(email);
        note($('auth-note'), 'account.reset.sent', true);
      } catch {
        note($('auth-note'), 'account.error', false);
      } finally {
        link.style.pointerEvents = '';
      }
    });
    $('logout-btn').addEventListener('click', async () => { try { await window.AUTH.signOut(); } catch { /* ignore */ } location.reload(); });
  }

  function wireReset() {
    $('reset-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button[type=submit]');
      if (btn) btn.disabled = true;
      try {
        const pw = new FormData(e.target).get('password');
        const { error } = await window.AUTH.updatePassword(pw);
        note($('reset-note'), error ? 'account.error' : 'account.reset.sent', !error);
        if (!error) { setTimeout(() => { location.href = '/compte'; }, 1200); return; }
      } catch {
        note($('reset-note'), 'account.error', false);
      } finally {
        if (btn) btn.disabled = false;
      }
    });
  }

  async function renderAccount() {
    show('account-view');
    const token = await window.AUTH.getToken();
    const me = await fetch('/api/account/me', { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.ok ? r.json() : null).catch(() => null);
    if (me) { $('acct-name').textContent = me.name || ''; $('acct-email').textContent = me.email || ''; }
    const orders = await fetch('/api/account/orders', { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.ok ? r.json() : []).catch(() => []);
    const list = $('orders-list'); const empty = $('orders-empty');
    if (!orders.length) { empty.classList.remove('hidden'); list.innerHTML = ''; return; }
    empty.classList.add('hidden');
    list.innerHTML = orders.map(orderRow).join('');
  }

  function orderRow(o) {
    const date = (o.created_at || '').slice(0, 10);
    return `<div class="service-card" style="margin-bottom:.8rem">
    <div style="display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap">
      <span>${window.escHtml(date)}</span>
      <strong>${Number(o.amount).toFixed(2)} €</strong>
      <span style="color:var(--sage-deep)">${window.escHtml(o.status)}</span>
    </div>
  </div>`;
  }
})();
