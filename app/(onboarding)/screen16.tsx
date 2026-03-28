import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  TouchableWithoutFeedback,
} from "react-native";
import { MeshGradientView } from "expo-mesh-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import * as SecureStore from "expo-secure-store";
import * as StoreReview from "expo-store-review";
import LottieView from "lottie-react-native";
import { Fonts } from "@/constants/theme";
import { useOnboardingNav } from "./use-onboarding-nav";

const { width } = Dimensions.get("window");
const isSmallDevice = width < 380;

const STREAK = 1;

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
  const dayOfWeek = today.getDay(); // 0 = sunday
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
  const { contentOpacity, fadeIn, navigateTo } = useOnboardingNav();

  const [userName, setUserName] = useState("");

  const lottieRef = useRef<LottieView>(null);
  const today = new Date().getDay();
  const weekDates = getWeekDates();

  // intro message anims
  const introOpacity = useRef(new Animated.Value(0)).current;
  const streakOpacity = useRef(new Animated.Value(0)).current;

  // slide-up anims for streak content
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

    const run = async () => {
      // ── phase 1: intro message ──────────────────────────────────────────────
      await delay(200);
      await new Promise<void>((res) =>
        Animated.timing(introOpacity, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }).start(() => res())
      );

      await delay(1800);

      await new Promise<void>((res) =>
        Animated.timing(introOpacity, {
          toValue: 0,
          duration: 600,
          useNativeDriver: true,
        }).start(() => res())
      );

      // ── phase 2: streak screen ──────────────────────────────────────────────
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

      // fire lottie + streak elements are done animating by now (~600ms for tapOpacity)
      await delay(1100);
      if (await StoreReview.isAvailableAsync()) {
        StoreReview.requestReview();
      }
    };

    run();
  }, []);

  const handleContinue = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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

        {/* ── streak content ── */}
        <Animated.View style={[{ flex: 1 }, { opacity: streakOpacity }]}>
        <View style={styles.content}>
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
        </View>

        <Animated.View style={[styles.footer, { opacity: tapOpacity }]}>
          <Text style={styles.tapText}>tap to continue →</Text>
        </Animated.View>
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
    gap: 0,
  },
  lottie: {
    width: isSmallDevice ? 110 : 130,
    height: isSmallDevice ? 110 : 130,
  },
  streakNum: {
    fontSize: isSmallDevice ? 88 : 108,
    color: "#fff",
    fontFamily: Fonts.serif,
    lineHeight: isSmallDevice ? 96 : 116,
    marginTop: -8,
    includeFontPadding: false,
  },
  streakLabel: {
    fontSize: isSmallDevice ? 22 : 26,
    color: "rgba(255,255,255,0.9)",
    fontFamily: Fonts.mono,
    letterSpacing: 0.5,
    marginTop: 2,
    marginBottom: 14,
  },
  subtitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.55)",
    fontFamily: Fonts.mono,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 40,
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
