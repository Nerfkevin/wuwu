import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Animated,
  TextInput,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Modal,
  ActivityIndicator,
} from 'react-native';
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

const recordColor = '#FF0000';
const TRIM_MIN_GAP_SECONDS = 0.35;
const TRIM_EPSILON = 0.0001;
const RECORDING_EFFECTS_STORAGE_KEY = 'recording_effect_preferences_v1';

const normalizeParam = (value?: string | string[]) =>
  Array.isArray(value) ? value[0] : value;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export default function RecordingScreen() {
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
      reverbGain: 5,
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
        reverbGain: 5,
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
            <AnimatedGlow
              preset={GlowPresets.chakra(40, [recordColor, recordColor], 8, 12)}
              activeState={glowState}
            >
              <TouchableOpacity
                style={styles.recordButton}
                disabled={isApplyingEnhance}
                onPress={toggleRecording}
                onPressIn={() => setGlowState('press')}
                onPressOut={() => setGlowState('default')}
              >
                <Ionicons
                  name={recorderState.isRecording ? 'stop' : 'mic'}
                  size={28}
                  color="#000"
                />
              </TouchableOpacity>
            </AnimatedGlow>
            <Text style={styles.hintText}>
              {isApplyingEnhance
                ? 'processing...'
                : recorderState.isRecording
                  ? 'recording...'
                  : 'tap to record your affirmation'}
            </Text>
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
                <TouchableOpacity style={styles.playButton} onPress={togglePlayback}>
                  <Ionicons name={isPlaying ? 'pause' : 'play'} size={22} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.reviewBottom}>
              <View style={styles.effectsRow}>
                <TouchableOpacity
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
                </TouchableOpacity>
                <TouchableOpacity
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
                </TouchableOpacity>
                <TouchableOpacity
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
                </TouchableOpacity>
              </View>

              <View style={styles.actionsRow}>
                <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
                  <Ionicons name="trash-outline" size={26} color={Colors.textSecondary} />
                </TouchableOpacity>
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
    fontSize: 22,
    color: Colors.text,
    textAlign: 'center',
    lineHeight: 30,
  },
  messageInput: {
    width: '100%',
    maxHeight: '100%',
    fontFamily: Fonts.serif,
    fontSize: 28,
    color: Colors.text,
    textAlign: 'center',
    lineHeight: 36,
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
    fontSize: 18,
    color: '#000000',
  },
  recordingLayer: {
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
    width: 72,
    height: 72,
    borderRadius: 36,
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
});import { Directory, File, Paths } from 'expo-file-system';
import {
  AudioBuffer,
  AudioContext,
  AudioNode,
  BaseAudioContext,
  OfflineAudioContext,
} from '@/lib/audio-api-core';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const dbToGain = (value: number) => 10 ** (value / 20);
const gainToDb = (value: number) => 20 * Math.log10(Math.max(value, 1e-8));
const getPeak = (buffer: AudioBuffer) => {
  let peak = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch += 1) {
    const channelData = buffer.getChannelData(ch);
    for (let i = 0; i < channelData.length; i += 1) {
      peak = Math.max(peak, Math.abs(channelData[i]));
    }
  }
  return peak;
};

const createBufferWithGain = (
  context: BaseAudioContext,
  buffer: AudioBuffer,
  gain: number,
  ceiling = 1
) => {
  const next = context.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  for (let ch = 0; ch < buffer.numberOfChannels; ch += 1) {
    const src = buffer.getChannelData(ch);
    const dst = next.getChannelData(ch);
    for (let i = 0; i < src.length; i += 1) {
      dst[i] = clamp(src[i] * gain, -ceiling, ceiling);
    }
  }
  return next;
};

const estimateActiveVoiceLevelDb = (buffer: AudioBuffer) => {
  if (buffer.length === 0 || buffer.numberOfChannels === 0) {
    return null;
  }

  const windowSize = clamp(Math.round(buffer.sampleRate * 0.05), 512, 4096);
  const hopSize = Math.max(256, Math.floor(windowSize / 2));
  const levels: number[] = [];

  for (let start = 0; start < buffer.length; start += hopSize) {
    const end = Math.min(buffer.length, start + windowSize);
    const frameLength = end - start;
    if (frameLength <= 0) {
      continue;
    }

    let energy = 0;
    for (let ch = 0; ch < buffer.numberOfChannels; ch += 1) {
      const channelData = buffer.getChannelData(ch);
      for (let i = start; i < end; i += 1) {
        const sample = channelData[i];
        energy += sample * sample;
      }
    }

    const rms = Math.sqrt(energy / (frameLength * buffer.numberOfChannels));
    levels.push(rms);
  }

  if (levels.length === 0) {
    return null;
  }

  const loudestWindow = Math.max(...levels);
  if (loudestWindow < 1e-4) {
    return null;
  }

  const absoluteGateDb = -45;
  const relativeGateDb = gainToDb(loudestWindow) - 18;
  const gateDb = Math.max(absoluteGateDb, relativeGateDb);
  const active = levels.filter((level) => gainToDb(level) >= gateDb);
  const candidates = active.length > 0 ? active : levels;
  const sorted = [...candidates].sort((a, b) => a - b);
  const percentileIndex = clamp(Math.floor(sorted.length * 0.65), 0, sorted.length - 1);

  return gainToDb(sorted[percentileIndex]);
};

const applyTransparentLimiter = (
  context: BaseAudioContext,
  input: AudioBuffer,
  {
    thresholdDb = -7,
    ratio = 10,
    attackMs = 2,
    releaseMs = 70,
  }: {
    thresholdDb?: number;
    ratio?: number;
    attackMs?: number;
    releaseMs?: number;
  } = {}
) => {
  const output = context.createBuffer(input.numberOfChannels, input.length, input.sampleRate);
  const sources = Array.from({ length: input.numberOfChannels }, (_, ch) => input.getChannelData(ch));
  const destinations = Array.from(
    { length: output.numberOfChannels },
    (_, ch) => output.getChannelData(ch)
  );
  const attackCoeff = Math.exp(-1 / (Math.max(attackMs, 1) * 0.001 * input.sampleRate));
  const releaseCoeff = Math.exp(-1 / (Math.max(releaseMs, 1) * 0.001 * input.sampleRate));
  let currentGain = 1;

  for (let i = 0; i < input.length; i += 1) {
    let linkedLevel = 0;
    for (let ch = 0; ch < sources.length; ch += 1) {
      linkedLevel = Math.max(linkedLevel, Math.abs(sources[ch][i]));
    }

    let targetGain = 1;
    if (linkedLevel > 1e-5) {
      const inputDb = gainToDb(linkedLevel);
      if (inputDb > thresholdDb) {
        const limitedDb = thresholdDb + (inputDb - thresholdDb) / ratio;
        targetGain = dbToGain(limitedDb - inputDb);
      }
    }

    const smoothing = targetGain < currentGain ? attackCoeff : releaseCoeff;
    currentGain = targetGain + smoothing * (currentGain - targetGain);

    for (let ch = 0; ch < destinations.length; ch += 1) {
      destinations[ch][i] = clamp(sources[ch][i] * currentGain, -1, 1);
    }
  }

  return output;
};

const ENHANCE_FFT_SIZE = 1024;
const ENHANCE_HOP_SIZE = 256;
const ENHANCE_NOISE_FLOOR = 0.005;
const ENHANCE_SUBTRACTION = 1.75;
const ENHANCE_DRY_MIX = 0;
const ENHANCE_MIN_NOISE_FRAMES = 8;
const ENHANCE_NOISE_UPDATE_ALPHA = 0.992;
const ENHANCE_GAIN_RELEASE = 0.86;
const ENHANCE_GATE_FLOOR = 0.00005;
const ENHANCE_GATE_RATIO = 8;
const ENHANCE_GATE_ATTACK_MS = 10;
const ENHANCE_GATE_RELEASE_MS = 180;

const applyResidualNoiseGate = (source: Float32Array, sampleRate: number) => {
  const gated = new Float32Array(source.length);
  const attackCoeff = Math.exp(-1 / (Math.max(ENHANCE_GATE_ATTACK_MS, 1) * 0.001 * sampleRate));
  const releaseCoeff = Math.exp(-1 / (Math.max(ENHANCE_GATE_RELEASE_MS, 1) * 0.001 * sampleRate));
  let envelope = 0;
  let noiseFloor = 0.0035;
  let gain = 1;

  for (let i = 0; i < source.length; i += 1) {
    const sample = source[i];
    const level = Math.abs(sample);
    const envCoeff = level > envelope ? attackCoeff : releaseCoeff;
    envelope = level + envCoeff * (envelope - level);

    if (envelope < noiseFloor * 1.6) {
      noiseFloor = noiseFloor * 0.9995 + envelope * 0.0005;
    }

    const threshold = noiseFloor * ENHANCE_GATE_RATIO + 0.0012;
    let targetGain = 1;

    if (envelope < threshold) {
      const normalized = clamp(envelope / Math.max(threshold, 1e-6), 0, 1);
      targetGain = ENHANCE_GATE_FLOOR + (1 - ENHANCE_GATE_FLOOR) * normalized * normalized;
    }

    const gainCoeff = targetGain > gain ? attackCoeff : releaseCoeff;
    gain = targetGain + gainCoeff * (gain - targetGain);
    gated[i] = clamp(sample * gain, -1, 1);
  }

  return gated;
};

const bitReverse = (index: number, bits: number) => {
  let reversed = 0;
  for (let i = 0; i < bits; i += 1) {
    reversed = (reversed << 1) | ((index >> i) & 1);
  }
  return reversed;
};

const createHannWindow = (size: number) => {
  const window = new Float32Array(size);
  for (let i = 0; i < size; i += 1) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  }
  return window;
};

const fft = (real: Float32Array, imag: Float32Array) => {
  const size = real.length;
  const levels = Math.log2(size);

  for (let i = 0; i < size; i += 1) {
    const j = bitReverse(i, levels);
    if (j <= i) {
      continue;
    }
    const realValue = real[i];
    real[i] = real[j];
    real[j] = realValue;
    const imagValue = imag[i];
    imag[i] = imag[j];
    imag[j] = imagValue;
  }

  for (let blockSize = 2; blockSize <= size; blockSize <<= 1) {
    const halfSize = blockSize >> 1;
    const step = (Math.PI * 2) / blockSize;
    for (let start = 0; start < size; start += blockSize) {
      for (let offset = 0; offset < halfSize; offset += 1) {
        const evenIndex = start + offset;
        const oddIndex = evenIndex + halfSize;
        const angle = offset * step;
        const twiddleReal = Math.cos(angle);
        const twiddleImag = -Math.sin(angle);
        const oddReal = twiddleReal * real[oddIndex] - twiddleImag * imag[oddIndex];
        const oddImag = twiddleReal * imag[oddIndex] + twiddleImag * real[oddIndex];
        real[oddIndex] = real[evenIndex] - oddReal;
        imag[oddIndex] = imag[evenIndex] - oddImag;
        real[evenIndex] += oddReal;
        imag[evenIndex] += oddImag;
      }
    }
  }
};

const ifft = (real: Float32Array, imag: Float32Array) => {
  for (let i = 0; i < real.length; i += 1) {
    imag[i] = -imag[i];
  }

  fft(real, imag);

  for (let i = 0; i < real.length; i += 1) {
    real[i] /= real.length;
    imag[i] = -imag[i] / real.length;
  }
};

const spectralDenoiseChannel = (
  source: Float32Array,
  length: number,
  sampleRate: number,
  analysisWindow: Float32Array
) => {
  const paddedLength = length + ENHANCE_FFT_SIZE;
  const output = new Float32Array(paddedLength);
  const normalization = new Float32Array(paddedLength);
  const frame = new Float32Array(ENHANCE_FFT_SIZE);
  const real = new Float32Array(ENHANCE_FFT_SIZE);
  const imag = new Float32Array(ENHANCE_FFT_SIZE);
  const noiseProfile = new Float32Array(ENHANCE_FFT_SIZE);
  const previousGain = new Float32Array(ENHANCE_FFT_SIZE);
  previousGain.fill(1);

  const totalFrames = Math.max(1, Math.ceil(Math.max(length - ENHANCE_FFT_SIZE, 0) / ENHANCE_HOP_SIZE) + 1);
  const estimatedNoiseFrames = Math.min(
    Math.max(ENHANCE_MIN_NOISE_FRAMES, Math.round(sampleRate * 0.12 / ENHANCE_HOP_SIZE)),
    totalFrames
  );

  for (let frameIndex = 0, offset = 0; frameIndex < totalFrames; frameIndex += 1, offset += ENHANCE_HOP_SIZE) {
    frame.fill(0);
    for (let i = 0; i < ENHANCE_FFT_SIZE; i += 1) {
      const sampleIndex = offset + i;
      const sample = sampleIndex < length ? source[sampleIndex] : 0;
      frame[i] = sample * analysisWindow[i];
      real[i] = frame[i];
      imag[i] = 0;
    }

    fft(real, imag);

    for (let i = 0; i < ENHANCE_FFT_SIZE; i += 1) {
      const magnitude = Math.hypot(real[i], imag[i]);

      if (frameIndex < estimatedNoiseFrames) {
        noiseProfile[i] += magnitude / estimatedNoiseFrames;
        continue;
      }

      if (magnitude < noiseProfile[i] * 1.5) {
        noiseProfile[i] =
          noiseProfile[i] * ENHANCE_NOISE_UPDATE_ALPHA + magnitude * (1 - ENHANCE_NOISE_UPDATE_ALPHA);
      }

      const reducedMagnitude = Math.max(
        magnitude - noiseProfile[i] * ENHANCE_SUBTRACTION,
        noiseProfile[i] * ENHANCE_NOISE_FLOOR
      );
      const rawGain = clamp(reducedMagnitude / (magnitude + 1e-6), ENHANCE_NOISE_FLOOR, 1);
      const smoothedGain = Math.max(rawGain, previousGain[i] * ENHANCE_GAIN_RELEASE);
      previousGain[i] = smoothedGain;
      real[i] *= smoothedGain;
      imag[i] *= smoothedGain;
    }

    ifft(real, imag);

    for (let i = 0; i < ENHANCE_FFT_SIZE; i += 1) {
      const targetIndex = offset + i;
      const weighted = real[i] * analysisWindow[i];
      output[targetIndex] += weighted;
      normalization[targetIndex] += analysisWindow[i] * analysisWindow[i];
    }
  }

  const denoised = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const wet = normalization[i] > 1e-6 ? output[i] / normalization[i] : source[i];
    denoised[i] = clamp(wet * (1 - ENHANCE_DRY_MIX) + source[i] * ENHANCE_DRY_MIX, -1, 1);
  }

  return applyResidualNoiseGate(denoised, sampleRate);
};

const createReverbImpulse = (context: BaseAudioContext) => {
  const duration = 1.1;
  const decay = 3.5;
  const length = Math.floor(context.sampleRate * duration);
  const impulse = context.createBuffer(2, length, context.sampleRate);
  for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
    const channelData = impulse.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      const envelope = Math.pow(1 - i / length, decay);
      channelData[i] = (Math.random() * 2 - 1) * envelope * 0.15;
    }
  }
  return impulse;
};

const createEchoImpulse = (context: BaseAudioContext) => {
  const duration = 0.9;
  const length = Math.floor(context.sampleRate * duration);
  const impulse = context.createBuffer(2, length, context.sampleRate);
  const taps = [
    { time: 0.11, gain: 0.34 },
    { time: 0.23, gain: 0.22 },
    { time: 0.38, gain: 0.14 },
    { time: 0.54, gain: 0.1 },
  ];
  for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
    const channelData = impulse.getChannelData(channel);
    taps.forEach((tap) => {
      const index = Math.floor(tap.time * context.sampleRate);
      if (index < channelData.length) {
        channelData[index] = tap.gain;
      }
    });
  }
  return impulse;
};

export const runOfflineEnhance = (context: AudioContext, input: AudioBuffer) => {
  const output = context.createBuffer(input.numberOfChannels, input.length, input.sampleRate);
  const analysisWindow = createHannWindow(ENHANCE_FFT_SIZE);

  for (let ch = 0; ch < input.numberOfChannels; ch += 1) {
    const src = input.getChannelData(ch);
    const dst = output.getChannelData(ch);
    dst.set(spectralDenoiseChannel(src, input.length, input.sampleRate, analysisWindow));
  }

  return output;
};

export const normalizeAndCompressVoice = (
  context: AudioContext,
  input: AudioBuffer,
  {
    thresholdDb = -20,
    ratio = 3.5,
    attackMs = 10,
    releaseMs = 140,
    targetVoiceLevelDb = -19,
    targetPeak = 0.94,
    maxLoudnessGainDb = 14,
    maxNormalizeGainDb = 10,
  }: {
    thresholdDb?: number;
    ratio?: number;
    attackMs?: number;
    releaseMs?: number;
    targetVoiceLevelDb?: number;
    targetPeak?: number;
    maxLoudnessGainDb?: number;
    maxNormalizeGainDb?: number;
  } = {}
) => {
  const output = context.createBuffer(input.numberOfChannels, input.length, input.sampleRate);
  if (input.length === 0) {
    return output;
  }

  const attackCoeff = Math.exp(-1 / (Math.max(attackMs, 1) * 0.001 * input.sampleRate));
  const releaseCoeff = Math.exp(-1 / (Math.max(releaseMs, 1) * 0.001 * input.sampleRate));
  const sources = Array.from({ length: input.numberOfChannels }, (_, ch) => input.getChannelData(ch));
  const destinations = Array.from(
    { length: output.numberOfChannels },
    (_, ch) => output.getChannelData(ch)
  );
  let currentGain = 1;
  let peak = 0;

  for (let i = 0; i < input.length; i += 1) {
    let linkedLevel = 0;
    for (let ch = 0; ch < sources.length; ch += 1) {
      linkedLevel = Math.max(linkedLevel, Math.abs(sources[ch][i]));
    }

    let targetGain = 1;
    if (linkedLevel > 1e-5) {
      const inputDb = gainToDb(linkedLevel);
      if (inputDb > thresholdDb) {
        const compressedDb = thresholdDb + (inputDb - thresholdDb) / ratio;
        targetGain = dbToGain(compressedDb - inputDb);
      }
    }

    const smoothing = targetGain < currentGain ? attackCoeff : releaseCoeff;
    currentGain = targetGain + smoothing * (currentGain - targetGain);

    for (let ch = 0; ch < destinations.length; ch += 1) {
      const sample = clamp(sources[ch][i] * currentGain, -1, 1);
      destinations[ch][i] = sample;
      peak = Math.max(peak, Math.abs(sample));
    }
  }

  if (peak < 1e-4) {
    return output;
  }

  let leveledBuffer = output;
  const detectedVoiceLevelDb = estimateActiveVoiceLevelDb(output);

  if (detectedVoiceLevelDb !== null) {
    const loudnessGain = clamp(
      dbToGain(targetVoiceLevelDb - detectedVoiceLevelDb),
      dbToGain(-6),
      dbToGain(maxLoudnessGainDb)
    );

    if (Math.abs(loudnessGain - 1) >= 0.01) {
      leveledBuffer = createBufferWithGain(context, output, loudnessGain);
    }
  }

  const limitedBuffer = applyTransparentLimiter(context, leveledBuffer);
  const limitedPeak = getPeak(limitedBuffer);
  if (limitedPeak < 1e-4) {
    return limitedBuffer;
  }

  const normalizeGain = clamp(targetPeak / limitedPeak, 0, dbToGain(maxNormalizeGainDb));
  if (Math.abs(normalizeGain - 1) < 0.01) {
    return limitedBuffer;
  }

  return createBufferWithGain(context, limitedBuffer, normalizeGain);
};

const encodeBufferAsWav = (buffer: AudioBuffer) => {
  const channels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const totalSamples = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = totalSamples * blockAlign;
  const wav = new ArrayBuffer(44 + dataSize);
  const view = new DataView(wav);

  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  };

  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeAscii(36, 'data');
  view.setUint32(40, dataSize, true);

  const channelData = Array.from({ length: channels }, (_, ch) => buffer.getChannelData(ch));
  let offset = 44;
  for (let i = 0; i < totalSamples; i += 1) {
    for (let ch = 0; ch < channels; ch += 1) {
      const sample = Math.max(-1, Math.min(1, channelData[ch][i]));
      const intSample = sample < 0 ? sample * 32768 : sample * 32767;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }

  return new Uint8Array(wav);
};

const applyMakeupGain = (
  context: BaseAudioContext,
  buffer: AudioBuffer,
  gain: number,
  ceiling = 0.98
) => {
  if (gain <= 1) {
    return buffer;
  }

  const peak = getPeak(buffer);

  const safeGain = peak > 0 ? Math.min(gain, ceiling / peak) : gain;
  if (safeGain <= 1) {
    return buffer;
  }

  return createBufferWithGain(context, buffer, safeGain);
};

export const trimBuffer = ({
  buffer,
  context,
  enabled,
  startTime,
  endTime,
}: {
  buffer: AudioBuffer;
  context: AudioContext | null;
  enabled: boolean;
  startTime: number;
  endTime: number;
}) => {
  if (!enabled || !context) {
    return buffer;
  }

  const startFrame = clamp(Math.floor(startTime * buffer.sampleRate), 0, buffer.length);
  const endFrame = clamp(Math.ceil(endTime * buffer.sampleRate), startFrame + 1, buffer.length);
  const nextLength = Math.max(1, endFrame - startFrame);
  const trimmed = context.createBuffer(buffer.numberOfChannels, nextLength, buffer.sampleRate);

  for (let ch = 0; ch < buffer.numberOfChannels; ch += 1) {
    const source = buffer.getChannelData(ch);
    trimmed.getChannelData(ch).set(source.subarray(startFrame, endFrame));
  }

  return trimmed;
};

export const renderBufferToFileWithEffects = async ({
  buffer,
  withEcho,
  withReverb,
  reverbGain = 1,
}: {
  buffer: AudioBuffer;
  withEcho: boolean;
  withReverb: boolean;
  reverbGain?: number;
}) => {
  const tailPadding = withEcho || withReverb ? Math.floor(buffer.sampleRate * 1.2) : 0;
  const renderContext = new OfflineAudioContext(
    buffer.numberOfChannels,
    buffer.length + tailPadding,
    buffer.sampleRate
  );
  const source = renderContext.createBufferSource();
  source.buffer = buffer;
  let tail: AudioNode = source;

  if (withEcho) {
    const echo = renderContext.createConvolver();
    echo.buffer = createEchoImpulse(renderContext);
    tail.connect(echo);
    tail = echo;
  }

  if (withReverb) {
    const reverb = renderContext.createConvolver();
    reverb.buffer = createReverbImpulse(renderContext);
    tail.connect(reverb);
    tail = reverb;
  }

  tail.connect(renderContext.destination);
  source.start();
  const rendered = await renderContext.startRendering();
  const renderedWithGain = withReverb ? applyMakeupGain(renderContext, rendered, reverbGain) : rendered;
  const wavBytes = encodeBufferAsWav(renderedWithGain);
  const processedDir = new Directory(Paths.cache, 'processed-recordings');
  if (!processedDir.exists) {
    processedDir.create({ intermediates: true, idempotent: true });
  }
  const output = new File(processedDir, `processed-${Date.now()}.wav`);
  output.create({ intermediates: true, overwrite: true });
  output.write(wavBytes);
  return output.uri;
};

export default function RecordingAudioUtilityRoute() {
  return null;
}