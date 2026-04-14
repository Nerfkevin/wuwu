import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  TouchableWithoutFeedback,
  TouchableOpacity,
  Image,
  Linking,
} from "react-native";
import RAnimated, { FadeIn, Easing as REasing } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Fonts } from "@/constants/theme";
import { useOnboardingNav } from "./use-onboarding-nav";
import { usePostHogScreenViewed } from "@/lib/posthog";

const { width, height } = Dimensions.get("window");
const isSmallDevice = width < 380;
const isShortDevice = height < 700;

const HEY = "hey";

const TYPEWRITER_MS = 53;
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

export default function Screen1() {
  usePostHogScreenViewed({
    screen: "onboarding/screen1",
    component: "Screen1",
    screen_number: 1,
  });
  const { contentOpacity, fadeIn, navigateTo } = useOnboardingNav();

  const fadeOrb = useRef(new Animated.Value(0)).current;
  const fadeTap = useRef(new Animated.Value(0)).current;

  const heyTokens = useRef(stringToCharTokens(HEY)).current;
  const heyWords = useRef(charsToWordTokens(heyTokens)).current;

  const [orbDone, setOrbDone] = useState(false);
  const [visibleHeyCount, setVisibleHeyCount] = useState(0);
  const [heyTypeDone, setHeyTypeDone] = useState(false);

  useEffect(() => {
    fadeIn();
    const anim = Animated.timing(fadeOrb, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    });
    anim.start(({ finished }) => {
      if (finished) setOrbDone(true);
    });
    return () => anim.stop();
  }, []);

  useEffect(() => {
    if (!orbDone) return;
    setVisibleHeyCount(0);
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      if (i > heyTokens.length) {
        clearInterval(id);
        setHeyTypeDone(true);
        return;
      }
      const ch = heyTokens[i - 1]?.ch;
      if (ch && !/\s/.test(ch)) {
        Haptics.selectionAsync();
      }
      setVisibleHeyCount(i);
    }, TYPEWRITER_MS);
    return () => clearInterval(id);
  }, [orbDone, heyTokens]);

  useEffect(() => {
    if (!heyTypeDone) return;
    const seq = Animated.sequence([
      Animated.delay(400),
      Animated.timing(fadeTap, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      }),
    ]);
    seq.start();
    return () => seq.stop();
  }, [heyTypeDone]);

  const handleContinue = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    navigateTo("/(onboarding)/screen2");
  };

  const handleOpenLink = async (url: string) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Linking.openURL(url);
  };

  const handleSkip = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigateTo("/(tabs)");
  };

  const orbSize = isSmallDevice || isShortDevice ? 200 : 260;
  const orbMarginBottom = isSmallDevice ? 24 : isShortDevice ? 20 : 32;
  const heyLineHeight = isSmallDevice ? 34 : 44;
  const stackHeight = orbSize + orbMarginBottom + heyLineHeight;

  return (
    <TouchableWithoutFeedback onPress={handleContinue}>
      <Animated.View style={[styles.container, { opacity: contentOpacity }]}>
        <SafeAreaView style={styles.safeArea}>
          <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
            <Text style={styles.skipText}>skip</Text>
          </TouchableOpacity>
          <View style={styles.content}>
            <View style={[styles.stackBlock, { height: stackHeight }]}>
              <Animated.View
                style={{
                  width: orbSize,
                  height: orbSize,
                  marginBottom: orbMarginBottom,
                  opacity: fadeOrb,
                }}
              >
                <Image
                  source={require("@/assets/images/orb.png")}
                  style={styles.orb}
                  resizeMode="contain"
                />
              </Animated.View>

              <View
                style={[
                  styles.charRow,
                  { height: heyLineHeight },
                ]}
              >
                {heyWords.map((word, wIdx) => {
                  const charsVisible = Math.max(
                    0,
                    Math.min(word.chars.length, visibleHeyCount - word.startIdx)
                  );
                  if (charsVisible === 0) return null;
                  return (
                    <View key={wIdx} style={styles.wordRow}>
                      {word.chars.slice(0, charsVisible).map((t, cIdx) => (
                        <FadeLetter
                          key={`${word.startIdx}-${cIdx}`}
                          ch={t.ch}
                          charStyle={styles.heyCharText}
                        />
                      ))}
                    </View>
                  );
                })}
              </View>
            </View>
          </View>

          <Animated.View style={[styles.footer, { opacity: fadeTap }]}>
            <Text style={styles.tapText}>tap to continue →</Text>
          </Animated.View>

          <View style={{ height: isSmallDevice ? 24 : 32 }} />

          <View style={styles.disclaimerContainer}>
            <Text style={styles.disclaimerText}>
              By continuing, you agree to our{' '}
              <Text style={styles.linkText} onPress={() => handleOpenLink('https://98goats.com/terms')}>Terms & Conditions</Text>
              {' '}and{' '}
              <Text style={styles.linkText} onPress={() => handleOpenLink('https://98goats.com/privacy')}>Privacy Policy</Text>.
            </Text>
          </View>
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
  stackBlock: {
    justifyContent: "flex-start",
    alignItems: "center",
  },
  orb: {
    width: "100%",
    height: "100%",
  },
  charRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "stretch",
  },
  wordRow: {
    flexDirection: "row",
  },
  heyCharText: {
    fontSize: isSmallDevice ? 28 : 36,
    lineHeight: isSmallDevice ? 34 : 44,
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
  disclaimerContainer: {
    alignItems: "center",
    paddingHorizontal: 40,
  },
  disclaimerText: {
    fontSize: 10,
    color: "rgba(255,255,255,0.35)",
    textAlign: "center",
    lineHeight: 14,
    fontFamily: Fonts.mono,
  },
  linkText: {
    textDecorationLine: "underline",
    color: "rgba(255,255,255,0.5)",
  },
  skipButton: {
    position: "absolute",
    top: 0,
    right: isSmallDevice ? 16 : 20,
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginTop: 50,
  },
  skipText: {
    fontSize: isSmallDevice ? 13 : 14,
    color: "rgba(255,255,255,0.4)",
    fontFamily: Fonts.mono,
  },
});
