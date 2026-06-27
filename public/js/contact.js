/* Soumission AJAX du formulaire de contact. */
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('contact-form');
  const note = document.getElementById('contact-note');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    note.hidden = true;

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const ok = res.ok;
      note.textContent = window.I18N.t(ok ? 'contact.success' : 'contact.error');
      note.className = 'form-note ' + (ok ? 'is-success' : 'is-error');
      note.hidden = false;
      if (ok) form.reset();
    } catch {
      note.textContent = window.I18N.t('contact.error');
      note.className = 'form-note is-error';
      note.hidden = false;
    }
  });
});
