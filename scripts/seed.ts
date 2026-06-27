/* Données de démo — insère/MAJ des produits par slug (idempotent).
   Usage : npx tsx scripts/seed.ts   (nécessite .env avec les clés Supabase)
   Les images de démo sont téléversées depuis des URLs libres de droits. */
import 'dotenv/config';
import { getSupabase } from '../src/lib/clients';
import { slugify } from '../src/lib/slug';
import { uploadProductImage } from '../src/lib/storage';

interface Seed { title_fr: string; title_en: string; description_fr: string; description_en: string; price: number; category: string; image: string; }

const SEEDS: Seed[] = [
  { title_fr: 'Bible familiale restaurée', title_en: 'Restored family Bible', description_fr: 'Restauration complète d\'une bible du XIXe siècle : couture refaite, cuir nourri, dorure ravivée.', description_en: 'Full restoration of a 19th-century Bible: resewn, nourished leather, revived gilding.', price: 380, category: 'bibles-restaurees', image: 'https://images.unsplash.com/photo-1504052434569-70ad5836ab65?w=800&q=80' },
  { title_fr: 'Bible brodée « Fleur de lys »', title_en: 'Embroidered Bible "Fleur de lys"', description_fr: 'Bible sur-mesure reliée cuir bordeaux, broderie or fil de soie, tranches dorées.', description_en: 'Bespoke Bible in burgundy leather, gold silk embroidery, gilt edges.', price: 620, category: 'bibles-brodees', image: 'https://images.unsplash.com/photo-1589998059171-988d887df646?w=800&q=80' },
  { title_fr: 'Missel ancien relié', title_en: 'Bound antique missal', description_fr: 'Reliure d\'un missel liturgique, dos à nerfs et fermoirs laiton.', description_en: 'Binding of a liturgical missal, raised bands and brass clasps.', price: 290, category: 'livres-religieux', image: 'https://images.unsplash.com/photo-1457369804613-52c61a468e7d?w=800&q=80' },
  { title_fr: 'Écrin de protection cuir', title_en: 'Leather protective case', description_fr: 'Coffret sur-mesure pour bible, intérieur velours, fermeture aimantée.', description_en: 'Bespoke case for a Bible, velvet interior, magnetic closure.', price: 180, category: 'coffrets-sacres', image: 'https://images.unsplash.com/photo-1524578271613-d550eacf6090?w=800&q=80' },
  { title_fr: 'Carnet relié cuir', title_en: 'Leather-bound notebook', description_fr: 'Carnet pleine peau, papier vergé, signet de soie.', description_en: 'Full-leather notebook, laid paper, silk bookmark.', price: 95, category: 'autres-reliures', image: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?w=800&q=80' },
  { title_fr: 'Évangéliaire doré', title_en: 'Gilded evangeliary', description_fr: 'Évangéliaire relié cuir noir, croix dorée à chaud, tranchefile main.', description_en: 'Evangeliary in black leather, gold-tooled cross, hand-sewn headband.', price: 540, category: 'livres-religieux', image: 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=800&q=80' },
];

async function fetchBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch image ${url}: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  const sb = getSupabase();
  for (const s of SEEDS) {
    const slug = slugify(s.title_fr);
    const row = {
      slug, title_fr: s.title_fr, title_en: s.title_en,
      description_fr: s.description_fr, description_en: s.description_en,
      price: s.price, category: s.category, status: 'disponible', weight_grams: 800,
    };
    const { data: prod, error } = await sb.from('products').upsert(row, { onConflict: 'slug' }).select().single();
    if (error) { console.error('upsert', slug, error.message); continue; }
    // image si le produit n'en a pas déjà
    const { data: existing } = await sb.from('product_images').select('id').eq('product_id', prod.id);
    if ((existing?.length ?? 0) === 0) {
      try {
        const buf = await fetchBuffer(s.image);
        const p = await uploadProductImage(prod.id, buf, 'image/jpeg', 'jpg', 0);
        await sb.from('product_images').insert({ product_id: prod.id, storage_path: p, sort_order: 0 });
        console.log('✓', slug, '(+image)');
      } catch (e: any) { console.warn('image', slug, e.message); }
    } else { console.log('✓', slug, '(déjà des images)'); }
  }
  console.log('Seed terminé.');
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
