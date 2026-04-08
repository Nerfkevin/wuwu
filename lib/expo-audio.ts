const ExpoAudio = require('expo-audio') as any;

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

export type AudioPlayer = {
  id?: number;
  playing: boolean;
  muted?: boolean;
  loop?: boolean;
  paused?: boolean;
  isLoaded?: boolean;
  isAudioSamplingSupported?: boolean;
  isBuffering?: boolean;
  currentTime: number;
  duration: number;
  volume?: number;
  playbackRate?: number;
  shouldCorrectPitch?: boolean;
  currentStatus?: any;
  play(): void;
  pause(): void;
  stop(): void;
  remove(): void;
  replace?(source: any): void;
  seekTo(
    seconds: number,
    toleranceMillisBefore?: number,
    toleranceMillisAfter?: number
  ): Promise<void>;
  setPlaybackRate?(rate: number, pitchCorrectionQuality?: any): void;
  setAudioSamplingEnabled?(enabled: boolean): void;
  setActiveForLockScreen?(active: boolean, metadata?: any, options?: any): void;
  updateLockScreenMetadata?(metadata: any): void;
  clearLockScreenControls?(): void;
  addListener?(eventName: string, cb: (...args: any[]) => void): { remove(): void };
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
