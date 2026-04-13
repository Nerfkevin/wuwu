import React, { useRef, useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  TouchableOpacity,
  FlatList,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import RAnimated, { FadeIn, Easing as REasing } from "react-native-reanimated";
import Slider from "@react-native-community/slider";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Fonts } from "@/constants/theme";
import { useOnboardingNav } from "./use-onboarding-nav";
import { usePostHogScreenViewed } from "@/lib/posthog";

const { width } = Dimensions.get("window");
const isSmallDevice = width < 380;

// ─── slide definitions ────────────────────────────────────────────────────────

type SlideBase = { id: string; question: string; hint?: string; storageKey: string };
type SingleSlide = SlideBase & { type: "single"; options: string[] };
type MultiSlide = SlideBase & {
  type: "multi";
  maxSelect: number;
  options: { emoji: string; label: string }[];
};
type SnapSlide = SlideBase & { type: "snap"; options: string[] };
type Slide = SingleSlide | MultiSlide | SnapSlide;

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

const slides: Slide[] = [
  {
    id: "1",
    type: "single",
    question: "how old are you?",
    storageKey: "onboarding_age",
    options: ["14–24", "25–34", "35–44", "45–54", "55+"],
  },
  {
    id: "2",
    type: "multi",
    question: "which pillars of your life feel the most stuck/heavy right now?",
    hint: "(choose up to 3)",
    maxSelect: 3,
    storageKey: "onboarding_pillars",
    options: [
      { emoji: "⚡", label: "Self-Worth & Confidence" },
      { emoji: "🌿", label: "Wealth & Abundance" },
      { emoji: "💕", label: "Love & Relationships" },
      { emoji: "💪", label: "Health & Vitality" },
      { emoji: "🌸", label: "Peace & Mental Calm" },
      { emoji: "🎯", label: "Focus & Achievement" },
    ],
  },
  {
    id: "3",
    type: "snap",
    question: "how often do limiting beliefs enter your mind?",
    storageKey: "onboarding_frequency",
    options: ["Once a day", "A few times a day", "Many times a day", "Almost constantly"],
  },
  {
    id: "4",
    type: "single",
    question: "how long do these limiting beliefs usually stick around?",
    storageKey: "onboarding_duration",
    options: ["Under a minute", "15–30 minutes", "30 minutes to 1 hour", "1–2 hours", "Almost constant"],
  },
];

// ─── question text slide (scrolls in FlatList) ───────────────────────────────

function QuestionSlide({
  slide,
  isActive,
  onTitleComplete,
}: {
  slide: Slide;
  isActive: boolean;
  onTitleComplete: () => void;
}) {
  const fadeHint = useRef(new Animated.Value(0)).current;
  const questionTokens = useMemo(
    () => stringToCharTokens(slide.question),
    [slide.question]
  );
  const questionWords = useMemo(
    () => charsToWordTokens(questionTokens),
    [questionTokens]
  );
  const [visibleCount, setVisibleCount] = useState(0);
  const completedRef = useRef(false);
  const onTitleCompleteRef = useRef(onTitleComplete);
  onTitleCompleteRef.current = onTitleComplete;

  const qLineH = isSmallDevice ? 36 : 44;
  const questionCharStyle = [styles.questionChar, { lineHeight: qLineH }];

  useEffect(() => {
    if (!isActive) {
      setVisibleCount(questionTokens.length);
      fadeHint.setValue(slide.hint ? 1 : 0);
      completedRef.current = false;
      return;
    }
    completedRef.current = false;
    setVisibleCount(0);
    fadeHint.setValue(0);
    let intervalId: ReturnType<typeof setInterval> | null = null;
    const delayId = setTimeout(() => {
      let i = 0;
      intervalId = setInterval(() => {
        i += 1;
        if (i > questionTokens.length) {
          clearInterval(intervalId!);
          if (!completedRef.current) {
            completedRef.current = true;
            onTitleCompleteRef.current();
          }
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
  }, [isActive, slide.question, slide.hint, fadeHint, questionTokens]);

  useEffect(() => {
    if (!isActive || !slide.hint) return;
    if (visibleCount < questionTokens.length) return;
    const t = setTimeout(() => {
      Animated.timing(fadeHint, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start();
    }, 0);
    return () => clearTimeout(t);
  }, [isActive, slide.hint, visibleCount, questionTokens.length, fadeHint]);

  return (
    <View style={styles.questionSlide}>
      {isActive ? (
        <>
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
                        charStyle={questionCharStyle}
                      />
                    ))}
                  </View>
                );
              })}
            </View>
          </View>
          {slide.hint ? (
            <Animated.Text style={[styles.hint, { opacity: fadeHint }]}>
              {slide.hint}
            </Animated.Text>
          ) : null}
        </>
      ) : (
        <>
          <Text style={styles.questionStatic}>{slide.question}</Text>
          {slide.hint ? <Text style={styles.hint}>{slide.hint}</Text> : null}
        </>
      )}
    </View>
  );
}

// ─── options panels (static, crossfade on slide change) ──────────────────────

function SingleOptions({
  slide,
  isSlideCurrent,
  revealContent,
  selected,
  onSelect,
}: {
  slide: SingleSlide;
  isSlideCurrent: boolean;
  revealContent: boolean;
  selected: string | null;
  onSelect: (v: string) => void;
}) {
  const fadeOpts = useRef(new Animated.Value(0)).current;
  const visible = isSlideCurrent && revealContent;

  useEffect(() => {
    Animated.timing(fadeOpts, {
      toValue: visible ? 1 : 0,
      duration: 350,
      useNativeDriver: true,
    }).start();
  }, [visible]);

  return (
    <Animated.View
      pointerEvents={visible ? "auto" : "none"}
      style={[styles.optionsPanel, { opacity: fadeOpts }]}
    >
      {slide.options.map((opt) => {
        const isSel = selected === opt;
        return (
          <TouchableOpacity
            key={opt}
            style={[styles.option, isSel && styles.optionSelected]}
            onPress={() => onSelect(opt)}
            activeOpacity={0.7}
          >
            <Text style={[styles.optionText, isSel && styles.optionTextSelected]}>
              {opt}
            </Text>
          </TouchableOpacity>
        );
      })}
    </Animated.View>
  );
}

function MultiOptions({
  slide,
  isSlideCurrent,
  revealContent,
  selected,
  onToggle,
}: {
  slide: MultiSlide;
  isSlideCurrent: boolean;
  revealContent: boolean;
  selected: string[];
  onToggle: (v: string) => void;
}) {
  const fadeOpts = useRef(new Animated.Value(0)).current;
  const visible = isSlideCurrent && revealContent;

  useEffect(() => {
    Animated.timing(fadeOpts, {
      toValue: visible ? 1 : 0,
      duration: 350,
      useNativeDriver: true,
    }).start();
  }, [visible]);

  return (
    <Animated.View
      pointerEvents={visible ? "auto" : "none"}
      style={[styles.optionsPanel, { opacity: fadeOpts }]}
    >
      {slide.options.map((opt) => {
        const isSel = selected.includes(opt.label);
        const atMax = selected.length >= slide.maxSelect && !isSel;
        return (
          <TouchableOpacity
            key={opt.label}
            style={[styles.option, styles.optionRow, isSel && styles.optionSelected]}
            onPress={() => !atMax && onToggle(opt.label)}
            activeOpacity={atMax ? 1 : 0.7}
          >
            <Text style={styles.emoji}>{opt.emoji}</Text>
            <Text style={[styles.optionText, isSel && styles.optionTextSelected]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </Animated.View>
  );
}

// ─── snap slider ─────────────────────────────────────────────────────────────

function SnapOptions({
  slide,
  isSlideCurrent,
  revealContent,
  selectedIdx,
  onSelect,
}: {
  slide: SnapSlide;
  isSlideCurrent: boolean;
  revealContent: boolean;
  selectedIdx: number;
  onSelect: (i: number) => void;
}) {
  const fadeOpts = useRef(new Animated.Value(0)).current;
  const lastIdxRef = useRef(selectedIdx);
  const visible = isSlideCurrent && revealContent;

  useEffect(() => {
    Animated.timing(fadeOpts, {
      toValue: visible ? 1 : 0,
      duration: 350,
      useNativeDriver: true,
    }).start();
  }, [visible]);

  const handleValueChange = (val: number) => {
    const idx = Math.round(val);
    if (idx !== lastIdxRef.current) {
      lastIdxRef.current = idx;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onSelect(idx);
    }
  };

  return (
    <Animated.View
      pointerEvents={visible ? "auto" : "none"}
      style={[snapStyles.panel, { opacity: fadeOpts }]}
    >
      <Text style={snapStyles.valueLabel} numberOfLines={1} adjustsFontSizeToFit>{slide.options[selectedIdx]}</Text>
      <Slider
        style={snapStyles.slider}
        minimumValue={0}
        maximumValue={slide.options.length - 1}
        step={1}
        value={selectedIdx}
        onValueChange={handleValueChange}
        minimumTrackTintColor="#E53935"
        maximumTrackTintColor="rgba(255,255,255,0.2)"
        thumbTintColor="#E53935"
      />
    </Animated.View>
  );
}

const snapStyles = StyleSheet.create({
  panel: {
    position: "absolute",
    top: isSmallDevice ? 24 : 40,
    left: isSmallDevice ? 28 : 32,
    right: isSmallDevice ? 28 : 32,
    alignItems: "center",
    gap: 14,
  },
  valueLabel: {
    fontSize: isSmallDevice ? 32 : 38,
    color: "#fff",
    fontFamily: Fonts.mono,
    textAlign: "center",
    height: isSmallDevice ? 44 : 52,
    lineHeight: isSmallDevice ? 44 : 52,
    marginTop: 80,
  },
  slider: {
    width: "100%",
    height: 80,
    marginTop: 50,
  },
});

// ─── main screen ─────────────────────────────────────────────────────────────

export default function Screen5() {
  usePostHogScreenViewed({
    screen: "onboarding/screen5",
    component: "Screen5",
    screen_number: 5,
  });
  const { contentOpacity, fadeIn, navigateTo } = useOnboardingNav();
  const [activeIndex, setActiveIndex] = useState(0);
  const [titleDone, setTitleDone] = useState(false);
  const [ageSelected, setAgeSelected] = useState<string | null>(null);
  const [pillarsSelected, setPillarsSelected] = useState<string[]>([]);
  const [frequencyIdx, setFrequencyIdx] = useState(0);
  const [durationSelected, setDurationSelected] = useState<string | null>(null);
  const listRef = useRef<FlatList>(null);

  const dotAnims = useRef(
    slides.map((_, i) => new Animated.Value(i === 0 ? 1 : 0.3))
  ).current;
  const fadeContinue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    fadeIn();
  }, []);

  useEffect(() => {
    setTitleDone(false);
  }, [activeIndex]);

  const handleTitleComplete = useCallback(() => {
    setTitleDone(true);
  }, []);

  useEffect(() => {
    dotAnims.forEach((anim, i) => {
      Animated.timing(anim, {
        toValue: i === activeIndex ? 1 : 0.3,
        duration: 250,
        useNativeDriver: true,
      }).start();
    });
  }, [activeIndex]);

  const canContinue =
    activeIndex === 0
      ? ageSelected !== null
      : activeIndex === 1
      ? pillarsSelected.length > 0
      : activeIndex === 2
      ? titleDone
      : activeIndex === 3
      ? durationSelected !== null
      : true;

  useEffect(() => {
    Animated.timing(fadeContinue, {
      toValue: canContinue ? 1 : 0,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [canContinue]);

  const buttonBg = fadeContinue.interpolate({
    inputRange: [0, 1],
    outputRange: ["rgba(255,255,255,0.18)", "rgba(255,255,255,1)"],
  });
  const buttonTextColor = fadeContinue.interpolate({
    inputRange: [0, 1],
    outputRange: ["rgba(255,255,255,0.35)", "rgba(0,0,0,1)"],
  });

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const idx = Math.round(e.nativeEvent.contentOffset.x / width);
      if (idx !== activeIndex) setActiveIndex(idx);
    },
    [activeIndex]
  );

  const handleTogglePillar = (label: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPillarsSelected((prev) =>
      prev.includes(label) ? prev.filter((p) => p !== label) : [...prev, label]
    );
  };

  const handleContinue = async () => {
    if (!canContinue) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (activeIndex === 0) {
      await AsyncStorage.setItem("onboarding_age", ageSelected!);
      listRef.current?.scrollToIndex({ index: 1, animated: true });
      setActiveIndex(1);
    } else if (activeIndex === 1) {
      await AsyncStorage.setItem("onboarding_pillars", JSON.stringify(pillarsSelected));
      listRef.current?.scrollToIndex({ index: 2, animated: true });
      setActiveIndex(2);
    } else if (activeIndex === 2) {
      const freqLabel = (slides[2] as SnapSlide).options[frequencyIdx];
      await AsyncStorage.setItem("onboarding_frequency", freqLabel);
      listRef.current?.scrollToIndex({ index: 3, animated: true });
      setActiveIndex(3);
    } else {
      await AsyncStorage.setItem("onboarding_duration", durationSelected!);
      navigateTo("/(onboarding)/screen6");
    }
  };

  return (
    <Animated.View style={[styles.container, { opacity: contentOpacity }]}>
      <SafeAreaView style={styles.safeArea}>

        {/* ── top: dots + scrolling question text ── */}
        <View style={styles.topSection}>
          <View style={styles.dots}>
            {slides.map((_, i) => (
              <Animated.View key={i} style={[styles.dot, { opacity: dotAnims[i] }]} />
            ))}
          </View>

          <FlatList
            ref={listRef}
            data={slides}
            keyExtractor={(item) => item.id}
            horizontal
            pagingEnabled
            scrollEnabled={false}
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            onMomentumScrollEnd={handleScroll}
            style={styles.questionList}
            renderItem={({ item, index }) => (
              <QuestionSlide
                slide={item}
                isActive={index === activeIndex}
                onTitleComplete={handleTitleComplete}
              />
            )}
          />
        </View>

        {/* ── middle: options (anchored under question, not vertically centered) ── */}
        <View style={styles.optionsArea}>
          <SingleOptions
            slide={slides[0] as SingleSlide}
            isSlideCurrent={activeIndex === 0}
            revealContent={titleDone}
            selected={ageSelected}
            onSelect={(v) => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setAgeSelected(v);
            }}
          />
          <MultiOptions
            slide={slides[1] as MultiSlide}
            isSlideCurrent={activeIndex === 1}
            revealContent={titleDone}
            selected={pillarsSelected}
            onToggle={handleTogglePillar}
          />
          <SnapOptions
            slide={slides[2] as SnapSlide}
            isSlideCurrent={activeIndex === 2}
            revealContent={titleDone}
            selectedIdx={frequencyIdx}
            onSelect={(i) => {
              setFrequencyIdx(i);
            }}
          />
          <SingleOptions
            slide={slides[3] as SingleSlide}
            isSlideCurrent={activeIndex === 3}
            revealContent={titleDone}
            selected={durationSelected}
            onSelect={(v) => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setDurationSelected(v);
            }}
          />
        </View>

        {/* ── bottom: continue button ── */}
        <View style={styles.footer}>
          <TouchableOpacity
            onPress={handleContinue}
            activeOpacity={canContinue ? 0.75 : 1}
            disabled={!canContinue}
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

// ─── styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },

  topSection: {
    paddingHorizontal: 0,
    flexGrow: 0,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 7,
    paddingTop: 10,
    paddingBottom: 20,
  },
  dot: {
    width: 28,
    height: 3,
    borderRadius: 2,
    backgroundColor: "#fff",
  },
  questionList: {
    flexGrow: 0,
  },
  questionSlide: {
    width,
    paddingHorizontal: isSmallDevice ? 28 : 32,
    paddingTop: isSmallDevice ? 4 : 6,
    gap: 6,
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
  questionChar: {
    fontSize: isSmallDevice ? 26 : 32,
    color: "#fff",
    fontFamily: Fonts.serif,
  },
  questionStatic: {
    fontSize: isSmallDevice ? 26 : 32,
    color: "#fff",
    fontFamily: Fonts.serif,
    lineHeight: isSmallDevice ? 36 : 44,
  },
  hint: {
    fontSize: 12,
    color: "rgba(255,255,255,0.45)",
    fontFamily: Fonts.mono,
    letterSpacing: 0.2,
  },

  optionsArea: {
    flex: 1,
    justifyContent: "flex-start",
    paddingTop: isSmallDevice ? 6 : 20,
    paddingHorizontal: isSmallDevice ? 28 : 32,
  },
  optionsPanel: {
    gap: 10,
    position: "absolute",
    top: isSmallDevice ? 24 : 50,
    left: isSmallDevice ? 28 : 32,
    right: isSmallDevice ? 28 : 32,
  },
  option: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    borderRadius: 15,
    paddingVertical: isSmallDevice ? 13 : 15,
    alignItems: "center",
  },
  optionRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 20,
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
  emoji: { fontSize: 14 },

  footer: {
    paddingHorizontal: isSmallDevice ? 24 : 32,
    paddingBottom: isSmallDevice ? 10 : 10,
    paddingTop: 6,
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
