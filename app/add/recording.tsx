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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  getRecordingPermissionsAsync,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import {
  AudioBuffer,
  AudioBufferSourceNode,
  BaseAudioContext,
  AudioContext,
  AudioNode,
  ConvolverNode,
  OfflineAudioContext,
} from 'react-native-audio-api';
import { AFFIRMATION_PILLARS, PillarKey } from '@/constants/affirmations';
import { Colors, Fonts } from '@/constants/theme';
import AnimatedGlow, { GlowEvent } from 'react-native-animated-glow';
import { GlowPresets } from '@/constants/glow';
import AffirmationCard from './components/affirmation-card';
import { saveRecordingToDevice } from './recording-store';
import { Directory, File, Paths } from 'expo-file-system';

const recordColor = '#FF0000';

const normalizeParam = (value?: string | string[]) =>
  Array.isArray(value) ? value[0] : value;

export default function RecordingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ text?: string; pillar?: string; writeOwn?: string }>();
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder);
  const [audioUri, setAudioUri] = useState('');
  const [hasRecorded, setHasRecorded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isApplyingEnhance, setIsApplyingEnhance] = useState(false);
  const [progress, setProgress] = useState(0);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [glowState, setGlowState] = useState<GlowEvent>('default');
  const [effects, setEffects] = useState({
    enhance: false,
    echo: false,
    reverb: false,
  });
  const transition = useRef(new Animated.Value(0)).current;
  const audioContextRef = useRef<AudioContext | null>(null);
  const decodedBufferRef = useRef<AudioBuffer | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const originalBufferRef = useRef<AudioBuffer | null>(null);
  const enhanceAppliedRef = useRef(false);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const playbackStartedAtRef = useRef(0);
  const playbackStartOffsetRef = useRef(0);
  const pausedPositionRef = useRef(0);
  const manualStopRef = useRef(false);
  const reverbImpulseRef = useRef<AudioBuffer | null>(null);
  const echoImpulseRef = useRef<AudioBuffer | null>(null);
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
      if (sourceNodeRef.current) {
        manualStopRef.current = true;
        sourceNodeRef.current.stop();
        sourceNodeRef.current.disconnect();
        sourceNodeRef.current = null;
      }
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
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
        decodedBufferRef.current = audioBuffer;
        originalBufferRef.current = audioBuffer;
        enhanceAppliedRef.current = false;
        setEffects({ enhance: false, echo: false, reverb: false });
        setIsApplyingEnhance(false);
        setProgress(0);
        pausedPositionRef.current = 0;
      } catch {
        decodedBufferRef.current = null;
        originalBufferRef.current = null;
        enhanceAppliedRef.current = false;
        pausedPositionRef.current = 0;
      }
    };

    decode();

    return () => {
      isMounted = false;
    };
  }, [audioUri]);

  const createReverbImpulse = (context: BaseAudioContext, fresh = false) => {
    if (!fresh && reverbImpulseRef.current) {
      return reverbImpulseRef.current;
    }
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
    if (!fresh) {
      reverbImpulseRef.current = impulse;
    }
    return impulse;
  };

  const createEchoImpulse = (context: BaseAudioContext, fresh = false) => {
    if (!fresh && echoImpulseRef.current) {
      return echoImpulseRef.current;
    }
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
    if (!fresh) {
      echoImpulseRef.current = impulse;
    }
    return impulse;
  };

  const runOfflineEnhance = (context: AudioContext, input: AudioBuffer) => {
    const output = context.createBuffer(
      input.numberOfChannels,
      input.length,
      input.sampleRate
    );
    const dt = 1 / input.sampleRate;
    const hpCutoff = 140;
    const lpCutoff = 6200;
    const hpRc = 1 / (2 * Math.PI * hpCutoff);
    const lpRc = 1 / (2 * Math.PI * lpCutoff);
    const hpAlpha = hpRc / (hpRc + dt);
    const lpAlpha = dt / (lpRc + dt);
    const presenceCutoff = 2400;
    const presenceRc = 1 / (2 * Math.PI * presenceCutoff);
    const presenceAlpha = dt / (presenceRc + dt);

    for (let ch = 0; ch < input.numberOfChannels; ch += 1) {
      const src = input.getChannelData(ch);
      const dst = output.getChannelData(ch);
      let prevIn = 0;
      let prevHp = 0;
      let prevLp = 0;
      let prevPresenceLp = 0;
      let envelope = 0;
      let noiseEstimate = 0.01;
      for (let i = 0; i < src.length; i += 1) {
        const sample = src[i];
        const hp = hpAlpha * (prevHp + sample - prevIn);
        prevIn = sample;
        prevHp = hp;

        prevPresenceLp = prevPresenceLp + presenceAlpha * (hp - prevPresenceLp);
        const presenceBand = hp - prevPresenceLp;
        const presence = hp + presenceBand * 0.5;

        envelope = envelope * 0.99 + Math.abs(presence) * 0.01;
        if (envelope < noiseEstimate * 3.0) {
          noiseEstimate = noiseEstimate * 0.996 + envelope * 0.004;
        }
        const gateThreshold = noiseEstimate * 5.2 + 0.004;
        const gateRange = 0.006;
        let gate = 1;
        if (envelope < gateThreshold) {
          gate = Math.max(0, (envelope - (gateThreshold - gateRange)) / gateRange);
          gate = gate * gate * gate;
        }
        const gated = presence * gate;

        prevLp = prevLp + lpAlpha * (gated - prevLp);
        dst[i] = Math.max(-1, Math.min(1, prevLp));
      }
    }

    return output;
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

  const renderBufferToFileWithEffects = async ({
    buffer,
    withEcho,
    withReverb,
  }: {
    buffer: AudioBuffer;
    withEcho: boolean;
    withReverb: boolean;
  }) => {
    const tailPadding = Math.floor(buffer.sampleRate * 1.2);
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
      echo.buffer = createEchoImpulse(renderContext, true);
      tail.connect(echo);
      tail = echo;
    }

    if (withReverb) {
      const reverb = renderContext.createConvolver();
      reverb.buffer = createReverbImpulse(renderContext, true);
      tail.connect(reverb);
      tail = reverb;
    }

    tail.connect(renderContext.destination);
    source.start();
    const rendered = await renderContext.startRendering();
    const wavBytes = encodeBufferAsWav(rendered);
    const processedDir = new Directory(Paths.cache, 'processed-recordings');
    if (!processedDir.exists) {
      processedDir.create({ intermediates: true, idempotent: true });
    }
    const output = new File(processedDir, `processed-${Date.now()}.wav`);
    output.create({ intermediates: true, overwrite: true });
    output.write(wavBytes);
    return output.uri;
  };

  const stopCurrentPlayback = (resetProgress: boolean, preservePosition = false) => {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
    const currentBuffer = decodedBufferRef.current;
    if (preservePosition && currentBuffer) {
      const elapsedSinceStart = (Date.now() - playbackStartedAtRef.current) / 1000;
      const nextPosition = Math.min(
        currentBuffer.duration,
        playbackStartOffsetRef.current + Math.max(0, elapsedSinceStart)
      );
      pausedPositionRef.current = nextPosition;
      setProgress(currentBuffer.duration > 0 ? nextPosition / currentBuffer.duration : 0);
    } else if (!preservePosition) {
      pausedPositionRef.current = 0;
    }
    if (sourceNodeRef.current) {
      manualStopRef.current = true;
      sourceNodeRef.current.stop();
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }
    setIsPlaying(false);
    if (resetProgress) {
      setProgress(0);
    }
  };

  const playProcessedAudio = async () => {
    const context = audioContextRef.current;
    const buffer = decodedBufferRef.current;
    if (!context || !buffer) {
      return;
    }
    if (context.state === 'suspended') {
      await context.resume().catch(() => undefined);
    }

    manualStopRef.current = false;
    const source = context.createBufferSource();
    source.buffer = buffer;

    let tail: AudioNode = source;

    if (effects.echo) {
      const echo: ConvolverNode = context.createConvolver();
      echo.buffer = createEchoImpulse(context);
      tail.connect(echo);
      tail = echo;
    }

    if (effects.reverb) {
      const reverb: ConvolverNode = context.createConvolver();
      reverb.buffer = createReverbImpulse(context);
      tail.connect(reverb);
      tail = reverb;
    }

    tail.connect(context.destination);
    sourceNodeRef.current = source;

    source.onEnded = () => {
      if (manualStopRef.current) {
        manualStopRef.current = false;
        return;
      }
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
      source.disconnect();
      sourceNodeRef.current = null;
      setIsPlaying(false);
      setProgress(1);
      pausedPositionRef.current = 0;
    };

    const startOffset = pausedPositionRef.current;
    source.start(0, startOffset);
    setIsPlaying(true);
    playbackStartOffsetRef.current = startOffset;
    setProgress(buffer.duration > 0 ? startOffset / buffer.duration : 0);
    playbackStartedAtRef.current = Date.now();

    progressTimerRef.current = setInterval(() => {
      const elapsed =
        playbackStartOffsetRef.current + (Date.now() - playbackStartedAtRef.current) / 1000;
      const next = buffer.duration > 0 ? Math.min(1, elapsed / buffer.duration) : 0;
      setProgress(next);
    }, 80);
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
      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: true,
        shouldPlayInBackground: true,
      });
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
    } catch {
      return;
    }
  };

  const stopRecording = async () => {
    try {
      await audioRecorder.stop();
      const audioUri = audioRecorder.uri ?? recorderState.url;
      if (audioUri) {
        setAudioUri(audioUri);
        setHasRecorded(true);
      }
      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: false,
        shouldPlayInBackground: true,
      });
    } catch {
      return;
    }
  };

  const togglePlayback = async () => {
    if (!decodedBufferRef.current) {
      return;
    }
    if (isPlaying) {
      stopCurrentPlayback(false, true);
      return;
    }
    await playProcessedAudio();
  };

  const toggleEffect = async (effect: keyof typeof effects) => {
    if (isApplyingEnhance) {
      return;
    }

    if (effect !== 'enhance') {
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
    setIsApplyingEnhance(true);
    try {
      const enhanced = runOfflineEnhance(context, source);
      decodedBufferRef.current = enhanced;
      enhanceAppliedRef.current = true;
      setEffects((prev) => ({ ...prev, enhance: true }));
    } finally {
      setIsApplyingEnhance(false);
    }
  };

  const handleDelete = () => {
    stopCurrentPlayback(true);
    setAudioUri('');
    setHasRecorded(false);
    setIsPlaying(false);
    setIsApplyingEnhance(false);
    setEffects({ enhance: false, echo: false, reverb: false });
    decodedBufferRef.current = null;
    originalBufferRef.current = null;
    enhanceAppliedRef.current = false;
  };

  const handleSave = async () => {
    stopCurrentPlayback(false);
    const context = audioContextRef.current;
    const sourceBuffer = decodedBufferRef.current;
    const shouldBakeAnyEffect = effects.enhance || effects.echo || effects.reverb;
    if (effects.enhance && !enhanceAppliedRef.current && context && sourceBuffer) {
      setIsApplyingEnhance(true);
      try {
        const enhanced = runOfflineEnhance(context, sourceBuffer);
        decodedBufferRef.current = enhanced;
        enhanceAppliedRef.current = true;
      } finally {
        setIsApplyingEnhance(false);
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
        buffer: bufferForExport,
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
    router.dismissAll();
    router.push('/(tabs)/library');
  };

  const toggleRecording = async () => {
    if (recorderState.isRecording) {
      await stopRecording();
    } else {
      await startRecording();
    }
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
      <Stack.Screen options={{ headerShown: false }} />
      <LinearGradient
        colors={[Colors.background, '#1A0B2E', Colors.background]}
        locations={[0, 0.4, 1]}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <View style={styles.cardGlowWrapper}>
          <AffirmationCard glowColor={pillar.color}>
            {isComposing ? (
              <TextInput
                style={styles.messageInput}
                placeholder="I am..."
                placeholderTextColor="#9A9A9A"
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
              {recorderState.isRecording ? 'recording...' : 'tap to record your affirmation'}
            </Text>
          </Animated.View>

          <Animated.View
            pointerEvents={!isComposing && hasRecorded ? 'auto' : 'none'}
            style={[
              styles.reviewLayer,
              { opacity: reviewOpacity, transform: [{ translateY: reviewTranslate }] },
            ]}
          >
            <View style={styles.playbackRow}>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
              </View>
              <TouchableOpacity style={styles.playButton} onPress={togglePlayback}>
                <Ionicons name={isPlaying ? 'pause' : 'play'} size={22} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <View style={styles.effectsRow}>
              <TouchableOpacity
                style={[styles.effectBtn, effects.enhance && styles.effectBtnActive]}
                onPress={() => toggleEffect('enhance')}
              >
                <Text style={styles.effectIcon}>✨</Text>
                <Text style={styles.effectText}>Enhance</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.effectBtn, effects.echo && styles.effectBtnActive]}
                onPress={() => toggleEffect('echo')}
              >
                <Text style={styles.effectIcon}>🔉</Text>
                <Text style={styles.effectText}>Echo</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.effectBtn, effects.reverb && styles.effectBtnActive]}
                onPress={() => toggleEffect('reverb')}
              >
                <Text style={styles.effectIcon}>✣</Text>
                <Text style={styles.effectText}>Reverb</Text>
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
  header: {
    paddingHorizontal: 20,
    paddingTop: 60,
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
    justifyContent: 'space-between',
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
    minHeight: 280,
    position: 'relative',
    justifyContent: 'center',
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
    minHeight: 280,
    justifyContent: 'center',
  },
  doneBtn: {
    width: '100%',
    height: 56,
    borderRadius: 28,
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
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 22,
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
  playbackRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  progressTrack: {
    flex: 1,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#C6C6C6',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 10,
    backgroundColor: '#1398FF',
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
  },
  effectBtn: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 4,
  },
  effectBtnActive: {
    backgroundColor: '#DDF0FF',
  },
  effectIcon: {
    fontSize: 16,
  },
  effectText: {
    fontFamily: Fonts.mono,
    fontSize: 11,
    color: '#111111',
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
    height: 54,
    borderRadius: 27,
    backgroundColor: '#10D53B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveText: {
    fontFamily: Fonts.serifBold,
    fontSize: 26,
    color: '#FFFFFF',
  },
});
