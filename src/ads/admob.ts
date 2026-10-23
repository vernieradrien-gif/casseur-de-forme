import { AdMob, AdmobConsentStatus, InterstitialAdPluginEvents, RewardAdPluginEvents } from '@capacitor-community/admob';
import type { PluginListenerHandle } from '@capacitor/core';
import type { AdService } from './index';

/**
 * AdMob sur Android, avec les identifiants de TEST fournis par Google uniquement
 * (https://developers.google.com/admob/android/test-ads). Avant publication, il faudra
 * les remplacer par ceux du compte AdMob du propriétaire (voir docs/publication.md).
 */
export const ADMOB_TEST_IDS = {
  app: 'ca-app-pub-3940256099942544~3347511713',
  rewarded: 'ca-app-pub-3940256099942544/5224354917',
  interstitial: 'ca-app-pub-3940256099942544/1033173712',
};

/** Sécurité : une pub qui ne se ferme jamais ne bloque pas le jeu. */
const AD_TIMEOUT_MS = 120_000;

export class AdMobService implements AdService {
  private canRequestAds = false;
  private busy = false;

  async init(): Promise<void> {
    await AdMob.initialize({ initializeForTesting: true });
    // Consentement RGPD (UMP) : formulaire affiché si nécessaire (Espace économique européen).
    try {
      let info = await AdMob.requestConsentInfo();
      if (info.isConsentFormAvailable && info.status === AdmobConsentStatus.REQUIRED) {
        info = await AdMob.showConsentForm();
      }
      this.canRequestAds = info.canRequestAds;
    } catch {
      this.canRequestAds = true;
    }
  }

  /** Résout seulement quand la pub est FERMÉE (le son du jeu ne revient pas pendant la pub). */
  async showRewarded(): Promise<boolean> {
    if (this.busy || !this.canRequestAds) return false;
    this.busy = true;
    try {
      await AdMob.prepareRewardVideoAd({ adId: ADMOB_TEST_IDS.rewarded, isTesting: true, immersiveMode: true });
      return await new Promise<boolean>((resolve) => {
        let rewarded = false;
        let finished = false;
        const handles: PluginListenerHandle[] = [];
        const done = () => {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          for (const h of handles) void h.remove();
          resolve(rewarded);
        };
        const timer = setTimeout(done, AD_TIMEOUT_MS);
        void Promise.all([
          AdMob.addListener(RewardAdPluginEvents.Rewarded, () => (rewarded = true)),
          AdMob.addListener(RewardAdPluginEvents.Dismissed, done),
          AdMob.addListener(RewardAdPluginEvents.FailedToShow, done),
        ]).then((hs) => {
          handles.push(...hs);
          AdMob.showRewardVideoAd()
            .then(() => (rewarded = true))
            .catch(done);
        });
      });
    } catch {
      return false;
    } finally {
      this.busy = false;
    }
  }

  async showInterstitial(): Promise<void> {
    if (this.busy || !this.canRequestAds) return;
    this.busy = true;
    try {
      await AdMob.prepareInterstitial({ adId: ADMOB_TEST_IDS.interstitial, isTesting: true, immersiveMode: true });
      await new Promise<void>((resolve) => {
        let finished = false;
        const handles: PluginListenerHandle[] = [];
        const done = () => {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          for (const h of handles) void h.remove();
          resolve();
        };
        const timer = setTimeout(done, AD_TIMEOUT_MS);
        void Promise.all([
          AdMob.addListener(InterstitialAdPluginEvents.Dismissed, done),
          AdMob.addListener(InterstitialAdPluginEvents.FailedToShow, done),
        ]).then((hs) => {
          handles.push(...hs);
          AdMob.showInterstitial().catch(done);
        });
      });
    } catch {
      // Pas de pub disponible : on continue sans.
    } finally {
      this.busy = false;
    }
  }

  consentAvailable(): boolean {
    return true;
  }

  async showConsent(): Promise<void> {
    try {
      await AdMob.showPrivacyOptionsForm();
    } catch {
      try {
        const info = await AdMob.showConsentForm();
        this.canRequestAds = info.canRequestAds;
      } catch {
        // Formulaire indisponible (hors EEE).
      }
    }
  }
}
