-- ═══════════════════════════════════════════════════════
-- LIVRE DE SOIE — Migration : détails produits (2026-07-01)
-- À exécuter dans le SQL Editor de Supabase. Idempotent.
-- ═══════════════════════════════════════════════════════
ALTER TABLE products ADD COLUMN IF NOT EXISTS materials  TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS duration   TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS dimensions TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS technique  TEXT;
