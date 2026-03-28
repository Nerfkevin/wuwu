import React, { useRef, useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Fonts } from "@/constants/theme";
import { useOnboardingNav } from "./use-onboarding-nav";

const { width } = Dimensions.get("window");
const isSmallDevice = width < 380;

const OPTIONS = [
  { emoji: "😎", label: "extremely committed" },
  { emoji: "💪", label: "very committed" },
  { emoji: "💪", label: "somewhat committed" },
  { emoji: "🌱", label: "a little committed" },
  { emoji: "⭐", label: "just trying it out" },
];

export default function Screen18() {
  const { contentOpacity, fadeIn, navigateTo } = useOnboardingNav();
  const [selected, setSelected] = useState<string | null>(null);
  const fadeContinue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    fadeIn();
  }, []);

  useEffect(() => {
    Animated.timing(fadeContinue, {
      toValue: selected !== null ? 1 : 0,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [selected]);

  const buttonBg = fadeContinue.interpolate({
    inputRange: [0, 1],
    outputRange: ["rgba(255,255,255,0.18)", "rgba(255,255,255,1)"],
  });

  const buttonTextColor = fadeContinue.interpolate({
    inputRange: [0, 1],
    outputRange: ["rgba(255,255,255,0.35)", "rgba(0,0,0,1)"],
  });

  const handleSelect = (label: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelected(label);
  };

  const handleContinue = async () => {
    if (!selected) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await AsyncStorage.setItem("onboarding_commitment", selected);
    navigateTo("/(onboarding)/screen19");
  };

  return (
    <Animated.View style={[styles.container, { opacity: contentOpacity }]}>
      <SafeAreaView style={styles.safeArea}>

        <View style={styles.topSection}>
          <Text style={styles.pre}>so,</Text>
          <Text style={styles.question}>
            how committed are you{"\n"}to manifesting your{"\n"}most abundant self?
          </Text>
        </View>

        <View style={styles.optionsArea}>
          {OPTIONS.map((opt) => {
            const isSel = selected === opt.label;
            return (
              <TouchableOpacity
                key={opt.label}
                style={[styles.option, isSel && styles.optionSelected]}
                onPress={() => handleSelect(opt.label)}
                activeOpacity={0.7}
              >
                <Text style={[styles.optionText, isSel && styles.optionTextSelected]}>
                  {opt.emoji} {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.footer}>
          <TouchableOpacity
            onPress={handleContinue}
            activeOpacity={selected ? 0.75 : 1}
            disabled={!selected}
          >
            <Animated.View style={[styles.continueButton, { backgroundColor: buttonBg }]}>
              <Animated.Text style={[styles.continueText, { color: buttonTextColor }]}>
                continue
              </Animated.Text>
            </Animated.View>
          </TouchableOpacity>
        </View>

      </SafeAreaView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },

  topSection: {
    paddingHorizontal: isSmallDevice ? 28 : 32,
    paddingTop: isSmallDevice ? 32 : 48,
    gap: 8,
  },
  pre: {
    fontSize: isSmallDevice ? 13 : 14,
    color: "rgba(255,255,255,0.5)",
    fontFamily: Fonts.mono,
    letterSpacing: 0.2,
  },
  question: {
    fontSize: isSmallDevice ? 26 : 32,
    color: "#fff",
    fontFamily: Fonts.serif,
    lineHeight: isSmallDevice ? 36 : 44,
  },

  optionsArea: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: isSmallDevice ? 28 : 32,
    gap: 10,
  },
  option: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    borderRadius: 50,
    paddingVertical: isSmallDevice ? 13 : 15,
    alignItems: "center",
  },
  optionSelected: {
    borderColor: "#fff",
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  optionText: {
    fontSize: isSmallDevice ? 13 : 14,
    color: "rgba(255,255,255,0.5)",
    fontFamily: Fonts.mono,
    letterSpacing: 0.2,
  },
  optionTextSelected: { color: "#fff" },

  footer: {
    paddingHorizontal: isSmallDevice ? 24 : 32,
    paddingBottom: isSmallDevice ? 10 : 10,
    paddingTop: 12,
  },
  continueButton: {
    borderRadius: 20,
    paddingVertical: 18,
    alignItems: "center",
  },
  continueText: {
    fontSize: isSmallDevice ? 15 : 17,
    fontFamily: Fonts.mono,
    letterSpacing: 0.3,
  },
});
