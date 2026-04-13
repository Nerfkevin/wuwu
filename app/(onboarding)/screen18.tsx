import React, { useRef, useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  TouchableOpacity,
} from "react-native";
import RAnimated, { FadeIn, Easing as REasing } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Fonts } from "@/constants/theme";
import { useOnboardingNav } from "./use-onboarding-nav";
import { usePostHogScreenViewed } from "@/lib/posthog";

const { width } = Dimensions.get("window");
const isSmallDevice = width < 380;

const TYPEWRITER_MS = 33;
const LETTER_FADE_MS = 480;
const SLIDE_DELAY_MS = 300;

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
    if (chars[i].ch === "\n") {
      words.push({ chars: [{ ch: "\n" }], startIdx });
      i += 1;
      continue;
    }
    const wordChars: CharToken[] = [];
    while (i < chars.length && chars[i].ch !== " " && chars[i].ch !== "\n") {
      wordChars.push(chars[i++]);
    }
    while (i < chars.length && chars[i].ch === " ") {
      wordChars.push(chars[i++]);
    }
    if (wordChars.length > 0) words.push({ chars: wordChars, startIdx });
  }
  return words;
}

const letterEnter = FadeIn.duration(LETTER_FADE_MS).easing(REasing.out(REasing.cubic));

function FadeLetter({ ch, charStyle }: { ch: string; charStyle: object }) {
  return (
    <RAnimated.View entering={letterEnter}>
      <Text style={charStyle}>{ch}</Text>
    </RAnimated.View>
  );
}

const OPTIONS = [
  { emoji: "😎", label: "extremely committed" },
  { emoji: "💪", label: "very committed" },
  { emoji: "💪", label: "somewhat committed" },
  { emoji: "🌱", label: "a little committed" },
  { emoji: "⭐", label: "just trying it out" },
];

const QUESTION = "how committed are you\nto manifesting your\ndream life?";

export default function Screen18() {
  usePostHogScreenViewed({
    screen: "onboarding/screen18",
    component: "Screen18",
    screen_number: 18,
  });
  const { contentOpacity, fadeIn, navigateTo } = useOnboardingNav();
  const [selected, setSelected] = useState<string | null>(null);
  const fadeContinue = useRef(new Animated.Value(0)).current;
  const fadeOptions = useRef(new Animated.Value(0)).current;
  const fadePre = useRef(new Animated.Value(0)).current;

  const questionTokens = useMemo(() => stringToCharTokens(QUESTION), []);
  const questionWords = useMemo(() => charsToWordTokens(questionTokens), [questionTokens]);
  const [visibleCount, setVisibleCount] = useState(0);
  const [titleDone, setTitleDone] = useState(false);

  const qLineH = isSmallDevice ? 36 : 44;
  const charStyle = { fontSize: isSmallDevice ? 26 : 32, color: "#fff", fontFamily: Fonts.serif, lineHeight: qLineH };

  useEffect(() => {
    fadeIn();

    // fade in "so," immediately
    Animated.timing(fadePre, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();

    let intervalId: ReturnType<typeof setInterval> | null = null;
    const delayId = setTimeout(() => {
      let i = 0;
      intervalId = setInterval(() => {
        i += 1;
        if (i > questionTokens.length) {
          clearInterval(intervalId!);
          setTitleDone(true);
          return;
        }
        const ch = questionTokens[i - 1]?.ch;
        if (ch && ch !== " " && ch !== "\n") {
          Haptics.selectionAsync();
        }
        setVisibleCount(i);
      }, TYPEWRITER_MS);
    }, SLIDE_DELAY_MS);

    return () => {
      clearTimeout(delayId);
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (!titleDone) return;
    const t = setTimeout(() => {
      Animated.timing(fadeOptions, {
        toValue: 1,
        duration: 350,
        useNativeDriver: true,
      }).start();
    }, 200);
    return () => clearTimeout(t);
  }, [titleDone]);

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
          <Animated.Text style={[styles.pre, { opacity: fadePre }]}>so,</Animated.Text>
          <View style={[styles.questionSlot, { minHeight: qLineH * 3 }]}>
            <View style={styles.charRow}>
              {questionWords.map((word, wIdx) => {
                const charsVisible = Math.max(
                  0,
                  Math.min(word.chars.length, visibleCount - word.startIdx)
                );
                if (charsVisible === 0) return null;
                if (word.chars.length === 1 && word.chars[0].ch === "\n") {
                  return <View key={wIdx} style={styles.lineBreak} />;
                }
                return (
                  <View key={wIdx} style={styles.wordRow}>
                    {word.chars.slice(0, charsVisible).map((t, cIdx) => (
                      <FadeLetter
                        key={`${word.startIdx}-${cIdx}`}
                        ch={t.ch}
                        charStyle={charStyle}
                      />
                    ))}
                  </View>
                );
              })}
            </View>
          </View>
        </View>

        <Animated.View
          style={[styles.optionsArea, { opacity: fadeOptions }]}
          pointerEvents={titleDone ? "auto" : "none"}
        >
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
        </Animated.View>

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
  questionSlot: {
    width: "100%",
    justifyContent: "flex-start",
  },
  charRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
    width: "100%",
  },
  wordRow: {
    flexDirection: "row",
  },
  lineBreak: {
    width: "100%",
    height: 0,
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
    borderRadius: 15,
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
