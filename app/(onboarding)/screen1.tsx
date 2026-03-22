import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  TouchableWithoutFeedback,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Fonts } from "@/constants/theme";
import { useOnboardingNav } from "./use-onboarding-nav";

const { width, height } = Dimensions.get("window");
const isSmallDevice = width < 380;
const isShortDevice = height < 700;

export default function Screen1() {
  const { contentOpacity, fadeIn, navigateTo } = useOnboardingNav();

  const fadeOrb = useRef(new Animated.Value(0)).current;
  const fadeHey = useRef(new Animated.Value(0)).current;
  const fadeTap = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.sequence([
      Animated.timing(fadeOrb, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(fadeHey, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.delay(400),
      Animated.timing(fadeTap, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      }),
    ]);

    // Fade in the whole content layer first, then run staggered anims
    fadeIn();
    animation.start();
    return () => animation.stop();
  }, []);

  const handleContinue = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigateTo("/(onboarding)/screen2");
  };

  const orbSize = isSmallDevice || isShortDevice ? 200 : 260;

  return (
    <TouchableWithoutFeedback onPress={handleContinue}>
      <Animated.View style={[styles.container, { opacity: contentOpacity }]}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.content}>
            <Animated.View
              style={[
                styles.orbWrapper,
                { width: orbSize, height: orbSize, opacity: fadeOrb },
              ]}
            >
              <Image
                source={require("@/assets/images/orb.png")}
                style={styles.orb}
                resizeMode="contain"
              />
            </Animated.View>

            <Animated.Text style={[styles.heyText, { opacity: fadeHey }]}>
              hey
            </Animated.Text>
          </View>

          <Animated.View style={[styles.footer, { opacity: fadeTap }]}>
            <Text style={styles.tapText}>tap to continue →</Text>
          </Animated.View>
        </SafeAreaView>
      </Animated.View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  orbWrapper: {
    marginBottom: isSmallDevice ? 24 : isShortDevice ? 20 : 32,
  },
  orb: {
    width: "100%",
    height: "100%",
  },
  heyText: {
    fontSize: isSmallDevice ? 28 : 36,
    color: "#fff",
    fontFamily: Fonts.serif,
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
