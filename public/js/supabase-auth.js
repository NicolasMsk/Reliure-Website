/* Initialise le client Supabase navigateur (clé publiable via /api/config)
   et expose window.AUTH avec des helpers. Charge le SDK UMD si absent. */
(function () {
  let client = null;
  let ready = null;

  function loadSdk() {
    if (window.supabase && window.supabase.createClient) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  async function init() {
    if (ready) return ready;
    ready = (async () => {
      const cfg = await fetch('/api/config').then((r) => r.json());
      if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) throw new Error('config Supabase absente');
      await loadSdk();
      client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
      return client;
    })();
    return ready;
  }

  window.AUTH = {
    async client() { return init(); },
    async signUp(email, password, name) {
      const c = await init();
      return c.auth.signUp({ email, password, options: { data: { name }, emailRedirectTo: location.origin + '/compte' } });
    },
    async signIn(email, password) {
      const c = await init();
      return c.auth.signInWithPassword({ email, password });
    },
    async signOut() { const c = await init(); return c.auth.signOut(); },
    async getSession() { const c = await init(); const { data } = await c.auth.getSession(); return data.session; },
    async getToken() { const s = await this.getSession(); return s ? s.access_token : null; },
    async resetPassword(email) { const c = await init(); return c.auth.resetPasswordForEmail(email, { redirectTo: location.origin + '/compte' }); },
    async updatePassword(password) { const c = await init(); return c.auth.updateUser({ password }); },
  };
})();
