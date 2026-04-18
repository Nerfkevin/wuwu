import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, Pressable, Dimensions } from 'react-native';

const { width: screenWidth } = Dimensions.get('window');
const isSmallDevice = screenWidth < 380;
import { LinearGradient } from 'expo-linear-gradient';
import Background from 'react-native-ambient-background';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useNavigation } from '@react-navigation/native';
import { getProfileStats, recordPlaybackSession } from '@/lib/profile-stats';
import Animated, {
  cancelAnimation,
  Easing,
  interpolateColor,
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import AnimatedGlow, { GlowEvent, PresetConfig } from '@/lib/animated-glow';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import AffirmationCard from '../add/components/affirmation-card';
import { AFFIRMATION_PILLARS, PillarKey } from '@/constants/affirmations';
import { Colors, Fonts } from '@/constants/theme';
import { GlowPresets } from '@/constants/glow';
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
  withAlpha,
} from './playback-constants';
import { usePostHog, usePostHogScreenViewed } from '@/lib/posthog';

const triggerHaptic = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
const triggerFinishHaptic = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

export default function PlaybackScreen() {
  usePostHogScreenViewed({
    screen: "session/playback",
    component: "PlaybackScreen",
  });

  const ph = usePostHog();
  const router = useRouter();
  const navigation = useNavigation();
  const statsRecordedRef = useRef(false);
  const { text, freq, bg, brainwave, color } = useLocalSearchParams<{
    text?: string; freq?: string; bg?: string; brainwave?: string; color?: string;
  }>();
  const insets = useSafeAreaInsets();
  const [glowState, setGlowState] = useState<GlowEvent>('default');
  const [showAmbientModal, setShowAmbientModal] = useState(false);
  const ambientBtnScale = useSharedValue(1);
  const ambientBtnStyle = useAnimatedStyle(() => ({ transform: [{ scale: ambientBtnScale.value }] }));
  const finishScale = useSharedValue(1);
  const finishPulse = useCallback(() => {
    finishScale.value = withRepeat(
      withSequence(
        withTiming(1.06, { duration: 950, easing: Easing.inOut(Easing.sin) }),
        withTiming(1, { duration: 950, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      false
    );
  }, [finishScale]);
  const finishButtonStyle = useAnimatedStyle(() => ({ transform: [{ scale: finishScale.value }] }));

  useEffect(() => {
    finishPulse();
    return () => cancelAnimation(finishScale);
  }, [finishPulse, finishScale]);

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
    volume, recordings, currentTrackIndex, completedSetCount, sessionElapsedMs,
    handlePlayToggle, stopSession, toggleBowlMute, toggleOscMute,
    toggleAmbientSound, updateVolume, ambientVolumes, updateAmbientVolume,
  } = useAudioEngine({
    selectedBowlAudio,
    selectedFrequency,
    selectedBrainwave,
    shouldPlaySingingBowl,
    shouldPlayBrainwave,
    shouldPlayPure,
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
  const currentRecording = recordings[currentTrackIndex];
  const messagePillarColor =
    currentRecording?.pillar && currentRecording.pillar in AFFIRMATION_PILLARS
      ? AFFIRMATION_PILLARS[currentRecording.pillar as PillarKey].color
      : selectedColor;

  // ─── Animation state ──────────────────────────────────────────────────────
  const volumeProgress = useSharedValue(AFFIRMATION_DEFAULT_VOLUME_PERCENT / 100);
  const playScale = useSharedValue(1);
  const messageOpacity = useSharedValue(1);
  const messageTranslateY = useSharedValue(0);
  const cardColorProgress = useSharedValue(1);
  const [displayMessage, setDisplayMessage] = useState(fallbackMessage);
  const [cardGlowState, setCardGlowState] = useState<GlowEvent>('default');
  const [resolvedCardColor, setResolvedCardColor] = useState<string>(selectedColor);
  const [cardColorRange, setCardColorRange] = useState({ from: selectedColor, to: selectedColor });
  const sliderWidthSV = useSharedValue(0);

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
  }, [cardColorProgress, finalizeCardColorTransition, messagePillarColor, resolvedCardColor]);

  // ─── Volume gesture ───────────────────────────────────────────────────────
  const gesture = Gesture.Pan()
    .onStart((e) => {
      runOnJS(triggerHaptic)();
      if (sliderWidthSV.value > 0) {
        const p = Math.max(0.01, Math.min(1, e.x / sliderWidthSV.value));
        volumeProgress.value = p;
        runOnJS(updateVolume)(p);
      }
    })
    .onUpdate((e) => {
      if (sliderWidthSV.value > 0) {
        const p = Math.max(0.01, Math.min(1, e.x / sliderWidthSV.value));
        volumeProgress.value = p;
        runOnJS(updateVolume)(p);
      }
    });

  // ─── Animated styles ──────────────────────────────────────────────────────
  const sliderStyle = useAnimatedStyle(() => ({ width: volumeProgress.value * sliderWidthSV.value }));
  const labelClipStyle = useAnimatedStyle(() => ({ width: volumeProgress.value * sliderWidthSV.value }));
  const labelFullStyle = useAnimatedStyle(() => ({ width: sliderWidthSV.value }));
  const playButtonAnimatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: playScale.value }] }));
  const messageAnimatedStyle = useAnimatedStyle(() => ({
    opacity: messageOpacity.value,
    transform: [{ translateY: messageTranslateY.value }],
  }));
  const cardAnimatedStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(cardColorProgress.value, [0, 0.5, 1], cardBorderTransitionColors),
  }), [cardBorderTransitionColors]);

  const cardGlowPreset = useMemo<PresetConfig>(() => ({
    metadata: { name: 'Affirmation Card Transition', textColor: '#FFFFFF', category: 'Custom', tags: [] },
    states: [
      {
        name: 'default',
        preset: {
          cornerRadius: 28,
          outlineWidth: 0,
          glowLayers: [{ colors: [cardColorRange.from, cardColorRange.from], opacity: 0.6, glowSize: 10 }],
        },
      },
      {
        name: 'hover',
        transition: 1100,
        preset: {
          glowLayers: [{ colors: [cardColorRange.to, cardColorRange.to], opacity: 0.66, glowSize: 12 }],
        },
      },
    ],
  }), [cardColorRange.from, cardColorRange.to]);

  const makeItRainActive = activeAmbientSounds.has('money');

  // ─── Derived display values ───────────────────────────────────────────────
  const totalMessages = recordings.length;
  const progressLabel =
    totalMessages > 0
      ? `${Math.min(currentTrackIndex + 1, totalMessages)}/${totalMessages}/${completedSetCount + 1}`
      : '0/0/1';
  const totalElapsedSec = Math.floor(sessionElapsedMs / 1000);
  const sessionTimerLabel = `${String(Math.floor(totalElapsedSec / 60)).padStart(2, '0')}:${String(totalElapsedSec % 60).padStart(2, '0')}`;
  const volumeLabel = volume <= 1 ? 'Subliminal' : `${volume}%`;
  const bowlIconColor = !isBowlMuted ? selectedColor : Colors.textSecondary;
  const bowlIconName = !isBowlMuted ? 'volume-high' : 'volume-mute';
  const oscIconColor = !isOscMuted ? selectedColor : Colors.textSecondary;
  const oscIconName = !isOscMuted ? 'volume-high' : 'volume-mute';

  const handleFinish = async () => {
    const prevStats = await getProfileStats();
    const ms = stopSession();
    statsRecordedRef.current = true;
    if (ms > 0) await recordPlaybackSession(ms);
    try {
      ph?.capture('session_finished', {
        session_ms: Math.max(0, ms),
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
        sessionMs: String(Math.max(0, ms)),
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
          style={[styles.safeArea, { paddingTop: insets.top + 6, paddingBottom: insets.bottom + 24 }]}
          edges={[]}
        >
          <View style={styles.brandTitleWrap}>
            <Text style={styles.brandTitle}>Wu-Wu</Text>
          </View>

          <View style={styles.header}>
            <View style={styles.headerTopRow}>
              <View style={styles.headerLeftCol}>
                <LinearGradient
                  colors={[
                    'rgba(200, 200, 205, 0)',
                    'rgba(200, 200, 205, 0.35)',
                    'rgba(220, 220, 225, 0.85)',
                    'rgba(200, 200, 205, 0.35)',
                    'rgba(200, 200, 205, 0)',
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
                      'rgba(200, 200, 205, 0)',
                      'rgba(200, 200, 205, 0.35)',
                      'rgba(220, 220, 225, 0.85)',
                      'rgba(200, 200, 205, 0.35)',
                      'rgba(200, 200, 205, 0)',
                    ]}
                    locations={[0, 0.22, 0.5, 0.78, 1]}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={[styles.headerTaperLine, styles.headerTaperLineRight]}
                  />
                  {shouldPlayBrainwave ? (
                    <Pressable style={styles.soundToggle} onPress={toggleOscMute}>
                      <Ionicons name={oscIconName} size={16} color={oscIconColor} />
                      <Text style={[styles.headerLabel, { color: oscIconColor }]}>
                        {BINAURAL_BEATS[selectedBrainwave] ?? BINAURAL_BEATS.alpha} Hz
                      </Text>
                    </Pressable>
                  ) : shouldPlayPure ? (
                    <Pressable style={styles.soundToggle} onPress={toggleOscMute}>
                      <Ionicons name={oscIconName} size={16} color={oscIconColor} />
                      <Text style={[styles.headerLabel, { color: oscIconColor }]}>{selectedFrequency} Hz</Text>
                    </Pressable>
                  ) : (
                    <Pressable style={styles.soundToggle} onPress={toggleBowlMute}>
                      <Ionicons name={bowlIconName} size={16} color={bowlIconColor} />
                      <Text style={[styles.headerLabel, { color: bowlIconColor }]}>{selectedFrequency} Hz</Text>
                    </Pressable>
                  )}
                  <Text style={styles.headerValue}>
                    {shouldPlayBrainwave
                      ? (BRAINWAVE_LABELS[selectedBrainwave] ?? selectedBrainwave)
                      : shouldPlayPure
                      ? 'Pure'
                      : selectedBackground}
                  </Text>
                </View>
              </View>
            </View>
            <View style={styles.headerRowEnd}>
              <Animated.View style={ambientBtnStyle}>
                <Pressable
                  style={styles.ambientButton}
                  onPress={() => setShowAmbientModal(true)}
                  onPressIn={() => {
                    triggerHaptic();
                    ambientBtnScale.value = withTiming(0.85, { duration: 100, easing: Easing.out(Easing.quad) });
                  }}
                  onPressOut={() => {
                    ambientBtnScale.value = withTiming(1, { duration: 180, easing: Easing.out(Easing.back(2)) });
                  }}
                >
                  <MaterialCommunityIcons name="flower-outline" size={18} color="#000" />
                </Pressable>
              </Animated.View>
            </View>
          </View>

          {/* Main content */}
          <View style={styles.contentContainer}>
            <View style={styles.cardGlowWrapper}>
              <AnimatedGlow preset={cardGlowPreset} activeState={cardGlowState}>
                <AffirmationCard
                  useGlow={false}
                  borderColor={resolvedCardColor}
                  wrapperStyle={styles.cardContainer}
                  cardStyle={cardAnimatedStyle}
                >
                  <Animated.Text style={[styles.affirmationText, messageAnimatedStyle]}>
                    "{displayMessage}"
                  </Animated.Text>
                </AffirmationCard>
              </AnimatedGlow>
            </View>
            <View style={styles.controlsContainer}>
              <AnimatedGlow
                preset={GlowPresets.chakra(32, [Colors.chakra.orange, Colors.chakra.orange], 8, 5)}
                activeState={glowState}
              >
                <Animated.View style={playButtonAnimatedStyle}>
                  <Pressable
                    style={styles.playButton}
                    onPress={() => { void handlePlayToggle(); }}
                    onPressIn={() => {
                      triggerHaptic();
                      playScale.value = withTiming(0.88, { duration: 80 });
                      setGlowState('press');
                    }}
                    onPressOut={() => {
                      playScale.value = withTiming(1, { duration: 120 });
                      setGlowState('default');
                    }}
                  >
                    <Ionicons name={isPlaying ? 'pause' : 'play'} size={32} color="#000" />
                  </Pressable>
                </Animated.View>
              </AnimatedGlow>
              <Text style={styles.timerText}>{sessionTimerLabel}</Text>
            </View>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Animated.View style={finishButtonStyle}>
              <Pressable
                onPress={() => { void handleFinish(); }}
                onPressIn={() => {
                  void triggerFinishHaptic();
                  cancelAnimation(finishScale);
                  finishScale.value = withTiming(0.92, { duration: 100, easing: Easing.out(Easing.quad) });
                }}
                onPressOut={() => {
                  finishScale.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.back(2)) }, (finished) => {
                    if (!finished) return;
                    runOnJS(finishPulse)();
                  });
                }}
              >
                <Text style={styles.finishText}>Finish Session</Text>
              </Pressable>
            </Animated.View>
            <View style={styles.volumeContainer}>
              <MaterialCommunityIcons name="head-flash" size={20} color="rgba(255,255,255,0.5)" />
              <GestureDetector gesture={gesture}>
                <View style={styles.sliderContainer} onLayout={(e) => { sliderWidthSV.value = e.nativeEvent.layout.width; }}>
                  <View style={styles.pillTrack}>
                    <Animated.View style={[styles.pillFill, sliderStyle]} />
                    {/* White label — visible over dark empty area */}
                    <View style={styles.labelLayer} pointerEvents="none">
                      <Text style={styles.pillLabelWhite}>{volumeLabel}</Text>
                    </View>
                    {/* Black label clipped to fill width — visible over white fill */}
                    <Animated.View style={[styles.labelClipOuter, labelClipStyle]} pointerEvents="none">
                      <Animated.View style={[styles.labelClipInner, labelFullStyle]}>
                        <Text style={styles.pillLabelBlack}>{volumeLabel}</Text>
                      </Animated.View>
                    </Animated.View>
                  </View>
                </View>
              </GestureDetector>
            </View>
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
      />

      {makeItRainActive && isPlaying && <MakeItRain />}
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  safeArea: { flex: 1, paddingHorizontal: 24, justifyContent: 'space-between' },
  brandTitleWrap: { alignItems: 'center', marginTop: -5, marginBottom: 5 },
  brandTitle: {
    fontFamily: Fonts.serif,
    fontSize: 32,
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
    flexDirection: 'column',
    marginTop: 6,
    marginBottom: 10,
    gap: 4,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerLeftCol: { flex: 1, minWidth: 0, alignItems: 'flex-start' },
  headerRowEnd: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 4,
  },
  headerLabel: { fontFamily: Fonts.mono, fontSize: 12, color: Colors.textSecondary },
  headerValue: { fontFamily: Fonts.mono, fontSize: 14, color: Colors.text },
  headerRight: { flex: 1, minWidth: 0, alignItems: 'flex-end' },
  headerRightInner: { alignItems: 'flex-end', gap: 6 },
  soundToggle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ambientButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'flex-end',
  },
  contentContainer: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: isSmallDevice ? 52 : 72 },
  setLabel: { fontFamily: Fonts.mono, fontSize: 14, color: Colors.textSecondary, marginBottom: 12 },
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
  controlsContainer: { alignItems: 'center', marginTop: isSmallDevice ? 18 : 28, gap: 12 },
  playButton: {
    width: isSmallDevice ? 60 : 72,
    height: isSmallDevice ? 60 : 72,
    borderRadius: isSmallDevice ? 30 : 36,
    backgroundColor: Colors.chakra.orange,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Colors.chakra.orange,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 4,
  },
  timerText: { fontFamily: Fonts.mono, fontSize: 14, color: Colors.text, marginTop: 4 },
  footer: { width: '100%', gap: 30, alignItems: 'center', marginBottom: -20 },
  finishText: { fontFamily: Fonts.mono, fontSize: 14, color: Colors.textSecondary, fontWeight: '500' },
  volumeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    gap: 10,
  },
  sliderContainer: { flex: 1, height: 50 },
  pillTrack: {
    flex: 1,
    height: 50,
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
