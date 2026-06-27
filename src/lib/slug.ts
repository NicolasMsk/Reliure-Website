/** Transforme un texte en slug URL : minuscules, sans accents, tirets. */
export function slugify(input: string): string {
  return input
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // retire les accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // non-alphanum → tiret
    .replace(/^-+|-+$/g, '');    // retire les tirets de bord
}
