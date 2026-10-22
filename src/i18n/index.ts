import fr from './fr.json';

export type TextKey = keyof typeof fr;

const dictionaries: Record<string, Record<TextKey, string>> = { fr };
let current: Record<TextKey, string> = fr;

export function setLanguage(lang: string): void {
  current = dictionaries[lang] ?? fr;
}

/** Texte traduit ; les `{nom}` sont remplacés par `params.nom`. */
export function t(key: TextKey, params: Record<string, string | number> = {}): string {
  const s = current[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k: string) => (k in params ? String(params[k]) : `{${k}}`));
}
