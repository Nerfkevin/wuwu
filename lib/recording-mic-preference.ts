import * as SecureStore from 'expo-secure-store';

const KEY = 'recording_mic_selection_v1';

export type RecordingMicPref = {
  uid: string;
  name: string;
};

export async function getRecordingMicPref(): Promise<RecordingMicPref | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as RecordingMicPref;
    if (typeof p?.uid === 'string' && typeof p?.name === 'string') {
      return p;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export async function setRecordingMicPref(pref: RecordingMicPref): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(pref));
}
