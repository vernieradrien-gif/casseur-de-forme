/**
 * Interface publicitaire unique (cahier des charges §2 et §8) : seulement des pubs récompensées
 * (`showRewarded`), affichées quand le joueur les demande. Version factice sur le web, AdMob
 * (identifiants de test uniquement) avec consentement UMP sur Android.
 */
export interface AdService {
  init(): Promise<void>;
  /** Affiche une pub récompensée ; résout `true` si la récompense est acquise. */
  showRewarded(placement: string): Promise<boolean>;
  /** Le formulaire de consentement peut être rouvert (Android). */
  consentAvailable(): boolean;
  showConsent(): Promise<void>;
}

export type RewardPlacement = 'continue' | 'doubleDiamonds' | 'doubleOffline' | 'boost';

let service: AdService | null = null;

/** Choisit l'implémentation selon la plateforme (chargée à la demande). */
export async function createAds(native: boolean): Promise<AdService> {
  if (service) return service;
  if (native) {
    try {
      const { AdMobService } = await import('./admob');
      service = new AdMobService();
    } catch {
      const { FakeAds } = await import('./fake');
      service = new FakeAds();
    }
  } else {
    const { FakeAds } = await import('./fake');
    service = new FakeAds();
  }
  await service.init().catch(() => {});
  return service;
}
