import React, { useEffect } from "react";
import { View, Text, StyleSheet, Animated, Dimensions, TouchableWithoutFeedback } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MeshGradientView } from "expo-mesh-gradient";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Fonts } from "@/constants/theme";
import { useOnboardingNav } from "./use-onboarding-nav";

const { width } = Dimensions.get("window");
const isSmallDevice = width < 380;

const HIGH_COMMITMENT = ["extremely committed", "very committed"];

const CONTENT = {
  high: {
    heading: "we love to see this.",
    body: "a willing mind is the foundation for incredible inner transformation. you've already set yourself up to experience real, lasting change through your own voice.",
  },
  low: {
    heading: "a little willingness\nis all it takes.",
    body: "your own voice, even in small daily moments, can quietly move mountains inside you. the moment you decide to start is the only thing your subconscious needs to begin a powerful new chapter in your life.",
  },
};

export default function Screen19() {
  const { contentOpacity, fadeIn, navigateTo } = useOnboardingNav();
  const [isHigh, setIsHigh] = React.useState(true);

  useEffect(() => {
    AsyncStorage.getItem("onboarding_commitment").then((val) => {
      setIsHigh(val ? HIGH_COMMITMENT.includes(val) : true);
    });
    fadeIn();
  }, []);

  const content = isHigh ? CONTENT.high : CONTENT.low;

  const handleContinue = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigateTo("/(onboarding)/screen20");
  };

  return (
    <TouchableWithoutFeedback onPress={handleContinue}>
      <Animated.View style={[styles.container, { opacity: contentOpacity }]}>
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

        <SafeAreaView style={styles.safeArea}>
          <View style={styles.content}>
            <Text style={styles.emoji}>🙏</Text>
            <Text style={styles.heading}>{content.heading}</Text>
            <Text style={styles.body}>{content.body}</Text>
          </View>

          <View style={styles.footer}>
            <Text style={styles.tapText}>tap to continue →</Text>
          </View>
        </SafeAreaView>
      </Animated.View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  content: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: isSmallDevice ? 28 : 36,
    gap: isSmallDevice ? 22 : 28,
  },
  emoji: {
    fontSize: isSmallDevice ? 64 : 100,
    textAlign: "left",
    marginBottom: 50,
  },
  heading: {
    fontSize: isSmallDevice ? 28 : 34,
    color: "#fff",
    fontFamily: Fonts.serif,
    lineHeight: isSmallDevice ? 38 : 46,
  },
  body: {
    fontSize: isSmallDevice ? 13 : 15,
    color: "rgba(255,255,255,0.65)",
    fontFamily: Fonts.mono,
    lineHeight: isSmallDevice ? 21 : 24,
    letterSpacing: 0.15,
  },
  footer: {
    paddingHorizontal: isSmallDevice ? 24 : 32,
    paddingBottom: isSmallDevice ? 10 : 10,
    alignItems: "flex-end",
  },
  tapText: {
    fontSize: isSmallDevice ? 13 : 15,
    color: "rgba(255,255,255,0.55)",
    fontFamily: Fonts.mono,
  },
});
