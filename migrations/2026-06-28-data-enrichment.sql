-- ═══════════════════════════════════════════════════════
-- RELIURE — Migration : enrichissement des données (2026-06-28)
-- À exécuter dans le SQL Editor de Supabase. Idempotent.
-- ═══════════════════════════════════════════════════════

-- ── customers : coordonnées ────────────────────────────
ALTER TABLE customers ADD COLUMN IF NOT EXISTS phone         TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS address_line1 TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS address_line2 TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS postal_code   TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS city          TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS country        TEXT;

-- ── orders : suivi d'expédition ────────────────────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_number TEXT;

-- ── custom_requests : téléphone ────────────────────────
ALTER TABLE custom_requests ADD COLUMN IF NOT EXISTS phone TEXT;

-- ── Messages de contact (persistés) ────────────────────
CREATE TABLE IF NOT EXISTS contact_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  message     TEXT NOT NULL,
  lang        TEXT NOT NULL DEFAULT 'fr' CHECK (lang IN ('fr','en')),
  status      TEXT NOT NULL DEFAULT 'nouveau' CHECK (status IN ('nouveau','lu')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_contact_messages_status ON contact_messages (status);

-- ── Journal de consentement (RGPD) ─────────────────────
CREATE TABLE IF NOT EXISTS consents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id   UUID REFERENCES customers(id) ON DELETE SET NULL,
  email         TEXT,
  consent_type  TEXT NOT NULL,
  granted       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_consents_email ON consents (email);

-- ── Sécurité : RLS deny-by-default sur les nouvelles tables ──
ALTER TABLE contact_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE consents         ENABLE ROW LEVEL SECURITY;
-- Aucune policy publique : seul le serveur (clé service) lit/écrit.
