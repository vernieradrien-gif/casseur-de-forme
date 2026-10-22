import { setDecimalSeparator } from '../game/bignum';
import en from './en.json';
import fr from './fr.json';

export type TextKey = keyof typeof fr;
export type LanguageCode = 'fr' | 'en';

const dictionaries: Record<LanguageCode, Record<string, string>> = { fr, en };
let current: Record<string, string> = fr;
let currentCode: LanguageCode = 'fr';

export function setLanguage(lang: LanguageCode): void {
  currentCode = lang in dictionaries ? lang : 'fr';
  current = dictionaries[currentCode];
  setDecimalSeparator(currentCode === 'fr' ? ',' : '.');
  if (typeof document !== 'undefined') document.documentElement.lang = currentCode;
}

export function language(): LanguageCode {
  return currentCode;
}

/**
 * Texte traduit ; les `{nom}` sont remplacés par `params.nom`.
 * Les clés composées (`run.${id}.name`) sont acceptées ; une clé absente s'affiche telle quelle.
 */
export function t(key: TextKey | (string & {}), params: Record<string, string | number> = {}): string {
  const s = current[key] ?? (fr as Record<string, string>)[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k: string) => (k in params ? String(params[k]) : `{${k}}`));
}

/** Durée lisible (« 1 h 5 min », « 3 min 20 s »). */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return t('time.hm', { h, m });
  if (m >= 10) return t('time.m', { m });
  if (m > 0) return t('time.ms', { m, s: s % 60 });
  return t('time.s', { s });
}
