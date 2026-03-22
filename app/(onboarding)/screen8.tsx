import React, { useRef, useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  Easing,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MeshGradientView } from "expo-mesh-gradient";
import Svg, { Circle, Defs, LinearGradient, Stop } from "react-native-svg";
import { Fonts } from "@/constants/theme";
import { useOnboardingNav } from "./use-onboarding-nav";

const { width } = Dimensions.get("window");
const isSmallDevice = width < 380;

// ─── phases ──────────────────────────────────────────────────────────────────

const PHASES = [
  "analyzing your responses...",
  "locking in your goals...",
  "personalising your affirmations...",
  "dialing in your routine...",
  "making sure this is tailored to you...",
  "syncing your plan...",
  "alright, you're set!",
];

// Varied durations per phase (ms) — last one snaps fast
const PHASE_DURATIONS = [900, 1200, 750, 1050, 800, 1100, 400];

// ─── ring constants ──────────────────────────────────────────────────────────

const CIRCLE_SIZE = isSmallDevice ? 190 : 215;
const STROKE_WIDTH = 14;
const RADIUS = (CIRCLE_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// ─── background mesh ──────────────────────────────────────────────────────────

const BG_COLORS = [
  "#100018", "#18002a", "#0e0014",
  "#0a0010", "#160022", "#0e0014",
  "#07000e", "#0e001a", "#0a0010",
];
const BG_POINTS: [number, number][] = [
  [0.0, 0.0], [0.5, 0.0], [1.0, 0.0],
  [0.0, 0.5], [0.48, 0.44], [1.0, 0.5],
  [0.0, 1.0], [0.5, 1.0], [1.0, 1.0],
];

// ─── animated svg ring ───────────────────────────────────────────────────────

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function ProgressRing({ progressAnim }: { progressAnim: Animated.Value }) {
  const strokeDashoffset = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [CIRCUMFERENCE, 0],
  });

  const center = CIRCLE_SIZE / 2;

  return (
    <Svg width={CIRCLE_SIZE} height={CIRCLE_SIZE} style={{ transform: [{ rotate: "-90deg" }] }}>
      <Defs>
        <LinearGradient id="arcGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <Stop offset="0%" stopColor="#FF2800" />
          <Stop offset="50%" stopColor="#FF5500" />
          <Stop offset="100%" stopColor="#FF8C00" />
        </LinearGradient>
      </Defs>

      {/* Track */}
      <Circle
        cx={center}
        cy={center}
        r={RADIUS}
        stroke="rgba(255,255,255,0.1)"
        strokeWidth={STROKE_WIDTH}
        fill="none"
      />

      {/* Progress arc */}
      <AnimatedCircle
        cx={center}
        cy={center}
        r={RADIUS}
        stroke="url(#arcGrad)"
        strokeWidth={STROKE_WIDTH}
        fill="none"
        strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
        strokeDashoffset={strokeDashoffset}
        strokeLinecap="round"
      />
    </Svg>
  );
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
      <Animated.View
        style={[dotStyles.fill, { opacity, transform: [{ scale }] }]}
      >
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
    backgroundColor: "#22C55E",
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

// ─── live percentage display ──────────────────────────────────────────────────

function LivePercent({ anim }: { anim: Animated.Value }) {
  const [pct, setPct] = useState(0);

  useEffect(() => {
    const id = anim.addListener(({ value }) => setPct(Math.round(value)));
    return () => anim.removeListener(id);
  }, [anim]);

  return <Text style={styles.percentText}>{pct}%</Text>;
}

// ─── main screen ─────────────────────────────────────────────────────────────

export default function Screen8() {
  const { contentOpacity, fadeIn, replaceTo } = useOnboardingNav();

  const [currentPhase, setCurrentPhase] = useState(0);
  const [completed, setCompleted] = useState<boolean[]>(
    Array(PHASES.length).fill(false)
  );

  const progressAnim = useRef(new Animated.Value(0)).current;
  const percentAnim = useRef(new Animated.Value(0)).current;

  // Per-phase text animations
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textScale = useRef(new Animated.Value(1)).current;
  const textColorAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    fadeIn();
    runPhases();
  }, []);

  const runPhases = useCallback(async () => {
    for (let i = 0; i < PHASES.length; i++) {
      await new Promise<void>((resolve) => {
        // Reset per-phase text
        textOpacity.setValue(0);
        textScale.setValue(1);
        textColorAnim.setValue(0);
        setCurrentPhase(i);

        const progressTo = (i + 1) / PHASES.length;
        const dur = PHASE_DURATIONS[i];

        // Fade in phase text
        Animated.timing(textOpacity, {
          toValue: 1,
          duration: 320,
          useNativeDriver: false,
        }).start();

        // Ring fills up
        Animated.timing(progressAnim, {
          toValue: progressTo,
          duration: dur * 0.82,
          useNativeDriver: false,
          easing: Easing.out(Easing.cubic),
        }).start();

        // Percentage counter follows ring
        Animated.timing(percentAnim, {
          toValue: progressTo * 100,
          duration: dur * 0.82,
          useNativeDriver: false,
          easing: Easing.out(Easing.cubic),
        }).start();

        // After phase duration: mark done + animate text green then fade out
        setTimeout(() => {
          setCompleted((prev) => {
            const next = [...prev];
            next[i] = true;
            return next;
          });

          Animated.parallel([
            Animated.spring(textScale, {
              toValue: 1.07,
              useNativeDriver: false,
              tension: 280,
              friction: 9,
            }),
            Animated.timing(textColorAnim, {
              toValue: 1,
              duration: 230,
              useNativeDriver: false,
            }),
          ]).start(() => {
            setTimeout(() => {
              Animated.timing(textOpacity, {
                toValue: 0,
                duration: 280,
                useNativeDriver: false,
              }).start(() => {
                if (i === PHASES.length - 1) {
                  setTimeout(() => replaceTo("/(tabs)"), 350);
                }
                resolve();
              });
            }, 150);
          });
        }, dur);
      });
    }
  }, []);

  const textColor = textColorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["#e8e0f0", "#4ADE80"],
  });

  return (
    <Animated.View style={[styles.container, { opacity: contentOpacity }]}>
      {/* Dark mesh background */}
      <MeshGradientView
        style={StyleSheet.absoluteFill}
        columns={3}
        rows={3}
        colors={BG_COLORS}
        points={BG_POINTS}
        smoothsColors
      />

      <SafeAreaView style={styles.safe}>
        <View style={styles.content}>
          {/* Ring + percentage */}
          <View style={styles.ringWrapper}>
            <ProgressRing progressAnim={progressAnim} />
            <View style={styles.centerLabel}>
              <LivePercent anim={percentAnim} />
            </View>
          </View>

          {/* Checkmark dots */}
          <View style={styles.dotsRow}>
            {PHASES.map((_, i) => (
              <CheckDot key={i} done={completed[i]} />
            ))}
          </View>

          {/* Phase text — fixed height so two-line text never shifts layout */}
          <View style={styles.phaseTextBox}>
            <Animated.Text
              style={[
                styles.phaseText,
                {
                  opacity: textOpacity,
                  transform: [{ scale: textScale }],
                  color: textColor,
                },
              ]}
            >
              {PHASES[currentPhase]}
            </Animated.Text>
          </View>
        </View>
      </SafeAreaView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safe: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 36,
  },
  ringWrapper: {
    alignItems: "center",
    justifyContent: "center",
  },
  centerLabel: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  percentText: {
    fontSize: isSmallDevice ? 34 : 40,
    fontWeight: "700",
    color: "#fff",
    fontFamily: Fonts.mono,
  },
  dotsRow: {
    flexDirection: "row",
    gap: 10,
  },
  phaseTextBox: {
    height: 52,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 44,
  },
  phaseText: {
    fontSize: isSmallDevice ? 14 : 16,
    fontFamily: Fonts.mono,
    textAlign: "center",
    letterSpacing: 0.3,
    lineHeight: isSmallDevice ? 20 : 23,
  },
});
