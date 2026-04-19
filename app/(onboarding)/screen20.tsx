import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  PanResponder,
} from "react-native";
import RAnimated, { FadeIn, Easing as REasing } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { MeshGradientView } from "expo-mesh-gradient";
import * as Haptics from "expo-haptics";
import * as SecureStore from "expo-secure-store";
import Svg, { Path as SvgPath } from "react-native-svg";
import { Fonts } from "@/constants/theme";
import { useOnboardingNav } from "./use-onboarding-nav";
import { usePostHogScreenViewed } from "@/lib/posthog";
import { ScalePressable } from "@/components/ScalePressable";
import MakeItRain from "@/app/session/make-it-rain";
import { createAudioPlayer } from "@/lib/expo-audio";

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

const letterEnter = FadeIn.duration(LETTER_FADE_MS).easing(REasing.out(REasing.cubic));

function FadeLetter({ ch, charStyle }: { ch: string; charStyle: object }) {
  return (
    <RAnimated.View entering={letterEnter}>
      <Text style={charStyle}>{ch}</Text>
    </RAnimated.View>
  );
}

const TITLE = "sign your commitment";
const TITLE_TOKENS = stringToCharTokens(TITLE);
const TITLE_WORDS = charsToWordTokens(TITLE_TOKENS);

const COMMITMENTS = [
  "listen to my own voice",
  "protect my mind from negativity",
  "nurture my inner peace",
  "manifest my abundant self daily",
];

const PAD_HEIGHT = isSmallDevice ? 110 : 140;

export default function Screen20() {
  usePostHogScreenViewed({
    screen: "onboarding/screen20",
    component: "Screen20",
    screen_number: 20,
  });
  const { contentOpacity, fadeIn, navigateTo } = useOnboardingNav();
  const [userName, setUserName] = useState<string | null>(null);
  const [paths, setPaths] = useState<string[]>([]);
  const [hasSignature, setHasSignature] = useState(false);
  const currentPath = useRef("");
  const fadeContinue = useRef(new Animated.Value(0)).current;
  const fadeContent = useRef(new Animated.Value(0)).current;

  const [titleVisibleCount, setTitleVisibleCount] = useState(0);
  const [titleDone, setTitleDone] = useState(false);
  const [showRain, setShowRain] = useState(false);
  const rainOpacity = useRef(new Animated.Value(0)).current;
  const soundRef = useRef<ReturnType<typeof createAudioPlayer> | null>(null);

  useEffect(() => {
    fadeIn();
    SecureStore.getItemAsync("user_name").then((val) => {
      if (val) setUserName(val);
    });
    // start typewriter
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      if (i > TITLE_TOKENS.length) {
        clearInterval(id);
        setTitleDone(true);
        return;
      }
      const ch = TITLE_TOKENS[i - 1]?.ch;
      if (ch && !/\s/.test(ch)) Haptics.selectionAsync();
      setTitleVisibleCount(i);
    }, TYPEWRITER_MS);
    return () => {
      clearInterval(id);
      try { soundRef.current?.pause(); soundRef.current?.remove(); } catch { /* ignore */ }
    };
  }, []);

  useEffect(() => {
    if (!titleDone) return;
    Animated.timing(fadeContent, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, [titleDone]);

  useEffect(() => {
    Animated.timing(fadeContinue, {
      toValue: hasSignature ? 1 : 0,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [hasSignature]);

  const buttonBg = fadeContinue.interpolate({
    inputRange: [0, 1],
    outputRange: ["rgba(255,255,255,0.18)", "rgba(255,255,255,1)"],
  });
  const buttonTextColor = fadeContinue.interpolate({
    inputRange: [0, 1],
    outputRange: ["rgba(255,255,255,0.35)", "rgba(0,0,0,1)"],
  });

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        const { locationX, locationY } = e.nativeEvent;
        currentPath.current = `M ${locationX} ${locationY}`;
        setPaths((prev) => [...prev, currentPath.current]);
        setHasSignature(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      },
      onPanResponderMove: (e) => {
        const { locationX, locationY } = e.nativeEvent;
        currentPath.current += ` L ${locationX} ${locationY}`;
        setPaths((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = currentPath.current;
          return updated;
        });
      },
    })
  ).current;

  const handleClear = () => {
    setPaths([]);
    setHasSignature(false);
    currentPath.current = "";
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleSign = async () => {
    if (!hasSignature) return;
    await SecureStore.setItemAsync("signature_paths", JSON.stringify(paths));

    // Strong haptic burst on sign
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setTimeout(() => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success), 120);

    // Rain + applause
    setShowRain(true);
    Animated.timing(rainOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    try {
      const player = createAudioPlayer(require("@/assets/images/applause.mp3"));
      soundRef.current = player;
      player.play();
    } catch { /* ignore */ }

    // Light consecutive haptics throughout the rain
    let hapticCount = 0;
    const hapticInterval = setInterval(() => {
      hapticCount++;
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (hapticCount >= 18) clearInterval(hapticInterval);
    }, 160);

    // Let rain animate longer, then fade it out and navigate
    setTimeout(() => {
      clearInterval(hapticInterval);
      Animated.timing(rainOpacity, { toValue: 0, duration: 500, useNativeDriver: true }).start(() => {
        navigateTo("/(onboarding)/screen21");
      });
    }, 3200);
  };

  return (
    <Animated.View style={[styles.container, { opacity: contentOpacity }]}>
      {showRain && (
        <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: rainOpacity, zIndex: 100 }]} pointerEvents="none">
          <MakeItRain speedMultiplier={2} delayMultiplier={8} />
        </Animated.View>
      )}
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
          {/* typewriter title */}
          <View style={styles.titleRow}>
            {TITLE_WORDS.map((word, wIdx) => {
              const charsVisible = Math.max(0, Math.min(word.chars.length, titleVisibleCount - word.startIdx));
              if (charsVisible === 0) return null;
              return (
                <View key={wIdx} style={styles.wordRow}>
                  {word.chars.slice(0, charsVisible).map((t, cIdx) => (
                    <FadeLetter key={`t-${word.startIdx}-${cIdx}`} ch={t.ch} charStyle={styles.titleChar} />
                  ))}
                </View>
              );
            })}
          </View>

          <Animated.View style={{ opacity: fadeContent, gap: isSmallDevice ? 20 : 24 }}>
            {/* Commitment card */}
            <View style={styles.card}>
              <Text style={styles.commitIntro}>
                {userName ? `I, ${userName}, commit to:` : "I commit to:"}
              </Text>
              {COMMITMENTS.map((item) => (
                <View key={item} style={styles.listItem}>
                  <Text style={styles.checkEmoji}>✅</Text>
                  <Text style={styles.listText}>{item}</Text>
                </View>
              ))}
            </View>

            {/* Signature pad */}
            <View style={styles.signatureSection}>
              <View style={styles.signatureBox} {...panResponder.panHandlers}>
                {!hasSignature && (
                  <View style={styles.placeholder} pointerEvents="none">
                    <Text style={styles.placeholderText}>Draw your signature on this box</Text>
                  </View>
                )}
                <Svg height={PAD_HEIGHT} width="100%" style={StyleSheet.absoluteFill}>
                  {paths.map((d, i) => (
                    <SvgPath
                      key={i}
                      d={d}
                      stroke="#1A0535"
                      strokeWidth={2.5}
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ))}
                </Svg>
                {hasSignature && (
                  <ScalePressable style={styles.clearBtn} onPress={handleClear}>
                    <Text style={styles.clearText}>clear</Text>
                  </ScalePressable>
                )}
              </View>
              <Text style={styles.hint}>
                {"sign as a reminder of the promise you're making to yourself."}
              </Text>
            </View>
          </Animated.View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <ScalePressable
            onPress={hasSignature ? handleSign : undefined}
            disabled={!hasSignature}
            scaleTo={0.96}
          >
            <Animated.View style={[styles.signButton, { backgroundColor: buttonBg }]}>
              <Animated.Text style={[styles.signButtonText, { color: buttonTextColor }]}>
                sign
              </Animated.Text>
            </Animated.View>
          </ScalePressable>
        </View>
      </SafeAreaView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  content: {
    flex: 1,
    paddingHorizontal: isSmallDevice ? 20 : 24,
    paddingBottom: 100,
  },

  titleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: isSmallDevice ? 24 : 32,
    marginBottom: isSmallDevice ? 20 : 28,
  },
  wordRow: {
    flexDirection: "row",
  },
  titleChar: {
    fontSize: isSmallDevice ? 28 : 34,
    color: "#fff",
    fontFamily: Fonts.serif,
    lineHeight: isSmallDevice ? 34 : 40,
  },

  card: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
    borderRadius: 20,
    padding: isSmallDevice ? 16 : 20,
    gap: isSmallDevice ? 10 : 14,
    marginBottom: isSmallDevice ? 20 : 24,
  },
  commitIntro: {
    fontSize: isSmallDevice ? 13 : 15,
    color: "rgba(255,255,255,0.7)",
    fontFamily: Fonts.mono,
    marginBottom: 4,
  },
  listItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  checkEmoji: {
    fontSize: isSmallDevice ? 14 : 16,
    marginTop: 1,
  },
  listText: {
    fontSize: isSmallDevice ? 13 : 15,
    color: "#fff",
    fontFamily: Fonts.mono,
    flex: 1,
    lineHeight: isSmallDevice ? 20 : 23,
  },

  signatureSection: {
    gap: 10,
  },
  signatureBox: {
    height: PAD_HEIGHT,
    backgroundColor: "rgba(220,210,240,0.92)",
    borderRadius: 20,
    overflow: "hidden",
    position: "relative",
  },
  placeholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  placeholderText: {
    fontSize: isSmallDevice ? 14 : 16,
    color: "#888",
    fontFamily: Fonts.mono,
  },
  clearBtn: {
    position: "absolute",
    bottom: 10,
    right: 14,
    zIndex: 5,
  },
  clearText: {
    fontSize: isSmallDevice ? 12 : 14,
    color: "#5A1A9E",
    fontFamily: Fonts.mono,
  },
  hint: {
    fontSize: isSmallDevice ? 11 : 12,
    color: "rgba(255,255,255,0.45)",
    fontFamily: Fonts.mono,
    lineHeight: 18,
  },

  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: isSmallDevice ? 24 : 32,
    paddingBottom: isSmallDevice ? 10 : 30,
  },
  signButton: {
    borderRadius: 20,
    paddingVertical: 18,
    alignItems: "center",
  },
  signButtonText: {
    fontSize: isSmallDevice ? 15 : 17,
    fontFamily: Fonts.mono,
    letterSpacing: 0.3,
  },
});
