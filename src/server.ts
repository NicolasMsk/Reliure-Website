import 'dotenv/config';
import { createApp } from './app';
import { validateEnv } from './lib/env';
import { PORT } from './config';

const missing = validateEnv(process.env);
if (missing.length > 0) {
  console.error(`❌  Variables d'environnement manquantes : ${missing.join(', ')}`);
  process.exit(1);
}

const app = createApp();

app.listen(PORT, () => {
  console.log(`
  ✦ ═══════════════════════════════════════════ ✦
    Reliure — serveur démarré
    → http://localhost:${PORT}
  ✦ ═══════════════════════════════════════════ ✦
  `);
});
