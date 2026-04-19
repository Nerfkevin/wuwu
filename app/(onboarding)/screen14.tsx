import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  Easing,
} from "react-native";
import * as SecureStore from "expo-secure-store";
import * as Haptics from "expo-haptics";
import { SafeAreaView } from "react-native-safe-area-context";
import { MeshGradientView } from "expo-mesh-gradient";
import Svg, { Circle, Defs, LinearGradient, Stop } from "react-native-svg";
import { Fonts } from "@/constants/theme";
import { useOnboardingNav } from "./use-onboarding-nav";
import { usePostHogScreenViewed } from "@/lib/posthog";

const { width } = Dimensions.get("window");
const isSmallDevice = width < 380;

// ─── background — purple / indigo mesh (onboarding family) ───────────────────
const BG_COLORS = [
  "#1A0A30", "#160720", "#120530",
  "#1C1035", "#0E061A", "#120830",
  "#080220", "#0C0828", "#07041A",
];
const BG_POINTS: [number, number][] = [
  [0.0, 0.0], [0.5, 0.0], [1.0, 0.0],
  [0.0, 0.5], [0.5, 0.42], [1.0, 0.5],
  [0.0, 1.0], [0.5, 1.0], [1.0, 1.0],
];

// 12 segments with organic speed variation — sum = 18000ms
const RING_DURATIONS = [
  1500,  750, 2000,  626,
  1750,  875, 2250,  626,
  1500, 1000, 1875, 3248,
];

// ─── ring constants ──────────────────────────────────────────────────────────
const CIRCLE_SIZE = isSmallDevice ? 160 : 180;
const STROKE_WIDTH = 12;
const RADIUS = (CIRCLE_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function ProgressRing({ progressAnim }: { progressAnim: Animated.Value }) {
  const strokeDashoffset = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [CIRCUMFERENCE, 0],
  });
  const center = CIRCLE_SIZE / 2;

  return (
    <Svg
      width={CIRCLE_SIZE}
      height={CIRCLE_SIZE}
      style={{ transform: [{ rotate: "-90deg" }] }}
    >
      <Defs>
        <LinearGradient id="arcGrad14" x1="0%" y1="0%" x2="100%" y2="0%">
          <Stop offset="0%" stopColor="#F5D0FE" />
          <Stop offset="45%" stopColor="#E879F9" />
          <Stop offset="100%" stopColor="#4338CA" />
        </LinearGradient>
      </Defs>
      <Circle
        cx={center}
        cy={center}
        r={RADIUS}
        stroke="rgba(255,255,255,0.1)"
        strokeWidth={STROKE_WIDTH}
        fill="none"
      />
      <AnimatedCircle
        cx={center}
        cy={center}
        r={RADIUS}
        stroke="url(#arcGrad14)"
        strokeWidth={STROKE_WIDTH}
        fill="none"
        strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
        strokeDashoffset={strokeDashoffset}
        strokeLinecap="round"
      />
    </Svg>
  );
}

// ─── live percentage display ──────────────────────────────────────────────────
function LivePercent({ anim }: { anim: Animated.Value }) {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    const id = anim.addListener(({ value }) => setPct(Math.round(value)));
    return () => anim.removeListener(id);
  }, [anim]);
  return <Text style={styles.percentText}>{pct}%</Text>;
}

// ─── checkmark dot ────────────────────────────────────────────────────────────

function CheckDot({ done }: { done: boolean }) {
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (done) {
      Animated.parallel([
        Animated.spring(scale, {
          toValue: 1,
          useNativeDriver: true,
          tension: 220,
          friction: 9,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [done]);

  return (
    <View style={dotStyles.outer}>
      <Animated.View style={[dotStyles.fill, { opacity, transform: [{ scale }] }]}>
        <Text style={dotStyles.check}>✓</Text>
      </Animated.View>
    </View>
  );
}

const dotStyles = StyleSheet.create({
  outer: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  fill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#22c55e",
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  check: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 16,
  },
});

// ─── timing: 7 messages, 18 s total ─────────────────────────────────────────
// msgs 0-4 → 3 s each (15 s), msg 5 → 1.5 s, msg 6 → 1.5 s
const MSG_DURATIONS = [3000, 3000, 3000, 3000, 3000, 1500, 1500];

// dots only for the first 6 messages (msg 6 is the farewell "let's start")
const DOT_COUNT = 6;

export default function Screen14() {
  usePostHogScreenViewed({
    screen: "onboarding/screen14",
    component: "Screen14",
    screen_number: 14,
  });
  const { contentOpacity, fadeIn, replaceTo } = useOnboardingNav();
  const [msgIndex, setMsgIndex] = useState(0);
  const [messages, setMessages] = useState<string[]>([]);
  const [completed, setCompleted] = useState<boolean[]>(Array(DOT_COUNT).fill(false));
  const progressAnim = useRef(new Animated.Value(0)).current;
  const percentAnim = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    fadeIn();
    SecureStore.getItemAsync("user_name").then((val) => {
      const n = val?.trim() || "friend";
      setMessages([
        `perfect ${n},\nwe're generating your\naffirmation track`,
        `let's prepare for\nyour first session`,
        `feel free to sit or lay down wherever comfortable`,
        `relax and allow the affirmations from your own voice to reprogram your subconscious`,
        `this would take less than a minute`,
        `ready?`,
        `let's start`,
      ]);
    });
  }, []);

  const runSequence = useCallback(() => {
    // ring fills in organic segments
    const totalRing = RING_DURATIONS.reduce((a, b) => a + b, 0);
    let ringAccum = 0;
    const ringSegments = RING_DURATIONS.map((dur) => {
      ringAccum += dur;
      return Animated.timing(progressAnim, {
        toValue: ringAccum / totalRing,
        duration: dur,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: false,
      });
    });
    let pctAccum = 0;
    const pctSegments = RING_DURATIONS.map((dur) => {
      pctAccum += dur;
      return Animated.timing(percentAnim, {
        toValue: (pctAccum / totalRing) * 100,
        duration: dur,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: false,
      });
    });
    Animated.sequence(ringSegments).start();
    Animated.sequence(pctSegments).start();

    // cycle through messages
    let elapsed = 0;
    MSG_DURATIONS.forEach((dur, i) => {
      setTimeout(() => {
        Animated.timing(textOpacity, {
          toValue: 0,
          duration: i === 0 ? 0 : 220,
          useNativeDriver: true,
        }).start(() => {
          setMsgIndex(i);
          Animated.timing(textOpacity, {
            toValue: 1,
            duration: 380,
            useNativeDriver: true,
          }).start();
        });
      }, elapsed);
      elapsed += dur;
    });

    // fire checkmarks 650ms before each of the first 6 messages ends
    let dotElapsed = 0;
    MSG_DURATIONS.slice(0, DOT_COUNT).forEach((dur, i) => {
      setTimeout(() => {
        setCompleted((prev) => {
          const next = [...prev];
          next[i] = true;
          return next;
        });
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      }, dotElapsed + dur - 650);
      dotElapsed += dur;
    });

    // navigate after last message
    setTimeout(() => replaceTo("/(onboarding)/screen15"), 18000);
  }, []);

  useEffect(() => {
    if (messages.length === 0) return;
    runSequence();
  }, [messages]);

  return (
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
        {/* ring — top half */}
        <View style={styles.ringSection}>
          <View style={styles.ringWrapper}>
            <ProgressRing progressAnim={progressAnim} />
            <View style={styles.centerLabel}>
              <LivePercent anim={percentAnim} />
            </View>
          </View>
          <View style={styles.dotsRow}>
            {Array.from({ length: DOT_COUNT }).map((_, i) => (
              <CheckDot key={i} done={completed[i]} />
            ))}
          </View>
        </View>

        {/* large serif text — bottom half */}
        <View style={styles.textSection}>
          <Animated.Text style={[styles.titleText, { opacity: textOpacity }]}>
            {messages[msgIndex] ?? ""}
          </Animated.Text>
        </View>
      </SafeAreaView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  ringSection: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 60,
  },
  ringWrapper: {
    alignItems: "center",
    justifyContent: "center",
  },
  dotsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 20,
  },
  centerLabel: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  percentText: {
    fontSize: isSmallDevice ? 28 : 34,
    fontWeight: "700",
    color: "#fff",
    fontFamily: Fonts.mono,
  },
  textSection: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingHorizontal: 36,
    paddingTop: 8,
  },
  titleText: {
    fontFamily: Fonts.mono,
    fontSize: 20,
    color: "#fff",
    textAlign: "center",
    letterSpacing: 0.2,
  },
});
