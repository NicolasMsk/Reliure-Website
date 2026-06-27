/** Variables d'environnement requises pour démarrer le serveur. */
export const REQUIRED_ENV = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'RESEND_API_KEY',
  'ADMIN_PASSWORD',
  'SESSION_SECRET',
] as const;

/**
 * Renvoie la liste des clés requises absentes ou vides de `source`.
 * Une chaîne vide ou un espace blanc compte comme absente.
 */
export function validateEnv(
  source: Record<string, string | undefined>,
  required: readonly string[] = REQUIRED_ENV,
): string[] {
  return required.filter((key) => {
    const value = source[key];
    return value === undefined || value.trim() === '';
  });
}
