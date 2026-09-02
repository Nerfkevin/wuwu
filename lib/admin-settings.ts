import * as SecureStore from 'expo-secure-store';

const UNLOCKED_KEY = 'admin_unlocked';
const TRACK_GAP_KEY = 'admin_track_gap_sec';
const START_DELAY_KEY = 'admin_start_delay_sec';

export const ADMIN_PASSWORD = 'hello120';
export const ADMIN_TAP_THRESHOLD = 7;

export const DEFAULT_TRACK_GAP_SEC = 5;
export const DEFAULT_START_DELAY_SEC = 3;
export const ADMIN_TIMING_MIN_SEC = 0;
export const ADMIN_TIMING_MAX_SEC = 10;
export const ADMIN_TIMING_STEP_SEC = 0.1;

export type AdminPlaybackSettings = {
  trackGapSec: number;
  /** Silence after play before first affirmation, ambient, and frequency audio. */
  startDelaySec: number;
};

const clampSec = (value: number, fallback: number): number => {
  if (!Number.isFinite(value)) return fallback;
  const stepped =
    Math.round(value / ADMIN_TIMING_STEP_SEC) * ADMIN_TIMING_STEP_SEC;
  // Kill floating-point dust from 0.1 steps (e.g. 1.3000000000000003).
  const rounded = Math.round(stepped * 10) / 10;
  return Math.max(ADMIN_TIMING_MIN_SEC, Math.min(ADMIN_TIMING_MAX_SEC, rounded));
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
