import 'dotenv/config';

export const PORT = Number(process.env.PORT) || 3000;
export const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;
export const EMAIL_FROM = process.env.EMAIL_FROM || 'Reliure <onboarding@resend.dev>';
export const CONTACT_TO = process.env.CONTACT_TO || '';
export const IS_PRODUCTION =
  process.env.NODE_ENV === 'production' || !!process.env.RAILWAY_ENVIRONMENT;
