/* Soumission AJAX du formulaire de contact. */
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('contact-form');
  const note = document.getElementById('contact-note');
  if (!form) return;

  const submitBtn = form.querySelector('button[type="submit"]');

  /* Traduit une clé ; si le dictionnaire n'est pas encore chargé (t() renvoie
     la clé brute), on retombe sur un message FR lisible. */
  function msg(key, fallbackFr) {
    const v = window.I18N && window.I18N.t ? window.I18N.t(key) : key;
    return v === key ? fallbackFr : v;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    note.hidden = true;
    if (submitBtn) submitBtn.disabled = true;

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const ok = res.ok;
      note.textContent = ok
        ? msg('contact.success', 'Message envoyé, merci !')
        : msg('contact.error', 'Une erreur est survenue. Réessayez.');
      note.className = 'form-note ' + (ok ? 'is-success' : 'is-error');
      note.hidden = false;
      if (ok) form.reset();
    } catch {
      note.textContent = msg('contact.error', 'Une erreur est survenue. Réessayez.');
      note.className = 'form-note is-error';
      note.hidden = false;
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
});
