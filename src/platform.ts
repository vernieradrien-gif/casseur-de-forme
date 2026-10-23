import { Capacitor } from '@capacitor/core';

/** Application Android (Capacitor) ou navigateur. */
export const isNative = Capacitor.isNativePlatform();

export interface PlatformHooks {
  /** Bouton retour Android ; renvoie false pour quitter l'application. */
  onBack(): boolean;
  onPause(): void;
  onResume(): void;
}

/** Branche le bouton retour et la mise en arrière-plan (Android). */
export async function setupPlatform(hooks: PlatformHooks): Promise<void> {
  if (!isNative) return;
  const { App } = await import('@capacitor/app');
  await App.addListener('backButton', () => {
    if (!hooks.onBack()) void App.minimizeApp().catch(() => App.exitApp());
  });
  await App.addListener('appStateChange', ({ isActive }) => (isActive ? hooks.onResume() : hooks.onPause()));
}
