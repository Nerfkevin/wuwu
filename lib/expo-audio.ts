import type { AudioPlayer } from 'expo-audio';

const ExpoAudio = require('expo-audio') as any;

export type { AudioPlayer };

export type PermissionResponseLike = {
  status?: string;
  granted: boolean;
};

export type AudioModeLike = {
  playsInSilentMode?: boolean;
  allowsRecording?: boolean;
  shouldPlayInBackground?: boolean;
  shouldRouteThroughEarpiece?: boolean;
  interruptionMode?: 'mixWithOthers' | 'doNotMix' | 'duckOthers';
  allowsBackgroundRecording?: boolean;
};

export type RecordingInput = {
  name: string;
  type: string;
  uid: string;
};

export type AudioRecorder = {
  uri: string | null;
  prepareToRecordAsync(options?: any): Promise<void>;
  record(options?: any): void;
  stop(): Promise<void>;
  pause?(): void;
  getStatus?(): any;
  getAvailableInputs?(): RecordingInput[];
  getCurrentInput?(): Promise<RecordingInput>;
  setInput?(inputUid: string): void;
};

export const RecordingPresets = ExpoAudio.RecordingPresets as Record<string, any>;

export const createAudioPlayer = (
  source?: string | number | null | { uri?: string; assetId?: number; headers?: Record<string, string> },
  options?: { updateInterval?: number; downloadFirst?: boolean; keepAudioSessionActive?: boolean }
): AudioPlayer => ExpoAudio.createAudioPlayer(source, options);

export const getRecordingPermissionsAsync = async (): Promise<PermissionResponseLike> =>
  ExpoAudio.getRecordingPermissionsAsync();

export const requestRecordingPermissionsAsync = async (): Promise<PermissionResponseLike> =>
  ExpoAudio.requestRecordingPermissionsAsync();

export const setAudioModeAsync = async (mode: AudioModeLike): Promise<void> =>
  ExpoAudio.setAudioModeAsync(mode);

export const useAudioRecorder = (
  options: any,
  statusListener?: (status: any) => void
): AudioRecorder => ExpoAudio.useAudioRecorder(options, statusListener);

export const useAudioRecorderState = <T = any>(recorder: AudioRecorder, interval?: number): T =>
  ExpoAudio.useAudioRecorderState(recorder, interval);
