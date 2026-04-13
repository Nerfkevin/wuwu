import React, { useRef, useEffect, useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  TouchableWithoutFeedback,
} from "react-native";
import RAnimated, { FadeIn, Easing as REasing } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { MeshGradientView } from "expo-mesh-gradient";
import * as Haptics from "expo-haptics";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Fonts } from "@/constants/theme";
import { useOnboardingNav } from "./use-onboarding-nav";
import { usePostHogScreenViewed } from "@/lib/posthog";

const { width } = Dimensions.get("window");
const isSmallDevice = width < 380;

const TYPEWRITER_MS = 33;
const LETTER_FADE_MS = 480;

type Seg = { text: string; bold?: boolean };
type CharToken = { ch: string; bold: boolean };
type WordToken = { chars: CharToken[]; startIdx: number };

function segmentsToTokens(segments: Seg[]): CharToken[] {
  const out: CharToken[] = [];
  for (const seg of segments) {
    const bold = !!seg.bold;
    for (const ch of seg.text) {
      out.push({ ch, bold });
    }
  }
  return out;
}

function charsToWordTokens(chars: CharToken[]): WordToken[] {
  const words: WordToken[] = [];
  let i = 0;
  while (i < chars.length) {
    const startIdx = i;
    if (chars[i].ch === "\n") {
      words.push({ chars: [{ ch: "\n", bold: chars[i].bold }], startIdx });
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

const letterEnter = FadeIn.duration(LETTER_FADE_MS).easing(
  REasing.out(REasing.cubic)
);

function FadeLetter({ ch, charStyle }: { ch: string; charStyle: object }) {
  return (
    <RAnimated.View entering={letterEnter}>
      <Text style={charStyle}>{ch}</Text>
    </RAnimated.View>
  );
}

function FullRuns({ segments, style }: { segments: Seg[]; style: object }) {
  return (
    <Text style={style}>
      {segments.map((seg, i) =>
        seg.bold ? (
          <Text key={i} style={styles.bold}>
            {seg.text}
          </Text>
        ) : (
          <Text key={i}>{seg.text}</Text>
        )
      )}
    </Text>
  );
}

function TypewriterBlock({
  segments,
  textStyle,
  lineHeight,
  minLines,
  onComplete,
  animate,
}: {
  segments: Seg[];
  textStyle: object;
  lineHeight: number;
  minLines: number;
  onComplete: () => void;
  animate: boolean;
}) {
  const tokens = useMemo(() => segmentsToTokens(segments), [segments]);
  const words = useMemo(() => charsToWordTokens(tokens), [tokens]);
  const [visibleCount, setVisibleCount] = useState(animate ? 0 : tokens.length);
  const doneRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (!animate) {
      setVisibleCount(tokens.length);
      return;
    }
    doneRef.current = false;
    setVisibleCount(0);
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      if (i > tokens.length) {
        clearInterval(id);
        if (!doneRef.current) {
          doneRef.current = true;
          setTimeout(() => onCompleteRef.current(), 300);
        }
        return;
      }
      const ch = tokens[i - 1]?.ch;
      if (ch && ch !== " " && ch !== "\n") {
        Haptics.selectionAsync();
      }
      setVisibleCount(i);
    }, TYPEWRITER_MS);
    return () => clearInterval(id);
  }, [tokens, animate]);

  const charStyle = (bold: boolean) =>
    bold
      ? [textStyle, styles.bold, { lineHeight }]
      : [textStyle, { lineHeight }];

  return (
    <View style={{ minHeight: lineHeight * minLines, width: "100%" }}>
      <View style={styles.charRow}>
        {words.map((word, wIdx) => {
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
                  charStyle={charStyle(t.bold)}
                />
              ))}
            </View>
          );
        })}
      </View>
    </View>
  );
}

function ParaSlot({
  phase,
  paraIndex,
  segments,
  textStyle,
  lineHeight,
  minLines,
  onAdvance,
}: {
  phase: number;
  paraIndex: number;
  segments: Seg[];
  textStyle: object;
  lineHeight: number;
  minLines: number;
  onAdvance: () => void;
}) {
  if (phase < paraIndex) return null;
  return (
    <TypewriterBlock
      segments={segments}
      textStyle={textStyle}
      lineHeight={lineHeight}
      minLines={minLines}
      onComplete={onAdvance}
      animate={phase === paraIndex}
    />
  );
}

const frequencyMap: Record<string, number> = {
  "Once a day": 1,
  "A few times a day": 3,
  "Many times a day": 6,
  "Almost constantly": 10,
};

const durationMap: Record<string, number> = {
  "Under a minute": 0.5,
  "15–30 minutes": 22,
  "30 minutes to 1 hour": 45,
  "1–2 hours": 90,
  "Almost constant": 180,
};

const ageMap: Record<string, number> = {
  "14–24": 19,
  "25–34": 29,
  "35–44": 39,
  "45–54": 49,
  "55+": 62,
};

const pillarShortName: Record<string, string> = {
  "Self-Worth & Confidence": "self-worth",
  "Wealth & Abundance": "wealth",
  "Love & Relationships": "love",
  "Health & Vitality": "health",
  "Peace & Mental Calm": "peace",
  "Focus & Achievement": "focus",
};

function formatDailyHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)} minutes`;
  const val = parseFloat(h.toFixed(1));
  return `${val} hour${val !== 1 ? "s" : ""}`;
}

export default function Screen6() {
  usePostHogScreenViewed({
    screen: "onboarding/screen6",
    component: "Screen6",
    screen_number: 6,
  });
  const { contentOpacity, fadeIn, navigateTo } = useOnboardingNav();

  const [slide, setSlide] = useState<0 | 1>(0);
  const [dailyHours, setDailyHours] = useState<number | null>(null);
  const [yearlyDays, setYearlyDays] = useState(0);
  const [lifetimeYears, setLifetimeYears] = useState(0);
  const [name, setName] = useState("");
  const [heavyReason, setHeavyReason] = useState("your dreams");

  const [s1Phase, setS1Phase] = useState(1);
  const [s2Phase, setS2Phase] = useState(1);

  const s1fadeBtn = useRef(new Animated.Value(0)).current;
  const s2fadeBtn = useRef(new Animated.Value(0)).current;

  const gradientSwitch = useRef(new Animated.Value(0)).current;

  const slide1Opacity = useRef(new Animated.Value(1)).current;
  const slide2Opacity = useRef(new Animated.Value(0)).current;

  const lh1 = isSmallDevice ? 38 : 44;
  const lh2 = isSmallDevice ? 34 : 40;

  const slide1Para1 = useMemo((): Seg[] => {
    if (dailyHours === null) {
      return [{ text: "" }];
    }
    return [
      { text: name ? `${name}, ` : "" },
      { text: "you'll spend about " },
      { text: `${formatDailyHours(dailyHours)} a day`, bold: true },
      { text: " in negative thought loops." },
    ];
  }, [name, dailyHours]);

  const slide1Para2 = useMemo(
    (): Seg[] => [
      { text: "that's " },
      { text: `${yearlyDays} days`, bold: true },
    ],
    [yearlyDays]
  );

  const slide1Para3 = useMemo(
    (): Seg[] => [
      { text: "or " },
      { text: `${lifetimeYears} years`, bold: true },
      { text: " over your lifetime..." },
    ],
    [lifetimeYears]
  );

  const slide1Para4 = useMemo(
    (): Seg[] => [
      { text: "what would all this time do to your " },
      { text: heavyReason, bold: true },
      { text: ", and the life you're building?" },
    ],
    [heavyReason]
  );

  const slide2Para1 = useMemo(
    (): Seg[] => [{ text: "it doesn't have to be this way" }],
    []
  );

  const slide2Para2 = useMemo(
    (): Seg[] => [
      { text: "do you have just " },
      { text: "5 minutes", bold: true },
      {
        text: " to quietly reprogram your subconscious mind each day?",
      },
    ],
    []
  );

  const slide2Para3 = useMemo(
    (): Seg[] => [
      { text: "let's build a plan for " },
      { text: "you", bold: true },
    ],
    []
  );

  useEffect(() => {
    fadeIn();

    (async () => {
      const [nameVal, ageVal, pillarsRaw, freqVal, durVal] = await Promise.all([
        SecureStore.getItemAsync("user_name"),
        AsyncStorage.getItem("onboarding_age"),
        AsyncStorage.getItem("onboarding_pillars"),
        AsyncStorage.getItem("onboarding_frequency"),
        AsyncStorage.getItem("onboarding_duration"),
      ]);

      if (nameVal) setName(nameVal);

      if (pillarsRaw) {
        const pillars: string[] = JSON.parse(pillarsRaw);
        if (pillars.length > 0) {
          const shorts = pillars.map(
            (p) => pillarShortName[p] ?? p.split(" ")[0].toLowerCase()
          );
          setHeavyReason(
            shorts.length === 1
              ? shorts[0]
              : shorts.slice(0, -1).join(", ") + " & " + shorts[shorts.length - 1]
          );
        }
      }

      const freq = frequencyMap[freqVal ?? ""] ?? 3;
      const dur = durationMap[durVal ?? ""] ?? 10;
      const age = ageMap[ageVal ?? ""] ?? 30;

      const dailyMinutes = freq * dur;
      const dHours = dailyMinutes / 60;
      const yearlyHours = (dailyMinutes * 365) / 60;
      const yDays = yearlyHours / 24;
      const yearsRemaining = 80 - age;
      const lYears = (yearlyHours * yearsRemaining) / (24 * 365);

      setDailyHours(dHours);
      setYearlyDays(Math.round(yDays));
      setLifetimeYears(parseFloat(lYears.toFixed(1)));
    })();
  }, []);

  useEffect(() => {
    if (s1Phase === 5) {
      Animated.timing(s1fadeBtn, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }).start();
    }
  }, [s1Phase]);

  useEffect(() => {
    if (slide === 1 && s2Phase === 4) {
      Animated.timing(s2fadeBtn, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }).start();
    }
  }, [slide, s2Phase]);

  const advanceS1 = () => setS1Phase((p) => p + 1);
  const advanceS2 = () => setS2Phase((p) => p + 1);

  const goToSlide2 = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    Animated.parallel([
      Animated.timing(slide1Opacity, { toValue: 0, duration: 500, useNativeDriver: true }),
      Animated.timing(gradientSwitch, { toValue: 1, duration: 800, useNativeDriver: false }),
    ]).start(() => {
      setSlide(1);
      slide2Opacity.setValue(1);
      s2fadeBtn.setValue(0);
      setS2Phase(1);
    });
  };

  const handleContinue = () => {
    if (slide === 0) {
      goToSlide2();
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      navigateTo("/(onboarding)/screen7");
    }
  };

  const grad1c1 = gradientSwitch.interpolate({ inputRange: [0, 1], outputRange: ["#1A0828", "#2D1040"] });
  const grad1c2 = gradientSwitch.interpolate({ inputRange: [0, 1], outputRange: ["#2A0A2E", "#4A1560"] });
  const grad1c3 = gradientSwitch.interpolate({ inputRange: [0, 1], outputRange: ["#180518", "#3A0D50"] });
  const grad1c4 = gradientSwitch.interpolate({ inputRange: [0, 1], outputRange: ["#000", "#1A0828"] });

  if (dailyHours === null) return null;

  return (
    <TouchableWithoutFeedback onPress={handleContinue}>
      <Animated.View style={[styles.container, { opacity: contentOpacity }]}>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { opacity: gradientSwitch.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) },
          ]}
        >
          <MeshGradientView
            style={StyleSheet.absoluteFill}
            columns={3}
            rows={3}
            colors={[
              "#1A0A30", "#160720", "#120530",
              "#1C1035", "#0E061A", "#120830",
              "#080220", "#0C0828", "#07041A",
            ]}
            points={[
              [0.0, 0.0], [0.5, 0.0], [1.0, 0.0],
              [0.0, 0.5], [0.5, 0.5], [1.0, 0.5],
              [0.0, 1.0], [0.5, 1.0], [1.0, 1.0],
            ]}
            smoothsColors
          />
        </Animated.View>

        <Animated.View style={[StyleSheet.absoluteFill, { opacity: gradientSwitch }]}>
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
        </Animated.View>

        <SafeAreaView style={styles.safeArea}>
          {slide === 0 && (
            <Animated.View style={[styles.slideWrap, { opacity: slide1Opacity }]}>
              <View style={styles.content}>
                <ParaSlot
                  phase={s1Phase}
                  paraIndex={1}
                  segments={slide1Para1}
                  textStyle={styles.para1}
                  lineHeight={lh1}
                  minLines={4}
                  onAdvance={advanceS1}
                />
                <ParaSlot
                  phase={s1Phase}
                  paraIndex={2}
                  segments={slide1Para2}
                  textStyle={styles.para2}
                  lineHeight={lh2}
                  minLines={2}
                  onAdvance={advanceS1}
                />
                <ParaSlot
                  phase={s1Phase}
                  paraIndex={3}
                  segments={slide1Para3}
                  textStyle={styles.para3}
                  lineHeight={lh2}
                  minLines={2}
                  onAdvance={advanceS1}
                />
                <ParaSlot
                  phase={s1Phase}
                  paraIndex={4}
                  segments={slide1Para4}
                  textStyle={styles.para4}
                  lineHeight={lh1}
                  minLines={4}
                  onAdvance={advanceS1}
                />
              </View>

              <Animated.View style={[styles.footer, { opacity: s1fadeBtn }]}>
                <Text style={styles.tapText}>tap to continue →</Text>
              </Animated.View>
            </Animated.View>
          )}

          {slide === 1 && (
            <Animated.View style={[styles.slideWrap, { opacity: slide2Opacity }]}>
              <View style={styles.content}>
                <ParaSlot
                  phase={s2Phase}
                  paraIndex={1}
                  segments={slide2Para1}
                  textStyle={styles.para1}
                  lineHeight={lh1}
                  minLines={2}
                  onAdvance={advanceS2}
                />
                <ParaSlot
                  phase={s2Phase}
                  paraIndex={2}
                  segments={slide2Para2}
                  textStyle={styles.para2}
                  lineHeight={lh2}
                  minLines={4}
                  onAdvance={advanceS2}
                />
                <ParaSlot
                  phase={s2Phase}
                  paraIndex={3}
                  segments={slide2Para3}
                  textStyle={styles.para3}
                  lineHeight={lh2}
                  minLines={2}
                  onAdvance={advanceS2}
                />
              </View>

              <Animated.View style={[styles.footer, { opacity: s2fadeBtn }]}>
                <Text style={styles.tapText}>tap to continue →</Text>
              </Animated.View>
            </Animated.View>
          )}
        </SafeAreaView>
      </Animated.View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  slideWrap: { flex: 1 },
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
  content: {
    flex: 1,
    justifyContent: "flex-start",
    paddingTop: isSmallDevice ? 60 : 80,
    paddingHorizontal: isSmallDevice ? 28 : 36,
    gap: isSmallDevice ? 28 : 36,
  },
  para1: {
    fontSize: isSmallDevice ? 26 : 30,
    color: "#fff",
    fontFamily: Fonts.serif,
    lineHeight: isSmallDevice ? 38 : 44,
  },
  para2: {
    fontSize: isSmallDevice ? 24 : 28,
    color: "rgba(255,255,255,0.85)",
    fontFamily: Fonts.serif,
    lineHeight: isSmallDevice ? 34 : 40,
  },
  para3: {
    fontSize: isSmallDevice ? 24 : 28,
    color: "rgba(255,255,255,0.85)",
    fontFamily: Fonts.serif,
    lineHeight: isSmallDevice ? 34 : 40,
  },
  para4: {
    fontSize: isSmallDevice ? 26 : 30,
    color: "#fff",
    fontFamily: Fonts.serif,
    lineHeight: isSmallDevice ? 38 : 44,
  },
  bold: {
    fontFamily: Fonts.serifBold,
    fontStyle: "italic",
    textDecorationLine: "underline",
    color: "#fff",
  },
  footer: {
    paddingHorizontal: isSmallDevice ? 24 : 32,
    paddingBottom: isSmallDevice ? 10 : 10,
    paddingTop: 12,
    alignItems: "flex-end",
  },
  tapText: {
    fontSize: isSmallDevice ? 13 : 14,
    color: "rgba(255,255,255,0.5)",
    fontFamily: Fonts.mono,
    letterSpacing: 0.3,
  },
});
