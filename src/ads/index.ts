/**
 * Interface publicitaire unique (cahier des charges §2 et §7).
 * Jalon 1 : seule la version factice web existe ; AdMob arrivera au jalon 4.
 */
export interface AdService {
  /** Affiche une pub récompensée ; résout `true` si la récompense est acquise. */
  showRewarded(placement: string): Promise<boolean>;
  showInterstitial(): Promise<void>;
}

/** Version factice pour le web : accorde toujours la récompense, n'affiche rien. */
export const fakeAds: AdService = {
  async showRewarded() {
    return true;
  },
  async showInterstitial() {},
};

export const ads: AdService = fakeAds;
