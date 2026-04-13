import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  Dimensions,
} from 'react-native';
import { MeshGradientView } from 'expo-mesh-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import LottieView from 'lottie-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Fonts } from '@/constants/theme';
import { formatHoursPlayed } from '@/lib/profile-stats';
import { updateStreakOnSession } from '@/lib/streak-utils';
import { createAudioPlayer } from '@/lib/expo-audio';
import { usePostHogScreenViewed } from '@/lib/posthog';

const { width } = Dimensions.get('window');
const isSmallDevice = width < 380;

const BG_COLORS = [
  '#3d0000', '#7a0000', '#2a0000',
  '#5c0000', '#990000', '#3d0000',
  '#1a0000', '#520000', '#2a0000',
];
const BG_POINTS: [number, number][] = [
  [0.0, 0.0], [0.5, 0.0], [1.0, 0.0],
  [0.0, 0.5], [0.5, 0.42], [1.0, 0.5],
  [0.0, 1.0], [0.5, 1.0], [1.0, 1.0],
];

const DAY_LABELS = ['su', 'mo', 'tu', 'we', 'th', 'fr', 'sa'];

function getWeekDates() {
  const today = new Date();
  const dayOfWeek = today.getDay();
  return DAY_LABELS.map((_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - dayOfWeek + i);
    return d.getDate();
  });
}

function getMotivation(streak: number) {
  if (streak === 0) return 'start your first session to build your streak';
  if (streak <= 1) return 'great start! keep building your daily affirmation habit';
  if (streak < 7) return "you're on a roll! keep the momentum going";
  if (streak < 30) return "amazing consistency! you're building a real habit";
  return "you're unstoppable!";
}

const COUNT_DURATION = 1600;
const HAPTIC_INTERVAL_MS = 70;

export default function SessionCompleteScreen() {
  usePostHogScreenViewed({
    screen: "session/complete",
    component: "SessionCompleteScreen",
  });

  const router = useRouter();
  const lottieRef = useRef<LottieView>(null);
  const today = new Date().getDay();
  const weekDates = getWeekDates();

  const { prevTotalMs, sessionMs, prevSessionCount } = useLocalSearchParams<{
    prevTotalMs: string;
    sessionMs: string;
    prevSessionCount: string;
  }>();

  const prevMs = Number(prevTotalMs ?? 0);
  const addedMs = Number(sessionMs ?? 0);
  const newMs = prevMs + addedMs;
  const prevSessions = Number(prevSessionCount ?? 0);
  const newSessions = prevSessions + 1;

  const prevHours = parseFloat(formatHoursPlayed(prevMs));
  const newHours = parseFloat(formatHoursPlayed(newMs));

  const [displayHours, setDisplayHours] = useState(prevHours.toFixed(1));
  const [displaySessions, setDisplaySessions] = useState(String(prevSessions));
  const [streak, setStreak] = useState(0);
  const [streakBefore, setStreakBefore] = useState(0);

  // Animated values
  const containerOpacity = useRef(new Animated.Value(0)).current;
  const statsOpacity = useRef(new Animated.Value(0)).current;
  const statsTranslateY = useRef(new Animated.Value(40)).current;
  const statsScale = useRef(new Animated.Value(1.0)).current;
  const streakOpacity = useRef(new Animated.Value(0)).current;

  // individual streak element slides (matches screen16)
  const fireSlide = useRef(new Animated.Value(60)).current;
  const fireOpacity = useRef(new Animated.Value(0)).current;
  const numSlide = useRef(new Animated.Value(60)).current;
  const numOpacity = useRef(new Animated.Value(0)).current;
  const labelSlide = useRef(new Animated.Value(60)).current;
  const labelOpacity = useRef(new Animated.Value(0)).current;
  const subtitleSlide = useRef(new Animated.Value(50)).current;
  const subtitleOpacity = useRef(new Animated.Value(0)).current;
  const calSlide = useRef(new Animated.Value(50)).current;
  const calOpacity = useRef(new Animated.Value(0)).current;

  // Sound player — created once, played on mount
  const soundRef = useRef<ReturnType<typeof createAudioPlayer> | null>(null);

  useEffect(() => {
    let player: ReturnType<typeof createAudioPlayer> | null = null;
    try {
      player = createAudioPlayer(require('@/assets/images/complete.mp3'));
      soundRef.current = player;
    } catch {
      // audio unavailable
    }

    const POP_UP_MS = 160;
    const POP_BACK_MS = 340;
    const FADE_IN_MS = 900;
    const POP_DELAY = FADE_IN_MS + 60;

    let rafId: number;
    let counting = true;
    let popTimeout: ReturnType<typeof setTimeout>;
    let countTimeout: ReturnType<typeof setTimeout>;

    const startCounting = () => {
      const startTime = Date.now();
      let lastHaptic = 0;

      const tick = () => {
        const now = Date.now();
        const elapsed = now - startTime;
        const rawProgress = Math.min(elapsed / COUNT_DURATION, 1);
        const t = 1 - Math.pow(1 - rawProgress, 3);

        setDisplayHours((prevHours + (newHours - prevHours) * t).toFixed(1));
        setDisplaySessions(String(Math.round(prevSessions + (newSessions - prevSessions) * t)));

        if (now - lastHaptic > HAPTIC_INTERVAL_MS) {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          lastHaptic = now;
        }

        if (rawProgress < 1) {
          rafId = requestAnimationFrame(tick);
        } else if (counting) {
          counting = false;
          onCountingDone();
        }
      };

      rafId = requestAnimationFrame(tick);
    };

    // Phase 0a: fade in screen — all stats animations start in the callback
    // so the slide-up is fully visible against an opaque background
    Animated.timing(containerOpacity, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start(() => {
      // Phase 0b: fade in stats — slide up + fade, identical to screen16
      Animated.parallel([
        Animated.timing(statsOpacity, {
          toValue: 1,
          duration: FADE_IN_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(statsTranslateY, {
          toValue: 0,
          duration: 480,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();

      // Phase 1: after fade-in, play sound + pop animation + heavy haptic
      popTimeout = setTimeout(() => {
        try { player?.play(); } catch { /* ignore */ }

        Animated.sequence([
          Animated.timing(statsScale, {
            toValue: 1.22,
            duration: POP_UP_MS,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(statsScale, {
            toValue: 1.0,
            duration: POP_BACK_MS,
            easing: Easing.out(Easing.back(2.5)),
            useNativeDriver: true,
          }),
        ]).start();

        setTimeout(() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        }, POP_UP_MS);
      }, POP_DELAY);

      // Phase 2: count up numbers with light haptics (starts after pop settles)
      countTimeout = setTimeout(startCounting, POP_DELAY + POP_UP_MS + POP_BACK_MS + 60);
    });

    return () => {
      clearTimeout(popTimeout);
      clearTimeout(countTimeout);
      cancelAnimationFrame(rafId);
      try { player?.stop(); player?.remove(); } catch { /* ignore */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onCountingDone = () => {
    // Update streak and then animate phase 2
    updateStreakOnSession().then(({ before, after }) => {
      setStreakBefore(before);
      setStreak(after);

      const slide = (translateY: Animated.Value, opacity: Animated.Value) =>
        Animated.parallel([
          Animated.timing(translateY, {
            toValue: 0,
            duration: 520,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 1,
            duration: 420,
            useNativeDriver: true,
          }),
        ]);

      const delay = (ms: number) =>
        new Promise<void>((res) => setTimeout(res, ms));

      // Phase 2: shift stats up + scale down
      Animated.parallel([
        Animated.timing(statsTranslateY, {
          toValue: -180,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(statsScale, {
          toValue: 0.78,
          duration: 600,
          useNativeDriver: true,
        }),
      ]).start(async () => {
        // Fade in streak container, then stagger-slide each child — same as screen16
        Animated.timing(streakOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }).start();

        await delay(80);
        slide(fireSlide, fireOpacity).start();
        await delay(100);
        slide(numSlide, numOpacity).start();
        await delay(80);
        slide(labelSlide, labelOpacity).start();
        await delay(80);
        slide(subtitleSlide, subtitleOpacity).start();
        await delay(80);
        slide(calSlide, calOpacity).start();

        setTimeout(() => lottieRef.current?.play(), 200);

        if (after !== before) {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }

        // Phase 3: wait then fade out + dismiss
        await delay(2200);
        Animated.timing(containerOpacity, {
          toValue: 0,
          duration: 600,
          useNativeDriver: true,
        }).start(() => {
          router.back();
        });
      });
    });
  };

  return (
    <View style={styles.backdrop}>
    <Animated.View style={[styles.container, { opacity: containerOpacity }]}>
      <MeshGradientView
        style={StyleSheet.absoluteFill}
        columns={3}
        rows={3}
        colors={BG_COLORS}
        points={BG_POINTS}
        smoothsColors
      />

      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.content}>

          {/* Stats block — only flow child so justifyContent:center truly centers it */}
          <Animated.View
            style={[
              styles.statsBlock,
              {
                opacity: statsOpacity,
                transform: [
                  { translateY: statsTranslateY },
                  { scale: statsScale },
                ],
              },
            ]}
          >
            <View style={styles.statRow}>
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>{displayHours}</Text>
                <Text style={styles.statLabel}>Hours Played</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>{displaySessions}</Text>
                <Text style={styles.statLabel}>Sessions</Text>
              </View>
            </View>
          </Animated.View>

          {/* Streak section — absolutely positioned, container opacity-only like screen16 */}
          <Animated.View style={[styles.streakSection, { opacity: streakOpacity }]}>
            <Animated.View
              style={{ transform: [{ translateY: fireSlide }], opacity: fireOpacity, alignItems: 'center' }}
            >
              <LottieView
                ref={lottieRef}
                source={require('@/assets/images/onboarding/fire-animation.json')}
                style={styles.lottie}
                loop
                autoPlay={false}
              />
            </Animated.View>

            <Animated.Text
              style={[styles.streakNum, { transform: [{ translateY: numSlide }], opacity: numOpacity }]}
            >
              {streak}
            </Animated.Text>

            <Animated.Text
              style={[styles.streakLabel, { transform: [{ translateY: labelSlide }], opacity: labelOpacity }]}
            >
              day streak
            </Animated.Text>

            <Animated.Text
              style={[styles.streakSubtitle, { transform: [{ translateY: subtitleSlide }], opacity: subtitleOpacity }]}
            >
              {getMotivation(streak)}
            </Animated.Text>

            <Animated.View
              style={[styles.calCard, { transform: [{ translateY: calSlide }], opacity: calOpacity }]}
            >
              {DAY_LABELS.map((day, i) => (
                <View key={day} style={styles.dayCol}>
                  <Text style={styles.dayLabel}>{day}</Text>
                  <View style={[styles.dayCircle, i === today && styles.dayCircleActive]}>
                    <Text style={[styles.dayNum, i === today && styles.dayNumActive]}>
                      {weekDates[i]}
                    </Text>
                  </View>
                </View>
              ))}
            </Animated.View>
          </Animated.View>

        </View>
      </SafeAreaView>
    </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#000' },
  container: { flex: 1 },
  safe: { flex: 1 },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingBottom: 100,
    position: 'relative',
  },
  statsBlock: {
    alignItems: 'center',
    width: '100%',
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 0,
  },
  statItem: {
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  statDivider: {
    width: 1,
    height: 60,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  statNumber: {
    fontFamily: Fonts.serif,
    fontSize: isSmallDevice ? 56 : 68,
    color: '#fff',
    lineHeight: isSmallDevice ? 62 : 76,
    includeFontPadding: false,
  },
  statLabel: {
    fontFamily: Fonts.mono,
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: 6,
  },
  streakSection: {
    position: 'absolute',
    top: '36%',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  lottie: {
    width: isSmallDevice ? 90 : 110,
    height: isSmallDevice ? 90 : 110,
  },
  streakNum: {
    fontSize: isSmallDevice ? 72 : 88,
    color: '#fff',
    fontFamily: Fonts.serif,
    lineHeight: isSmallDevice ? 78 : 96,
    marginTop: -6,
    includeFontPadding: false,
  },
  streakLabel: {
    fontSize: isSmallDevice ? 20 : 24,
    color: 'rgba(255,255,255,0.9)',
    fontFamily: Fonts.mono,
    letterSpacing: 0.5,
    marginTop: 2,
    marginBottom: 10,
  },
  streakSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    fontFamily: Fonts.mono,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 28,
    paddingHorizontal: 10,
  },
  calCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingVertical: 16,
    paddingHorizontal: 10,
    width: '100%',
    justifyContent: 'space-around',
  },
  dayCol: { alignItems: 'center', gap: 8 },
  dayLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    fontFamily: Fonts.mono,
    letterSpacing: 0.3,
  },
  dayCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircleActive: { backgroundColor: '#ff6b00' },
  dayNum: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    fontFamily: Fonts.mono,
  },
  dayNumActive: { color: '#fff', fontWeight: '700' },
});
