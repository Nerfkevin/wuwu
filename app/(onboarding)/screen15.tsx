import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import Animated, {
  cancelAnimation,
  Easing,
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
  withTiming,
} from 'react-native-reanimated';
import AnimatedGlow, { PresetConfig } from '@/lib/animated-glow';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AudioBuffer, AudioContext } from '@/lib/audio-api-core';
import { getSavedRecordings, SavedRecording } from '@/lib/recording-store';
import { configureBackgroundPlaybackAsync } from '@/lib/audio-playback';
import { Colors, Fonts } from '@/constants/theme';
import {
  height,
  BOWL_VOLUME,
  BINAURAL_CARRIER,
  OSC_VOLUME,
  AFFIRMATION_DEFAULT_VOLUME_PERCENT,
  AMBIENT_VOLUME,
  BINAURAL_BEATS,
  BOWL_AUDIO_BY_FREQUENCY,
  NATURE_SOUNDS,
  AmbientNode,
  AmbientSoundId,
  affirmationPercentToGain,
} from '../session/playback-constants';
import { usePostHogScreenViewed } from "@/lib/posthog";
import MakeItRain from '@/app/session/make-it-rain';

const INTRO_MS = 5000;
const GAP_MS = 5000;
const MAX_TRACKS = 3;
const AMBIENT_ONBOARDING_VOLUME = 0.15;
const ONBOARDING_AMBIENTS: AmbientSoundId[] = ['rain', 'birds'];

const { width: screenWidth } = Dimensions.get('window');
const isSmallDevice = screenWidth < 380;
const isShortDevice = height < 720;

const ORB_PURPLE_DEEP = '#6B21CC';
const ORB_PURPLE = '#7C3AED';
const ORB_PURPLE_MID = '#A855F7';
const ORB_PURPLE_SOFT = '#C084FC';
const ORB_PURPLE_LIGHT = '#E9D5FF';

const ORB_SIZE = Math.round(
  Math.min(
    screenWidth - (isSmallDevice ? 48 : 64),
    height * (isShortDevice ? 0.42 : 0.34),
    isShortDevice ? 304 : 320
  )
);
const ORB_RADIUS = ORB_SIZE / 2;

const orbGlowPreset: PresetConfig = {
  metadata: { name: 'Orb Ring', textColor: '#FFFFFF', category: 'Custom', tags: [] },
  states: [
    {
      name: 'default',
      preset: {
        cornerRadius: ORB_RADIUS,
        outlineWidth: 1.5,
        borderColor: [ORB_PURPLE_SOFT, ORB_PURPLE_DEEP, ORB_PURPLE_MID, ORB_PURPLE_LIGHT, ORB_PURPLE_SOFT],
        backgroundColor: 'transparent',
        animationSpeed: 1.2,
        borderSpeedMultiplier: 1,
        glowLayers: [
          {
            glowPlacement: 'behind',
            colors: [ORB_PURPLE_SOFT, ORB_PURPLE, ORB_PURPLE_DEEP, ORB_PURPLE_MID],
            glowSize: isSmallDevice ? 10 : 14,
            opacity: 0.52,
            speedMultiplier: 1,
            coverage: 1,
          },
          {
            glowPlacement: 'behind',
            colors: [ORB_PURPLE_LIGHT, ORB_PURPLE_MID, ORB_PURPLE_DEEP, ORB_PURPLE_SOFT],
            glowSize: 4,
            opacity: 0.8,
            speedMultiplier: 0.8,
            coverage: 1,
          },
        ],
      },
    },
  ],
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

  const [settings, setSettings] = useState<SessionSettings>({
    freq: '528', bg: 'Brainwaves', brainwave: 'alpha',
  });
  const [recordings, setRecordings] = useState<SavedRecording[]>([]);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);

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
  const ambientNodesRef = useRef<Map<AmbientSoundId, AmbientNode>>(new Map());

  const sessionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionStartedAtRef = useRef<number | null>(null);
  const sessionElapsedMsRef = useRef(0);

  const mountedRef = useRef(true);
  const isPlayingRef = useRef(false);

  const messageOpacity = useSharedValue(0);
  const messageTranslateY = useSharedValue(0);
  const [displayMessage, setDisplayMessage] = useState('');
  const [dotCount, setDotCount] = useState(1);

  useEffect(() => {
    const id = setInterval(() => {
      setDotCount((prev) => (prev % 3) + 1);
    }, 500);
    return () => clearInterval(id);
  }, []);

  const currentRecording = recordings[currentTrackIndex];
  const message = currentRecording?.text ?? '';
  const hasAbundance = recordings.some((r) => r.pillar === 'Abundance');

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
    for (const { source, gain } of ambientNodesRef.current.values()) {
      try { source.stop(); } catch { /* already ended */ }
      try { source.disconnect(); } catch { /* best effort */ }
      try { gain.disconnect(); } catch { /* best effort */ }
    }
    ambientNodesRef.current.clear();
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

  const messageAnimatedStyle = useAnimatedStyle(() => ({
    opacity: messageOpacity.value,
    transform: [{ translateY: messageTranslateY.value }],
  }));

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
      const source = allRecs[0];
      const recs = source ? Array.from({ length: MAX_TRACKS }, () => source) : [];
      setRecordings(recs);

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

      const ambientGainValue = AMBIENT_VOLUME * AMBIENT_ONBOARDING_VOLUME;
      for (const id of ONBOARDING_AMBIENTS) {
        const entry = NATURE_SOUNDS.find((s) => s.id === id);
        if (!entry?.asset) continue;
        try {
          const buffer = await ctx.decodeAudioData(entry.asset);
          if (!mountedRef.current) return;
          const gain = ctx.createGain();
          gain.gain.setValueAtTime(0, ctx.currentTime);
          gain.gain.linearRampToValueAtTime(ambientGainValue, ctx.currentTime + 0.05);
          gain.connect(ctx.destination);
          const src = ctx.createBufferSource();
          src.buffer = buffer;
          src.loop = true;
          src.connect(gain);
          src.start();
          ambientNodesRef.current.set(id, { source: src, gain });
        } catch (e) {
          console.warn(`[screen15] failed to start ${id} ambient:`, e);
        }
      }

      isPlayingRef.current = true;
      startSessionTimer();

      await new Promise<void>((r) => setTimeout(r, INTRO_MS));
      if (!mountedRef.current) return;

      for (let i = 0; i < recs.length; i++) {
        if (!mountedRef.current) return;
        setCurrentTrackIndex(i);

        if (affirmationSourceRef.current) {
          const old = affirmationSourceRef.current;
          old.onEnded = null;
          try { old.stop(); } catch { /* ended */ }
          try { old.disconnect(); } catch { /* best effort */ }
          affirmationSourceRef.current = null;
        }

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

        await ctx.resume();
        if (!mountedRef.current) return;

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

      const FADE_S = 1;
      const now = ctx.currentTime;
      const fadeGains = [
        bowlGainRef.current,
        affirmationGainRef.current,
        binauralGainRef.current,
        ...[...ambientNodesRef.current.values()].map((n) => n.gain),
      ];
      fadeGains.forEach((g) => {
        if (!g) return;
        try {
          g.gain.cancelScheduledValues(now);
          g.gain.setValueAtTime(g.gain.value, now);
          g.gain.linearRampToValueAtTime(0, now + FADE_S);
        } catch { /* best effort */ }
      });
      await new Promise<void>((r) => setTimeout(r, FADE_S * 1000));

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

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={styles.container}>
        {hasAbundance && (
          <View style={[StyleSheet.absoluteFillObject, { opacity: 0.8, zIndex: 0 }]} pointerEvents="none">
            <MakeItRain />
          </View>
        )}
        <SafeAreaView
          style={[styles.safeArea, { paddingTop: insets.top + 6, paddingBottom: insets.bottom + 10 }]}
          edges={[]}
        >
          <View style={styles.brandTitleWrap}>
            <Text style={styles.brandTitle}>Wu-Wu</Text>
          </View>

          <View style={styles.contentContainer}>
            <View style={styles.cardGlowWrapper} pointerEvents="box-none">
              <AnimatedGlow preset={orbGlowPreset} activeState="default">
                <View style={styles.orbContainer}>
                  <View style={styles.orbCard}>
                    <LinearGradient
                      colors={['rgba(192, 132, 252, 0.2)', 'rgba(88, 28, 135, 0.12)', 'rgba(10, 0, 13, 0.18)']}
                      locations={[0, 0.55, 1]}
                      style={StyleSheet.absoluteFillObject}
                      pointerEvents="none"
                    />
                    <Animated.Text
                      style={[styles.affirmationText, messageAnimatedStyle]}
                      numberOfLines={5}
                      adjustsFontSizeToFit
                      minimumFontScale={0.55}
                    >
                      {displayMessage}
                    </Animated.Text>
                  </View>
                </View>
              </AnimatedGlow>
            </View>
          </View>

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
  safeArea: { flex: 1, paddingHorizontal: 24, justifyContent: 'space-between' },
  brandTitleWrap: { alignItems: 'center', justifyContent: 'center', marginTop: -5, marginBottom: 8, minHeight: 36 },
  brandTitle: {
    fontFamily: Fonts.serif,
    fontSize: 32,
    color: Colors.text,
    letterSpacing: 0.5,
  },
  contentContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardGlowWrapper: { marginVertical: isSmallDevice ? 8 : 12 },
  orbContainer: {
    width: ORB_SIZE,
    height: ORB_SIZE,
    aspectRatio: 1,
    borderRadius: ORB_RADIUS,
    alignSelf: 'center',
    overflow: 'hidden',
  },
  orbCard: {
    flex: 1,
    borderRadius: ORB_RADIUS,
    borderWidth: 0,
    paddingHorizontal: ORB_SIZE * 0.17,
    paddingVertical: ORB_SIZE * 0.18,
    backgroundColor: 'rgba(114, 9, 183, 0.1)',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  affirmationText: {
    fontFamily: Fonts.serif,
    fontSize: isSmallDevice ? 30 : 34,
    color: Colors.text,
    textAlign: 'center',
    lineHeight: isSmallDevice ? 44 : 52,
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
