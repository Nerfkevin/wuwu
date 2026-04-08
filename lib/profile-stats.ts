import AsyncStorage from '@react-native-async-storage/async-storage';

const TOTAL_PLAY_MS_KEY = 'profile_total_play_ms';
const SESSION_COUNT_KEY = 'profile_session_count';

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

/** Whole hours for the stat tile (floor). */
export function formatHoursPlayed(totalPlayMs: number): string {
  const h = Math.floor(totalPlayMs / 3_600_000);
  return String(h);
}
