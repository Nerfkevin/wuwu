import React, { useRef, useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  TouchableWithoutFeedback,
} from "react-native";
import RAnimated, { FadeIn, Easing as REasing } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import * as SecureStore from "expo-secure-store";
import { Fonts } from "@/constants/theme";
import { useOnboardingNav } from "./use-onboarding-nav";
import { usePostHog, usePostHogScreenViewed } from "@/lib/posthog";
import { ScalePressable } from "@/components/ScalePressable";

const { width } = Dimensions.get("window");
const isSmallDevice = width < 380;

const QUESTION = "what should we call you?";

const TYPEWRITER_MS = 33;
const LETTER_FADE_MS = 480;

type CharToken = { ch: string };
type WordToken = { chars: CharToken[]; startIdx: number };

function stringToCharTokens(s: string): CharToken[] {
  return [...s].map((ch) => ({ ch }));
}

function charsToWordTokens(chars: CharToken[]): WordToken[] {
  const words: WordToken[] = [];
  let i = 0;
  while (i < chars.length) {
    const startIdx = i;
    const wordChars: CharToken[] = [];
    while (i < chars.length && chars[i].ch !== " ") {
      wordChars.push(chars[i++]);
    }
    while (i < chars.length && chars[i].ch === " ") {
      wordChars.push(chars[i++]);
    }
    if (wordChars.length > 0) words.push({ chars: wordChars, startIdx });
  }
  return words;
}

const enterAnim = FadeIn.duration(LETTER_FADE_MS).easing(
  REasing.out(REasing.cubic)
);

function FadeLetter({ ch, charStyle }: { ch: string; charStyle: object }) {
  return (
    <RAnimated.View entering={enterAnim}>
      <Text style={charStyle}>{ch}</Text>
    </RAnimated.View>
  );
}

export default function Screen3() {
  usePostHogScreenViewed({
    screen: "onboarding/screen3",
    component: "Screen3",
    screen_number: 3,
  });
  const ph = usePostHog();
  const { contentOpacity, fadeIn, navigateTo } = useOnboardingNav();
  const [name, setName] = useState("");
  const inputRef = useRef<TextInput>(null);

  const questionTokens = useRef(stringToCharTokens(QUESTION)).current;
  const questionWords = useRef(charsToWordTokens(questionTokens)).current;

  const [labelDone, setLabelDone] = useState(false);
  const [visibleCount, setVisibleCount] = useState(0);
  const [typewriterDone, setTypewriterDone] = useState(false);

  const fadeContinue = useRef(new Animated.Value(0)).current;
  const fadeLabel = useRef(new Animated.Value(0)).current;
  const fadeInput = useRef(new Animated.Value(0)).current;
  const fadeFooter = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    fadeIn();
    Animated.timing(fadeLabel, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setLabelDone(true);
    });
  }, []);

  useEffect(() => {
    if (!labelDone) return;
    setVisibleCount(0);
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      if (i > questionTokens.length) {
        clearInterval(id);
        setTypewriterDone(true);
        return;
      }
      const ch = questionTokens[i - 1]?.ch;
      if (ch && !/\s/.test(ch)) {
        Haptics.selectionAsync();
      }
      setVisibleCount(i);
    }, TYPEWRITER_MS);
    return () => clearInterval(id);
  }, [labelDone, questionTokens]);

  useEffect(() => {
    if (!typewriterDone) return;
    Animated.parallel([
      Animated.timing(fadeInput, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.timing(fadeFooter, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start(() => {
      inputRef.current?.focus();
    });
  }, [typewriterDone]);

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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Keyboard.dismiss();
    await SecureStore.setItemAsync("user_name", name.trim());
    try {
      const uuid = await SecureStore.getItemAsync('app_user_uuid');
      if (uuid) ph?.identify(uuid, { name: name.trim() });
      ph?.capture('onboarding_name_set', { component: 'Screen3' });
      void ph?.flush();
    } catch {}
    navigateTo("/(onboarding)/screen4");
  };

  const charTextStyle = styles.charText;

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

              <View style={styles.charRow}>
                {questionWords.map((word, wIdx) => {
                  const charsVisible = Math.max(
                    0,
                    Math.min(word.chars.length, visibleCount - word.startIdx)
                  );
                  if (charsVisible === 0) return null;
                  return (
                    <View key={wIdx} style={styles.wordRow}>
                      {word.chars.slice(0, charsVisible).map((t, cIdx) => (
                        <FadeLetter
                          key={`${word.startIdx}-${cIdx}`}
                          ch={t.ch}
                          charStyle={charTextStyle}
                        />
                      ))}
                    </View>
                  );
                })}
              </View>

              <Animated.View style={[styles.inputWrapper, { opacity: fadeInput }]}>
                <TextInput
                  ref={inputRef}
                  style={styles.input}
                  placeholder="name"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  value={name}
                  onChangeText={setName}
                  autoCorrect={false}
                  autoCapitalize="words"
                  returnKeyType="done"
                  onSubmitEditing={handleContinue}
                  selectionColor="#fff"
                />
                <View style={styles.inputLine} />
              </Animated.View>
            </View>

            <Animated.View
              style={[styles.footer, { opacity: fadeFooter }]}
              pointerEvents={typewriterDone ? "auto" : "none"}
            >
              <ScalePressable
                onPress={handleContinue}
                disabled={!name.trim()}
                scaleTo={0.96}
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
              </ScalePressable>
            </Animated.View>
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
  charRow: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  wordRow: {
    flexDirection: "row",
  },
  charText: {
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
    paddingBottom: isSmallDevice ? 10 : 10,
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
