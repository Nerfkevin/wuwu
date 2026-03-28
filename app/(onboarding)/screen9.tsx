import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  TouchableOpacity,
  Easing,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Fonts } from "@/constants/theme";
import { useOnboardingNav } from "./use-onboarding-nav";

const { width } = Dimensions.get("window");
const isSmallDevice = width < 380;

// ─── animated bar ─────────────────────────────────────────────────────────────

interface AnimatedBarProps {
  value: number; // 0–100, portion of maxHeight
  label: string;
  color: string;
  gradient?: readonly [string, string, ...string[]];
  delay?: number;
  valueLabel: string;
  valueColor?: string;
  shouldStart: boolean;
}

const BAR_MAX_HEIGHT = isSmallDevice ? 190 : 230;

function AnimatedBar({
  value,
  label,
  color,
  gradient,
  delay = 0,
  valueLabel,
  valueColor = "#fff",
  shouldStart,
}: AnimatedBarProps) {
  const animH = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (shouldStart) {
      Animated.timing(animH, {
        toValue: (value / 100) * BAR_MAX_HEIGHT,
        duration: 1800,
        delay,
        useNativeDriver: false,
        easing: Easing.out(Easing.exp),
      }).start();
    }
  }, [shouldStart]);

  return (
    <View style={bar.container}>
      <View style={[bar.track, { height: BAR_MAX_HEIGHT }]}>
        <Animated.View style={[bar.fill, { height: animH }]}>
          {gradient ? (
            <LinearGradient
              colors={gradient}
              start={{ x: 0, y: 1 }}
              end={{ x: 0, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: color }]} />
          )}
          <Text style={[bar.value, { color: valueColor }]}>{valueLabel}</Text>
        </Animated.View>
      </View>
      <Text style={bar.label}>{label}</Text>
    </View>
  );
}

const bar = StyleSheet.create({
  container: { alignItems: "center", justifyContent: "flex-end" },
  track: {
    width: 88,
    justifyContent: "flex-end",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 8,
    overflow: "hidden",
  },
  fill: {
    width: "100%",
    borderRadius: 8,
    alignItems: "center",
    paddingTop: 12,
    overflow: "hidden",
  },
  value: {
    fontSize: isSmallDevice ? 16 : 18,
    fontFamily: Fonts.mono,
    fontWeight: "700",
  },
  label: {
    marginTop: 10,
    fontSize: 13,
    color: "rgba(255,255,255,0.6)",
    fontFamily: Fonts.mono,
    textAlign: "center",
  },
});

// ─── main screen ─────────────────────────────────────────────────────────────

export default function Screen9() {
  const { contentOpacity, fadeIn, navigateTo } = useOnboardingNav();

  const fadeTitle = useRef(new Animated.Value(0)).current;
  const fadeDesc = useRef(new Animated.Value(0)).current;
  const fadeCard = useRef(new Animated.Value(0)).current;
  const fadeStat = useRef(new Animated.Value(0)).current;
  const fadeBtn = useRef(new Animated.Value(0)).current;

  const [startCharts, setStartCharts] = useState(false);

  useEffect(() => {
    fadeIn();

    Animated.sequence([
      Animated.timing(fadeTitle, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.timing(fadeDesc, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.timing(fadeCard, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        setStartCharts(true);
        Animated.parallel([
          Animated.timing(fadeStat, {
            toValue: 1,
            duration: 700,
            delay: 600,
            useNativeDriver: true,
          }),
          Animated.timing(fadeBtn, {
            toValue: 1,
            duration: 600,
            delay: 900,
            useNativeDriver: true,
          }),
        ]).start();
      }
    });
  }, []);

  const handleContinue = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigateTo("/(onboarding)/screen10");
  };

  return (
    <Animated.View style={[styles.container, { opacity: contentOpacity }]}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.content}>
          {/* Title */}
          <Animated.View style={{ opacity: fadeTitle, width: "100%" }}>
            <Text style={styles.title}>analysis complete</Text>
            <Text style={styles.subtitle}>based on your response...</Text>
          </Animated.View>

          {/* Description */}
          <Animated.View style={{ opacity: fadeDesc, width: "100%" }}>
            <Text style={styles.description}>
              Your results suggest a significant amount of time caught in
              negative thought loops.*
            </Text>
          </Animated.View>

          {/* Chart card */}
          <Animated.View style={[styles.card, { opacity: fadeCard }]}>
            <View style={styles.chartRow}>
              <AnimatedBar
                value={72}
                label="Your Score"
                color="#FF3B30"
                gradient={["#FF2800", "#FF5500", "#FF8C00"]}
                valueLabel="43%"
                valueColor="#fff"
                delay={200}
                shouldStart={startCharts}
              />
              <AnimatedBar
                value={30}
                label="Average"
                color="rgba(255,255,255,0.85)"
                valueLabel="18%"
                valueColor="#111"
                delay={400}
                shouldStart={startCharts}
              />
            </View>

            {/* Stat */}
            <Animated.Text style={[styles.stat, { opacity: fadeStat }]}>
              23% more rumination time compared{"\n"}to others in your demographic
            </Animated.Text>
          </Animated.View>
        </View>

        {/* Footer */}
        <Animated.View style={[styles.footer, { opacity: fadeBtn }]}>
          <TouchableOpacity
            style={styles.btn}
            onPress={handleContinue}
            activeOpacity={0.85}
          >
            <Text style={styles.btnText}>Continue</Text>
          </TouchableOpacity>
        </Animated.View>
      </SafeAreaView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  content: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: isSmallDevice ? 24 : 44,
    gap: 20,
  },
  title: {
    fontSize: isSmallDevice ? 28 : 34,
    color: "#fff",
    fontFamily: Fonts.serif,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.45)",
    fontFamily: Fonts.mono,
    letterSpacing: 0.3,
  },
  description: {
    fontSize: isSmallDevice ? 15 : 14,
    color: "#fff",
    fontFamily: Fonts.mono,
    lineHeight: 22,
    textAlign: "center",
    marginTop: 20,
  },
  card: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: "center",
    marginTop: 20,
    gap: 24,
  },
  chartRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 28,
    marginTop: 20,
    height: BAR_MAX_HEIGHT + 10,
  },
  stat: {
    fontSize: 14,
    color: "rgba(255,255,255,0.55)",
    fontFamily: Fonts.mono,
    textAlign: "center",
    lineHeight: 22,
    letterSpacing: 0.2,
  },
  footer: {
    paddingHorizontal: 28,
    paddingBottom: isSmallDevice ? 10 : 10,
  },
  btn: {
    backgroundColor: "#fff",
    borderRadius: 20,
    paddingVertical: isSmallDevice ? 15 : 18,
    alignItems: "center",
  },
  btnText: {
    color: "#0a000d",
    fontSize: 17,
    fontFamily: Fonts.mono,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
});
