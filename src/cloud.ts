import { registerPlugin } from '@capacitor/core';
import { WORKSHOP } from './game/config';
import type { MetaState } from './game/state';
import { isNative } from './platform';

/**
 * Sauvegarde dans le cloud avec le compte Google du joueur (Google Play Jeux, Android).
 * Le code natif est dans android/…/CloudSavePlugin.java ; sur le web, rien n'est disponible.
 */
interface CloudSavePlugin {
  isAvailable(): Promise<{ available: boolean }>;
  status(): Promise<{ signedIn: boolean }>;
  signIn(): Promise<{ signedIn: boolean }>;
  save(options: { data: string; description: string }): Promise<void>;
  load(): Promise<{ data: string | null }>;
}

const CloudSave = registerPlugin<CloudSavePlugin>('CloudSave');

export async function cloudAvailable(): Promise<boolean> {
  if (!isNative) return false;
  try {
    return (await CloudSave.isAvailable()).available;
  } catch {
    return false;
  }
}

export async function cloudSignedIn(): Promise<boolean> {
  try {
    return (await CloudSave.status()).signedIn;
  } catch {
    return false;
  }
}

export async function cloudSignIn(): Promise<boolean> {
  try {
    return (await CloudSave.signIn()).signedIn;
  } catch {
    return false;
  }
}

export async function cloudUpload(data: string, description: string): Promise<boolean> {
  try {
    await CloudSave.save({ data, description });
    return true;
  } catch {
    return false;
  }
}

export async function cloudDownload(): Promise<string | null> {
  try {
    return (await CloudSave.load()).data ?? null;
  } catch {
    return null;
  }
}

/** Score d'avancement : on garde toujours la sauvegarde la plus avancée (jamais de perte de progression). */
export function progressScore(meta: MetaState): number {
  const workshop = WORKSHOP.reduce((s, id) => s + meta.workshop[id], 0);
  return meta.bestLevel * 1e9 + meta.highestCleared * 1e6 + (workshop + meta.achievements.length) * 1e3 + Math.min(999, meta.stats.kills / 100);
}
