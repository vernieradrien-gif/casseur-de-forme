import { AdMob, AdmobConsentStatus, MaxAdContentRating, RewardAdPluginEvents } from '@capacitor-community/admob';
import type { AdmobConsentInfo } from '@capacitor-community/admob';
import type { PluginListenerHandle } from '@capacitor/core';
import type { AdService } from './index';

/**
 * AdMob sur Android, avec les identifiants de TEST fournis par Google uniquement
 * (https://developers.google.com/admob/android/test-ads). Avant publication, il faudra
 * les remplacer par ceux du compte AdMob du propriétaire (voir docs/publication.md).
 * Seules des pubs récompensées existent : elles ne s'affichent que quand le joueur les demande.
 */
export const ADMOB_TEST_IDS = {
  app: 'ca-app-pub-3940256099942544~3347511713',
  rewarded: 'ca-app-pub-3940256099942544/5224354917',
};

/** Sécurité : une pub qui ne se ferme jamais ne bloque pas le jeu. */
const AD_TIMEOUT_MS = 120_000;

export class AdMobService implements AdService {
  private canRequestAds = false;
  private privacyRequired = false;
  private sdkStarted = false;
  private busy = false;

  async init(): Promise<void> {
    await this.gatherConsent();
  }

  /**
   * RGPD : le consentement (Google UMP) est demandé d'abord ; le SDK publicitaire n'est démarré
   * et aucune pub n'est demandée tant que Google n'indique pas que c'est permis.
   */
  private async gatherConsent(): Promise<void> {
    try {
      let info = await AdMob.requestConsentInfo();
      if (info.isConsentFormAvailable && info.status === AdmobConsentStatus.REQUIRED) info = await AdMob.showConsentForm();
      this.apply(info);
    } catch {
      // Pas de réponse (hors ligne…) : aucune pub tant que le consentement n'est pas connu.
      this.canRequestAds = false;
    }
    await this.startSdk();
  }

  private apply(info: AdmobConsentInfo): void {
    this.canRequestAds = info.canRequestAds;
    this.privacyRequired = String(info.privacyOptionsRequirementStatus) === 'REQUIRED';
  }

  private async startSdk(): Promise<void> {
    if (!this.canRequestAds || this.sdkStarted) return;
    // Contenu des pubs limité à « accord parental » (jeu tous publics à partir de 13 ans).
    await AdMob.initialize({ initializeForTesting: true, maxAdContentRating: MaxAdContentRating.ParentalGuidance });
    this.sdkStarted = true;
  }

  /** Résout seulement quand la pub est FERMÉE (le son du jeu ne revient pas pendant la pub). */
  async showRewarded(): Promise<boolean> {
    if (this.busy) return false;
    this.busy = true;
    try {
      // Consentement inconnu au démarrage (par exemple hors ligne) : nouvelle demande.
      if (!this.canRequestAds || !this.sdkStarted) await this.gatherConsent();
      if (!this.canRequestAds || !this.sdkStarted) return false;
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

  /** Le bouton « Consentement publicités » n'apparaît que là où Google l'exige (Europe, Royaume-Uni…). */
  consentAvailable(): boolean {
    return this.privacyRequired;
  }

  async showConsent(): Promise<void> {
    try {
      await AdMob.showPrivacyOptionsForm();
      this.apply(await AdMob.requestConsentInfo());
      await this.startSdk();
    } catch {
      // Formulaire indisponible.
    }
  }
}
