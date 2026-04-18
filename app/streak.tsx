import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import { MeshGradientView } from 'expo-mesh-gradient';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import * as SecureStore from 'expo-secure-store';
import LottieView from 'lottie-react-native';
import Svg, { Path as SvgPath } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { Fonts } from '@/constants/theme';
import { usePostHogScreenViewed } from '@/lib/posthog';

const { width } = Dimensions.get('window');
const isSmallDevice = width < 380;
const SIGNATURE_PAD_HEIGHT = isSmallDevice ? 110 : 140;

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

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getWeekDates() {
  const today = new Date();
  const dayOfWeek = today.getDay();
  return DAY_LABELS.map((_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - dayOfWeek + i);
    return d.getDate();
  });
}

function getStreakDayIndicesThisWeek(streak: number, lastDateStr: string | null): Set<number> {
  if (!lastDateStr || streak === 0) return new Set();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const todayStr = dateKey(today);
  const yesterdayStr = dateKey(yesterday);

  // Streak is broken if last session was before yesterday
  if (lastDateStr !== todayStr && lastDateStr !== yesterdayStr) return new Set();

  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay());

  const [y, m, day] = lastDateStr.split('-').map(Number);
  const lastDate = new Date(y, m - 1, day);
  lastDate.setHours(0, 0, 0, 0);

  const active = new Set<number>();
  for (let i = 0; i < streak; i++) {
    const d = new Date(lastDate);
    d.setDate(lastDate.getDate() - i);
    if (d >= weekStart && d <= today) {
      active.add(d.getDay());
    }
  }
  return active;
}

function getMotivation(streak: number) {
  if (streak === 0) return 'start your first session to build your streak';
  if (streak <= 1) return 'great start! keep building your daily affirmation habit';
  if (streak < 7) return "you're on a roll! keep the momentum going";
  if (streak < 30) return "amazing consistency! you're building a real habit";
  return "you're unstoppable!";
}

export default function StreakScreen() {
  usePostHogScreenViewed({
    screen: "streak",
    component: "StreakScreen",
  });

  const router = useRouter();
  const insets = useSafeAreaInsets();
  const lottieRef = useRef<LottieView>(null);
  const [streak, setStreak] = useState(0);
  const [signaturePaths, setSignaturePaths] = useState<string[]>([]);
  const [streakDayIndices, setStreakDayIndices] = useState<Set<number>>(new Set());
  const today = new Date().getDay();
  const weekDates = getWeekDates();

  const containerOpacity = useRef(new Animated.Value(0)).current;
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

  useEffect(() => {
    Promise.all([
      SecureStore.getItemAsync('streak_count'),
      SecureStore.getItemAsync('streak_last_date'),
    ]).then(([countRaw, lastDateStr]) => {
      const count = countRaw ? parseInt(countRaw, 10) : 0;
      const t = new Date();
      t.setHours(0, 0, 0, 0);
      const yest = new Date(t);
      yest.setDate(t.getDate() - 1);
      const isAlive = lastDateStr === dateKey(t) || lastDateStr === dateKey(yest);
      const live = isAlive ? count : 0;
      setStreak(live);
      setStreakDayIndices(getStreakDayIndicesThisWeek(live, lastDateStr));
    });
    SecureStore.getItemAsync('signature_paths').then((val) => {
      if (val) setSignaturePaths(JSON.parse(val));
    });

    const delay = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

    const slide = (translateY: Animated.Value, opacity: Animated.Value) =>
      Animated.parallel([
        Animated.timing(translateY, { toValue: 0, duration: 520, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 420, useNativeDriver: true }),
      ]);

    const run = async () => {
      Animated.timing(containerOpacity, { toValue: 1, duration: 400, useNativeDriver: true }).start();
      await delay(100);
      slide(fireSlide, fireOpacity).start();
      await delay(100);
      slide(numSlide, numOpacity).start();
      await delay(80);
      slide(labelSlide, labelOpacity).start();
      await delay(80);
      slide(subtitleSlide, subtitleOpacity).start();
      await delay(80);
      slide(calSlide, calOpacity).start();
      await delay(400);
      setTimeout(() => lottieRef.current?.play(), 100);
    };

    run();
  }, []);

  const handleDismiss = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  return (
    <Animated.View style={[styles.container, { opacity: containerOpacity }]}>
      <MeshGradientView
        style={StyleSheet.absoluteFill}
        columns={3}
        rows={3}
        colors={BG_COLORS}
        points={BG_POINTS}
        smoothsColors
      />

      <SafeAreaView style={styles.safe} edges={['bottom']}>
        {/* close button — manual top inset + extra gap so it clears notch / status bar */}
        <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
          <TouchableOpacity style={styles.closeBtn} onPress={handleDismiss}>
            <Text style={styles.closeIcon}>✕</Text>
          </TouchableOpacity>
        </View>

          <View style={styles.content}>
            {/* fire lottie */}
            <Animated.View
              style={{
                transform: [{ translateY: fireSlide }],
                opacity: fireOpacity,
                alignItems: 'center',
              }}
            >
              <LottieView
                ref={lottieRef}
                source={require('@/assets/images/onboarding/fire-animation.json')}
                style={styles.lottie}
                loop
                autoPlay={false}
              />
            </Animated.View>

            {/* streak number */}
            <Animated.Text
              style={[
                styles.streakNum,
                { transform: [{ translateY: numSlide }], opacity: numOpacity },
              ]}
            >
              {streak}
            </Animated.Text>

            {/* "day streak" label */}
            <Animated.Text
              style={[
                styles.streakLabel,
                { transform: [{ translateY: labelSlide }], opacity: labelOpacity },
              ]}
            >
              day streak
            </Animated.Text>

            {/* subtitle */}
            <Animated.Text
              style={[
                styles.subtitle,
                { transform: [{ translateY: subtitleSlide }], opacity: subtitleOpacity },
              ]}
            >
              {getMotivation(streak)}
            </Animated.Text>

            {/* week calendar */}
            <Animated.View
              style={[
                styles.calCard,
                { transform: [{ translateY: calSlide }], opacity: calOpacity },
              ]}
            >
              {DAY_LABELS.map((day, i) => {
                const isStreakDay = streakDayIndices.has(i);
                const isToday = i === today;
                return (
                  <View key={day} style={styles.dayCol}>
                    <Text style={[styles.dayLabel, isToday && styles.dayLabelToday]}>{day}</Text>
                    <View style={[styles.dayCircle, isStreakDay && styles.dayCircleActive]}>
                      <Text style={[styles.dayNum, isStreakDay && styles.dayNumActive]}>
                        {weekDates[i]}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </Animated.View>

            {/* signature */}
            {signaturePaths.length > 0 && (
              <Animated.View
                style={[
                  styles.sigBox,
                  { transform: [{ translateY: calSlide }], opacity: calOpacity },
                ]}
              >
                <Svg height={SIGNATURE_PAD_HEIGHT} width="100%" style={StyleSheet.absoluteFill}>
                  {signaturePaths.map((d, i) => (
                    <SvgPath
                      key={i}
                      d={d}
                      stroke="#1A0535"
                      strokeWidth={2.5}
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ))}
                </Svg>
              </Animated.View>
            )}
          </View>
        </SafeAreaView>
      </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  lottie: {
    width: isSmallDevice ? 110 : 130,
    height: isSmallDevice ? 110 : 130,
  },
  streakNum: {
    fontSize: isSmallDevice ? 88 : 108,
    color: '#fff',
    fontFamily: Fonts.serif,
    lineHeight: isSmallDevice ? 96 : 116,
    marginTop: -8,
    includeFontPadding: false,
  },
  streakLabel: {
    fontSize: isSmallDevice ? 22 : 26,
    color: 'rgba(255,255,255,0.9)',
    fontFamily: Fonts.mono,
    letterSpacing: 0.5,
    marginTop: 2,
    marginBottom: 14,
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.55)',
    fontFamily: Fonts.mono,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 40,
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
  dayCol: {
    alignItems: 'center',
    gap: 8,
  },
  dayLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    fontFamily: Fonts.mono,
    letterSpacing: 0.3,
  },
  dayLabelToday: {
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '700',
  },
  dayCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircleActive: {
    backgroundColor: '#ff6b00',
  },
  dayNum: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    fontFamily: Fonts.mono,
  },
  dayNumActive: {
    color: '#fff',
    fontWeight: '700',
  },
  header: {
    alignItems: 'flex-end',
    paddingHorizontal: 20,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeIcon: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 18,
  },
  sigBox: {
    height: SIGNATURE_PAD_HEIGHT,
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 20,
    overflow: 'hidden',
    marginTop: 16,
    position: 'relative',
  },
});
