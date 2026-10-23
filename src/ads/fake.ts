import { t } from '../i18n';
import type { AdService } from './index';

/** Durée de la fausse pub (ms). */
const FAKE_AD_MS = 1200;

/**
 * Version factice pour le web : un court écran « Publicité (démo) », puis la récompense
 * est toujours accordée. Aucune vraie publicité, aucun traceur.
 */
export class FakeAds implements AdService {
  async init(): Promise<void> {}

  showRewarded(): Promise<boolean> {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'fake-ad';
      overlay.setAttribute('role', 'dialog');
      const title = document.createElement('div');
      title.className = 'fake-ad-title';
      title.textContent = t('ad.title');
      const text = document.createElement('div');
      text.className = 'fake-ad-text';
      text.textContent = t('ad.text');
      const bar = document.createElement('div');
      bar.className = 'progress';
      const fill = document.createElement('div');
      fill.className = 'progress-fill fake-ad-fill';
      fill.style.animationDuration = `${FAKE_AD_MS}ms`;
      bar.appendChild(fill);
      overlay.append(title, text, bar);
      document.body.appendChild(overlay);
      setTimeout(() => {
        overlay.remove();
        resolve(true);
      }, FAKE_AD_MS);
    });
  }

  async showInterstitial(): Promise<void> {}

  consentAvailable(): boolean {
    return false;
  }

  async showConsent(): Promise<void> {}
}
