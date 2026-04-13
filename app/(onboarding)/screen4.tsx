import React, { useEffect, useRef, useState, useMemo } from "react";
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
import { MeshGradientView } from "expo-mesh-gradient";
import * as Haptics from "expo-haptics";
import * as SecureStore from "expo-secure-store";
import { Fonts } from "@/constants/theme";
import { useOnboardingNav } from "./use-onboarding-nav";
import { usePostHogScreenViewed } from "@/lib/posthog";

const { width } = Dimensions.get("window");
const isSmallDevice = width < 380;

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

export default function Screen4() {
  usePostHogScreenViewed({
    screen: "onboarding/screen4",
    component: "Screen4",
    screen_number: 4,
  });
  const { contentOpacity, fadeIn, navigateTo } = useOnboardingNav();
  const [name, setName] = useState<string | null>(null);

  const fadeSub = useRef(new Animated.Value(0)).current;
  const fadeBtn = useRef(new Animated.Value(0)).current;

  const headingText = useMemo(() => {
    if (name === null) return "";
    return name
      ? `${name}, answer these\nquestions honestly`
      : "answer these\nquestions honestly";
  }, [name]);

  const headingTokens = useMemo(
    () => stringToCharTokens(headingText),
    [headingText]
  );
  const headingWords = useMemo(
    () => charsToWordTokens(headingTokens),
    [headingTokens]
  );

  const [visibleCount, setVisibleCount] = useState(0);
  const [headingDone, setHeadingDone] = useState(false);

  const headingLineHeight = isSmallDevice ? 46 : 46;
  /** Fixed height: enough for wrapped title + newline, minimal empty space above description */
  const headingSlotHeight = headingLineHeight * 5;

  useEffect(() => {
    fadeIn();
    SecureStore.getItemAsync("user_name").then((val) => {
      setName(val ?? "");
    });
  }, []);

  useEffect(() => {
    if (name === null || headingTokens.length === 0) return;
    setVisibleCount(0);
    setHeadingDone(false);
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      if (i > headingTokens.length) {
        clearInterval(id);
        setHeadingDone(true);
        return;
      }
      const ch = headingTokens[i - 1]?.ch;
      if (ch && ch !== " " && ch !== "\n") {
        Haptics.selectionAsync();
      }
      setVisibleCount(i);
    }, TYPEWRITER_MS);
    return () => clearInterval(id);
  }, [name, headingTokens]);

  useEffect(() => {
    if (!headingDone) return;
    const anim = Animated.sequence([
      Animated.delay(150),
      Animated.timing(fadeSub, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.delay(400),
      Animated.timing(fadeBtn, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [headingDone]);

  const handleContinue = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigateTo("/(onboarding)/screen5");
  };

  const headingCharStyle = [
    styles.headingChar,
    { lineHeight: headingLineHeight },
  ];

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
          <View style={styles.copyBlock}>
            <View
              style={[styles.headingSlot, { height: headingSlotHeight }]}
            >
              <View style={styles.charRow}>
                {headingWords.map((word, wIdx) => {
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
                          charStyle={headingCharStyle}
                        />
                      ))}
                    </View>
                  );
                })}
              </View>
            </View>

            <Animated.Text style={[styles.sub, { opacity: fadeSub }]}>
              they will help us personalize your journey to manifest your dream life!
            </Animated.Text>
          </View>
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
  },
  copyBlock: {
    width: "100%",
    gap: isSmallDevice ? 4 : 6,
  },
  headingSlot: {
    width: "100%",
    justifyContent: "flex-start",
    overflow: "hidden",
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
  headingChar: {
    fontSize: isSmallDevice ? 36 : 44,
    color: "#fff",
    fontFamily: Fonts.serif,
  },
  sub: {
    marginTop: -100,
    fontSize: isSmallDevice ? 14 : 16,
    color: "rgba(255,255,255,0.6)",
    fontFamily: Fonts.mono,
    lineHeight: isSmallDevice ? 22 : 25,
    letterSpacing: 0.2,
  },
  footer: {
    paddingHorizontal: isSmallDevice ? 24 : 32,
    paddingBottom: isSmallDevice ? 10 : 10,
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
