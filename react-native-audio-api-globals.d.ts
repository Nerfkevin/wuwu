/**
 * Runtime globals registered by react-native-audio-api native code.
 * Declared so `tsc` does not error when typechecking that package's sources.
 */
export {};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  var createAudioContext: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  var createOfflineAudioContext: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  var createAudioRecorder: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  var createAudioDecoder: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  var createAudioStretcher: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  var AudioEventEmitter: any;
}
