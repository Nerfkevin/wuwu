import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Animated, Dimensions, TouchableWithoutFeedback } from "react-native";
import RAnimated, { FadeIn, Easing as REasing } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { MeshGradientView } from "expo-mesh-gradient";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Fonts } from "@/constants/theme";
import { useOnboardingNav } from "./use-onboarding-nav";
import { usePostHogScreenViewed } from "@/lib/posthog";

const TYPEWRITER_MS = 30;
const LETTER_FADE_MS = 400;

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
    while (i < chars.length && chars[i].ch !== " " && chars[i].ch !== "\n") {
      wordChars.push(chars[i++]);
    }
    while (i < chars.length && (chars[i].ch === " " || chars[i].ch === "\n")) {
      wordChars.push(chars[i++]);
    }
    if (wordChars.length > 0) words.push({ chars: wordChars, startIdx });
  }
  return words;
}

const enterAnim = FadeIn.duration(LETTER_FADE_MS).easing(REasing.out(REasing.cubic));

function FadeLetter({ ch, charStyle }: { ch: string; charStyle: object }) {
  return (
    <RAnimated.View entering={enterAnim}>
      <Text style={charStyle}>{ch}</Text>
    </RAnimated.View>
  );
}

const { width } = Dimensions.get("window");
const isSmallDevice = width < 380;

const HIGH_COMMITMENT = ["extremely committed", "very committed"];

const CONTENT = {
  high: {
    heading: "we love to see this.",
    body: "a willing mind is the foundation for incredible inner transformation.",
  },
  low: {
    heading: "a little willingness is all it takes.",
    body: "your own voice, even in small daily moments, can quietly move mountains inside you.",
  },
};

export default function Screen19() {
  usePostHogScreenViewed({
    screen: "onboarding/screen19",
    component: "Screen19",
    screen_number: 19,
  });
  const { contentOpacity, fadeIn, navigateTo } = useOnboardingNav();
  const [isHigh, setIsHigh] = React.useState(true);
  const [ready, setReady] = useState(false);
  const [emojiDone, setEmojiDone] = useState(false);
  const [headingVisibleCount, setHeadingVisibleCount] = useState(0);
  const [headingDone, setHeadingDone] = useState(false);
  const [bodyDone, setBodyDone] = useState(false);

  const emojiScale = useRef(new Animated.Value(0.4)).current;
  const emojiOpacity = useRef(new Animated.Value(0)).current;
  const fadeBody = useRef(new Animated.Value(0)).current;
  const fadeFooter = useRef(new Animated.Value(0)).current;

  const headingTokens = useRef<CharToken[]>([]);
  const headingWords = useRef<WordToken[]>([]);

  useEffect(() => {
    AsyncStorage.getItem("onboarding_commitment").then((val) => {
      setIsHigh(val ? HIGH_COMMITMENT.includes(val) : true);
      setReady(true);
    });
    fadeIn();
  }, []);

  const content = isHigh ? CONTENT.high : CONTENT.low;

  // rebuild heading tokens when ready
  useEffect(() => {
    if (!ready) return;
    headingTokens.current = stringToCharTokens(content.heading);
    headingWords.current = charsToWordTokens(headingTokens.current);
    setHeadingVisibleCount(0);
    setHeadingDone(false);
  }, [ready, isHigh]);

  // animate emoji in, then start heading
  useEffect(() => {
    if (!ready) return;
    Animated.parallel([
      Animated.spring(emojiScale, { toValue: 1, useNativeDriver: true, tension: 120, friction: 8 }),
      Animated.timing(emojiOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start(() => setEmojiDone(true));
  }, [ready]);

  // heading typewriter — starts after emoji
  useEffect(() => {
    if (!emojiDone || headingTokens.current.length === 0) return;
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      if (i > headingTokens.current.length) {
        clearInterval(id);
        setHeadingDone(true);
        return;
      }
      const ch = headingTokens.current[i - 1]?.ch;
      if (ch && !/\s/.test(ch)) Haptics.selectionAsync();
      setHeadingVisibleCount(i);
    }, TYPEWRITER_MS);
    return () => clearInterval(id);
  }, [emojiDone, isHigh]);

  // fade body in after heading done
  useEffect(() => {
    if (!headingDone) return;
    Animated.timing(fadeBody, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start(() => {
      setBodyDone(true);
      Animated.timing(fadeFooter, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start();
    });
  }, [headingDone]);

  const handleContinue = () => {
    if (!bodyDone) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
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
            <Animated.Text style={[styles.emoji, { opacity: emojiOpacity, transform: [{ scale: emojiScale }] }]}>
              🙏
            </Animated.Text>

            <View style={styles.charRow}>
              {headingWords.current.map((word, wIdx) => {
                const charsVisible = Math.max(0, Math.min(word.chars.length, headingVisibleCount - word.startIdx));
                if (charsVisible === 0) return null;
                return (
                  <View key={wIdx} style={styles.wordRow}>
                    {word.chars.slice(0, charsVisible).map((t, cIdx) => (
                      <FadeLetter key={`h-${word.startIdx}-${cIdx}`} ch={t.ch} charStyle={styles.heading} />
                    ))}
                  </View>
                );
              })}
            </View>

            <Animated.Text style={[styles.body, { opacity: fadeBody }]}>
              {content.body}
            </Animated.Text>
          </View>

          <Animated.View style={[styles.footer, { opacity: fadeFooter }]} pointerEvents={bodyDone ? "auto" : "none"}>
            <Text style={styles.tapText}>tap to continue →</Text>
          </Animated.View>
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
  charRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    height: isSmallDevice ? 56 : 98,
    alignContent: "flex-start",
  },
  wordRow: {
    flexDirection: "row",
  },
  heading: {
    fontSize: isSmallDevice ? 28 : 34,
    color: "#fff",
    fontFamily: Fonts.serif,
    lineHeight: isSmallDevice ? 30 : 40,
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
