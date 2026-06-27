import 'dotenv/config';

export const PORT = Number(process.env.PORT) || 3000;
export const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;
export const EMAIL_FROM = process.env.EMAIL_FROM || 'Reliure <onboarding@resend.dev>';
export const CONTACT_TO = process.env.CONTACT_TO || '';
export const IS_PRODUCTION =
  process.env.NODE_ENV === 'production' || !!process.env.RAILWAY_ENVIRONMENT;

export const CURRENCY = 'eur';

/** Tarifs de port (modifiables ici). Montants en euros. */
export const SHIPPING_RATES = [
  { key: 'fr',     label_fr: 'France',        label_en: 'France',        amount: 8 },
  { key: 'eu',     label_fr: 'Europe',        label_en: 'Europe',        amount: 15 },
  { key: 'world',  label_fr: 'Reste du monde', label_en: 'Rest of world', amount: 25 },
] as const;

/** Pays autorisés à la livraison (codes ISO-2). Élargir si besoin. */
export const SHIPPING_COUNTRIES = [
  'FR','BE','LU','CH','DE','ES','IT','NL','PT','AT','IE','GB',
  'US','CA','SE','DK','FI','NO','PL','CZ','GR','AU','NZ','JP',
] as const;

/** Destinataire des notifications de commande. */
export const ORDER_NOTIFY_EMAIL = process.env.ORDER_NOTIFY_EMAIL || process.env.CONTACT_TO || '';
