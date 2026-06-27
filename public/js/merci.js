/* Page Merci : confirme la commande via l'API si session_id présent. */
document.addEventListener('i18n:ready', async () => {
  const msg = document.getElementById('merci-msg');
  const id = new URLSearchParams(location.search).get('session_id');
  if (!id || !msg) return;
  try {
    const res = await fetch(`/api/checkout/session/${encodeURIComponent(id)}`);
    if (res.ok) {
      const d = await res.json();
      if (d.paid) msg.textContent = window.I18N.t('merci.confirmed');
    }
  } catch { /* garde le message d'attente */ }
}, { once: true });
