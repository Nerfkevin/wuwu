import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated, Dimensions, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MeshGradientView } from "expo-mesh-gradient";
import * as Haptics from "expo-haptics";
import * as SecureStore from "expo-secure-store";
import { Fonts } from "@/constants/theme";
import { useOnboardingNav } from "./use-onboarding-nav";

const { width } = Dimensions.get("window");
const isSmallDevice = width < 380;

export default function Screen4() {
  const { contentOpacity, fadeIn, navigateTo } = useOnboardingNav();
  const [name, setName] = React.useState("");

  const fadeName = useRef(new Animated.Value(0)).current;
  const fadeSub = useRef(new Animated.Value(0)).current;
  const fadeBtn = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    SecureStore.getItemAsync("user_name").then((val) => {
      if (val) setName(val);
    });
  }, []);

  useEffect(() => {
    fadeIn();

    const anim = Animated.sequence([
      Animated.timing(fadeName, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.delay(150),
      Animated.timing(fadeSub, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.delay(400),
      Animated.timing(fadeBtn, { toValue: 1, duration: 500, useNativeDriver: true }),
    ]);

    anim.start();
    return () => anim.stop();
  }, []);

  const handleContinue = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigateTo("/(onboarding)/screen5");
  };

  return (
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
          <Animated.Text style={[styles.heading, { opacity: fadeName }]}>
            {name ? `${name}, answer these\nquestions honestly` : "answer these\nquestions honestly"}
          </Animated.Text>

          <Animated.Text style={[styles.sub, { opacity: fadeSub }]}>
            they will help us understand your current mindset better,
            to personalize your journey to manifest your dream life!
          </Animated.Text>
        </View>

        <Animated.View style={[styles.footer, { opacity: fadeBtn }]}>
          <TouchableOpacity
            style={styles.arrowButton}
            onPress={handleContinue}
            activeOpacity={0.75}
          >
            <Text style={styles.arrowText}>let's start →</Text>
          </TouchableOpacity>
        </Animated.View>
      </SafeAreaView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  content: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: isSmallDevice ? 28 : 36,
    gap: isSmallDevice ? 22 : 30,
  },
  heading: {
    fontSize: isSmallDevice ? 36 : 44,
    color: "#fff",
    fontFamily: Fonts.serif,
    lineHeight: isSmallDevice ? 46 : 46,
  },
  sub: {
    fontSize: isSmallDevice ? 14 : 16,
    color: "rgba(255,255,255,0.6)",
    fontFamily: Fonts.mono,
    lineHeight: isSmallDevice ? 22 : 25,
    letterSpacing: 0.2,
  },
  footer: {
    paddingHorizontal: isSmallDevice ? 24 : 32,
    paddingBottom: isSmallDevice ? 20 : 32,
    paddingTop: 12,
    alignItems: "flex-end",
  },
  arrowButton: {
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 22,
    backgroundColor: "#fff",
    alignItems: "center",
  },
  arrowText: {
    fontSize: isSmallDevice ? 13 : 14,
    color: "#000",
    fontFamily: Fonts.mono,
    letterSpacing: 0.3,
  },
});
