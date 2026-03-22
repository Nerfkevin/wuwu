import { Platform } from 'react-native';
import { setAudioModeAsync } from 'expo-audio';
import type { AudioMetadata, AudioMode, AudioPlayer } from 'expo-audio';

const BACKGROUND_PLAYBACK_MODE: Partial<AudioMode> = {
  playsInSilentMode: true,
  allowsRecording: false,
  shouldPlayInBackground: true,
  interruptionMode: 'doNotMix',
};

const MIXED_PLAYBACK_MODE: Partial<AudioMode> = {
  ...BACKGROUND_PLAYBACK_MODE,
  interruptionMode: 'mixWithOthers',
};

export const configureBackgroundPlaybackAsync = async (overrides: Partial<AudioMode> = {}) => {
  const baseMode = Platform.OS === 'ios' ? MIXED_PLAYBACK_MODE : BACKGROUND_PLAYBACK_MODE;
  await setAudioModeAsync({
    ...baseMode,
    ...overrides,
  });
};

export const configureMixedPlaybackAsync = async (overrides: Partial<AudioMode> = {}) => {
  await setAudioModeAsync({
    ...MIXED_PLAYBACK_MODE,
    ...overrides,
  });
};

export const activateLockScreenControls = (
  player: AudioPlayer | null | undefined,
  metadata: AudioMetadata
) => {
  if (!player || Platform.OS !== 'android') {
    return;
  }

  try {
    player.setActiveForLockScreen(true, {
      artist: 'Wu-Wu',
      albumTitle: 'Wu-Wu',
      ...metadata,
    });
  } catch {
    // If another app owns the system media session, keep playback going without lock screen controls.
  }
};

export const updateLockScreenControls = (
  player: AudioPlayer | null | undefined,
  metadata: AudioMetadata
) => {
  if (!player || Platform.OS !== 'android') {
    return;
  }

  try {
    player.updateLockScreenMetadata({
      artist: 'Wu-Wu',
      albumTitle: 'Wu-Wu',
      ...metadata,
    });
  } catch {
    // Metadata updates are best-effort only.
  }
};

export const clearLockScreenControls = (player: AudioPlayer | null | undefined) => {
  if (!player || Platform.OS !== 'android') {
    return;
  }

  try {
    player.setActiveForLockScreen(false);
    player.clearLockScreenControls();
  } catch {
    // Ignore cleanup failures for an already-invalid or inactive media session.
  }
};

export const playAudioPlayer = (player: AudioPlayer | null | undefined) => {
  if (!player) {
    return false;
  }

  try {
    player.play();
    return true;
  } catch {
    return false;
  }
};
