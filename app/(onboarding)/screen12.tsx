import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  TouchableOpacity,
  Linking,
} from "react-native";
import { MeshGradientView } from "expo-mesh-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import * as SecureStore from "expo-secure-store";
import { requestRecordingPermissionsAsync } from "expo-audio";
import { Fonts } from "@/constants/theme";
import { useOnboardingNav } from "./use-onboarding-nav";
import { usePostHogScreenViewed } from "@/lib/posthog";
import RAnimated, { FadeIn, Easing as REasing } from "react-native-reanimated";

const { width, height } = Dimensions.get("window");
const isSmallDevice = width < 380;

const BG_COLORS = [
  "#100018", "#18002a", "#0e0014",
  "#0a0010", "#160022", "#0e0014",
  "#07000e", "#0e001a", "#0a0010",
];
const BG_POINTS: [number, number][] = [
  [0.0, 0.0], [0.5, 0.0], [1.0, 0.0],
  [0.0, 0.5], [0.48, 0.44], [1.0, 0.5],
  [0.0, 1.0], [0.5, 1.0], [1.0, 1.0],
];

const OVERLAY_COLORS = [
  "#7B2FBE", "#A030B0", "#9D2A6A",
  "#5A1A9E", "#7B2090", "#8B1A60",
  "#1A0535", "#3D0E7A", "#250845",
];

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

const letterEnter = FadeIn.duration(LETTER_FADE_MS).easing(REasing.out(REasing.cubic));

function FadeLetter({ ch, charStyle }: { ch: string; charStyle: object }) {
  return (
    <RAnimated.View entering={letterEnter}>
      <Text style={charStyle}>{ch}</Text>
    </RAnimated.View>
  );
}

type PermState = "idle" | "granted" | "denied";

export default function Screen12() {
  usePostHogScreenViewed({
    screen: "onboarding/screen12",
    component: "Screen12",
    screen_number: 12,
  });
  const { contentOpacity, fadeIn, navigateTo } = useOnboardingNav();
  const [permState, setPermState] = useState<PermState>("idle");
  const [userName, setUserName] = useState("");
  const [showOverlay, setShowOverlay] = useState(false);

  const TITLE_TEXT = "allow microphone recording";
  const DENIED_TEXT = "microphone access denied";
  const titleTokens = useMemo(() => stringToCharTokens(TITLE_TEXT), []);
  const titleWords = useMemo(() => charsToWordTokens(titleTokens), [titleTokens]);
  const deniedTokens = useMemo(() => stringToCharTokens(DENIED_TEXT), []);
  const deniedWords = useMemo(() => charsToWordTokens(deniedTokens), [deniedTokens]);

  const greetingWordsRef = useRef<WordToken[]>([]);
  const greetingTokensLenRef = useRef(0);

  const [titleVisible, setTitleVisible] = useState(0);
  const [deniedVisible, setDeniedVisible] = useState(0);
  const [greetingVisible, setGreetingVisible] = useState(0);
  const fadeMic = useRef(new Animated.Value(0)).current;
  const fadePill = useRef(new Animated.Value(0)).current;
  const fadeBtn = useRef(new Animated.Value(0)).current;
  const fadeDeniedBelow = useRef(new Animated.Value(0)).current;

  const pillOpacity = useRef(new Animated.Value(1)).current;

  // overlay animations
  const overlayOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    fadeIn();
    SecureStore.getItemAsync("user_name").then((val) => {
      if (val) setUserName(val);
    });

    setTitleVisible(0);
    let intervalId: ReturnType<typeof setInterval> | null = null;
    const delayId = setTimeout(() => {
      let i = 0;
      intervalId = setInterval(() => {
        i += 1;
        if (i > titleTokens.length) {
          clearInterval(intervalId!);
          setTimeout(() => {
            Animated.sequence([
              Animated.timing(fadeMic, { toValue: 1, duration: 500, useNativeDriver: true }),
              Animated.timing(fadePill, { toValue: 1, duration: 450, useNativeDriver: true }),
              Animated.timing(fadeBtn, { toValue: 1, duration: 400, useNativeDriver: true }),
            ]).start();
          }, 150);
          return;
        }
        const ch = titleTokens[i - 1]?.ch;
        if (ch && ch !== " ") Haptics.selectionAsync();
        setTitleVisible(i);
      }, TYPEWRITER_MS);
    }, 300);

    return () => {
      clearTimeout(delayId);
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  // typewrite "microphone access denied" when denied, then fade in footer buttons
  useEffect(() => {
    if (permState !== "denied") return;
    setDeniedVisible(0);
    fadeDeniedBelow.setValue(0);
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let i = 0;
    intervalId = setInterval(() => {
      i += 1;
      if (i > deniedTokens.length) {
        clearInterval(intervalId!);
        setTimeout(() => {
          Animated.timing(fadeDeniedBelow, { toValue: 1, duration: 400, useNativeDriver: true }).start();
        }, 150);
        return;
      }
      const ch = deniedTokens[i - 1]?.ch;
      if (ch && ch !== " ") Haptics.selectionAsync();
      setDeniedVisible(i);
    }, TYPEWRITER_MS);
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [permState]);

  // when denied, also keep pill visible (swapPill fades it out then back — ensure fadePill stays 1)
  useEffect(() => {
    if (permState === "denied") {
      Animated.timing(fadePill, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    }
  }, [permState]);

  const swapPill = (next: () => void) => {
    Animated.timing(pillOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
      next();
      Animated.timing(pillOpacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    });
  };

  const showCelebrationThenNavigate = () => {
    setShowOverlay(true);
    setGreetingVisible(0);
    const text = userName
      ? `awesome ${userName},\nlet's build your\naffirmation track!`
      : `awesome,\nlet's build your\naffirmation track!`;
    const tokens = stringToCharTokens(text);
    greetingWordsRef.current = charsToWordTokens(tokens);
    greetingTokensLenRef.current = tokens.length;

    Animated.timing(overlayOpacity, { toValue: 1, duration: 400, useNativeDriver: true }).start(() => {
      let i = 0;
      const intervalId = setInterval(() => {
        i += 1;
        if (i > tokens.length) {
          clearInterval(intervalId);
          setTimeout(() => navigateTo("/(onboarding)/screen13"), 1800);
          return;
        }
        const ch = tokens[i - 1]?.ch;
        if (ch && ch !== " " && ch !== "\n") Haptics.selectionAsync();
        setGreetingVisible(i);
      }, TYPEWRITER_MS);
    });
  };

  const handleUnlock = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const result = await requestRecordingPermissionsAsync();
    if (result.granted) {
      swapPill(() => setPermState("granted"));
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(showCelebrationThenNavigate, 400);
    } else {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      swapPill(() => setPermState("denied"));
    }
  };

  const handleOpenSettings = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Linking.openSettings();
  };

  const handleSkip = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigateTo("/(onboarding)/screen13");
  };

  const pillText =
    permState === "denied"
      ? "you can enable microphone access in settings anytime to unlock voice affirmations"
      : permState === "granted"
      ? "microphone unlocked — your voice is ready ✓"
      : "your voice is the most powerful sound that understands you";


  return (
    <Animated.View style={[styles.container, { opacity: contentOpacity }]}>
      <MeshGradientView
        style={StyleSheet.absoluteFillObject}
        colors={BG_COLORS}
        points={BG_POINTS}
      />

      <SafeAreaView style={styles.safe}>
        <View style={styles.content}>
          <View style={styles.titleSlot}>
            <View style={styles.charRow}>
              {(permState === "denied" ? deniedWords : titleWords).map((word, wIdx) => {
                const visibleCount = permState === "denied" ? deniedVisible : titleVisible;
                const charsVisible = Math.max(0, Math.min(word.chars.length, visibleCount - word.startIdx));
                if (charsVisible === 0) return null;
                if (word.chars.length === 1 && word.chars[0].ch === "\n") {
                  return <View key={wIdx} style={styles.lineBreak} />;
                }
                return (
                  <View key={wIdx} style={styles.wordRow}>
                    {word.chars.slice(0, charsVisible).map((tok, cIdx) => (
                      <FadeLetter
                        key={`${word.startIdx}-${cIdx}`}
                        ch={tok.ch}
                        charStyle={styles.title}
                      />
                    ))}
                  </View>
                );
              })}
            </View>
          </View>

          <Animated.View style={[styles.micWrap, { opacity: fadeMic }]}>
            <View style={[styles.micRing, permState === "granted" && styles.micRingGranted]}>
              <Text style={styles.micEmoji}>🎙️</Text>
            </View>
          </Animated.View>

          <Animated.View style={[styles.pill, { opacity: Animated.multiply(fadePill, pillOpacity) }]}>
            <Text style={styles.pillText}>{pillText}</Text>
          </Animated.View>
        </View>

        {permState === "denied" ? (
          <Animated.View style={[styles.footer, { opacity: fadeDeniedBelow }]}>
            <View style={styles.deniedActions}>
              <TouchableOpacity onPress={handleOpenSettings} activeOpacity={0.85} style={styles.settingsBtn}>
                <Text style={styles.settingsBtnText}>open settings</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSkip} activeOpacity={0.7} style={styles.skipRow}>
                <Text style={styles.skipText}>continue without microphone →</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        ) : (
          <Animated.View style={[styles.footer, { opacity: fadeBtn }]}>
            <TouchableOpacity
              onPress={handleUnlock}
              activeOpacity={0.85}
              style={styles.ctaBtn}
              disabled={permState === "granted"}
            >
              <Text style={styles.ctaText}>
                {permState === "granted" ? "unlocked ✓" : "unlock your voice"}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        )}
      </SafeAreaView>

      {/* ── Celebration overlay ── */}
      {showOverlay && (
        <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]} pointerEvents="none">
          <MeshGradientView
            style={StyleSheet.absoluteFillObject}
            columns={3}
            rows={3}
            colors={OVERLAY_COLORS}
            points={BG_POINTS}
            smoothsColors
          />
          <SafeAreaView style={styles.overlaySafe}>
            <View style={styles.overlaySlot}>
              <View style={styles.charRow}>
                {greetingWordsRef.current.map((word, wIdx) => {
                  const charsVisible = Math.max(0, Math.min(word.chars.length, greetingVisible - word.startIdx));
                  if (charsVisible === 0) return null;
                  if (word.chars.length === 1 && word.chars[0].ch === "\n") {
                    return <View key={wIdx} style={styles.lineBreak} />;
                  }
                  return (
                    <View key={wIdx} style={styles.wordRow}>
                      {word.chars.slice(0, charsVisible).map((tok, cIdx) => (
                        <FadeLetter
                          key={`${word.startIdx}-${cIdx}`}
                          ch={tok.ch}
                          charStyle={styles.overlayText}
                        />
                      ))}
                    </View>
                  );
                })}
              </View>
            </View>
          </SafeAreaView>
        </Animated.View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  content: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: isSmallDevice ? 24 : 44,
    gap: isSmallDevice ? 20 : 28,
  },
  titleSlot: {
    width: "100%",
  },
  charRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
  },
  wordRow: {
    flexDirection: "row",
  },
  lineBreak: {
    width: "100%",
    height: 0,
  },
  title: {
    fontSize: isSmallDevice ? 28 : 36,
    color: "#fff",
    fontFamily: Fonts.serif,
    lineHeight: isSmallDevice ? 34 : 42,
  },
  micWrap: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 130,
    marginBottom: isSmallDevice ? 32 : 48,
  },
  micRing: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(155, 109, 255, 0.12)",
    borderWidth: 1.5,
    borderColor: "rgba(155, 109, 255, 0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  micRingGranted: {
    backgroundColor: "rgba(100, 220, 130, 0.15)",
    borderColor: "rgba(100, 220, 130, 0.4)",
  },
  micEmoji: {
    fontSize: 80,
  },
  pill: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingVertical: 18,
    paddingHorizontal: 20,
    width: "100%",
  },
  pillText: {
    fontSize: isSmallDevice ? 14 : 15,
    color: "#fff",
    fontFamily: Fonts.mono,
    lineHeight: 24,
    textAlign: "center",
  },
  footer: {
    paddingHorizontal: 28,
    paddingBottom: isSmallDevice ? 10 : 10,
  },
  ctaBtn: {
    backgroundColor: "#fff",
    borderRadius: 20,
    paddingVertical: isSmallDevice ? 15 : 18,
    alignItems: "center",
  },
  ctaText: {
    color: "#0a000d",
    fontSize: 17,
    fontFamily: Fonts.mono,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  deniedActions: {
    width: "100%",
    gap: 14,
    alignItems: "center",
  },
  settingsBtn: {
    backgroundColor: "#fff",
    borderRadius: 20,
    paddingVertical: isSmallDevice ? 15 : 18,
    alignItems: "center",
    width: "100%",
  },
  settingsBtnText: {
    color: "#0a000d",
    fontSize: 17,
    fontFamily: Fonts.mono,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  skipRow: { paddingVertical: 8 },
  skipText: {
    fontSize: isSmallDevice ? 13 : 15,
    color: "rgba(255,255,255,0.55)",
    fontFamily: Fonts.mono,
    letterSpacing: 0.2,
  },

  // ── overlay ──
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
  },
  overlaySafe: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: isSmallDevice ? 28 : 36,
  },
  overlaySlot: {
    justifyContent: "flex-start",
    minHeight: isSmallDevice ? 132 : 156,
  },
  overlayText: {
    fontSize: isSmallDevice ? 36 : 44,
    color: "#fff",
    fontFamily: Fonts.serif,
    lineHeight: isSmallDevice ? 44 : 52,
  },
});
