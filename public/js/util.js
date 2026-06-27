/* Utilitaires partagés côté client — échappement HTML/attribut. */
(function () {
  /** Échappe le texte pour une insertion dans le corps HTML (& < >). */
  window.escHtml = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  };
  /** Échappe pour une valeur d'attribut (escHtml + guillemets doubles). */
  window.escAttr = function (s) {
    return window.escHtml(s).replace(/"/g, '&quot;');
  };
})();
