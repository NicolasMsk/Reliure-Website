/* Remplit UNIQUEMENT les 4 champs « Détails » (materials/duration/dimensions/technique)
   des produits de démo, identifiés par slug. NE TOUCHE PAS aux images ni aux autres champs.
   Sûr à relancer, sûr même si de vraies photos ont été ajoutées via l'admin.
   Prérequis : migration 2026-07-01-product-details.sql appliquée dans Supabase.
   Usage : npx tsx scripts/fill-product-details.ts   (nécessite .env avec les clés Supabase) */
import 'dotenv/config';
import { getSupabase } from '../src/lib/clients';
import { slugify } from '../src/lib/slug';

interface Detail {
  title_fr: string;
  materials: string; duration: string; dimensions: string; technique: string;
}

const DETAILS: Detail[] = [
  {
    title_fr: 'Bible familiale restaurée',
    materials: 'Cuir pleine fleur, fil de lin, dorure à la feuille', duration: '~25 h sur 3 semaines', dimensions: '24 × 17 × 6 cm', technique: 'Démontage, couture main sur ruban, coiffes refaites, dorure ravivée',
  },
  {
    title_fr: 'Bible brodée « Fleur de lys »',
    materials: 'Cuir bordeaux pleine fleur, fil de soie, or, tranches dorées', duration: '~40 h', dimensions: '22 × 15 × 5 cm', technique: 'Reliure plein cuir, broderie main soie & or, tranches dorées à la feuille',
  },
  {
    title_fr: 'Missel ancien relié',
    materials: 'Cuir sombre, laiton, papier consolidé', duration: '~20 h', dimensions: '20 × 14 × 4 cm', technique: 'Dos à nerfs, estampage à froid, fermoirs laiton',
  },
  {
    title_fr: 'Écrin de protection cuir',
    materials: 'Cuir fauve, velours bordeaux', duration: '~12 h', dimensions: 'Sur-mesure (selon l\'ouvrage)', technique: 'Couture main, intérieur velours, fermeture aimantée',
  },
  {
    title_fr: 'Carnet relié cuir',
    materials: 'Cuir pleine peau, papier vergé crème, soie', duration: '~6 h', dimensions: '21 × 14 × 2 cm', technique: 'Couture apparente, coins arrondis, signet de soie',
  },
  {
    title_fr: 'Évangéliaire doré',
    materials: 'Cuir noir, dorure à chaud, tranches dorées', duration: '~35 h', dimensions: '26 × 18 × 5 cm', technique: 'Reliure plein cuir, croix dorée à chaud, dos à nerfs, tranchefile main',
  },
];

async function main() {
  const sb = getSupabase();
  let updated = 0;
  for (const d of DETAILS) {
    const slug = slugify(d.title_fr);
    const { data, error } = await sb
      .from('products')
      .update({ materials: d.materials, duration: d.duration, dimensions: d.dimensions, technique: d.technique })
      .eq('slug', slug)
      .select('id');
    if (error) { console.error('update', slug, error.message); continue; }
    if (!data || data.length === 0) { console.warn(`— ${slug} : aucun produit avec ce slug (ignoré)`); continue; }
    updated += data.length;
    console.log(`✓ ${slug}`);
  }
  console.log(`Terminé — ${updated} produit(s) enrichi(s). Images inchangées.`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
