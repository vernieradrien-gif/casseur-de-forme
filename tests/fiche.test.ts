import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Fiche Google Play (docs/fiche-google-play.md) : chaque langue respecte les limites de la Play Console
 * et évite les mots que Google refuse dans le titre (« gratuit », « meilleur », « n° 1 »…).
 */
const doc = readFileSync('docs/fiche-google-play.md', 'utf8').replace(/\r\n/g, '\n');
const LANGS = ['en', 'fr', 'es', 'pt', 'de', 'it'];

/** Les 4 blocs d'une langue, dans l'ordre : titre, description courte, description longue, notes de version. */
function fields(lang: string): string[] {
  const m = doc.match(new RegExp(`<!-- fiche:${lang} -->([\\s\\S]*?)<!-- /fiche:${lang} -->`));
  if (!m) throw new Error(`langue absente : ${lang}`);
  // Découpe sur les intitulés en gras (« **Titre** : », « **Title**: »…).
  const parts = m[1].split(/\n\*\*[^*\n]+\*\*\s?:\s*\n/).slice(1);
  return parts.map((p) => p.trim());
}

const BANNED = /\b(free|gratuit|gratis|kostenlos|best|meilleur|mejor|melhor|beste|migliore|top|#1|n° ?1|new|nouveau)\b/i;

describe('fiche Google Play', () => {
  for (const lang of LANGS) {
    it(`${lang} : limites de la Play Console`, () => {
      const [title, short, full, notes] = fields(lang);
      expect(title.length).toBeGreaterThan(0);
      expect(title.length).toBeLessThanOrEqual(30);
      expect(title.startsWith('Prisma Blast')).toBe(true);
      expect(short.length).toBeLessThanOrEqual(80);
      expect(full.length).toBeGreaterThan(800);
      expect(full.length).toBeLessThanOrEqual(4000);
      expect(notes.length).toBeLessThanOrEqual(500);
      expect(title + ' ' + short).not.toMatch(BANNED);
    });
  }
});
