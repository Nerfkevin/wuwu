import AsyncStorage from '@react-native-async-storage/async-storage';

const TOTAL_PLAY_MS_KEY = 'profile_total_play_ms';
const SESSION_COUNT_KEY = 'profile_session_count';
const ONBOARDING_FIRST_SESSION_COMMITTED_KEY =
  'profile_onboarding_first_session_committed';

export type ProfileStats = {
  totalPlayMs: number;
  sessionCount: number;
};

export async function getProfileStats(): Promise<ProfileStats> {
  const [totalRaw, countRaw] = await Promise.all([
    AsyncStorage.getItem(TOTAL_PLAY_MS_KEY),
    AsyncStorage.getItem(SESSION_COUNT_KEY),
  ]);
  const totalPlayMs = Math.max(0, Number(totalRaw ?? 0)) || 0;
  const sessionCount = Math.max(0, Math.floor(Number(countRaw ?? 0))) || 0;
  return { totalPlayMs, sessionCount };
}

/** Persist after a playback session (only when user had active play time). */
export async function recordPlaybackSession(elapsedMs: number): Promise<void> {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return;
  const rounded = Math.round(elapsedMs);
  const { totalPlayMs, sessionCount } = await getProfileStats();
  await Promise.all([
    AsyncStorage.setItem(TOTAL_PLAY_MS_KEY, String(totalPlayMs + rounded)),
    AsyncStorage.setItem(SESSION_COUNT_KEY, String(sessionCount + 1)),
  ]);
}

/**
 * Merge the onboarding “first session” timer into profile stats once.
 * Idempotent so screen16 remounts / replays do not double-count.
 */
export async function commitOnboardingFirstSessionToProfile(
  elapsedMs: number
): Promise<void> {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return;
  const done = await AsyncStorage.getItem(ONBOARDING_FIRST_SESSION_COMMITTED_KEY);
  if (done === '1') return;
  await recordPlaybackSession(elapsedMs);
  await AsyncStorage.setItem(ONBOARDING_FIRST_SESSION_COMMITTED_KEY, '1');
}

export type PlayTimeFormat = {
  value: string;
  label: string;
};

/**
 * Smart time formatter:
 *   < 1 hour  → "M:SS"  + "Minutes Played"
 *   < 24 hrs  → "H:MM"  + "Hours Played"
 *   >= 24 hrs → "D.D"   + "Days Played"
 */
export function formatPlayTime(totalPlayMs: number): PlayTimeFormat {
  const totalSeconds = Math.floor(Math.max(0, totalPlayMs) / 1000);
  const totalMinutes = totalSeconds / 60;
  const totalHours = totalMinutes / 60;

  if (totalHours >= 24) {
    return { value: (totalHours / 24).toFixed(1), label: 'Days Played' };
  }
  if (totalHours >= 1) {
    const h = Math.floor(totalHours);
    const m = Math.floor(totalMinutes % 60);
    return { value: `${h}:${String(m).padStart(2, '0')}`, label: 'Hours Played' };
  }
  const m = Math.floor(totalMinutes);
  const s = totalSeconds % 60;
  return { value: `${m}:${String(s).padStart(2, '0')}`, label: 'Minutes Played' };
}
