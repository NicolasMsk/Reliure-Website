/* Accordéon FAQ — ouvre/ferme au clic, accessible clavier (les boutons le sont nativement). */
(function () {
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.faq-item .faq-q').forEach((btn) => {
      btn.setAttribute('aria-expanded', 'false');
      btn.addEventListener('click', () => {
        const item = btn.closest('.faq-item');
        const open = item.classList.toggle('open');
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    });
  });
})();
