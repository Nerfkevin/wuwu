import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, Pressable, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Background from 'react-native-ambient-background';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useNavigation } from '@react-navigation/native';
import { getProfileStats, recordPlaybackSession } from '@/lib/profile-stats';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
  withTiming,
} from 'react-native-reanimated';
import AnimatedGlow, { type PresetConfig } from '@/lib/animated-glow';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Colors, Fonts } from '@/constants/theme';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useAudioEngine } from './use-audio-engine';
import AmbientModal from './ambient-modal';
import MakeItRain from './make-it-rain';
import {
  height,
  AFFIRMATION_DEFAULT_VOLUME_PERCENT,
  BINAURAL_BEATS,
  BOWL_AUDIO_BY_FREQUENCY,
  BRAINWAVE_LABELS,
} from './playback-constants';
import { usePostHog, usePostHogScreenViewed } from '@/lib/posthog';

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
const VOLUME_ICON_SLOT = 36;
const VOLUME_ROW_GAP = 10;

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
            // @ts-ignore: glowPlacement is supported but types might be outdated
            glowPlacement: 'behind',
            colors: [ORB_PURPLE_SOFT, ORB_PURPLE, ORB_PURPLE_DEEP, ORB_PURPLE_MID],
            glowSize: isSmallDevice ? 10 : 14,
            opacity: 0.52,
            speedMultiplier: 1,
            coverage: 1,
          },
          {
            // @ts-ignore: glowPlacement is supported but types might be outdated
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

const triggerHaptic = () => {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
};
const triggerFinishHaptic = () => {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
};

export default function PlaybackScreen() {
  usePostHogScreenViewed({
    screen: "session/playback",
    component: "PlaybackScreen",
  });

  const ph = usePostHog();
  const router = useRouter();
  const navigation = useNavigation();
  const statsRecordedRef = useRef(false);
  const { text, freq, bg, brainwave, color, playlistId } = useLocalSearchParams<{
    text?: string; freq?: string; bg?: string; brainwave?: string; color?: string; playlistId?: string;
  }>();
  const insets = useSafeAreaInsets();
  const [showAmbientModal, setShowAmbientModal] = useState(false);
  const [volumeOpen, setVolumeOpen] = useState(false);
  const [volumeTrackWidth, setVolumeTrackWidth] = useState(0);
  const ambientBtnScale = useSharedValue(1);
  const ambientBtnStyle = useAnimatedStyle(() => ({ transform: [{ scale: ambientBtnScale.value }] }));
  const finishScale = useSharedValue(1);

  // ─── Derived params ───────────────────────────────────────────────────────
  const selectedFrequency = typeof freq === 'string' && freq in BOWL_AUDIO_BY_FREQUENCY ? freq : '528';
  const selectedBackground = typeof bg === 'string' ? bg : 'Brainwaves';
  const shouldPlaySingingBowl = selectedBackground === 'Singing Bowl';
  const selectedBrainwave = typeof brainwave === 'string' && brainwave in BINAURAL_BEATS ? brainwave : 'alpha';
  const shouldPlayBrainwave = selectedBackground === 'Brainwaves';
  const shouldPlayPure = selectedBackground === 'Pure';
  const selectedBowlAudio = BOWL_AUDIO_BY_FREQUENCY[selectedFrequency] ?? BOWL_AUDIO_BY_FREQUENCY['528'];
  const fallbackMessage =
    typeof text === 'string' && text.trim().length > 0
      ? text.trim()
      : 'I am deeply loved in healthy, reciprocal relationships';
  const selectedColor = typeof color === 'string' && color.length > 0 ? color : Colors.chakra.blue;

  // ─── Audio engine ─────────────────────────────────────────────────────────
  const {
    isPlaying, isBowlMuted, isOscMuted, activeAmbientSounds,
    volume, recordings, currentTrackIndex, sessionElapsedMs,
    handlePlayToggle, stopSession, fadeOutAll, toggleBowlMute, toggleOscMute,
    toggleAmbientSound, updateVolume, setVolumeImmediate,
    ambientVolumes, updateAmbientVolume,
  } = useAudioEngine({
    selectedBowlAudio,
    selectedFrequency,
    selectedBrainwave,
    shouldPlaySingingBowl,
    shouldPlayBrainwave,
    shouldPlayPure,
    ...(typeof playlistId === 'string' ? { playlistId } : {}),
  });

  useEffect(() => {
    statsRecordedRef.current = false;
    const unsub = navigation.addListener('beforeRemove', () => {
      const ms = stopSession();
      if (statsRecordedRef.current) return;
      statsRecordedRef.current = true;
      if (ms > 0) void recordPlaybackSession(ms);
    });
    return unsub;
  }, [navigation, stopSession]);

  // ─── Message display ──────────────────────────────────────────────────────
  const hasTrackMessage = recordings.length > 0 && !!recordings[currentTrackIndex]?.text;
  const message = hasTrackMessage ? recordings[currentTrackIndex].text : fallbackMessage;

  // ─── Animation state ──────────────────────────────────────────────────────
  const volumeProgress = useSharedValue(AFFIRMATION_DEFAULT_VOLUME_PERCENT / 100);
  const volumeOpenSV = useSharedValue(0);
  const playScale = useSharedValue(1);
  const messageOpacity = useSharedValue(1);
  const messageTranslateY = useSharedValue(0);
  const [displayMessage, setDisplayMessage] = useState(fallbackMessage);
  const sliderWidthSV = useSharedValue(0);
  const lastVolumeCommitMsSV = useSharedValue(0);

  useEffect(() => {
    if (displayMessage === message) return;
    cancelAnimation(messageOpacity);
    cancelAnimation(messageTranslateY);
    messageTranslateY.value = 0;
    messageOpacity.value = withTiming(0, { duration: 180, easing: Easing.out(Easing.cubic) }, (finished) => {
      if (!finished) return;
      messageTranslateY.value = 12;
      runOnJS(setDisplayMessage)(message);
      messageOpacity.value = withTiming(1, { duration: 360, easing: Easing.inOut(Easing.cubic) });
      messageTranslateY.value = withTiming(0, { duration: 360, easing: Easing.inOut(Easing.cubic) });
    });
  }, [displayMessage, message, messageOpacity, messageTranslateY]);

  // Sync slider position when volume is restored from storage
  useEffect(() => {
    volumeProgress.value = volume / 100;
  }, [volume, volumeProgress]);

  // ─── Volume gesture ───────────────────────────────────────────────────────
  // Real-time audio updates every frame via refs (no React re-render).
  // React state commits throttled to ~10Hz so the label updates smoothly
  // without thrashing the whole screen re-render.
  const VOLUME_COMMIT_INTERVAL_MS = 100;
  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .onStart((e) => {
          runOnJS(triggerHaptic)();
          if (sliderWidthSV.value <= 0) return;
          const p = Math.max(0.01, Math.min(1, e.x / sliderWidthSV.value));
          volumeProgress.value = p;
          lastVolumeCommitMsSV.value = Date.now();
          runOnJS(updateVolume)(p);
        })
        .onUpdate((e) => {
          if (sliderWidthSV.value <= 0) return;
          const p = Math.max(0.01, Math.min(1, e.x / sliderWidthSV.value));
          volumeProgress.value = p;
          runOnJS(setVolumeImmediate)(p);
          const now = Date.now();
          if (now - lastVolumeCommitMsSV.value >= VOLUME_COMMIT_INTERVAL_MS) {
            lastVolumeCommitMsSV.value = now;
            runOnJS(updateVolume)(p);
          }
        })
        .onEnd((e) => {
          if (sliderWidthSV.value <= 0) return;
          const p = Math.max(0.01, Math.min(1, e.x / sliderWidthSV.value));
          runOnJS(updateVolume)(p);
        }),
    [setVolumeImmediate, sliderWidthSV, updateVolume, volumeProgress, lastVolumeCommitMsSV]
  );

  // ─── Animated styles ──────────────────────────────────────────────────────
  const sliderStyle = useAnimatedStyle(() => ({ width: volumeProgress.value * sliderWidthSV.value }));
  const labelClipStyle = useAnimatedStyle(() => ({ width: volumeProgress.value * sliderWidthSV.value }));
  const labelFullStyle = useAnimatedStyle(() => ({ width: sliderWidthSV.value }));
  const playButtonAnimatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: playScale.value }] }));
  const messageAnimatedStyle = useAnimatedStyle(() => ({
    opacity: messageOpacity.value,
    transform: [{ translateY: messageTranslateY.value }],
  }));
  const volumeRevealStyle = useAnimatedStyle(() => ({
    opacity: volumeOpenSV.value,
  }));
  const finishFadeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(volumeOpenSV.value, [0, 1], [1, 0]),
    transform: [{ scale: finishScale.value }],
  }));

  const toggleVolumeSlider = () => {
    triggerHaptic();
    const next = !volumeOpen;
    setVolumeOpen(next);
    volumeOpenSV.value = withTiming(next ? 1 : 0, {
      duration: 280,
      easing: Easing.inOut(Easing.cubic),
    });
  };

  const makeItRainActive = activeAmbientSounds.has('money');

  const totalElapsedSec = Math.floor(sessionElapsedMs / 1000);
  const sessionTimerLabel = `${String(Math.floor(totalElapsedSec / 60)).padStart(2, '0')}:${String(totalElapsedSec % 60).padStart(2, '0')}`;
  const volumeLabel = volume <= 1 ? 'Subliminal' : `${volume}%`;
  const sessionHzLabel = shouldPlayBrainwave
    ? `${BINAURAL_BEATS[selectedBrainwave] ?? BINAURAL_BEATS.alpha} Hz`
    : `${selectedFrequency} Hz`;
  const sessionBackgroundLabel = shouldPlayBrainwave
    ? (BRAINWAVE_LABELS[selectedBrainwave] ?? selectedBrainwave)
    : shouldPlayPure
    ? 'Pure'
    : selectedBackground;
  const sessionSoundMuted = shouldPlayBrainwave || shouldPlayPure ? isOscMuted : isBowlMuted;
  const onToggleSessionSound = shouldPlayBrainwave || shouldPlayPure ? toggleOscMute : toggleBowlMute;

  const handleFinish = async () => {
    fadeOutAll(900);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const ms = stopSession();
    statsRecordedRef.current = true;

    if (ms <= 0) {
      router.back();
      return;
    }

    const prevStats = await getProfileStats();
    await recordPlaybackSession(ms);
    try {
      ph?.capture('session_finished', {
        session_ms: ms,
        background: selectedBackground,
        frequency: !shouldPlayBrainwave ? (selectedFrequency ?? null) : null,
        brainwave: shouldPlayBrainwave ? (selectedBrainwave ?? null) : null,
      });
      void ph?.flush();
    } catch {}
    router.replace({
      pathname: '/session/complete',
      params: {
        prevTotalMs: String(prevStats.totalPlayMs),
        sessionMs: String(ms),
        prevSessionCount: String(prevStats.sessionCount),
      },
    });
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={styles.container}>
        <Background
          variant="fluid"
          mainColor="#0a000d"
          speed={0.2}
          style={StyleSheet.absoluteFillObject}
        />
        <SafeAreaView
          style={[styles.safeArea, { paddingTop: insets.top + 6, paddingBottom: insets.bottom + 10 }]}
          edges={[]}
        >
          <View style={styles.brandTitleWrap}>
            <Text style={styles.brandTitle}>Wu-Wu</Text>
            <Animated.View style={[styles.ambientBtnWrap, ambientBtnStyle]}>
              <Pressable
                style={styles.iconRing}
                onPress={() => setShowAmbientModal(true)}
                onPressIn={() => {
                  triggerHaptic();
                  ambientBtnScale.value = withTiming(0.85, { duration: 100, easing: Easing.out(Easing.quad) });
                }}
                onPressOut={() => {
                  ambientBtnScale.value = withTiming(1, { duration: 180, easing: Easing.out(Easing.back(2)) });
                }}
              >
                <MaterialCommunityIcons name="flower" size={18} color={ORB_PURPLE_SOFT} />
              </Pressable>
            </Animated.View>
          </View>

          {/* Main content */}
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
            <View style={styles.controlsContainer}>
              <Animated.View style={playButtonAnimatedStyle}>
                <Pressable
                  style={styles.playButton}
                  hitSlop={12}
                  onPress={() => { void handlePlayToggle(); }}
                  onPressIn={() => {
                    triggerHaptic();
                    playScale.value = withTiming(0.88, { duration: 80 });
                  }}
                  onPressOut={() => {
                    playScale.value = withTiming(1, { duration: 120 });
                  }}
                >
                  <Ionicons
                    name={isPlaying ? 'pause' : 'play'}
                    size={isSmallDevice ? 22 : 26}
                    color={ORB_PURPLE_SOFT}
                    style={!isPlaying ? { marginLeft: 3 } : undefined}
                  />
                </Pressable>
              </Animated.View>
              <Text style={styles.timerText}>{sessionTimerLabel}</Text>
            </View>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Pressable
              onPress={toggleVolumeSlider}
              hitSlop={12}
              style={styles.volumeIconHit}
            >
              <View style={styles.iconRing}>
                <MaterialCommunityIcons
                  name="head-flash"
                  size={18}
                  color={ORB_PURPLE_SOFT}
                />
              </View>
            </Pressable>
            <Animated.View
              style={[styles.finishOverlay, finishFadeStyle]}
              pointerEvents={volumeOpen ? 'none' : 'auto'}
            >
              <Pressable
                onPress={() => { void handleFinish(); }}
                onPressIn={() => {
                  void triggerFinishHaptic();
                  cancelAnimation(finishScale);
                  finishScale.value = withTiming(0.92, { duration: 100, easing: Easing.out(Easing.quad) });
                }}
                onPressOut={() => {
                  finishScale.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.back(2)) });
                }}
              >
                <Text style={styles.finishText}>Finish Session</Text>
              </Pressable>
            </Animated.View>
            <Animated.View
              style={[styles.volumeSliderReveal, volumeRevealStyle]}
              pointerEvents={volumeOpen ? 'auto' : 'none'}
              onLayout={(e) => {
                const w = e.nativeEvent.layout.width;
                sliderWidthSV.value = w;
                setVolumeTrackWidth((prev) => (prev === w ? prev : w));
              }}
            >
              <GestureDetector gesture={gesture}>
                <View style={[styles.sliderContainer, { width: volumeTrackWidth }]}>
                  <View style={styles.pillTrack}>
                    <Animated.View style={[styles.pillFill, sliderStyle]} />
                    <View style={styles.labelLayer} pointerEvents="none">
                      <Text style={styles.pillLabelWhite}>{volumeLabel}</Text>
                    </View>
                    <Animated.View style={[styles.labelClipOuter, labelClipStyle]} pointerEvents="none">
                      <Animated.View style={[styles.labelClipInner, labelFullStyle]}>
                        <Text style={styles.pillLabelBlack}>{volumeLabel}</Text>
                      </Animated.View>
                    </Animated.View>
                  </View>
                </View>
              </GestureDetector>
            </Animated.View>
          </View>
        </SafeAreaView>
      </View>

      <AmbientModal
        visible={showAmbientModal}
        onClose={() => setShowAmbientModal(false)}
        activeAmbientSounds={activeAmbientSounds}
        onToggle={(id) => { void toggleAmbientSound(id); }}
        ambientVolumes={ambientVolumes}
        onAmbientVolumeChange={updateAmbientVolume}
        sessionHzLabel={sessionHzLabel}
        sessionBackgroundLabel={sessionBackgroundLabel}
        sessionSoundMuted={sessionSoundMuted}
        sessionSoundColor={sessionSoundMuted ? Colors.textSecondary : selectedColor}
        onToggleSessionSound={onToggleSessionSound}
      />

      {makeItRainActive && isPlaying && (
        <View style={[StyleSheet.absoluteFillObject, { opacity: 0.8, zIndex: 0 }]} pointerEvents="none">
          <MakeItRain />
        </View>
      )}
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  safeArea: { flex: 1, paddingHorizontal: 24, justifyContent: 'space-between' },
  brandTitleWrap: { alignItems: 'center', justifyContent: 'center', marginTop: -5, marginBottom: 8, minHeight: 36 },
  brandTitle: {
    fontFamily: Fonts.serif,
    fontSize: 32,
    color: Colors.text,
    letterSpacing: 0.5,
  },
  ambientBtnWrap: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  contentContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: isSmallDevice ? 40 : 64,
  },
  setLabel: { fontFamily: Fonts.mono, fontSize: 14, color: Colors.textSecondary, marginBottom: 12 },
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
  controlsContainer: {
    alignItems: 'center',
    marginTop: isSmallDevice ? 36 : 52,
    gap: 10,
    zIndex: 2,
  },
  playButton: {
    width: isSmallDevice ? 54 : 64,
    height: isSmallDevice ? 54 : 64,
    borderRadius: isSmallDevice ? 27 : 32,
    borderWidth: 2,
    borderColor: ORB_PURPLE_SOFT,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  timerText: { fontFamily: Fonts.mono, fontSize: 14, color: Colors.text, marginTop: 4 },
  footer: {
    width: '100%',
    height: 44,
    justifyContent: 'center',
  },
  finishOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  finishText: { fontFamily: Fonts.mono, fontSize: 14, color: ORB_PURPLE_SOFT, fontWeight: '500' },
  volumeIconHit: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: VOLUME_ICON_SLOT,
    zIndex: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconRing: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: ORB_PURPLE_SOFT,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  volumeSliderReveal: {
    position: 'absolute',
    left: VOLUME_ICON_SLOT + VOLUME_ROW_GAP,
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  sliderContainer: { height: 44 },
  pillTrack: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
  },
  pillFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderRadius: 22,
  },
  labelLayer: {
    position: 'absolute',
    top: 0, bottom: 0, left: 0, right: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pillLabelWhite: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    color: '#fff',
    letterSpacing: 0.4,
  },
  labelClipOuter: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  labelClipInner: {
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pillLabelBlack: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    color: '#000',
    letterSpacing: 0.4,
  },
});
