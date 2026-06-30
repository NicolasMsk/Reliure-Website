/* Panneau admin : connexion, CRUD produits, upload images. */
const $ = (id) => document.getElementById(id);
let EDIT_ID = null;

document.addEventListener('DOMContentLoaded', async () => {
  fillCategorySelect();
  $('login-form').addEventListener('submit', onLogin);
  $('logout-btn').addEventListener('click', onLogout);
  $('new-btn').addEventListener('click', () => openEditor(null));
  $('back-btn').addEventListener('click', showList);
  $('product-form').addEventListener('submit', onSave);
  $('image-input').addEventListener('change', onUpload);
  const me = await fetch('/api/admin/me').then((r) => r.json()).catch(() => ({ admin: false }));
  if (me.admin) { showList(); } else { show('login-view'); }
});

function fillCategorySelect() {
  const sel = $('cat-select');
  sel.innerHTML = (window.CATEGORIES || []).map((c) => `<option value="${escAttr(c.slug)}">${escHtml(c.fr)}</option>`).join('');
}
function show(id) { ['login-view', 'admin-view', 'editor-view'].forEach((v) => $(v).classList.toggle('hidden', v !== id)); }

async function onLogin(e) {
  e.preventDefault();
  const password = new FormData(e.target).get('password');
  const res = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
  if (res.ok) { showList(); } else { $('login-error').classList.remove('hidden'); }
}
async function onLogout() { await fetch('/api/admin/logout', { method: 'POST' }); show('login-view'); }

let TABS_WIRED = false;
async function showList() {
  show('admin-view');
  if (!TABS_WIRED) { wireTabs(); TABS_WIRED = true; }
  const rows = await fetch('/api/admin/products').then((r) => r.ok ? r.json() : []).catch(() => []);
  $('products-tbody').innerHTML = rows.map(rowHTML).join('') || `<tr><td colspan="5">Aucune création pour l'instant.</td></tr>`;
  document.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => openEditor(b.getAttribute('data-edit'))));
  document.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => onDelete(b.getAttribute('data-del'))));
  loadOrders();
  loadCustom();
  loadDashboard();
  loadMessages();
}

function wireTabs() {
  document.querySelectorAll('.admin-tab').forEach((t) => {
    t.addEventListener('click', () => {
      const name = t.getAttribute('data-tab');
      document.querySelectorAll('.admin-tab').forEach((x) => x.classList.toggle('active', x === t));
      document.querySelectorAll('.admin-panel').forEach((p) => p.classList.toggle('active', p.getAttribute('data-panel') === name));
    });
  });
}

async function loadDashboard() {
  const wrap = document.getElementById('stat-cards');
  if (!wrap) return;
  const s = await fetch('/api/admin/stats').then((r) => r.ok ? r.json() : null).catch(() => null);
  if (!s) return;
  const money = (n) => Number(n || 0).toFixed(2) + ' €';
  wrap.innerHTML = `
    <div class="stat-card"><div class="stat-label">CA ce mois</div><div class="stat-value">${money(s.revenue_month)}</div><div class="stat-sub">Total : ${money(s.revenue_total)}</div></div>
    <div class="stat-card"><div class="stat-label">Commandes</div><div class="stat-value">${s.orders_count}</div><div class="stat-sub">${s.products_sold} pièce(s) vendue(s)</div></div>
    <div class="stat-card"><div class="stat-label">Catalogue</div><div class="stat-value">${s.products_available}</div><div class="stat-sub">dispo · ${s.products_draft} brouillon(s)</div></div>
    <div class="stat-card stat-card--todo"><div class="stat-label">À traiter</div><div class="stat-value">${s.orders_to_ship + s.custom_new + s.messages_unread}</div><div class="stat-sub">${s.orders_to_ship} à expédier · ${s.custom_new} devis · ${s.messages_unread} message(s)</div></div>`;
  const cats = document.getElementById('cat-breakdown');
  const entries = Object.entries(s.by_category || {});
  cats.innerHTML = entries.length ? entries.map(([k, v]) => `<li><span>${escHtml(window.categoryLabel ? window.categoryLabel(k, 'fr') : k)}</span><strong>${v}</strong></li>`).join('') : '<li>Aucun produit disponible.</li>';
  const rs = document.getElementById('recent-sales');
  rs.innerHTML = (s.recent_sales || []).length
    ? s.recent_sales.map((o) => `<tr><td>${escHtml((o.created_at || '').slice(0,10))}</td><td>${escHtml(o.customer_email || '')}</td><td>${Number(o.amount).toFixed(2)} €</td><td>${escHtml(o.status)}</td></tr>`).join('')
    : '<tr><td>Aucune vente pour l\'instant.</td></tr>';
}

async function loadMessages() {
  const tb = document.getElementById('messages-tbody');
  if (!tb) return;
  const rows = await fetch('/api/admin/messages').then((r) => r.ok ? r.json() : []).catch(() => []);
  const unread = rows.filter((m) => m.status === 'nouveau').length;
  const badge = document.getElementById('msg-badge');
  if (badge) { badge.textContent = unread; badge.classList.toggle('hidden', unread === 0); }
  tb.innerHTML = rows.length ? rows.map(msgRow).join('') : `<tr><td colspan="5">Aucun message.</td></tr>`;
  tb.querySelectorAll('[data-read]').forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    await fetch(`/api/admin/messages/${b.getAttribute('data-read')}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'lu' }) });
    loadMessages();
  }));
}
function msgRow(m) {
  const date = (m.created_at || '').slice(0, 10);
  const extrait = (m.message || '').slice(0, 80);
  const action = m.status === 'nouveau' ? `<button class="btn btn--sm" data-read="${escAttr(m.id)}">Marquer lu</button>` : '';
  return `<tr><td>${escHtml(date)}</td><td>${escHtml(m.name)}<br><span style="color:var(--text-soft)">${escHtml(m.email)}</span></td><td>${escHtml(extrait)}</td><td>${escHtml(m.status)}</td><td class="admin-actions">${action}</td></tr>`;
}

async function loadOrders() {
  const tb = document.getElementById('orders-tbody');
  if (!tb) return;
  const orders = await fetch('/api/admin/orders').then((r) => r.ok ? r.json() : []).catch(() => []);
  tb.innerHTML = orders.length ? orders.map(orderRow).join('') : `<tr><td colspan="6">Aucune commande pour l'instant.</td></tr>`;
  tb.querySelectorAll('[data-ship]').forEach((b) => b.addEventListener('click', () => setOrder(b.getAttribute('data-ship'), 'expédiée', b)));
  tb.querySelectorAll('[data-deliver]').forEach((b) => b.addEventListener('click', () => setOrder(b.getAttribute('data-deliver'), 'livrée', b)));
}
function orderRow(o) {
  const a = o.shipping_address || {};
  const addr = [a.line1, a.postal_code, a.city, a.country].filter(Boolean).join(', ');
  const date = (o.created_at || '').slice(0, 10);
  return `<tr>
    <td>${escHtml(date)}</td>
    <td>${escHtml(o.customer_email || '')}</td>
    <td>${Number(o.amount).toFixed(2)} €</td>
    <td>${escHtml(addr)}</td>
    <td><input type="text" class="track-input" data-track="${escAttr(o.id)}" value="${escAttr(o.tracking_number || '')}" placeholder="N° suivi" style="width:120px" /></td>
    <td>${escHtml(o.status)}</td>
    <td class="admin-actions">
      <button class="btn btn--sm" data-ship="${escAttr(o.id)}">Expédiée</button>
      <button class="btn btn--sm" data-deliver="${escAttr(o.id)}">Livrée</button>
    </td></tr>`;
}
async function setOrder(id, status, btn) {
  if (btn) btn.disabled = true;
  const input = document.querySelector(`.track-input[data-track="${id}"]`);
  const v = input ? input.value.trim() : '';
  const body = v ? { status, tracking_number: v } : { status };
  try {
    const res = await fetch(`/api/admin/orders/${id}/status`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) { alert('Échec de la mise à jour de la commande.'); if (btn) btn.disabled = false; return; }
    loadOrders();
  } catch {
    alert('Échec de la mise à jour de la commande.');
    if (btn) btn.disabled = false;
  }
}
function rowHTML(p) {
  const cat = window.categoryLabel ? window.categoryLabel(p.category, 'fr') : (p.category || '');
  return `<tr>
    <td>${escHtml(p.title_fr)}</td><td>${escHtml(cat)}</td><td>${Number(p.price).toFixed(2)} €</td><td>${escHtml(p.status)}</td>
    <td class="admin-actions">
      <button class="btn btn--sm" data-edit="${escAttr(p.id)}">Éditer</button>
      <button class="btn btn--sm btn--danger" data-del="${escAttr(p.id)}">Suppr.</button>
    </td></tr>`;
}

async function openEditor(id) {
  EDIT_ID = id;
  const f = $('product-form');
  f.reset();
  $('form-note').classList.add('hidden');
  if (id) {
    $('editor-title').textContent = 'Modifier la création';
    const rows = await fetch('/api/admin/products').then((r) => r.json());
    const p = rows.find((x) => x.id === id);
    if (p) { for (const k of ['title_fr','title_en','description_fr','description_en','price','category','weight_grams','status','materials','technique','duration','dimensions']) if (f[k]) f[k].value = p[k] ?? ''; }
    f.id.value = id;
    $('images-block').classList.remove('hidden');
    loadImages(id);
  } else {
    $('editor-title').textContent = 'Nouvelle création';
    $('images-block').classList.add('hidden'); // images après 1ère sauvegarde
  }
  show('editor-view');
}

async function onSave(e) {
  e.preventDefault();
  const f = e.target;
  const body = {};
  for (const k of ['title_fr','title_en','description_fr','description_en','price','category','weight_grams','status','materials','technique','duration','dimensions']) body[k] = f[k].value;
  const url = EDIT_ID ? `/api/admin/products/${EDIT_ID}` : '/api/admin/products';
  const method = EDIT_ID ? 'PATCH' : 'POST';
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const note = $('form-note');
  if (res.ok) {
    const saved = await res.json();
    note.textContent = 'Enregistré ✓'; note.className = 'form-note is-success';
    if (!EDIT_ID) { EDIT_ID = saved.id; $('images-block').classList.remove('hidden'); loadImages(saved.id); $('editor-title').textContent = 'Modifier la création'; }
  } else { note.textContent = 'Erreur lors de l\'enregistrement.'; note.className = 'form-note is-error'; }
  note.classList.remove('hidden');
}

async function onDelete(id) {
  if (!confirm('Supprimer définitivement cette création ?')) return;
  await fetch(`/api/admin/products/${id}`, { method: 'DELETE' });
  showList();
}

async function loadImages(id) {
  const list = $('images-list');
  const imgs = await fetch(`/api/admin/products/${id}/images`).then((r) => r.ok ? r.json() : []).catch(() => []);
  list.innerHTML = imgs.map((im) => `<figure><img src="${escAttr(im.url)}" alt="" /><br><button class="btn btn--sm btn--danger" data-img="${escAttr(im.id)}">Suppr.</button></figure>`).join('');
  list.querySelectorAll('[data-img]').forEach((b) => b.addEventListener('click', async () => {
    await fetch(`/api/admin/images/${b.getAttribute('data-img')}`, { method: 'DELETE' });
    loadImages(id);
  }));
}

async function onUpload(e) {
  if (!EDIT_ID) return;
  const file = e.target.files[0];
  if (!file) return;
  const fd = new FormData(); fd.append('image', file);
  const res = await fetch(`/api/admin/products/${EDIT_ID}/images`, { method: 'POST', body: fd });
  if (res.ok) { e.target.value = ''; loadImages(EDIT_ID); alert('Image ajoutée ✓'); }
  else { alert('Échec de l\'upload (format ou taille ?)'); }
}

/* ── Demandes sur-mesure ──────────────────────────────────────── */
async function loadCustom() {
  const tb = document.getElementById('custom-tbody');
  if (!tb) return;
  const rows = await fetch('/api/admin/custom-requests').then((r) => r.ok ? r.json() : []).catch(() => []);
  tb.innerHTML = rows.length ? rows.map(customRow).join('') : `<tr><td colspan="5">Aucune demande pour l'instant.</td></tr>`;
  tb.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => viewCustom(b.getAttribute('data-view'))));
}
function customRow(r) {
  const date = (r.created_at || '').slice(0, 10);
  return `<tr>
    <td>${escHtml(date)}</td>
    <td>${escHtml(r.name)}<br><span style="color:var(--text-soft)">${escHtml(r.email)}</span></td>
    <td>${escHtml(r.budget || '—')}</td>
    <td>${escHtml(r.status)}</td>
    <td class="admin-actions"><button class="btn btn--sm" data-view="${escAttr(r.id)}">Voir</button></td>
  </tr>`;
}
async function viewCustom(id) {
  const box = document.getElementById('custom-detail');
  const r = await fetch(`/api/admin/custom-requests/${id}`).then((x) => x.ok ? x.json() : null).catch(() => null);
  if (!r) { box.innerHTML = ''; box.classList.add('hidden'); return; }
  const imgs = (r.signed_images || []).map((u) => `<img src="${escAttr(u)}" style="width:120px;height:150px;object-fit:cover;border:1px solid var(--line);margin:.3rem" />`).join('');
  const link = r.stripe_payment_link ? `<p>Lien : <a href="${escAttr(r.stripe_payment_link)}" target="_blank">${escHtml(r.stripe_payment_link)}</a></p>` : '';
  box.innerHTML = `
    <div class="service-card">
      <h3>${escHtml(r.name)} — ${escHtml(r.email)}</h3>
      <p>${escHtml(r.description).replace(/\n/g, '<br>')}</p>
      <p><em>Budget : ${escHtml(r.budget || '—')}</em></p>
      <p><em>Téléphone : ${escHtml(r.phone || '—')}</em></p>
      <div>${imgs}</div>
      <p style="margin-top:1rem">Statut :
        <select id="custom-status">
          <option value="nouvelle">Nouvelle</option>
          <option value="devis_envoyé">Devis envoyé</option>
          <option value="payée">Payée</option>
          <option value="terminée">Terminée</option>
        </select>
        <button class="btn btn--sm" id="custom-status-save">Enregistrer</button>
      </p>
      ${link}
      <p style="margin-top:1rem">Générer un lien de paiement :
        <input type="number" id="pl-amount" min="1" step="0.01" placeholder="Montant €" style="width:120px" />
        <input type="text" id="pl-label" placeholder="Libellé" />
        <button class="btn btn--sm" id="pl-create">Créer le lien</button>
      </p>
      <p class="form-note hidden" id="custom-note2"></p>
    </div>`;
  box.classList.remove('hidden');
  document.getElementById('custom-status').value = r.status;
  document.getElementById('custom-status-save').addEventListener('click', async (ev) => {
    ev.target.disabled = true;
    const status = document.getElementById('custom-status').value;
    try { await fetch(`/api/admin/custom-requests/${id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }); }
    finally { loadCustom(); }
  });
  document.getElementById('pl-create').addEventListener('click', async () => {
    const plBtn = document.getElementById('pl-create');
    const amount = Number(document.getElementById('pl-amount').value);
    const label = document.getElementById('pl-label').value;
    const note2 = document.getElementById('custom-note2');
    if (!amount || amount <= 0) { note2.textContent = 'Montant invalide.'; note2.className = 'form-note is-error'; note2.hidden = false; return; }
    plBtn.disabled = true;
    try {
      const res = await fetch(`/api/admin/custom-requests/${id}/payment-link`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount, label }) });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.url) { viewCustom(id); }   // re-render shows the new link in the detail panel
      else { note2.textContent = body.error || 'Échec de création du lien.'; note2.className = 'form-note is-error'; note2.hidden = false; plBtn.disabled = false; }
    } catch {
      note2.textContent = 'Échec de création du lien.'; note2.className = 'form-note is-error'; note2.hidden = false; plBtn.disabled = false;
    }
  });
}
