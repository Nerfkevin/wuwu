import React, { useRef, useState, useEffect, useCallback } from "react";
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
import Slider from "@react-native-community/slider";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Fonts } from "@/constants/theme";
import { useOnboardingNav } from "./use-onboarding-nav";

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
}: {
  slide: Slide;
  isActive: boolean;
}) {
  const fadeQ = useRef(new Animated.Value(0)).current;
  const fadeHint = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isActive) {
      fadeQ.setValue(0);
      fadeHint.setValue(0);
      const anim = Animated.stagger(80, [
        Animated.timing(fadeQ, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(fadeHint, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]);
      anim.start();
      return () => anim.stop();
    }
  }, [isActive]);

  return (
    <View style={styles.questionSlide}>
      <Animated.Text style={[styles.question, { opacity: fadeQ }]}>
        {slide.question}
      </Animated.Text>
      {slide.hint ? (
        <Animated.Text style={[styles.hint, { opacity: fadeHint }]}>
          {slide.hint}
        </Animated.Text>
      ) : null}
    </View>
  );
}

// ─── options panels (static, crossfade on slide change) ──────────────────────

function SingleOptions({
  slide,
  isActive,
  selected,
  onSelect,
}: {
  slide: SingleSlide;
  isActive: boolean;
  selected: string | null;
  onSelect: (v: string) => void;
}) {
  const fadeOpts = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeOpts, {
      toValue: isActive ? 1 : 0,
      duration: 350,
      useNativeDriver: true,
    }).start();
  }, [isActive]);

  return (
    <Animated.View
      pointerEvents={isActive ? "auto" : "none"}
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
  isActive,
  selected,
  onToggle,
}: {
  slide: MultiSlide;
  isActive: boolean;
  selected: string[];
  onToggle: (v: string) => void;
}) {
  const fadeOpts = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeOpts, {
      toValue: isActive ? 1 : 0,
      duration: 350,
      useNativeDriver: true,
    }).start();
  }, [isActive]);

  return (
    <Animated.View
      pointerEvents={isActive ? "auto" : "none"}
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
  isActive,
  selectedIdx,
  onSelect,
}: {
  slide: SnapSlide;
  isActive: boolean;
  selectedIdx: number;
  onSelect: (i: number) => void;
}) {
  const fadeOpts = useRef(new Animated.Value(0)).current;
  const lastIdxRef = useRef(selectedIdx);

  useEffect(() => {
    Animated.timing(fadeOpts, {
      toValue: isActive ? 1 : 0,
      duration: 350,
      useNativeDriver: true,
    }).start();
  }, [isActive]);

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
      pointerEvents={isActive ? "auto" : "none"}
      style={[snapStyles.panel, { opacity: fadeOpts }]}
    >
      <Text style={snapStyles.valueLabel}>{slide.options[selectedIdx]}</Text>
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
    left: isSmallDevice ? 28 : 32,
    right: isSmallDevice ? 28 : 32,
    alignItems: "center",
    gap: 28,
  },
  valueLabel: {
    fontSize: isSmallDevice ? 32 : 38,
    color: "#fff",
    fontFamily: Fonts.mono,
    textAlign: "center",
    height: isSmallDevice ? 90 : 110,
    textAlignVertical: "center",
    lineHeight: isSmallDevice ? 42 : 50,
  },
  slider: {
    width: "100%",
    height: 40,
  },
});

// ─── main screen ─────────────────────────────────────────────────────────────

export default function Screen5() {
  const { contentOpacity, fadeIn, navigateTo } = useOnboardingNav();
  const [activeIndex, setActiveIndex] = useState(0);
  const [ageSelected, setAgeSelected] = useState<string | null>(null);
  const [pillarsSelected, setPillarsSelected] = useState<string[]>([]);
  const [frequencyIdx, setFrequencyIdx] = useState(0);
  const [durationSelected, setDurationSelected] = useState<string | null>(null);
  const listRef = useRef<FlatList>(null);

  const dotAnims = useRef(
    slides.map((_, i) => new Animated.Value(i === 0 ? 1 : 0.3))
  ).current;
  const fadeContinue = useRef(new Animated.Value(0)).current;

  useEffect(() => { fadeIn(); }, []);

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
            renderItem={({ item, index }) => (
              <QuestionSlide slide={item} isActive={index === activeIndex} />
            )}
          />
        </View>

        {/* ── middle: options centered ── */}
        <View style={styles.optionsArea}>
          <SingleOptions
            slide={slides[0] as SingleSlide}
            isActive={activeIndex === 0}
            selected={ageSelected}
            onSelect={(v) => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setAgeSelected(v);
            }}
          />
          <MultiOptions
            slide={slides[1] as MultiSlide}
            isActive={activeIndex === 1}
            selected={pillarsSelected}
            onToggle={handleTogglePillar}
          />
          <SnapOptions
            slide={slides[2] as SnapSlide}
            isActive={activeIndex === 2}
            selectedIdx={frequencyIdx}
            onSelect={(i) => {
              setFrequencyIdx(i);
            }}
          />
          <SingleOptions
            slide={slides[3] as SingleSlide}
            isActive={activeIndex === 3}
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
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 7,
    paddingTop: 16,
    paddingBottom: 4,
  },
  dot: {
    width: 28,
    height: 3,
    borderRadius: 2,
    backgroundColor: "#fff",
  },
  questionSlide: {
    width,
    paddingHorizontal: isSmallDevice ? 28 : 32,
    paddingTop: isSmallDevice ? 20 : 28,
    gap: 8,
  },
  question: {
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
    justifyContent: "center",
    paddingHorizontal: isSmallDevice ? 28 : 32,
  },
  optionsPanel: {
    gap: 10,
    position: "absolute",
    left: isSmallDevice ? 28 : 32,
    right: isSmallDevice ? 28 : 32,
  },
  option: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    borderRadius: 50,
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
