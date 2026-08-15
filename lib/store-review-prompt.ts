import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';

const REVIEW_DONE_KEY = 'store_review_completed';
export const REVIEW_SESSION_THRESHOLD = 2;

export async function hasCompletedStoreReviewFlow(): Promise<boolean> {
  return (await AsyncStorage.getItem(REVIEW_DONE_KEY)) === '1';
}

/** Mark that the user has been prompted or opened the store review page. */
export async function markStoreReviewCompleted(): Promise<void> {
  await AsyncStorage.setItem(REVIEW_DONE_KEY, '1');
}

export async function clearStoreReviewPromptState(): Promise<void> {
  await AsyncStorage.removeItem(REVIEW_DONE_KEY);
}

/**
 * Show the native in-app review dialog once the user hits N sessions
 * and we haven't already prompted / opened the store for them.
 */
export async function maybeRequestReviewAfterSessions(
  sessionCount: number
): Promise<boolean> {
  if (sessionCount < REVIEW_SESSION_THRESHOLD) return false;
  if (await hasCompletedStoreReviewFlow()) return false;

  try {
    if (!(await StoreReview.isAvailableAsync())) return false;
    await StoreReview.requestReview();
    await markStoreReviewCompleted();
    return true;
  } catch {
    return false;
  }
}
