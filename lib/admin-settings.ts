import * as SecureStore from 'expo-secure-store';

const UNLOCKED_KEY = 'admin_unlocked';
const TRACK_GAP_KEY = 'admin_track_gap_sec';
const START_DELAY_KEY = 'admin_start_delay_sec';

export const ADMIN_PASSWORD = 'hello120';
export const ADMIN_TAP_THRESHOLD = 7;

export const DEFAULT_TRACK_GAP_SEC = 5;
export const DEFAULT_START_DELAY_SEC = 3;
export const ADMIN_TIMING_MIN_SEC = 1;
export const ADMIN_TIMING_MAX_SEC = 10;

export type AdminPlaybackSettings = {
  trackGapSec: number;
  startDelaySec: number;
};

const clampSec = (value: number, fallback: number): number => {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(
    ADMIN_TIMING_MIN_SEC,
    Math.min(ADMIN_TIMING_MAX_SEC, Math.round(value))
  );
};

export async function isAdminUnlocked(): Promise<boolean> {
  return (await SecureStore.getItemAsync(UNLOCKED_KEY)) === '1';
}

export async function setAdminUnlocked(unlocked: boolean): Promise<void> {
  if (unlocked) {
    await SecureStore.setItemAsync(UNLOCKED_KEY, '1');
  } else {
    await SecureStore.deleteItemAsync(UNLOCKED_KEY);
  }
}

export async function getAdminPlaybackSettings(): Promise<AdminPlaybackSettings> {
  const [gapRaw, delayRaw] = await Promise.all([
    SecureStore.getItemAsync(TRACK_GAP_KEY),
    SecureStore.getItemAsync(START_DELAY_KEY),
  ]);
  return {
    trackGapSec: clampSec(
      gapRaw != null ? Number(gapRaw) : DEFAULT_TRACK_GAP_SEC,
      DEFAULT_TRACK_GAP_SEC
    ),
    startDelaySec: clampSec(
      delayRaw != null ? Number(delayRaw) : DEFAULT_START_DELAY_SEC,
      DEFAULT_START_DELAY_SEC
    ),
  };
}

export async function setTrackGapSec(seconds: number): Promise<number> {
  const next = clampSec(seconds, DEFAULT_TRACK_GAP_SEC);
  await SecureStore.setItemAsync(TRACK_GAP_KEY, String(next));
  return next;
}

export async function setStartDelaySec(seconds: number): Promise<number> {
  const next = clampSec(seconds, DEFAULT_START_DELAY_SEC);
  await SecureStore.setItemAsync(START_DELAY_KEY, String(next));
  return next;
}

export function verifyAdminPassword(password: string): boolean {
  return password.trim() === ADMIN_PASSWORD;
}
