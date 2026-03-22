import React, { useRef, useEffect, useState } from "react";
import { View, Text, StyleSheet, Animated, Dimensions, TouchableWithoutFeedback } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MeshGradientView } from "expo-mesh-gradient";
import * as Haptics from "expo-haptics";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Fonts } from "@/constants/theme";
import { useOnboardingNav } from "./use-onboarding-nav";

const { width } = Dimensions.get("window");
const isSmallDevice = width < 380;

const frequencyMap: Record<string, number> = {
  "Once a day": 1,
  "A few times a day": 3,
  "Many times a day": 6,
  "Almost constantly": 10,
};

const durationMap: Record<string, number> = {
  "Under a minute": 0.5,
  "15–30 minutes": 22,
  "30 minutes to 1 hour": 45,
  "1–2 hours": 90,
  "Almost constant": 180,
};

const ageMap: Record<string, number> = {
  "14–24": 19,
  "25–34": 29,
  "35–44": 39,
  "45–54": 49,
  "55+": 62,
};

const pillarShortName: Record<string, string> = {
  "Self-Worth & Confidence": "self-worth",
  "Wealth & Abundance": "wealth",
  "Love & Relationships": "love",
  "Health & Vitality": "health",
  "Peace & Mental Calm": "peace",
  "Focus & Achievement": "focus",
};

function formatDailyHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)} minutes`;
  const val = parseFloat(h.toFixed(1));
  return `${val} hour${val !== 1 ? "s" : ""}`;
}

export default function Screen6() {
  const { contentOpacity, fadeIn, navigateTo } = useOnboardingNav();

  const [slide, setSlide] = useState<0 | 1>(0);
  const [dailyHours, setDailyHours] = useState<number | null>(null);
  const [yearlyDays, setYearlyDays] = useState(0);
  const [lifetimeYears, setLifetimeYears] = useState(0);
  const [name, setName] = useState("");
  const [heavyReason, setHeavyReason] = useState("your dreams");

  // slide 1 fades
  const s1fade1 = useRef(new Animated.Value(0)).current;
  const s1fade2 = useRef(new Animated.Value(0)).current;
  const s1fade3 = useRef(new Animated.Value(0)).current;
  const s1fade4 = useRef(new Animated.Value(0)).current;
  const s1fadeBtn = useRef(new Animated.Value(0)).current;

  // slide 2 fades
  const s2fade1 = useRef(new Animated.Value(0)).current;
  const s2fade2 = useRef(new Animated.Value(0)).current;
  const s2fade3 = useRef(new Animated.Value(0)).current;
  const s2fadeBtn = useRef(new Animated.Value(0)).current;

  // crossfade between gradients
  const gradientSwitch = useRef(new Animated.Value(0)).current;

  // overall content opacity for each slide block
  const slide1Opacity = useRef(new Animated.Value(1)).current;
  const slide2Opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    fadeIn();

    (async () => {
      const [nameVal, ageVal, pillarsRaw, freqVal, durVal] = await Promise.all([
        SecureStore.getItemAsync("user_name"),
        AsyncStorage.getItem("onboarding_age"),
        AsyncStorage.getItem("onboarding_pillars"),
        AsyncStorage.getItem("onboarding_frequency"),
        AsyncStorage.getItem("onboarding_duration"),
      ]);

      if (nameVal) setName(nameVal);

      if (pillarsRaw) {
        const pillars: string[] = JSON.parse(pillarsRaw);
        if (pillars.length > 0) {
          const shorts = pillars.map(
            (p) => pillarShortName[p] ?? p.split(" ")[0].toLowerCase()
          );
          setHeavyReason(
            shorts.length === 1
              ? shorts[0]
              : shorts.slice(0, -1).join(", ") + " & " + shorts[shorts.length - 1]
          );
        }
      }

      const freq = frequencyMap[freqVal ?? ""] ?? 3;
      const dur = durationMap[durVal ?? ""] ?? 10;
      const age = ageMap[ageVal ?? ""] ?? 30;

      const dailyMinutes = freq * dur;
      const dHours = dailyMinutes / 60;
      const yearlyHours = (dailyMinutes * 365) / 60;
      const yDays = yearlyHours / 24;
      const yearsRemaining = 80 - age;
      const lYears = (yearlyHours * yearsRemaining) / (24 * 365);

      setDailyHours(dHours);
      setYearlyDays(Math.round(yDays));
      setLifetimeYears(parseFloat(lYears.toFixed(1)));

      Animated.stagger(1100, [
        Animated.timing(s1fade1, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(s1fade2, { toValue: 1, duration: 1300, useNativeDriver: true }),
        Animated.timing(s1fade3, { toValue: 1, duration: 1300, useNativeDriver: true }),
        Animated.timing(s1fade4, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(s1fadeBtn, { toValue: 1, duration: 1100, useNativeDriver: true }),
      ]).start();
    })();
  }, []);

  const goToSlide2 = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // fade out slide 1 content + gradient crossfade
    Animated.parallel([
      Animated.timing(slide1Opacity, { toValue: 0, duration: 500, useNativeDriver: true }),
      Animated.timing(gradientSwitch, { toValue: 1, duration: 800, useNativeDriver: false }),
    ]).start(() => {
      setSlide(1);
      slide2Opacity.setValue(1);

      Animated.stagger(1100, [
        Animated.timing(s2fade1, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(s2fade2, { toValue: 1, duration: 1300, useNativeDriver: true }),
        Animated.timing(s2fade3, { toValue: 1, duration: 1300, useNativeDriver: true }),
        Animated.timing(s2fadeBtn, { toValue: 1, duration: 1100, useNativeDriver: true }),
      ]).start();
    });
  };

  const handleContinue = () => {
    if (slide === 0) {
      goToSlide2();
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      navigateTo("/(onboarding)/screen7");
    }
  };

  // gradient colour interpolation
  const grad1c1 = gradientSwitch.interpolate({ inputRange: [0, 1], outputRange: ["#1A0828", "#2D1040"] });
  const grad1c2 = gradientSwitch.interpolate({ inputRange: [0, 1], outputRange: ["#2A0A2E", "#4A1560"] });
  const grad1c3 = gradientSwitch.interpolate({ inputRange: [0, 1], outputRange: ["#180518", "#3A0D50"] });
  const grad1c4 = gradientSwitch.interpolate({ inputRange: [0, 1], outputRange: ["#000", "#1A0828"] });

  if (dailyHours === null) return null;

  return (
    <TouchableWithoutFeedback onPress={handleContinue}>
    <Animated.View style={[styles.container, { opacity: contentOpacity }]}>
      {/* ── slide 1: dark near-black mesh ── */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: gradientSwitch.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]}>
        <MeshGradientView
          style={StyleSheet.absoluteFill}
          columns={3}
          rows={3}
          colors={[
            "#1A0A30", "#160720", "#120530",
            "#1C1035", "#0E061A", "#120830",
            "#080220", "#0C0828", "#07041A",
          ]}
          points={[
            [0.0, 0.0], [0.5, 0.0], [1.0, 0.0],
            [0.0, 0.5], [0.5, 0.5], [1.0, 0.5],
            [0.0, 1.0], [0.5, 1.0], [1.0, 1.0],
          ]}
          smoothsColors
        />
      </Animated.View>

      {/* ── slide 2: same mesh as screen4 ── */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: gradientSwitch }]}>
        <MeshGradientView
          style={StyleSheet.absoluteFill}
          columns={3}
          rows={3}
          colors={[
            "#7B2FBE", "#A030B0", "#9D2A6A",
            "#5A1A9E", "#7B2090", "#8B1A60",
            "#1A0535", "#3D0E7A", "#250845",
          ]}
          points={[
            [0.0, 0.0], [0.5, 0.0], [1.0, 0.0],
            [0.0, 0.5], [0.45, 0.42], [1.0, 0.5],
            [0.0, 1.0], [0.5, 1.0], [1.0, 1.0],
          ]}
          smoothsColors
        />
      </Animated.View>

      <SafeAreaView style={styles.safeArea}>
        {/* ── slide 1 ── */}
        {slide === 0 && (
          <Animated.View style={[styles.slideWrap, { opacity: slide1Opacity }]}>
            <View style={styles.content}>
              <Animated.Text style={[styles.para1, { opacity: s1fade1 }]}>
                {name ? `${name}, ` : ""}you'll spend about{" "}
                <Text style={styles.bold}>{formatDailyHours(dailyHours)} a day</Text> in negative
                thought loops.
              </Animated.Text>

              <Animated.Text style={[styles.para2, { opacity: s1fade2 }]}>
                that's <Text style={styles.bold}>{yearlyDays} days</Text>
              </Animated.Text>

              <Animated.Text style={[styles.para3, { opacity: s1fade3 }]}>
                or <Text style={styles.bold}>{lifetimeYears} years</Text> over your lifetime...
              </Animated.Text>

              <Animated.Text style={[styles.para4, { opacity: s1fade4 }]}>
                what would all this time do to your{" "}
                <Text style={styles.bold}>{heavyReason}</Text>, and the life you're building?
              </Animated.Text>
            </View>

            <Animated.View style={[styles.footer, { opacity: s1fadeBtn }]}>
              <Text style={styles.tapText}>tap to continue →</Text>
            </Animated.View>
          </Animated.View>
        )}

        {/* ── slide 2 ── */}
        {slide === 1 && (
          <Animated.View style={[styles.slideWrap, { opacity: slide2Opacity }]}>
            <View style={styles.content}>
              <Animated.Text style={[styles.para1, { opacity: s2fade1 }]}>
                it doesn't have to be this way
              </Animated.Text>

              <Animated.Text style={[styles.para2, { opacity: s2fade2 }]}>
                do you have just{" "}
                <Text style={styles.bold}>5 minutes</Text> to quietly reprogram your subconscious
                each day?
              </Animated.Text>

              <Animated.Text style={[styles.para3, { opacity: s2fade3 }]}>
                let's build a plan for <Text style={styles.bold}>you</Text>
              </Animated.Text>
            </View>

            <Animated.View style={[styles.footer, { opacity: s2fadeBtn }]}>
              <Text style={styles.tapText}>tap to continue →</Text>
            </Animated.View>
          </Animated.View>
        )}
      </SafeAreaView>
    </Animated.View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  slideWrap: { flex: 1 },
  content: {
    flex: 1,
    justifyContent: "flex-start",
    paddingTop: isSmallDevice ? 60 : 80,
    paddingHorizontal: isSmallDevice ? 28 : 36,
    gap: isSmallDevice ? 28 : 36,
  },
  para1: {
    fontSize: isSmallDevice ? 26 : 30,
    color: "#fff",
    fontFamily: Fonts.serif,
    lineHeight: isSmallDevice ? 38 : 44,
  },
  para2: {
    fontSize: isSmallDevice ? 24 : 28,
    color: "rgba(255,255,255,0.85)",
    fontFamily: Fonts.serif,
    lineHeight: isSmallDevice ? 34 : 40,
  },
  para3: {
    fontSize: isSmallDevice ? 24 : 28,
    color: "rgba(255,255,255,0.85)",
    fontFamily: Fonts.serif,
    lineHeight: isSmallDevice ? 34 : 40,
  },
  para4: {
    fontSize: isSmallDevice ? 26 : 30,
    color: "#fff",
    fontFamily: Fonts.serif,
    lineHeight: isSmallDevice ? 38 : 44,
  },
  bold: {
    fontFamily: Fonts.serifBold,
    fontStyle: "italic",
    textDecorationLine: "underline",
    color: "#fff",
  },
  footer: {
    paddingHorizontal: isSmallDevice ? 24 : 32,
    paddingBottom: isSmallDevice ? 10 : 10,
    paddingTop: 12,
    alignItems: "flex-end",
  },
  tapText: {
    fontSize: isSmallDevice ? 13 : 14,
    color: "rgba(255,255,255,0.5)",
    fontFamily: Fonts.mono,
    letterSpacing: 0.3,
  },
});
