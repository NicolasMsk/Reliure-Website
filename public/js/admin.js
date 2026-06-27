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

async function showList() {
  show('admin-view');
  const rows = await fetch('/api/admin/products').then((r) => r.ok ? r.json() : []).catch(() => []);
  $('products-tbody').innerHTML = rows.map(rowHTML).join('') || `<tr><td colspan="5">Aucune création pour l'instant.</td></tr>`;
  document.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => openEditor(b.getAttribute('data-edit'))));
  document.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => onDelete(b.getAttribute('data-del'))));
  loadOrders();
}

async function loadOrders() {
  const tb = document.getElementById('orders-tbody');
  if (!tb) return;
  const orders = await fetch('/api/admin/orders').then((r) => r.ok ? r.json() : []).catch(() => []);
  tb.innerHTML = orders.length ? orders.map(orderRow).join('') : `<tr><td colspan="6">Aucune commande pour l'instant.</td></tr>`;
  tb.querySelectorAll('[data-ship]').forEach((b) => b.addEventListener('click', () => setOrder(b.getAttribute('data-ship'), 'expédiée')));
  tb.querySelectorAll('[data-deliver]').forEach((b) => b.addEventListener('click', () => setOrder(b.getAttribute('data-deliver'), 'livrée')));
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
    <td>${escHtml(o.status)}</td>
    <td class="admin-actions">
      <button class="btn btn--sm" data-ship="${escAttr(o.id)}">Expédiée</button>
      <button class="btn btn--sm" data-deliver="${escAttr(o.id)}">Livrée</button>
    </td></tr>`;
}
async function setOrder(id, status) {
  await fetch(`/api/admin/orders/${id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
  loadOrders();
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
    if (p) { for (const k of ['title_fr','title_en','description_fr','description_en','price','category','weight_grams','status']) if (f[k]) f[k].value = p[k] ?? ''; }
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
  for (const k of ['title_fr','title_en','description_fr','description_en','price','category','weight_grams','status']) body[k] = f[k].value;
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
