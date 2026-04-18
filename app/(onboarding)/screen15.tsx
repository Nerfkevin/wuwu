import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, Pressable, Dimensions } from 'react-native';

const { width: screenWidth } = Dimensions.get('window');
const isSmallDevice = screenWidth < 380;
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import Animated, {
  cancelAnimation,
  Easing,
  interpolateColor,
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
  withTiming,
} from 'react-native-reanimated';
import AnimatedGlow, { GlowEvent, PresetConfig } from '@/lib/animated-glow';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import AffirmationCard from '../add/components/affirmation-card';
import { AFFIRMATION_PILLARS, PillarKey } from '@/constants/affirmations';
import { Colors, Fonts } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AudioBuffer, AudioContext } from '@/lib/audio-api-core';
import { getSavedRecordings, SavedRecording } from '@/lib/recording-store';
import { configureBackgroundPlaybackAsync } from '@/lib/audio-playback';
import {
  height,
  BOWL_VOLUME,
  BINAURAL_CARRIER,
  OSC_VOLUME,
  AFFIRMATION_DEFAULT_VOLUME_PERCENT,
  BINAURAL_BEATS,
  BOWL_AUDIO_BY_FREQUENCY,
  BRAINWAVE_LABELS,
  withAlpha,
  affirmationPercentToGain,
} from '../session/playback-constants';
import { usePostHogScreenViewed } from "@/lib/posthog";
import MakeItRain from '@/app/session/make-it-rain';

const triggerHaptic = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

const INTRO_MS = 5000;
const GAP_MS = 5000;
const MAX_TRACKS = 3;

/** Solfeggio Hz → accent: light pink/lavender (low) → deep indigo (high) */
const FREQ_COLORS: Record<string, string> = {
  '174': '#F5D0FE',
  '285': '#F0ABFC',
  '396': '#E879F9',
  '417': '#D946EF',
  '528': '#C084FC',
  '639': '#A855F7',
  '741': '#818CF8',
  '852': '#6366F1',
  '963': '#4338CA',
};

type SessionSettings = { freq: string; bg: string; brainwave: string };

export default function Screen15() {
  usePostHogScreenViewed({
    screen: "onboarding/screen15",
    component: "Screen15",
    screen_number: 15,
  });
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // ─── UI state ─────────────────────────────────────────────────────────────
  const [settings, setSettings] = useState<SessionSettings>({
    freq: '528', bg: 'Brainwaves', brainwave: 'alpha',
  });
  const [recordings, setRecordings] = useState<SavedRecording[]>([]);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [glowState, setGlowState] = useState<GlowEvent>('default');
  const [isMuted, setIsMuted] = useState(false);

  // ─── "Affirming..." dots ──────────────────────────────────────────────────
  const [dotCount, setDotCount] = useState(1);
  useEffect(() => {
    const id = setInterval(() => {
      setDotCount((prev) => (prev % 3) + 1);
    }, 500);
    return () => clearInterval(id);
  }, []);

  // ─── Audio refs ───────────────────────────────────────────────────────────
  const audioCtxRef = useRef<AudioContext | null>(null);
  const bowlGainRef = useRef<ReturnType<AudioContext['createGain']> | null>(null);
  const affirmationGainRef = useRef<ReturnType<AudioContext['createGain']> | null>(null);
  const binauralGainRef = useRef<ReturnType<AudioContext['createGain']> | null>(null);
  const bowlSourceRef = useRef<ReturnType<AudioContext['createBufferSource']> | null>(null);
  const affirmationSourceRef = useRef<ReturnType<AudioContext['createBufferSource']> | null>(null);
  const leftOscRef = useRef<ReturnType<AudioContext['createOscillator']> | null>(null);
  const rightOscRef = useRef<ReturnType<AudioContext['createOscillator']> | null>(null);
  const pureOscRef = useRef<ReturnType<AudioContext['createOscillator']> | null>(null);
  const bowlBufferRef = useRef<AudioBuffer | null>(null);
  const affirmationBuffersRef = useRef<Map<string, AudioBuffer>>(new Map());
  const affirmationVolumeRef = useRef(
    affirmationPercentToGain(AFFIRMATION_DEFAULT_VOLUME_PERCENT)
  );

  // ─── Session timer refs ───────────────────────────────────────────────────
  const sessionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionStartedAtRef = useRef<number | null>(null);
  const sessionElapsedMsRef = useRef(0);

  // ─── Control refs ─────────────────────────────────────────────────────────
  const mountedRef = useRef(true);
  const isPlayingRef = useRef(false);

  // ─── Animation state ──────────────────────────────────────────────────────
  const messageOpacity = useSharedValue(0);
  const messageTranslateY = useSharedValue(0);
  const cardColorProgress = useSharedValue(1);

  const [displayMessage, setDisplayMessage] = useState('');
  const [cardGlowState, setCardGlowState] = useState<GlowEvent>('default');
  const [resolvedCardColor, setResolvedCardColor] = useState<string>('#A855F7');
  const [cardColorRange, setCardColorRange] = useState({
    from: '#A855F7',
    to: '#A855F7',
  });

  // ─── Derived values ───────────────────────────────────────────────────────
  const selectedColor = FREQ_COLORS[settings.freq] ?? '#A855F7';
  const shouldPlayBrainwave = settings.bg === 'Brainwaves';
  const shouldPlayPure = settings.bg === 'Pure';

  const currentRecording = recordings[currentTrackIndex];
  const message = currentRecording?.text ?? '';
  const messagePillarColor =
    currentRecording?.pillar && currentRecording.pillar in AFFIRMATION_PILLARS
      ? AFFIRMATION_PILLARS[currentRecording.pillar as PillarKey].color
      : selectedColor;

  const hasAbundance = recordings.some((r) => r.pillar === 'Abundance');

  const totalMessages = recordings.length;
  const progressLabel =
    totalMessages > 0
      ? `${Math.min(currentTrackIndex + 1, totalMessages)}/${totalMessages}`
      : '0/0';
  const freqIconColor = !isMuted ? selectedColor : Colors.textSecondary;
  const freqIconName = !isMuted ? 'volume-high' : 'volume-mute';

  // ─── Card border transition colors ───────────────────────────────────────
  const cardBorderTransitionColors = useMemo(
    () => [
      withAlpha(cardColorRange.from, 0.82),
      withAlpha(cardColorRange.to, 0.4),
      withAlpha(cardColorRange.to, 0.82),
    ],
    [cardColorRange.from, cardColorRange.to]
  );

  const finalizeCardColorTransition = useCallback((nextColor: string) => {
    setResolvedCardColor(nextColor);
    setCardColorRange({ from: nextColor, to: nextColor });
    setCardGlowState('default');
  }, []);

  // ─── Message transition ───────────────────────────────────────────────────
  useEffect(() => {
    if (displayMessage === message) return;
    cancelAnimation(messageOpacity);
    cancelAnimation(messageTranslateY);
    messageTranslateY.value = 0;
    messageOpacity.value = withTiming(
      0,
      { duration: 180, easing: Easing.out(Easing.cubic) },
      (finished) => {
        if (!finished) return;
        messageTranslateY.value = 12;
        runOnJS(setDisplayMessage)(message);
        messageOpacity.value = withTiming(1, {
          duration: 360,
          easing: Easing.inOut(Easing.cubic),
        });
        messageTranslateY.value = withTiming(0, {
          duration: 360,
          easing: Easing.inOut(Easing.cubic),
        });
      }
    );
  }, [displayMessage, message, messageOpacity, messageTranslateY]);

  // ─── Card color transition ────────────────────────────────────────────────
  useEffect(() => {
    if (resolvedCardColor === messagePillarColor) return;
    cancelAnimation(cardColorProgress);
    setCardGlowState('default');
    setCardColorRange({ from: resolvedCardColor, to: messagePillarColor });
    cardColorProgress.value = 0;
    requestAnimationFrame(() => setCardGlowState('hover'));
    cardColorProgress.value = withTiming(
      1,
      { duration: 1100, easing: Easing.inOut(Easing.cubic) },
      (finished) => {
        if (!finished) return;
        runOnJS(finalizeCardColorTransition)(messagePillarColor);
      }
    );
  }, [
    cardColorProgress,
    finalizeCardColorTransition,
    messagePillarColor,
    resolvedCardColor,
  ]);

  // ─── Session timer ────────────────────────────────────────────────────────
  const startSessionTimer = useCallback(() => {
    if (sessionStartedAtRef.current) return;
    sessionStartedAtRef.current = Date.now();
    sessionTimerRef.current = setInterval(() => {
      if (!mountedRef.current) return;
    }, 1000);
  }, []);

  const pauseSessionTimer = useCallback(() => {
    if (sessionStartedAtRef.current) {
      sessionElapsedMsRef.current += Date.now() - sessionStartedAtRef.current;
      sessionStartedAtRef.current = null;
    }
    if (sessionTimerRef.current) {
      clearInterval(sessionTimerRef.current);
      sessionTimerRef.current = null;
    }
  }, []);

  // ─── Audio teardown ───────────────────────────────────────────────────────
  const stopAllAudio = useCallback(() => {
    if (affirmationSourceRef.current) {
      const src = affirmationSourceRef.current;
      src.onEnded = null;
      try { src.stop(); } catch { /* already ended */ }
      try { src.disconnect(); } catch { /* best effort */ }
      affirmationSourceRef.current = null;
    }
    if (bowlSourceRef.current) {
      try { bowlSourceRef.current.stop(); } catch { /* already ended */ }
      try { bowlSourceRef.current.disconnect(); } catch { /* best effort */ }
      bowlSourceRef.current = null;
    }
    [leftOscRef, rightOscRef, pureOscRef].forEach((ref) => {
      if (ref.current) {
        try { ref.current.stop(); } catch { /* already ended */ }
        try { ref.current.disconnect(); } catch { /* best effort */ }
        ref.current = null;
      }
    });
    bowlGainRef.current = null;
    affirmationGainRef.current = null;
    binauralGainRef.current = null;
    bowlBufferRef.current = null;
    affirmationBuffersRef.current.clear();
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
  }, []);

  // ─── Mute toggle ─────────────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    triggerHaptic();
    setIsMuted((prev) => {
      const next = !prev;
      const gainVal = next ? 0 : OSC_VOLUME;
      if (binauralGainRef.current) binauralGainRef.current.gain.value = gainVal;
      if (bowlGainRef.current) {
        bowlGainRef.current.gain.value = next ? 0 : BOWL_VOLUME;
      }
      return next;
    });
  }, []);

  // ─── Animated styles ──────────────────────────────────────────────────────
  const messageAnimatedStyle = useAnimatedStyle(() => ({
    opacity: messageOpacity.value,
    transform: [{ translateY: messageTranslateY.value }],
  }));
  const cardAnimatedStyle = useAnimatedStyle(
    () => ({
      borderColor: interpolateColor(
        cardColorProgress.value,
        [0, 0.5, 1],
        cardBorderTransitionColors
      ),
    }),
    [cardBorderTransitionColors]
  );

  const cardGlowPreset = useMemo<PresetConfig>(
    () => ({
      metadata: {
        name: 'Affirmation Card Transition',
        textColor: '#FFFFFF',
        category: 'Custom',
        tags: [],
      },
      states: [
        {
          name: 'default',
          preset: {
            cornerRadius: 28,
            outlineWidth: 0,
            glowLayers: [
              {
                colors: [cardColorRange.from, cardColorRange.from],
                opacity: 0.6,
                glowSize: 10,
              },
            ],
          },
        },
        {
          name: 'hover',
          transition: 1100,
          preset: {
            glowLayers: [
              {
                colors: [cardColorRange.to, cardColorRange.to],
                opacity: 0.66,
                glowSize: 12,
              },
            ],
          },
        },
      ],
    }),
    [cardColorRange.from, cardColorRange.to]
  );

  // ─── Main session sequence ────────────────────────────────────────────────
  useEffect(() => {
    const run = async () => {
      const [f, b, bw] = await Promise.all([
        AsyncStorage.getItem('onboarding_freq'),
        AsyncStorage.getItem('onboarding_freq_bg'),
        AsyncStorage.getItem('onboarding_brainwave'),
      ]);
      if (!mountedRef.current) return;

      const freq = f ?? '528';
      const bg = b ?? 'Brainwaves';
      const brainwave = bw ?? 'alpha';
      setSettings({ freq, bg, brainwave });

      const allRecs = await getSavedRecordings();
      if (!mountedRef.current) return;
      const recs = allRecs.slice(0, MAX_TRACKS);
      setRecordings(recs);
      // Don't set displayMessage directly — let the transition effect animate it in

      if (recs.length === 0) {
        router.replace('/(tabs)' as any);
        return;
      }

      await new Promise<void>((r) => setTimeout(r, 400));
      if (!mountedRef.current) return;

      await configureBackgroundPlaybackAsync();

      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      await ctx.resume();

      const bowlGain = ctx.createGain();
      bowlGain.gain.value = BOWL_VOLUME;
      bowlGain.connect(ctx.destination);
      bowlGainRef.current = bowlGain;

      const affGain = ctx.createGain();
      affGain.gain.value = affirmationVolumeRef.current;
      affGain.connect(ctx.destination);
      affirmationGainRef.current = affGain;

      const binGain = ctx.createGain();
      binGain.gain.value = OSC_VOLUME;
      binGain.connect(ctx.destination);
      binauralGainRef.current = binGain;

      const playBowl = bg === 'Singing Bowl';
      const playBrainwave = bg === 'Brainwaves';
      const playPure = bg === 'Pure';
      const bowlAudio =
        BOWL_AUDIO_BY_FREQUENCY[freq] ?? BOWL_AUDIO_BY_FREQUENCY['528'];

      if (playBowl) {
        const buffer = await ctx.decodeAudioData(bowlAudio);
        if (!mountedRef.current) return;
        const FADE = 512;
        for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
          const data = buffer.getChannelData(ch);
          for (let i = 0; i < FADE && i < data.length; i++)
            data[i] *= i / FADE;
          for (let i = 0; i < FADE && i < data.length; i++)
            data[data.length - 1 - i] *= i / FADE;
        }
        bowlBufferRef.current = buffer;
        bowlGain.gain.setValueAtTime(0, ctx.currentTime);
        bowlGain.gain.linearRampToValueAtTime(BOWL_VOLUME, ctx.currentTime + 0.05);
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.loop = true;
        src.connect(bowlGain);
        src.start();
        bowlSourceRef.current = src;
      } else if (playBrainwave) {
        const beat = BINAURAL_BEATS[brainwave] ?? BINAURAL_BEATS.alpha;
        const leftOsc = ctx.createOscillator();
        const rightOsc = ctx.createOscillator();
        const leftPan = ctx.createStereoPanner();
        const rightPan = ctx.createStereoPanner();
        leftPan.pan.value = -1;
        rightPan.pan.value = 1;
        leftOsc.frequency.value = BINAURAL_CARRIER - beat / 2;
        rightOsc.frequency.value = BINAURAL_CARRIER + beat / 2;
        leftOsc.connect(leftPan);
        rightOsc.connect(rightPan);
        leftPan.connect(binGain);
        rightPan.connect(binGain);
        leftOsc.start();
        rightOsc.start();
        leftOscRef.current = leftOsc;
        rightOscRef.current = rightOsc;
      } else if (playPure) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = parseFloat(freq);
        osc.connect(binGain);
        osc.start();
        pureOscRef.current = osc;
      }

      isPlayingRef.current = true;
      startSessionTimer();

      // 5 s intro (freq only)
      await new Promise<void>((r) => setTimeout(r, INTRO_MS));
      if (!mountedRef.current) return;

      // Play each affirmation with a 5 s gap after each
      for (let i = 0; i < recs.length; i++) {
        if (!mountedRef.current) return;
        setCurrentTrackIndex(i);

        // Stop any leftover source
        if (affirmationSourceRef.current) {
          const old = affirmationSourceRef.current;
          old.onEnded = null;
          try { old.stop(); } catch { /* ended */ }
          try { old.disconnect(); } catch { /* best effort */ }
          affirmationSourceRef.current = null;
        }

        // Decode outside the Promise constructor so errors propagate properly
        let buffer = affirmationBuffersRef.current.get(recs[i].id);
        if (!buffer) {
          try {
            buffer = await ctx.decodeAudioData(recs[i].uri);
            affirmationBuffersRef.current.set(recs[i].id, buffer);
          } catch (e) {
            console.warn('[screen15] decodeAudioData failed:', e);
            continue;
          }
        }
        if (!mountedRef.current) return;

        // Resume in case the context auto-suspended
        await ctx.resume();
        if (!mountedRef.current) return;

        // Play and wait for onEnded
        await new Promise<void>((resolve) => {
          const src = ctx.createBufferSource();
          src.buffer = buffer!;
          src.connect(affGain);
          src.onEnded = () => {
            if (affirmationSourceRef.current === src) {
              affirmationSourceRef.current = null;
            }
            try { src.disconnect(); } catch { /* best effort */ }
            resolve();
          };
          src.start();
          affirmationSourceRef.current = src;
        });

        if (!mountedRef.current) return;

        await new Promise<void>((r) => setTimeout(r, GAP_MS));
        if (!mountedRef.current) return;
      }

      stopAllAudio();
      pauseSessionTimer();
      if (mountedRef.current) {
        await AsyncStorage.setItem('onboarding_session_ms', String(sessionElapsedMsRef.current));
        router.replace('/(onboarding)/screen16' as any);
      }
    };

    void run();

    return () => {
      mountedRef.current = false;
      stopAllAudio();
      if (sessionTimerRef.current) clearInterval(sessionTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={styles.container}>
        {hasAbundance && (
          <View style={[StyleSheet.absoluteFillObject, { opacity: 0.1, zIndex: 0 }]} pointerEvents="none">
            <MakeItRain />
          </View>
        )}
        <SafeAreaView
          style={[
            styles.safeArea,
            { paddingTop: insets.top + 6, paddingBottom: insets.bottom + 24 },
          ]}
          edges={[]}
        >
          <View style={styles.brandTitleWrap}>
            <Text style={styles.brandTitle}>Wu-Wu</Text>
          </View>

          <View style={styles.header}>
            <View style={styles.headerLeftCol}>
              <LinearGradient
                colors={[
                  'rgba(192, 132, 252, 0)',
                  'rgba(192, 132, 252, 0.28)',
                  'rgba(167, 139, 250, 0.72)',
                  'rgba(192, 132, 252, 0.28)',
                  'rgba(192, 132, 252, 0)',
                ]}
                locations={[0, 0.22, 0.5, 0.78, 1]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={[styles.headerTaperLine, styles.headerTaperLineLeft]}
              />
              <Text style={styles.headerLabel}>Affirmation</Text>
              <Text style={styles.headerValue}>{progressLabel}</Text>
            </View>
            <View style={styles.headerRight}>
              <View style={styles.headerRightInner}>
                <LinearGradient
                  colors={[
                    'rgba(129, 140, 248, 0)',
                    'rgba(129, 140, 248, 0.28)',
                    'rgba(99, 102, 241, 0.7)',
                    'rgba(129, 140, 248, 0.28)',
                    'rgba(129, 140, 248, 0)',
                  ]}
                  locations={[0, 0.22, 0.5, 0.78, 1]}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={[styles.headerTaperLine, styles.headerTaperLineRight]}
                />
                <Pressable style={styles.soundToggle} onPress={toggleMute}>
                  <Ionicons name={freqIconName} size={16} color={freqIconColor} />
                  <Text style={[styles.headerLabel, { color: freqIconColor }]}>
                    {settings.freq} Hz
                  </Text>
                </Pressable>
                {shouldPlayBrainwave ? (
                  <Text style={styles.headerValue}>
                    {BRAINWAVE_LABELS[settings.brainwave] ?? settings.brainwave}
                  </Text>
                ) : shouldPlayPure ? (
                  <Text style={styles.headerValue}>Pure</Text>
                ) : (
                  <Text style={styles.headerValue}>Singing Bowl</Text>
                )}
              </View>
            </View>
          </View>

          {/* Main content — centered, shifted up */}
          <View style={styles.contentContainer}>
            <View style={styles.cardGlowWrapper}>
              <AnimatedGlow preset={cardGlowPreset} activeState={cardGlowState}>
                <AffirmationCard
                  useGlow={false}
                  borderColor={resolvedCardColor}
                  wrapperStyle={styles.cardContainer}
                  cardStyle={cardAnimatedStyle}
                >
                  <Animated.Text
                    style={[styles.affirmationText, messageAnimatedStyle]}
                  >
                    "{displayMessage}"
                  </Animated.Text>
                </AffirmationCard>
              </AnimatedGlow>
            </View>
          </View>

          {/* Bottom label */}
          <View style={styles.footer}>
            <View style={styles.affirmingRow}>
              <Text style={styles.affirmingLabel}>YOU ARE MANIFESTING</Text>
              <Text style={styles.affirmingDots}>
                {'.'.repeat(dotCount).padEnd(3, '\u00A0')}
              </Text>
            </View>
          </View>
        </SafeAreaView>
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  safeArea: { flex: 1, paddingHorizontal: isSmallDevice ? 18 : 24 },
  brandTitleWrap: { alignItems: 'center', marginTop: 2, marginBottom: 2 },
  brandTitle: {
    fontFamily: Fonts.serif,
    fontSize: isSmallDevice ? 22 : 26,
    color: Colors.text,
    letterSpacing: 0.5,
  },
  headerTaperLine: {
    width: 96,
    height: 2,
    marginBottom: 8,
    borderRadius: 1,
  },
  headerTaperLineLeft: { alignSelf: 'flex-start' },
  headerTaperLineRight: { alignSelf: 'flex-end' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginTop: 6,
    marginBottom: 10,
  },
  headerLeftCol: { flex: 1, minWidth: 0, alignItems: 'flex-start' },
  headerLabel: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  headerValue: { fontFamily: Fonts.mono, fontSize: 14, color: Colors.text },
  headerRight: { flex: 1, minWidth: 0, alignItems: 'flex-end' },
  headerRightInner: { alignItems: 'flex-end', gap: 6 },
  soundToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  contentContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 80,
  },
  cardGlowWrapper: { marginVertical: 14 },
  cardContainer: {
    width: '100%',
    aspectRatio: 1.25,
    maxHeight: height * 0.26,
    maxWidth: 320,
    alignSelf: 'center',
  },
  affirmationText: {
    fontFamily: Fonts.serif,
    fontSize: isSmallDevice ? 20 : 24,
    color: Colors.text,
    textAlign: 'center',
    lineHeight: isSmallDevice ? 27 : 32,
  },
  footer: {
    alignItems: 'center',
    paddingBottom: 8,
  },
  affirmingRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  affirmingLabel: {
    fontFamily: Fonts.mono,
    fontSize: isSmallDevice ? 15 : 20,
    color: Colors.text,
    letterSpacing: 1.5,
    marginLeft: isSmallDevice ? 12 : 20,
  },
  affirmingDots: {
    fontFamily: Fonts.mono,
    fontSize: isSmallDevice ? 15 : 20,
    color: Colors.text,
    letterSpacing: 1,
    width: isSmallDevice ? 36 : 46,
  },
});
