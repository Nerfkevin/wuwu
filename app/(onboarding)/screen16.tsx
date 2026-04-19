import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  Dimensions,
  TouchableWithoutFeedback,
} from "react-native";
import { MeshGradientView } from "expo-mesh-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import * as SecureStore from "expo-secure-store";
import * as StoreReview from "expo-store-review";
import LottieView from "lottie-react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Fonts } from "@/constants/theme";
import { useOnboardingNav } from "./use-onboarding-nav";
import { usePostHogScreenViewed } from "@/lib/posthog";
import { createAudioPlayer } from "@/lib/expo-audio";
import {
  commitOnboardingFirstSessionToProfile,
  formatPlayTime,
  getProfileStats,
} from "@/lib/profile-stats";

const { width } = Dimensions.get("window");
const isSmallDevice = width < 380;

const STREAK = 1;
const COUNT_DURATION = 1600;
const HAPTIC_INTERVAL_MS = 70;

const BG_COLORS = [
  "#3d0000", "#7a0000", "#2a0000",
  "#5c0000", "#990000", "#3d0000",
  "#1a0000", "#520000", "#2a0000",
];
const BG_POINTS: [number, number][] = [
  [0.0, 0.0], [0.5, 0.0], [1.0, 0.0],
  [0.0, 0.5], [0.5, 0.42], [1.0, 0.5],
  [0.0, 1.0], [0.5, 1.0], [1.0, 1.0],
];

const DAY_LABELS = ["su", "mo", "tu", "we", "th", "fr", "sa"];

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
  if (streak <= 1) return "great start! keep building your daily affirmation habit";
  if (streak < 7) return "you're on a roll! keep the momentum going";
  if (streak < 30) return "amazing consistency! you're building a real habit";
  return "you're unstoppable!";
}

export default function Screen16() {
  usePostHogScreenViewed({
    screen: "onboarding/screen16",
    component: "Screen16",
    screen_number: 16,
  });
  const { contentOpacity, fadeIn, navigateTo } = useOnboardingNav();

  const [userName, setUserName] = useState("");
  const [displayHours, setDisplayHours] = useState("0:00");
  const [displayTimeLabel, setDisplayTimeLabel] = useState("Minutes Played");
  const [displaySessions, setDisplaySessions] = useState("0");

  const lottieRef = useRef<LottieView>(null);
  const soundRef = useRef<ReturnType<typeof createAudioPlayer> | null>(null);
  const today = new Date().getDay();
  const weekDates = getWeekDates();

  // intro message anim
  const introOpacity = useRef(new Animated.Value(0)).current;

  // stats block anims
  const statsOpacity = useRef(new Animated.Value(0)).current;
  const statsTranslateY = useRef(new Animated.Value(40)).current;
  const statsScale = useRef(new Animated.Value(1.0)).current;

  // streak section
  const streakOpacity = useRef(new Animated.Value(0)).current;

  // slide-up anims for individual streak elements
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
  const tapOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    fadeIn();
    SecureStore.getItemAsync("user_name").then((n) => setUserName(n ?? ""));

    let soundPlayer: ReturnType<typeof createAudioPlayer> | null = null;
    try {
      soundPlayer = createAudioPlayer(require("@/assets/images/complete.mp3"));
      soundRef.current = soundPlayer;
    } catch {
      // audio unavailable
    }

    const delay = (ms: number) =>
      new Promise<void>((res) => setTimeout(res, ms));

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

    let rafId: number;
    let counting = true;

    const run = async () => {
      // ── Phase 1: intro message ──────────────────────────────────────────────
      await delay(200);
      await new Promise<void>((res) =>
        Animated.timing(introOpacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }).start(() => res())
      );

      await delay(1000);

      await new Promise<void>((res) =>
        Animated.timing(introOpacity, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }).start(() => res())
      );

      // ── Phase 2: stats block ────────────────────────────────────────────────
      const sessionMsRaw = await AsyncStorage.getItem("onboarding_session_ms");
      const sessionMs = Math.max(0, Number(sessionMsRaw ?? 0));
      await commitOnboardingFirstSessionToProfile(sessionMs);
      const { totalPlayMs, sessionCount } = await getProfileStats();
      const targetSessions = sessionCount;

      const FADE_IN_MS = 900;
      await new Promise<void>((res) =>
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
        ]).start(() => res())
      );

      // Pop + sound
      const POP_UP_MS = 160;
      const POP_BACK_MS = 340;
      try { soundPlayer?.play(); } catch { /* ignore */ }
      await new Promise<void>((res) =>
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
        ]).start(() => res())
      );
      setTimeout(
        () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy),
        POP_UP_MS
      );

      // Count up
      await new Promise<void>((res) => {
        const startTime = Date.now();
        let lastHaptic = 0;
        const tick = () => {
          const now = Date.now();
          const elapsed = now - startTime;
          const rawProgress = Math.min(elapsed / COUNT_DURATION, 1);
          const t = 1 - Math.pow(1 - rawProgress, 3);
          const fmt = formatPlayTime(totalPlayMs * t);
          setDisplayHours(fmt.value);
          setDisplayTimeLabel(fmt.label);
          setDisplaySessions(String(Math.round(t * targetSessions)));
          if (now - lastHaptic > HAPTIC_INTERVAL_MS) {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            lastHaptic = now;
          }
          if (rawProgress < 1) {
            rafId = requestAnimationFrame(tick);
          } else if (counting) {
            counting = false;
            res();
          }
        };
        rafId = requestAnimationFrame(tick);
      });

      // ── Phase 3: shift stats up, show streak ────────────────────────────────
      await new Promise<void>((res) =>
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
        ]).start(() => res())
      );

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
      await delay(500);
      Animated.timing(tapOpacity, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }).start();

      setTimeout(() => lottieRef.current?.play(), 200);

      await delay(1100);
      if (await StoreReview.isAvailableAsync()) {
        StoreReview.requestReview();
      }
    };

    run();

    return () => {
      cancelAnimationFrame(rafId);
      try { soundPlayer?.pause(); soundPlayer?.remove(); } catch { /* ignore */ }
    };
  }, []);

  const handleContinue = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    navigateTo("/(onboarding)/screen17");
  };

  return (
    <TouchableWithoutFeedback onPress={handleContinue}>
      <Animated.View style={[styles.container, { opacity: contentOpacity }]}>
        <MeshGradientView
          style={StyleSheet.absoluteFill}
          columns={3}
          rows={3}
          colors={BG_COLORS}
          points={BG_POINTS}
          smoothsColors
        />

        <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
          {/* ── intro message ── */}
          <Animated.View style={[styles.introOverlay, { opacity: introOpacity }]}>
            <Text style={styles.introText}>
              {"well done"}
              {userName ? ` ${userName}` : ""}
              {",\nyou've completed your\nfirst wu-wu session."}
            </Text>
          </Animated.View>

          {/* ── main content area ── */}
          <View style={styles.content}>
            {/* stats block */}
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
                  <Text style={styles.statLabel}>{displayTimeLabel}</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Text style={styles.statNumber}>{displaySessions}</Text>
                  <Text style={styles.statLabel}>Sessions</Text>
                </View>
              </View>
            </Animated.View>

            {/* streak section — absolutely positioned so it appears below the shifted stats */}
            <Animated.View
              style={[styles.streakSection, { opacity: streakOpacity }]}
            >
              {/* fire lottie */}
              <Animated.View
                style={{
                  transform: [{ translateY: fireSlide }],
                  opacity: fireOpacity,
                  alignItems: "center",
                }}
              >
                <LottieView
                  ref={lottieRef}
                  source={require("@/assets/images/onboarding/fire-animation.json")}
                  style={styles.lottie}
                  loop
                  autoPlay={false}
                />
              </Animated.View>

              {/* streak number */}
              <Animated.Text
                style={[
                  styles.streakNum,
                  {
                    transform: [{ translateY: numSlide }],
                    opacity: numOpacity,
                  },
                ]}
              >
                {STREAK}
              </Animated.Text>

              {/* "day streak" label */}
              <Animated.Text
                style={[
                  styles.streakLabel,
                  {
                    transform: [{ translateY: labelSlide }],
                    opacity: labelOpacity,
                  },
                ]}
              >
                day streak
              </Animated.Text>

              {/* subtitle */}
              <Animated.Text
                style={[
                  styles.subtitle,
                  {
                    transform: [{ translateY: subtitleSlide }],
                    opacity: subtitleOpacity,
                  },
                ]}
              >
                {getMotivation(STREAK)}
              </Animated.Text>

              {/* week calendar */}
              <Animated.View
                style={[
                  styles.calCard,
                  {
                    transform: [{ translateY: calSlide }],
                    opacity: calOpacity,
                  },
                ]}
              >
                {DAY_LABELS.map((day, i) => (
                  <View key={day} style={styles.dayCol}>
                    <Text style={styles.dayLabel}>{day}</Text>
                    <View
                      style={[
                        styles.dayCircle,
                        i === today && styles.dayCircleActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.dayNum,
                          i === today && styles.dayNumActive,
                        ]}
                      >
                        {weekDates[i]}
                      </Text>
                    </View>
                  </View>
                ))}
              </Animated.View>
            </Animated.View>
          </View>

          <Animated.View style={[styles.footer, { opacity: tapOpacity }]}>
            <Text style={styles.tapText}>tap to continue →</Text>
          </Animated.View>
        </SafeAreaView>
      </Animated.View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  introOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 36,
    zIndex: 10,
  },
  introText: {
    fontSize: isSmallDevice ? 26 : 30,
    color: "#fff",
    fontFamily: Fonts.serif,
    textAlign: "center",
    lineHeight: isSmallDevice ? 38 : 44,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    paddingBottom: 100,
  },
  statsBlock: {
    alignItems: "center",
    width: "100%",
  },
  statRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 0,
  },
  statItem: {
    alignItems: "center",
    paddingHorizontal: 28,
  },
  statDivider: {
    width: 1,
    height: 60,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  statNumber: {
    fontFamily: Fonts.serif,
    fontSize: isSmallDevice ? 56 : 68,
    color: "#fff",
    lineHeight: isSmallDevice ? 62 : 76,
    includeFontPadding: false,
  },
  statLabel: {
    fontFamily: Fonts.mono,
    fontSize: 11,
    color: "rgba(255,255,255,0.5)",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginTop: 6,
  },
  streakSection: {
    position: "absolute",
    top: "36%",
    left: 0,
    right: 0,
    alignItems: "center",
    paddingHorizontal: 28,
  },
  lottie: {
    width: isSmallDevice ? 90 : 110,
    height: isSmallDevice ? 90 : 110,
  },
  streakNum: {
    fontSize: isSmallDevice ? 72 : 88,
    color: "#fff",
    fontFamily: Fonts.serif,
    lineHeight: isSmallDevice ? 78 : 96,
    marginTop: -6,
    includeFontPadding: false,
  },
  streakLabel: {
    fontSize: isSmallDevice ? 20 : 24,
    color: "rgba(255,255,255,0.9)",
    fontFamily: Fonts.mono,
    letterSpacing: 0.5,
    marginTop: 2,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 13,
    color: "rgba(255,255,255,0.5)",
    fontFamily: Fonts.mono,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 28,
    paddingHorizontal: 10,
  },
  calCard: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    paddingVertical: 16,
    paddingHorizontal: 10,
    width: "100%",
    justifyContent: "space-around",
  },
  dayCol: {
    alignItems: "center",
    gap: 8,
  },
  dayLabel: {
    fontSize: 12,
    color: "rgba(255,255,255,0.4)",
    fontFamily: Fonts.mono,
    letterSpacing: 0.3,
  },
  dayCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  dayCircleActive: {
    backgroundColor: "#ff6b00",
  },
  dayNum: {
    fontSize: 14,
    color: "rgba(255,255,255,0.6)",
    fontFamily: Fonts.mono,
  },
  dayNumActive: {
    color: "#fff",
    fontWeight: "700",
  },
  footer: {
    paddingHorizontal: 28,
    paddingBottom: 10,
    alignItems: "flex-end",
  },
  tapText: {
    fontSize: isSmallDevice ? 13 : 15,
    color: "rgba(255,255,255,0.55)",
    fontFamily: Fonts.mono,
  },
});
