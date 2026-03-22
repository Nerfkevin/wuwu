import React, { useRef, useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  TouchableWithoutFeedback,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import * as SecureStore from "expo-secure-store";
import { Fonts } from "@/constants/theme";
import { useOnboardingNav } from "./use-onboarding-nav";

const { width } = Dimensions.get("window");
const isSmallDevice = width < 380;

export default function Screen3() {
  const { contentOpacity, fadeIn, navigateTo } = useOnboardingNav();
  const [name, setName] = useState("");
  const inputRef = useRef<TextInput>(null);

  const fadeContinue = useRef(new Animated.Value(0)).current;
  const fadeLabel = useRef(new Animated.Value(0)).current;
  const fadeQuestion = useRef(new Animated.Value(0)).current;
  const fadeInput = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    fadeIn();
    const anim = Animated.stagger(120, [
      Animated.timing(fadeLabel, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(fadeQuestion, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(fadeInput, { toValue: 1, duration: 500, useNativeDriver: true }),
    ]);
    anim.start();
    return () => anim.stop();
  }, []);

  useEffect(() => {
    Animated.timing(fadeContinue, {
      toValue: name.trim().length > 0 ? 1 : 0,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [name]);

  const buttonBg = fadeContinue.interpolate({
    inputRange: [0, 1],
    outputRange: ["rgba(255,255,255,0.18)", "rgba(255,255,255,1)"],
  });

  const buttonTextColor = fadeContinue.interpolate({
    inputRange: [0, 1],
    outputRange: ["rgba(255,255,255,0.35)", "rgba(0,0,0,1)"],
  });

  const handleContinue = async () => {
    if (!name.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Keyboard.dismiss();
    await SecureStore.setItemAsync("user_name", name.trim());
    navigateTo("/(onboarding)/screen4");
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <Animated.View style={[styles.container, { opacity: contentOpacity }]}>
        <KeyboardAvoidingView
          style={styles.kav}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={0}
        >
          <SafeAreaView style={styles.safeArea}>
            <View style={styles.content}>
              <Animated.Text style={[styles.label, { opacity: fadeLabel }]}>
                first things first
              </Animated.Text>

              <Animated.Text style={[styles.question, { opacity: fadeQuestion }]}>
                what should we call you?
              </Animated.Text>

              <Animated.View style={[styles.inputWrapper, { opacity: fadeInput }]}>
                <TextInput
                  ref={inputRef}
                  style={styles.input}
                  placeholder="name"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  value={name}
                  onChangeText={setName}
                  autoFocus
                  autoCorrect={false}
                  autoCapitalize="words"
                  returnKeyType="done"
                  onSubmitEditing={handleContinue}
                  selectionColor="#fff"
                />
                <View style={styles.inputLine} />
              </Animated.View>
            </View>

            <View style={styles.footer}>
              <TouchableOpacity
                onPress={handleContinue}
                activeOpacity={name.trim() ? 0.75 : 1}
                disabled={!name.trim()}
              >
                <Animated.View
                  style={[styles.continueButton, { backgroundColor: buttonBg }]}
                >
                  <Animated.Text
                    style={[styles.continueText, { color: buttonTextColor }]}
                  >
                    continue
                  </Animated.Text>
                </Animated.View>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Animated.View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  kav: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: isSmallDevice ? 28 : 36,
    paddingTop: isSmallDevice ? 32 : 48,
    gap: isSmallDevice ? 14 : 18,
  },
  label: {
    fontSize: 12,
    color: "rgba(255,255,255,0.5)",
    fontFamily: Fonts.mono,
    letterSpacing: 0.5,
  },
  question: {
    fontSize: isSmallDevice ? 28 : 34,
    color: "#fff",
    fontFamily: Fonts.serif,
    lineHeight: isSmallDevice ? 38 : 46,
  },
  inputWrapper: {
    marginTop: isSmallDevice ? 12 : 20,
  },
  input: {
    fontSize: isSmallDevice ? 26 : 32,
    color: "#fff",
    fontFamily: Fonts.serif,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  inputLine: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  footer: {
    paddingHorizontal: isSmallDevice ? 24 : 32,
    paddingBottom: isSmallDevice ? 20 : 32,
  },
  continueButton: {
    borderRadius: 20,
    paddingVertical: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  continueText: {
    fontSize: isSmallDevice ? 15 : 17,
    fontFamily: Fonts.mono,
    letterSpacing: 0.3,
  },
});
