/* Données de démo — produits soignés (descriptions riches + plusieurs photos).
   Usage : npx tsx scripts/seed.ts   (nécessite .env avec les clés Supabase)
   ⚠️ DÉMO : pour chaque produit, ce script REMPLACE les images existantes par le
   jeu ci-dessous (idempotent). À ne pas relancer une fois les vraies photos
   ajoutées via l'admin, sous peine de les écraser.
   Images : URLs libres de droits (Unsplash) — à remplacer par les vraies photos. */
import 'dotenv/config';
import { getSupabase } from '../src/lib/clients';
import { slugify } from '../src/lib/slug';
import { uploadProductImage, deleteStorageObject } from '../src/lib/storage';

interface Seed {
  title_fr: string; title_en: string;
  description_fr: string; description_en: string;
  price: number; category: string; weight_grams: number;
  images: string[];
}

const img = (id: string) => `https://images.unsplash.com/${id}?w=900&q=80`;

const SEEDS: Seed[] = [
  {
    title_fr: 'Bible familiale restaurée',
    title_en: 'Restored family Bible',
    description_fr:
      "Une bible familiale du XIXᵉ siècle rendue à sa dignité d'origine.\n\n" +
      "Le corps d'ouvrage a été entièrement démonté puis recousu à la main sur ruban de lin. Le cuir a été nettoyé, nourri et reteinté, les coiffes refaites et les nerfs du dos remis en valeur. Les rousseurs des pages ont été atténuées avec soin.\n\n" +
      "Reliure plein cuir · dorure ravivée à la feuille · tranchefile cousue main. Une pièce unique, porteuse d'une histoire de famille.",
    description_en:
      "A 19th-century family Bible restored to its original dignity.\n\n" +
      "The text block was fully disbound and hand-sewn anew on linen tapes. The leather was cleaned, nourished and re-toned, the headcaps rebuilt and the spine bands revived. Page foxing was gently reduced.\n\n" +
      "Full-leather binding · gilding revived with gold leaf · hand-sewn headband. A unique piece carrying a family's story.",
    price: 380, category: 'bibles-restaurees', weight_grams: 950,
    images: ['photo-1504052434569-70ad5836ab65', 'photo-1532012197267-da84d127e765', 'photo-1456513080510-7bf3a84b82f8'].map(img),
  },
  {
    title_fr: 'Bible brodée « Fleur de lys »',
    title_en: 'Embroidered Bible — "Fleur de lys"',
    description_fr:
      "Une création sur-mesure où la reliure d'art rencontre la broderie.\n\n" +
      "Reliée plein cuir bordeaux, cette bible est ornée d'une fleur de lys brodée à la main au fil de soie et rehaussée d'or. Les tranches sont dorées à la feuille, le signet en soie assorti.\n\n" +
      "Cuir pleine fleur · broderie main fil de soie & or · tranches dorées · étui de protection offert. Idéale pour un mariage, un baptême ou une transmission.",
    description_en:
      "A bespoke creation where fine binding meets embroidery.\n\n" +
      "Bound in full burgundy leather, this Bible features a hand-embroidered fleur-de-lys in silk thread highlighted with gold. The edges are gold-leafed, with a matching silk bookmark.\n\n" +
      "Full-grain leather · hand silk-and-gold embroidery · gilt edges · protective case included. Perfect for a wedding, christening or family heirloom.",
    price: 620, category: 'bibles-brodees', weight_grams: 900,
    images: ['photo-1589998059171-988d887df646', 'photo-1543002588-bfa74002ed7e', 'photo-1481627834876-b7833e8f5570'].map(img),
  },
  {
    title_fr: 'Missel ancien relié',
    title_en: 'Bound antique missal',
    description_fr:
      "Un missel liturgique remis en reliure dans la tradition.\n\n" +
      "Dos à nerfs, plats de cuir sombre estampés à froid, fermoirs en laiton patiné. L'ouvrage a été consolidé page à page pour traverser encore les décennies.\n\n" +
      "Cuir & laiton · dos à nerfs · estampage à froid. Un objet de dévotion solide et sobre.",
    description_en:
      "A liturgical missal rebound in the traditional manner.\n\n" +
      "Raised-band spine, dark cold-tooled leather boards, patinated brass clasps. The work was consolidated page by page to last for decades to come.\n\n" +
      "Leather & brass · raised bands · cold tooling. A solid, understated devotional object.",
    price: 290, category: 'livres-religieux', weight_grams: 800,
    images: ['photo-1457369804613-52c61a468e7d', 'photo-1474932430478-367dbb6832c1', 'photo-1495446815901-a7297e633e8d'].map(img),
  },
  {
    title_fr: 'Écrin de protection cuir',
    title_en: 'Leather protective case',
    description_fr:
      "Un écrin sur-mesure pour protéger et magnifier une bible ou un objet de dévotion.\n\n" +
      "Cuir fauve cousu main, intérieur garni de velours bordeaux, fermeture aimantée discrète. Réalisé aux dimensions exactes de l'ouvrage confié.\n\n" +
      "Cuir & velours · fait main · sur-mesure. Pour conserver et transmettre en toute sécurité.",
    description_en:
      "A bespoke case to protect and enhance a Bible or devotional object.\n\n" +
      "Hand-sewn tan leather, lined with burgundy velvet, discreet magnetic closure. Made to the exact dimensions of the entrusted work.\n\n" +
      "Leather & velvet · handmade · made to measure. To preserve and pass on safely.",
    price: 180, category: 'coffrets-sacres', weight_grams: 600,
    images: ['photo-1524578271613-d550eacf6090', 'photo-1521587760476-6c12a4b040da', 'photo-1512820790803-83ca734da794'].map(img),
  },
  {
    title_fr: 'Carnet relié cuir',
    title_en: 'Leather-bound notebook',
    description_fr:
      "Un carnet pleine peau pour l'écriture quotidienne ou le journal spirituel.\n\n" +
      "Couture apparente sur le dos, papier vergé crème, signet de soie et coins arrondis. Le cuir prend une belle patine avec le temps.\n\n" +
      "Pleine peau · papier vergé · couture apparente. Disponible en plusieurs teintes sur demande.",
    description_en:
      "A full-leather notebook for daily writing or a spiritual journal.\n\n" +
      "Exposed spine sewing, cream laid paper, silk bookmark and rounded corners. The leather develops a beautiful patina over time.\n\n" +
      "Full leather · laid paper · exposed sewing. Available in several shades on request.",
    price: 95, category: 'autres-reliures', weight_grams: 350,
    images: ['photo-1512820790803-83ca734da794', 'photo-1456513080510-7bf3a84b82f8', 'photo-1532012197267-da84d127e765'].map(img),
  },
  {
    title_fr: 'Évangéliaire doré',
    title_en: 'Gilded evangeliary',
    description_fr:
      "Un évangéliaire à la présence solennelle, pensé pour la liturgie.\n\n" +
      "Reliure plein cuir noir, grande croix dorée à chaud sur le plat supérieur, tranchefile cousue main et tranches dorées. Le dos à nerfs souligne la noblesse de l'ouvrage.\n\n" +
      "Cuir noir · dorure à chaud · tranches dorées. Une pièce de cérémonie.",
    description_en:
      "An evangeliary with a solemn presence, made for the liturgy.\n\n" +
      "Full black leather binding, large gold-tooled cross on the upper board, hand-sewn headband and gilt edges. The raised-band spine underlines the nobility of the work.\n\n" +
      "Black leather · gold tooling · gilt edges. A ceremonial piece.",
    price: 540, category: 'livres-religieux', weight_grams: 1000,
    images: ['photo-1543002588-bfa74002ed7e', 'photo-1589998059171-988d887df646', 'photo-1474932430478-367dbb6832c1'].map(img),
  },
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
      price: s.price, category: s.category, status: 'disponible', weight_grams: s.weight_grams,
    };
    const { data: prod, error } = await sb.from('products').upsert(row, { onConflict: 'slug' }).select().single();
    if (error) { console.error('upsert', slug, error.message); continue; }

    // Réinitialise le jeu d'images (DÉMO) : supprime les anciennes puis ré-uploade.
    const { data: existing } = await sb.from('product_images').select('id, storage_path').eq('product_id', prod.id);
    for (const im of existing ?? []) { try { await deleteStorageObject(im.storage_path); } catch { /* best effort */ } }
    await sb.from('product_images').delete().eq('product_id', prod.id);

    let n = 0;
    for (let i = 0; i < s.images.length; i++) {
      try {
        const buf = await fetchBuffer(s.images[i]);
        const path = await uploadProductImage(prod.id, buf, 'image/jpeg', 'jpg', i);
        await sb.from('product_images').insert({ product_id: prod.id, storage_path: path, sort_order: i });
        n += 1;
      } catch (e: any) { console.warn('image', slug, i, e.message); }
    }
    console.log(`✓ ${slug} (${n} photo(s))`);
  }
  console.log('Seed terminé.');
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
