import { registerPlugin } from '@capacitor/core';
import { BALANCE } from './game/config';
import { isNative } from './platform';
import type { Extra } from './storage/save';

/**
 * Demande d'avis Google Play intégrée au jeu (Android). Le code natif est dans
 * android/…/InAppReviewPlugin.java ; sur le web, rien ne s'affiche.
 * Google décide seul d'afficher ou non la fenêtre (quota par joueur) : le jeu ne sait jamais si elle est apparue
 * et ne donne aucune récompense pour un avis (interdit par Google Play).
 */
interface InAppReviewPlugin {
  requestReview(): Promise<void>;
}

const InAppReview = registerPlugin<InAppReviewPlugin>('InAppReview');

const DAY_MS = 86_400_000;

/** Le moment est-il bon pour demander un avis, juste après la victoire du niveau `level` ? */
export function reviewDue(extra: Extra, level: number, now: number): boolean {
  const cfg = BALANCE.review;
  if (level < cfg.firstAtLevel || extra.reviewAsks >= cfg.maxAsks) return false;
  return extra.reviewAsks === 0 || now - extra.reviewAskedAt >= cfg.minDaysBetween * DAY_MS;
}

/**
 * Note la demande dans la sauvegarde (même si Google ne l'affiche pas) et la lance sur Android,
 * `review.delay` secondes plus tard (le temps de voir la bannière de victoire).
 */
export function askReview(extra: Extra, now: number): void {
  extra.reviewAsks++;
  extra.reviewAskedAt = now;
  if (!isNative) return;
  setTimeout(() => void InAppReview.requestReview().catch(() => undefined), BALANCE.review.delay * 1000);
}
