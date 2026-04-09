import * as SecureStore from 'expo-secure-store';

const STREAK_COUNT_KEY = 'streak_count';
const STREAK_LAST_DATE_KEY = 'streak_last_date';

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export type StreakResult = { before: number; after: number };

export async function getStreakCount(): Promise<number> {
  const val = await SecureStore.getItemAsync(STREAK_COUNT_KEY);
  return val ? parseInt(val, 10) : 0;
}

/**
 * Call once after a session completes. Returns the streak before and after.
 * - Same day: no change
 * - Yesterday: +1
 * - Older / never: reset to 1
 */
export async function updateStreakOnSession(): Promise<StreakResult> {
  const [countRaw, lastDate] = await Promise.all([
    SecureStore.getItemAsync(STREAK_COUNT_KEY),
    SecureStore.getItemAsync(STREAK_LAST_DATE_KEY),
  ]);

  const before = countRaw ? parseInt(countRaw, 10) : 0;
  const today = new Date();
  const todayStr = dateKey(today);

  if (lastDate === todayStr) {
    return { before, after: before };
  }

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const after = lastDate === dateKey(yesterday) ? before + 1 : 1;

  await Promise.all([
    SecureStore.setItemAsync(STREAK_COUNT_KEY, String(after)),
    SecureStore.setItemAsync(STREAK_LAST_DATE_KEY, todayStr),
  ]);

  return { before, after };
}
