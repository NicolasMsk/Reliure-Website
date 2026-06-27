-- ═══════════════════════════════════════════════════════
-- RELIURE — Schéma Supabase (PostgreSQL)
-- À exécuter dans le SQL Editor de Supabase.
-- ═══════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Produits (pièces uniques) ──────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug            TEXT UNIQUE NOT NULL,
  title_fr        TEXT NOT NULL,
  title_en        TEXT NOT NULL,
  description_fr  TEXT,
  description_en  TEXT,
  price           NUMERIC(10,2) NOT NULL DEFAULT 0,
  category        TEXT,
  status          TEXT NOT NULL DEFAULT 'brouillon'
                  CHECK (status IN ('brouillon', 'disponible', 'vendu')),
  weight_grams    INT NOT NULL DEFAULT 500,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_products_status ON products (status);
-- (Pas d'index sur slug : la contrainte UNIQUE crée déjà l'index sous-jacent.)

-- ── Images de produits ─────────────────────────────────
CREATE TABLE IF NOT EXISTS product_images (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id   UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  alt_fr       TEXT,
  alt_en       TEXT,
  sort_order   INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_product_images_product ON product_images (product_id);

-- ── Comptes clients (liés à Supabase Auth) ─────────────
CREATE TABLE IF NOT EXISTS customers (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_user_id  UUID UNIQUE,
  name          TEXT,
  email         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Commandes (vente directe) ──────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  stripe_session_id  TEXT UNIQUE NOT NULL,
  product_id         UUID REFERENCES products(id) ON DELETE SET NULL,
  customer_id        UUID REFERENCES customers(id) ON DELETE SET NULL,
  customer_email     TEXT,
  amount             NUMERIC(10,2) NOT NULL DEFAULT 0,
  shipping_address   JSONB,
  status             TEXT NOT NULL DEFAULT 'payée'
                     CHECK (status IN ('payée', 'expédiée', 'livrée')),
  lang               TEXT NOT NULL DEFAULT 'fr' CHECK (lang IN ('fr', 'en')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  shipped_at         TIMESTAMPTZ,
  delivered_at       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders (customer_id);

-- ── Demandes sur-mesure ────────────────────────────────
CREATE TABLE IF NOT EXISTS custom_requests (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                TEXT NOT NULL,
  email               TEXT NOT NULL,
  description         TEXT NOT NULL,
  budget              TEXT,
  reference_images    JSONB,
  status              TEXT NOT NULL DEFAULT 'nouvelle'
                      CHECK (status IN ('nouvelle', 'devis_envoyé', 'payée', 'terminée')),
  stripe_payment_link TEXT,
  lang                TEXT NOT NULL DEFAULT 'fr' CHECK (lang IN ('fr', 'en')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_custom_requests_status ON custom_requests (status);

-- ── Sécurité : RLS activé partout (le serveur utilise la clé service) ──
ALTER TABLE products        ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_images  ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers       ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders          ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_requests ENABLE ROW LEVEL SECURITY;

-- Lecture publique des produits disponibles + leurs images (boutique).
CREATE POLICY products_public_read ON products
  FOR SELECT USING (status = 'disponible');
CREATE POLICY product_images_public_read ON product_images
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM products p
      WHERE p.id = product_images.product_id
        AND p.status = 'disponible'
    )
  );

-- ── Maintien automatique de updated_at ─────────────────
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_products_updated ON products;
CREATE TRIGGER trg_products_updated
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_custom_requests_updated ON custom_requests;
CREATE TRIGGER trg_custom_requests_updated
  BEFORE UPDATE ON custom_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
