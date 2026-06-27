/* Formulaire sur-mesure : envoi multipart (texte + photos) avec garde anti-double-soumission. */
(function () {
  document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('custom-form');
    const note = document.getElementById('custom-note');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('button[type=submit]');
      if (btn) btn.disabled = true;
      note.hidden = true;
      try {
        const fd = new FormData(form);
        fd.append('lang', window.I18N ? window.I18N.current : 'fr');
        const res = await fetch('/api/custom-request', { method: 'POST', body: fd });
        const ok = res.ok;
        note.textContent = window.I18N.t(ok ? 'custom.success' : 'custom.error');
        note.className = 'form-note ' + (ok ? 'is-success' : 'is-error');
        note.hidden = false;
        if (ok) form.reset();
      } catch {
        note.textContent = window.I18N.t('custom.error');
        note.className = 'form-note is-error';
        note.hidden = false;
      } finally {
        if (btn) btn.disabled = false;
      }
    });
  });
})();
