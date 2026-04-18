import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Animated,
  Easing,
  TextInput,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Modal,
  ActivityIndicator,
  Dimensions,
} from 'react-native';

const { width: screenWidth } = Dimensions.get('window');
const isSmallDevice = screenWidth < 380;

function ScaleBtn({
  onPress,
  onPressIn,
  onPressOut,
  disabled,
  style,
  children,
  scaleTo = 0.88,
}: {
  onPress?: () => void;
  onPressIn?: () => void;
  onPressOut?: () => void;
  disabled?: boolean;
  style?: object | object[];
  children: React.ReactNode;
  scaleTo?: number;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const handlePressIn = () => {
    Animated.spring(scale, { toValue: scaleTo, useNativeDriver: true, speed: 50, bounciness: 0 }).start();
    onPressIn?.();
  };
  const handlePressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 6 }).start();
    onPressOut?.();
  };
  // Pull flex/layout off the style array so it sits on the TouchableOpacity
  const styleArr = Array.isArray(style) ? style : style ? [style] : [];
  const flatStyle = StyleSheet.flatten(styleArr) as Record<string, unknown>;
  const { flex, flexGrow, flexShrink, flexBasis, alignSelf, ...innerStyle } = flatStyle;
  const outerStyle = { flex, flexGrow, flexShrink, flexBasis, alignSelf } as object;
  return (
    <TouchableOpacity onPress={onPress} onPressIn={handlePressIn} onPressOut={handlePressOut} disabled={disabled} activeOpacity={1} style={outerStyle}>
      <Animated.View style={[innerStyle, { transform: [{ scale }] }]}>{children}</Animated.View>
    </TouchableOpacity>
  );
}
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createAudioPlayer,
  getRecordingPermissionsAsync,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from '@/lib/expo-audio';
import type { AudioPlayer } from '@/lib/expo-audio';
import { AudioBuffer, AudioContext } from '@/lib/audio-api-core';
import { AFFIRMATION_PILLARS, PillarKey } from '@/constants/affirmations';
import { Colors, Fonts } from '@/constants/theme';
import AnimatedGlow, { GlowEvent } from '@/lib/animated-glow';
import { GlowPresets } from '@/constants/glow';
import AffirmationCard from './components/affirmation-card';
import TrimEditor from './components/trim-editor';
import {
  normalizeAndCompressVoice,
  renderBufferToFileWithEffects,
  runOfflineEnhance,
  trimBuffer,
} from './recording-audio';
import { saveRecordingToDevice } from '@/lib/recording-store';
import { getRecordingMicPref } from '@/lib/recording-mic-preference';
import {
  activateLockScreenControls,
  clearLockScreenControls,
  configureBackgroundPlaybackAsync,
  configureMixedPlaybackAsync,
} from '@/lib/audio-playback';
import { usePostHog, usePostHogScreenViewed } from '@/lib/posthog';

const recordColor = '#FF0000';
const TRIM_MIN_GAP_SECONDS = 0.35;
const TRIM_EPSILON = 0.0001;
const RECORDING_EFFECTS_STORAGE_KEY = 'recording_effect_preferences_v1';

const normalizeParam = (value?: string | string[]) =>
  Array.isArray(value) ? value[0] : value;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

type RecordingScreenProps = { reviewMode?: boolean };

export default function RecordingScreen({ reviewMode }: RecordingScreenProps = {}) {
  usePostHogScreenViewed({
    screen: reviewMode ? 'add/review' : 'add/recording',
    component: reviewMode ? 'ReviewScreen' : 'RecordingScreen',
  });
  const ph = usePostHog();
  const router = useRouter();
  const params = useLocalSearchParams<{ text?: string; pillar?: string; writeOwn?: string; onboarding?: string }>();
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder);
  const [audioUri, setAudioUri] = useState('');
  const [hasRecorded, setHasRecorded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isApplyingEnhance, setIsApplyingEnhance] = useState(false);
  const [isProcessingRecording, setIsProcessingRecording] = useState(false);
  const [progress, setProgress] = useState(0);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [glowState, setGlowState] = useState<GlowEvent>('default');
  const [audioDuration, setAudioDuration] = useState(0);
  const [trimStartRatio, setTrimStartRatio] = useState(0);
  const [trimEndRatio, setTrimEndRatio] = useState(1);
  const [effects, setEffects] = useState({
    enhance: false,
    echo: false,
    reverb: false,
  });
  const effectsPrefsLoadedRef = useRef(false);
  const transition = useRef(new Animated.Value(0)).current;
  const audioContextRef = useRef<AudioContext | null>(null);
  const decodedBufferRef = useRef<AudioBuffer | null>(null);
  const originalBufferRef = useRef<AudioBuffer | null>(null);
  const enhancedBufferRef = useRef<AudioBuffer | null>(null);
  const enhanceAppliedRef = useRef(false);
  const previewPlayerRef = useRef<AudioPlayer | null>(null);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pausedPositionRef = useRef(0);
  const previewSourceKeyRef = useRef('');
  const initialText = typeof params.text === 'string' ? params.text.trim() : '';
  const shouldStartInCompose = initialText.length === 0 || normalizeParam(params.writeOwn) === '1';
  const [draftMessage, setDraftMessage] = useState(initialText);
  const [finalMessage, setFinalMessage] = useState(
    initialText.length > 0 ? initialText : 'I am calm, grounded, and confident in who I am.'
  );
  const [isComposing, setIsComposing] = useState(shouldStartInCompose);
  const composeTransition = useRef(new Animated.Value(shouldStartInCompose ? 0 : 1)).current;
  const recordIconPulse = useRef(new Animated.Value(0)).current;
  const recordIconGlow = useRef(new Animated.Value(0)).current;

  const pillarKey = useMemo(() => {
    const raw = normalizeParam(params.pillar);
    if (raw && raw in AFFIRMATION_PILLARS) {
      return raw as PillarKey;
    }
    return 'Confidence';
  }, [params.pillar]);

  const pillar = AFFIRMATION_PILLARS[pillarKey];
  const message = finalMessage;
  const recordingOpacity = transition.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });
  const reviewOpacity = transition.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });
  const recordingTranslate = transition.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -12],
  });
  const reviewTranslate = transition.interpolate({
    inputRange: [0, 1],
    outputRange: [12, 0],
  });
  const composeOpacity = composeTransition.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });
  const composeTranslate = composeTransition.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -10],
  });
  const controlsTranslate = composeTransition.interpolate({
    inputRange: [0, 1],
    outputRange: [10, 0],
  });
  const minTrimGapRatio = useMemo(() => {
    if (audioDuration <= 0) {
      return 0.04;
    }
    return Math.min(1, Math.max(TRIM_MIN_GAP_SECONDS / audioDuration, 0.04));
  }, [audioDuration]);

  useEffect(() => {
    const loadEffectPrefs = async () => {
      try {
        const raw = await AsyncStorage.getItem(RECORDING_EFFECTS_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<typeof effects>;
          setEffects({
            enhance: parsed.enhance === true,
            echo: parsed.echo === true,
            reverb: parsed.reverb === true,
          });
        }
      } catch {
        // ignore malformed persisted preferences
      } finally {
        effectsPrefsLoadedRef.current = true;
      }
    };

    void loadEffectPrefs();
  }, []);

  useEffect(() => {
    if (!effectsPrefsLoadedRef.current) {
      return;
    }
    void AsyncStorage.setItem(RECORDING_EFFECTS_STORAGE_KEY, JSON.stringify(effects));
  }, [effects]);
  const trimStartTime = audioDuration * trimStartRatio;
  const trimEndTime = audioDuration * trimEndRatio;
  const trimmedDuration = Math.max(0, trimEndTime - trimStartTime);
  const hasTrimSelection =
    audioDuration > 0 && (trimStartRatio > TRIM_EPSILON || trimEndRatio < 1 - TRIM_EPSILON);
  const playheadTime = trimStartTime + progress * trimmedDuration;
  const playheadRatio =
    audioDuration > 0 && trimmedDuration > 0
      ? clamp(playheadTime / audioDuration, trimStartRatio, trimEndRatio)
      : trimStartRatio;
  const prepareEnhancedBuffer = async (sourceBuffer: AudioBuffer) => {
    const context = audioContextRef.current;
    if (!context) {
      return null;
    }

    return runOfflineEnhance(context, sourceBuffer);
  };

  useEffect(() => {
    let isMounted = true;

    const setup = async () => {
      const status = await getRecordingPermissionsAsync();
      if (!isMounted) {
        return;
      }
      setHasPermission(status.granted);
    };

    setup();

    return () => {
      isMounted = false;
      if (recorderState.isRecording) {
        audioRecorder.stop().catch(() => undefined);
      }
    };
  }, [audioRecorder, recorderState.isRecording]);

  useEffect(() => {
    Animated.timing(transition, {
      toValue: hasRecorded ? 1 : 0,
      duration: 260,
      useNativeDriver: true,
    }).start();
  }, [hasRecorded, transition]);

  const shouldPulseRecordMic =
    !isComposing && !hasRecorded && !recorderState.isRecording && !isApplyingEnhance;

  useEffect(() => {
    if (!shouldPulseRecordMic) {
      recordIconPulse.stopAnimation();
      recordIconPulse.setValue(0);
      recordIconGlow.stopAnimation();
      recordIconGlow.setValue(0);
      return;
    }

    const shake = Animated.loop(
      Animated.sequence([
        Animated.delay(1200),
        Animated.timing(recordIconPulse, { toValue: 1, duration: 80, easing: Easing.linear, useNativeDriver: true }),
        Animated.timing(recordIconPulse, { toValue: -1, duration: 80, easing: Easing.linear, useNativeDriver: true }),
        Animated.timing(recordIconPulse, { toValue: 1, duration: 80, easing: Easing.linear, useNativeDriver: true }),
        Animated.timing(recordIconPulse, { toValue: -1, duration: 80, easing: Easing.linear, useNativeDriver: true }),
        Animated.timing(recordIconPulse, { toValue: 0, duration: 60, easing: Easing.linear, useNativeDriver: true }),
      ])
    );

    const glow = Animated.loop(
      Animated.sequence([
        Animated.timing(recordIconGlow, {
          toValue: 1,
          duration: 950,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(recordIconGlow, {
          toValue: 0,
          duration: 950,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    shake.start();
    glow.start();
    return () => {
      shake.stop();
      glow.stop();
    };
  }, [shouldPulseRecordMic, recordIconGlow, recordIconPulse]);

  const recordMicAnimStyle = useMemo(
    () => ({
      opacity: recordIconGlow.interpolate({ inputRange: [0, 1], outputRange: [0.38, 1] }),
      transform: [
        {
          rotate: recordIconPulse.interpolate({
            inputRange: [-1, 0, 1],
            outputRange: ['-22deg', '0deg', '22deg'],
          }),
        },
        { scale: recordIconGlow.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1.14] }) },
      ],
    }),
    [recordIconGlow, recordIconPulse]
  );

  useEffect(() => {
    const context = new AudioContext();
    audioContextRef.current = context;

    return () => {
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
      if (previewPlayerRef.current) {
        clearLockScreenControls(previewPlayerRef.current);
        previewPlayerRef.current.remove();
        previewPlayerRef.current = null;
      }
      context.close().catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    if (!audioUri || !audioContextRef.current) {
      return;
    }

    let isMounted = true;
    const decode = async () => {
      try {
        const audioBuffer = await audioContextRef.current?.decodeAudioData(audioUri);
        if (!isMounted || !audioBuffer) {
          return;
        }
        const preparedEnhancedBuffer = await prepareEnhancedBuffer(audioBuffer);
        if (!isMounted) {
          return;
        }
        decodedBufferRef.current = effects.enhance && preparedEnhancedBuffer ? preparedEnhancedBuffer : audioBuffer;
        originalBufferRef.current = audioBuffer;
        enhancedBufferRef.current = preparedEnhancedBuffer;
        enhanceAppliedRef.current = Boolean(effects.enhance && preparedEnhancedBuffer);
        setAudioDuration(audioBuffer.duration);
        setTrimStartRatio(0);
        setTrimEndRatio(1);
        setIsApplyingEnhance(false);
        setIsProcessingRecording(false);
        setProgress(0);
        pausedPositionRef.current = 0;
        previewSourceKeyRef.current = '';
        if (previewPlayerRef.current) {
          clearLockScreenControls(previewPlayerRef.current);
          previewPlayerRef.current.remove();
          previewPlayerRef.current = null;
        }
        setIsPlaying(false);
        setHasRecorded(true);
      } catch {
        decodedBufferRef.current = null;
        originalBufferRef.current = null;
        enhancedBufferRef.current = null;
        enhanceAppliedRef.current = false;
        setAudioDuration(0);
        setTrimStartRatio(0);
        setTrimEndRatio(1);
        setIsApplyingEnhance(false);
        setIsProcessingRecording(false);
        setHasRecorded(false);
        pausedPositionRef.current = 0;
        previewSourceKeyRef.current = '';
        if (previewPlayerRef.current) {
          clearLockScreenControls(previewPlayerRef.current);
          previewPlayerRef.current.remove();
          previewPlayerRef.current = null;
        }
        setIsPlaying(false);
      }
    };

    decode();

    return () => {
      isMounted = false;
    };
  }, [audioUri]);

  const getTrimmedBuffer = (buffer: AudioBuffer) =>
    trimBuffer({
      buffer,
      context: audioContextRef.current,
      enabled: hasTrimSelection,
      startTime: trimStartTime,
      endTime: trimEndTime,
    });

  const stopPreviewProgressTimer = () => {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  };

  const stopCurrentPlayback = (resetProgress: boolean, preservePosition = false) => {
    stopPreviewProgressTimer();

    if (previewPlayerRef.current) {
      if (preservePosition) {
        const duration = previewPlayerRef.current.duration || 0;
        const current = previewPlayerRef.current.currentTime || 0;
        pausedPositionRef.current = current;
        setProgress(duration > 0 ? Math.min(1, current / duration) : 0);
        previewPlayerRef.current.pause();
        clearLockScreenControls(previewPlayerRef.current);
      } else {
        pausedPositionRef.current = 0;
        clearLockScreenControls(previewPlayerRef.current);
        previewPlayerRef.current.remove();
        previewPlayerRef.current = null;
        previewSourceKeyRef.current = '';
      }
    } else if (!preservePosition) {
      pausedPositionRef.current = 0;
    }

    setIsPlaying(false);
    if (resetProgress) {
      setProgress(0);
    }
  };

  const startPreviewProgressTimer = () => {
    stopPreviewProgressTimer();
    progressTimerRef.current = setInterval(() => {
      const active = previewPlayerRef.current;
      if (!active) {
        return;
      }

      const duration = active.duration || 0;
      const current = active.currentTime || 0;
      const next = duration > 0 ? Math.min(1, current / duration) : 0;
      setProgress(next);

      if (!active.playing && duration > 0 && current >= duration - 0.05) {
        clearLockScreenControls(active);
        active.remove();
        previewPlayerRef.current = null;
        previewSourceKeyRef.current = '';
        pausedPositionRef.current = 0;
        setIsPlaying(false);
        setProgress(1);
        stopPreviewProgressTimer();
      }
    }, 80);
  };

  const getPreviewSourceKey = () =>
    [
      audioUri,
      effects.enhance ? 'enhance:on' : 'enhance:off',
      effects.echo ? 'echo:on' : 'echo:off',
      effects.reverb ? 'reverb:on' : 'reverb:off',
      `trim:${trimStartRatio.toFixed(4)}-${trimEndRatio.toFixed(4)}`,
    ].join('|');

  const getPreviewPlaybackUri = async () => {
    if (!audioUri) {
      return null;
    }

    const needsRenderedPreview = effects.enhance || effects.echo || effects.reverb || hasTrimSelection;
    if (!needsRenderedPreview) {
      return audioUri;
    }

    const bufferForPreview = effects.enhance
      ? decodedBufferRef.current
      : originalBufferRef.current ?? decodedBufferRef.current;

    if (!bufferForPreview) {
      return null;
    }

    return renderBufferToFileWithEffects({
      buffer: getTrimmedBuffer(bufferForPreview),
      withEcho: effects.echo,
      withReverb: effects.reverb,
    });
  };

  const playProcessedAudio = async () => {
    const targetUri = await getPreviewPlaybackUri();
    if (!targetUri) {
      return;
    }

    const nextSourceKey = getPreviewSourceKey();
    await configureMixedPlaybackAsync();

    if (previewPlayerRef.current && previewSourceKeyRef.current === nextSourceKey) {
      const startOffset = pausedPositionRef.current;
      if (startOffset > 0) {
        await previewPlayerRef.current.seekTo(startOffset).catch(() => undefined);
      } else {
        await previewPlayerRef.current.seekTo(0).catch(() => undefined);
      }
      activateLockScreenControls(previewPlayerRef.current, {
        title: message,
        albumTitle: 'Preview Recording',
      });
      previewPlayerRef.current.play();
      setIsPlaying(true);
      startPreviewProgressTimer();
      return;
    }

    if (previewPlayerRef.current) {
      clearLockScreenControls(previewPlayerRef.current);
      previewPlayerRef.current.remove();
      previewPlayerRef.current = null;
    }

    const player = createAudioPlayer(targetUri, { updateInterval: 100 });
    previewPlayerRef.current = player;
    previewSourceKeyRef.current = nextSourceKey;

    const startOffset = pausedPositionRef.current;
    if (startOffset > 0) {
      await player.seekTo(startOffset).catch(() => undefined);
    }

    activateLockScreenControls(player, {
      title: message,
      albumTitle: 'Preview Recording',
    });
    player.play();
    setIsPlaying(true);
    startPreviewProgressTimer();
  };

  const startRecording = async () => {
    if (hasPermission !== true) {
      const status = await requestRecordingPermissionsAsync();
      setHasPermission(status.granted);
      if (!status.granted) {
        return;
      }
    }
    try {
      stopCurrentPlayback(true);
      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: true,
        ...(Platform.OS === 'android' ? { shouldPlayInBackground: true } : {}),
      });
      await audioRecorder.prepareToRecordAsync();
      if (Platform.OS !== 'web') {
        const micPref = await getRecordingMicPref();
        if (micPref?.uid && audioRecorder.setInput) {
          try {
            audioRecorder.setInput(micPref.uid);
          } catch {
            /* preferred input unavailable */
          }
        }
      }
      audioRecorder.record();
    } catch {
      return;
    }
  };

  const stopRecording = async () => {
    try {
      await audioRecorder.stop();
      const recordedUri = audioRecorder.uri ?? recorderState.url;
      if (recordedUri) {
        stopCurrentPlayback(true);
        setHasRecorded(false);
        setIsPlaying(false);
        setProgress(0);
        setIsProcessingRecording(true);
        setIsApplyingEnhance(true);
        let nextUri = recordedUri;
        const context = audioContextRef.current;

        if (context) {
          try {
            const recordedBuffer = await context.decodeAudioData(recordedUri);
            const polishedBuffer = normalizeAndCompressVoice(context, recordedBuffer);
            const processedUri = await renderBufferToFileWithEffects({
              buffer: polishedBuffer,
              withEcho: false,
              withReverb: false,
            });
            if (processedUri) {
              nextUri = processedUri;
            }
          } catch {
            nextUri = recordedUri;
          }
        }

        setAudioUri(nextUri);
      }
      await configureMixedPlaybackAsync();
    } catch {
      setIsApplyingEnhance(false);
      setIsProcessingRecording(false);
      return;
    }
  };

  const togglePlayback = async () => {
    if (!audioUri) {
      return;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isPlaying) {
      stopCurrentPlayback(false, true);
      return;
    }
    await playProcessedAudio();
  };

  const scrubToRatio = (globalRatio: number) => {
    if (trimmedDuration <= 0) {
      pausedPositionRef.current = 0;
      setProgress(0);
      return;
    }

    const boundedRatio = clamp(globalRatio, trimStartRatio, trimEndRatio);
    const nextProgress =
      (boundedRatio - trimStartRatio) / Math.max(trimEndRatio - trimStartRatio, TRIM_EPSILON);
    pausedPositionRef.current = nextProgress * trimmedDuration;
    setProgress(nextProgress);
  };

  const handleTrimDragStart = () => {
    void Haptics.selectionAsync();
    stopCurrentPlayback(true);
    pausedPositionRef.current = 0;
    setProgress(0);
  };

  const handleTrimChange = (nextStartRatio: number, nextEndRatio: number) => {
    setTrimStartRatio(nextStartRatio);
    setTrimEndRatio(nextEndRatio);
  };

  const handleScrubStart = () => {
    void Haptics.selectionAsync();
    if (isPlaying) {
      stopCurrentPlayback(false, true);
    }
  };

  const handleScrubCommit = (ratio: number) => {
    void Haptics.selectionAsync();
    scrubToRatio(ratio);
    if (previewPlayerRef.current) {
      previewPlayerRef.current.seekTo(pausedPositionRef.current).catch(() => undefined);
    }
  };

  const toggleEffect = async (effect: keyof typeof effects) => {
    if (isApplyingEnhance) {
      return;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (effect !== 'enhance') {
      stopCurrentPlayback(true);
      setEffects((prev) => ({ ...prev, [effect]: !prev[effect] }));
      return;
    }

    const enableEnhance = !effects.enhance;
    if (!enableEnhance) {
      stopCurrentPlayback(true);
      if (originalBufferRef.current) {
        decodedBufferRef.current = originalBufferRef.current;
      }
      enhanceAppliedRef.current = false;
      setEffects((prev) => ({ ...prev, enhance: false }));
      return;
    }

    const context = audioContextRef.current;
    const source = originalBufferRef.current ?? decodedBufferRef.current;
    if (!context || !source) {
      return;
    }

    stopCurrentPlayback(true);
    const preparedEnhancedBuffer = enhancedBufferRef.current;
    if (preparedEnhancedBuffer) {
      decodedBufferRef.current = preparedEnhancedBuffer;
      enhanceAppliedRef.current = true;
      setEffects((prev) => ({ ...prev, enhance: true }));
      return;
    }

    setIsApplyingEnhance(true);
    try {
      const enhanced = await prepareEnhancedBuffer(source);
      if (!enhanced) {
        return;
      }
      enhancedBufferRef.current = enhanced;
      decodedBufferRef.current = enhanced;
      enhanceAppliedRef.current = true;
      setEffects((prev) => ({ ...prev, enhance: true }));
    } finally {
      setIsApplyingEnhance(false);
    }
  };

  const handleDelete = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    stopCurrentPlayback(true);
    setAudioUri('');
    setAudioDuration(0);
    setHasRecorded(false);
    setIsPlaying(false);
    setIsApplyingEnhance(false);
    setTrimStartRatio(0);
    setTrimEndRatio(1);
    decodedBufferRef.current = null;
    originalBufferRef.current = null;
    enhancedBufferRef.current = null;
    enhanceAppliedRef.current = false;
  };

  const handleSave = async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    stopCurrentPlayback(false);
    const context = audioContextRef.current;
    const sourceBuffer = decodedBufferRef.current;
    const shouldBakeAnyEffect = effects.enhance || effects.echo || effects.reverb || hasTrimSelection;
    if (effects.enhance && !enhanceAppliedRef.current && context && sourceBuffer) {
      const preparedEnhancedBuffer = enhancedBufferRef.current;
      if (preparedEnhancedBuffer) {
        decodedBufferRef.current = preparedEnhancedBuffer;
        enhanceAppliedRef.current = true;
      } else {
        setIsApplyingEnhance(true);
        try {
          const enhanced = await prepareEnhancedBuffer(sourceBuffer);
          if (enhanced) {
            enhancedBufferRef.current = enhanced;
            decodedBufferRef.current = enhanced;
            enhanceAppliedRef.current = true;
          }
        } finally {
          setIsApplyingEnhance(false);
        }
      }
    }
    if (!audioUri) {
      return;
    }
    let uriToSave = audioUri;
    const bufferForExport = effects.enhance
      ? decodedBufferRef.current
      : originalBufferRef.current ?? decodedBufferRef.current;

    if (shouldBakeAnyEffect && bufferForExport) {
      const processedPath = await renderBufferToFileWithEffects({
        buffer: getTrimmedBuffer(bufferForExport),
        withEcho: effects.echo,
        withReverb: effects.reverb,
      });
      if (processedPath) {
        uriToSave = processedPath;
      }
    }

    await saveRecordingToDevice({
      sourceUri: uriToSave,
      text: message,
      pillar: pillarKey,
    });
    try {
      ph?.capture('recording_saved', {
        pillar: pillarKey,
        has_enhance: effects.enhance,
        has_echo: effects.echo,
        has_reverb: effects.reverb,
        has_trim: hasTrimSelection,
        onboarding: params.onboarding === '1',
      });
    } catch {}
    if (params.onboarding === '1') {
      router.back();
    } else {
      router.dismissAll();
      router.push('/(tabs)/library');
    }
  };

  const toggleRecording = async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (recorderState.isRecording) {
      await stopRecording();
    } else {
      await startRecording();
    }
  };

  const handleDismiss = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  const handleDoneComposing = () => {
    const next = draftMessage.trim();
    if (next.length === 0) {
      return;
    }
    Keyboard.dismiss();
    setFinalMessage(next);
    setIsComposing(false);
    Animated.timing(composeTransition, {
      toValue: 1,
      duration: 260,
      useNativeDriver: true,
    }).start();
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}
      style={styles.container}
    >
      <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      <Modal transparent visible={isProcessingRecording} animationType="fade">
        <View style={styles.processingOverlay}>
          <View style={styles.processingCard}>
            <ActivityIndicator size="large" color="#FFFFFF" />
            <Text style={styles.processingTitle}>Processing audio...</Text>
            <Text style={styles.processingText}>Cleaning noise and preparing your edit.</Text>
          </View>
        </View>
      </Modal>
      <LinearGradient
        colors={[Colors.background, '#1A0B2E', Colors.background]}
        locations={[0, 0.4, 1]}
        style={StyleSheet.absoluteFill}
      />

      <TouchableOpacity onPress={handleDismiss} activeOpacity={0.6} style={styles.dragHandle}>
        <View style={styles.dragPill} />
      </TouchableOpacity>

      <View style={styles.header}>
        <TouchableOpacity onPress={handleDismiss} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <View style={styles.cardGlowWrapper}>
          <AffirmationCard glowColor={pillar.color} borderColor={pillar.color}>
            {isComposing ? (
              <TextInput
                style={styles.messageInput}
                placeholder="I am..."
                placeholderTextColor={Colors.textSecondary}
                multiline
                value={draftMessage}
                onChangeText={setDraftMessage}
                autoFocus
                textAlignVertical="center"
              />
            ) : (
              <Text style={styles.affirmationText}>“{message}”</Text>
            )}
          </AffirmationCard>
        </View>

        <View style={styles.controlsShell}>
          <Animated.View
            pointerEvents={isComposing ? 'auto' : 'none'}
            style={[
              styles.composeLayer,
              { opacity: composeOpacity, transform: [{ translateY: composeTranslate }] },
            ]}
          >
            <TouchableOpacity
              style={[styles.doneBtn, draftMessage.trim().length === 0 && styles.doneBtnDisabled]}
              disabled={draftMessage.trim().length === 0}
              onPress={handleDoneComposing}
            >
              <Text style={styles.doneText}>done</Text>
            </TouchableOpacity>
          </Animated.View>

          <Animated.View
            pointerEvents={isComposing ? 'none' : 'auto'}
            style={[styles.controlsLayer, { opacity: composeTransition, transform: [{ translateY: controlsTranslate }] }]}
          >
          <Animated.View
            pointerEvents={!isComposing && !hasRecorded ? 'auto' : 'none'}
            style={[
              styles.recordingLayer,
              { opacity: recordingOpacity, transform: [{ translateY: recordingTranslate }] },
            ]}
          >
            <View style={styles.recordingCenter}>
            <AnimatedGlow
              preset={GlowPresets.chakra(40, [recordColor, recordColor], 8, 12)}
              activeState={glowState}
            >
              <ScaleBtn
                style={styles.recordButton}
                disabled={isApplyingEnhance}
                onPress={toggleRecording}
                onPressIn={() => setGlowState('press')}
                onPressOut={() => setGlowState('default')}
                scaleTo={0.85}
              >
                <Animated.View style={shouldPulseRecordMic ? recordMicAnimStyle : undefined}>
                  <Ionicons
                    name={recorderState.isRecording ? 'stop' : 'mic'}
                    size={28}
                    color="#000"
                  />
                </Animated.View>
              </ScaleBtn>
            </AnimatedGlow>
              <Text style={styles.hintText}>
                {isApplyingEnhance
                  ? 'processing...'
                  : recorderState.isRecording
                    ? 'recording...'
                    : 'tap to record your affirmation'}
              </Text>
            </View>
            {!hasRecorded && !isComposing && !isApplyingEnhance && !recorderState.isRecording ? (
              <View style={styles.recordTipBox}>
                <View style={styles.recordTipInner}>
                  <Text style={styles.recordTipText}>
                    Find a quiet place to record — you can always re-record later.
                  </Text>
                </View>
              </View>
            ) : null}
          </Animated.View>

          <Animated.View
            pointerEvents={!isComposing && hasRecorded ? 'auto' : 'none'}
            style={[
              styles.reviewLayer,
              { opacity: reviewOpacity, transform: [{ translateY: reviewTranslate }] },
            ]}
          >
            <View style={styles.reviewTop}>
              <TrimEditor
                audioDuration={audioDuration}
                minTrimGapRatio={minTrimGapRatio}
                onScrubCommit={handleScrubCommit}
                onScrubStart={handleScrubStart}
                onTrimChange={handleTrimChange}
                onTrimDragStart={handleTrimDragStart}
                playheadRatio={playheadRatio}
                trimEndRatio={trimEndRatio}
                trimStartRatio={trimStartRatio}
              />

              <View style={styles.playButtonRow}>
                <ScaleBtn style={styles.playButton} onPress={togglePlayback} scaleTo={0.85}>
                  <Ionicons name={isPlaying ? 'pause' : 'play'} size={22} color="#FFFFFF" />
                </ScaleBtn>
              </View>
            </View>

            <View style={styles.reviewBottom}>
              <View style={styles.effectsRow}>
                <ScaleBtn
                  style={[styles.effectBtn, effects.enhance && styles.effectBtnEnhanceActive]}
                  onPress={() => toggleEffect('enhance')}
                >
                  <Ionicons
                    name="sparkles"
                    size={16}
                    style={styles.effectIcon}
                    color={effects.enhance ? '#CDB6FF' : 'rgba(255,255,255,0.28)'}
                  />
                  <Text style={[styles.effectText, effects.enhance && styles.effectTextEnhanceActive]}>Enhance</Text>
                </ScaleBtn>
                <ScaleBtn
                  style={[styles.effectBtn, effects.echo && styles.effectBtnEchoActive]}
                  onPress={() => toggleEffect('echo')}
                >
                  <Ionicons
                    name="volume-high"
                    size={16}
                    style={styles.effectIcon}
                    color={effects.echo ? '#A9D7FF' : 'rgba(255,255,255,0.28)'}
                  />
                  <Text style={[styles.effectText, effects.echo && styles.effectTextEchoActive]}>Echo</Text>
                </ScaleBtn>
                <ScaleBtn
                  style={[styles.effectBtn, effects.reverb && styles.effectBtnReverbActive]}
                  onPress={() => toggleEffect('reverb')}
                >
                  <Ionicons
                    name="water"
                    size={16}
                    style={styles.effectIcon}
                    color={effects.reverb ? '#FFB39F' : 'rgba(255,255,255,0.28)'}
                  />
                  <Text style={[styles.effectText, effects.reverb && styles.effectTextReverbActive]}>Reverb</Text>
                </ScaleBtn>
              </View>

              <View style={styles.actionsRow}>
                <ScaleBtn style={styles.deleteBtn} onPress={handleDelete} scaleTo={0.82}>
                  <Ionicons name="trash-outline" size={26} color="#FF3B30" />
                </ScaleBtn>
                <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                  <Text style={styles.saveText}>{isApplyingEnhance ? 'Applying...' : 'Save'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Animated.View>
          </Animated.View>
        </View>
      </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  dragHandle: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 4,
  },
  dragPill: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 10,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingBottom: 48,
  },
  cardGlowWrapper: {
    width: '100%',
    alignItems: 'center',
    marginTop: 24,
  },
  affirmationText: {
    fontFamily: Fonts.serif,
    fontSize: isSmallDevice ? 18 : 22,
    color: Colors.text,
    textAlign: 'center',
    lineHeight: isSmallDevice ? 25 : 30,
  },
  messageInput: {
    width: '100%',
    maxHeight: '100%',
    fontFamily: Fonts.serif,
    fontSize: isSmallDevice ? 22 : 28,
    color: Colors.text,
    textAlign: 'center',
    lineHeight: isSmallDevice ? 30 : 36,
  },
  controlsShell: {
    width: '100%',
    flex: 1,
    position: 'relative',
    justifyContent: 'center',
    marginTop: 12,
  },
  composeLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlsLayer: {
    width: '100%',
    flex: 1,
    justifyContent: 'center',
  },
  doneBtn: {
    width: '100%',
    height: 56,
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtnDisabled: {
    backgroundColor: '#6E6E6E',
  },
  doneText: {
    fontFamily: Fonts.mono,
    fontSize: isSmallDevice ? 15 : 18,
    color: '#000000',
  },
  recordingLayer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingCenter: {
    alignItems: 'center',
    gap: 16,
  },
  reviewLayer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    justifyContent: 'space-between',
    alignItems: 'stretch',
  },
  reviewTop: {
    width: '100%',
    alignItems: 'center',
    gap: 12,
    paddingTop: 4,
  },
  reviewBottom: {
    width: '100%',
    gap: 12,
  },
  recordButton: {
    width: isSmallDevice ? 60 : 72,
    height: isSmallDevice ? 60 : 72,
    borderRadius: isSmallDevice ? 30 : 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: recordColor,
  },
  hintText: {
    fontFamily: Fonts.mono,
    fontSize: 14,
    color: Colors.text,
    textAlign: 'center',
  },
  recordTipBox: {
    position: 'absolute',
    bottom: 32,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  recordTipInner: {
    maxWidth: 300,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  recordTipText: {
    fontFamily: Fonts.mono,
    fontSize: 11,
    lineHeight: 16,
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'center',
  },
  playButtonRow: {
    width: '100%',
    alignItems: 'center',
  },
  playButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FF3B1F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  effectsRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: -20,
    marginBottom: 20,
  },
  effectBtn: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 4,
  },
  effectBtnEnhanceActive: {
    backgroundColor: 'rgba(155,109,255,0.18)',
    borderColor: 'rgba(155,109,255,0.55)',
  },
  effectBtnEchoActive: {
    backgroundColor: 'rgba(76,161,255,0.16)',
    borderColor: 'rgba(76,161,255,0.5)',
  },
  effectBtnReverbActive: {
    backgroundColor: 'rgba(255,124,96,0.16)',
    borderColor: 'rgba(255,124,96,0.5)',
  },
  effectIcon: {
    fontSize: 16,
    opacity: 0.95,
  },
  effectText: {
    fontFamily: Fonts.mono,
    fontSize: 11,
    color: 'rgba(255,255,255,0.3)',
  },
  effectTextEnhanceActive: {
    color: '#CDB6FF',
  },
  effectTextEchoActive: {
    color: '#A9D7FF',
  },
  effectTextReverbActive: {
    color: '#FFB39F',
  },
  actionsRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  deleteBtn: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtn: {
    flex: 1,
    marginLeft: 14,
    borderRadius: 15,
    paddingVertical: 18,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveText: {
    fontFamily: Fonts.mono,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: '#0a000d',
  },
  processingOverlay: {
    flex: 1,
    backgroundColor: 'rgba(4, 6, 10, 0.74)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  processingCard: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingVertical: 28,
    backgroundColor: 'rgba(17, 18, 24, 0.96)',
    alignItems: 'center',
    gap: 12,
  },
  processingTitle: {
    fontFamily: Fonts.serifBold,
    fontSize: 24,
    color: Colors.text,
    textAlign: 'center',
  },
  processingText: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    lineHeight: 18,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
});
