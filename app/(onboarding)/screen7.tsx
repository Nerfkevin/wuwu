import React, { useRef, useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
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
import { MeshGradientView } from "expo-mesh-gradient";
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

// ─── slide definitions ────────────────────────────────────────────────────────

type MultiSlide = {
  id: string;
  type: "multi";
  question: string;
  hint?: string;
  storageKey: string;
  maxSelect: number;
  options: string[];
};

type SingleSlide = {
  id: string;
  type: "single";
  question: string;
  hint?: string;
  storageKey: string;
  options: string[];
};

type SnapSlide = {
  id: string;
  type: "snap";
  question: string;
  storageKey: string;
};

type Slide = MultiSlide | SingleSlide | SnapSlide;

const slides: Slide[] = [
  {
    id: "1",
    type: "multi",
    question: "what do you want to achieve with Wu-Wu?",
    hint: "(choose up to 3)",
    maxSelect: 3,
    storageKey: "onboarding_goals",
    options: [
      "🙏 Silence self-doubt",
      "💰 Unlock effortless wealth",
      "❤️ Attract loving relationships",
      "😌 Find calm & peace",
      "🔥 Build unshakable confidence",
      "🧠 Gain crystal-clear focus",
      "💪 Build a resilient body",
    ],
  },
  {
    id: "2",
    type: "single",
    question: "thinking bigger, what does your highest self look like to you?",
    storageKey: "onboarding_highest_self",
    options: [
      "🔥 Step into decisive action & alignment with my goals",
      "🧘 Live with unshakable calm & clarity",
      "❤️ Embody deep self-worth & magnetic confidence",
      "⭐ Naturally attracts abundance & opportunities",
    ],
  },
  {
    id: "3",
    type: "snap",
    question: "be honest, how often do you currently spend time on affirmations/manifestations per week?",
    storageKey: "onboarding_affirmation_days",
  },
  {
    id: "4",
    type: "single",
    question: "and how would you describe your relationship with yourself right now?",
    storageKey: "onboarding_self_relationship",
    options: [
      "🎭 it has its ups and downs",
      "😔 feeling distant/disconnected",
      "🌱 just starting/rebuilding",
      "✨ close and compassionate",
    ],
  },
  {
    id: "5",
    type: "multi",
    question: "what's holding you back from the more abundant version of yourself?",
    hint: "(choose up to 3)",
    maxSelect: 3,
    storageKey: "onboarding_blocks",
    options: [
      "🧡 past trauma/inner child scars",
      "😩 lack of motivation",
      "❓ not knowing what to affirm",
      "🧠 financial anxiety/scarcity",
      "😰 fear of judgment",
      "👥 body image/self love",
    ],
  },
];

// ─── question text slide ──────────────────────────────────────────────────────

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
  const hint = "hint" in slide ? slide.hint : undefined;
  const questionTokens = useMemo(() => stringToCharTokens(slide.question), [slide.question]);
  const questionWords = useMemo(() => charsToWordTokens(questionTokens), [questionTokens]);
  const [visibleCount, setVisibleCount] = useState(0);
  const completedRef = useRef(false);
  const onTitleCompleteRef = useRef(onTitleComplete);
  onTitleCompleteRef.current = onTitleComplete;

  const qLineH = isSmallDevice ? 36 : 44;
  const questionCharStyle = [styles.questionChar, { lineHeight: qLineH }];

  useEffect(() => {
    if (!isActive) {
      setVisibleCount(questionTokens.length);
      fadeHint.setValue(hint ? 1 : 0);
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
        if (ch && ch !== " " && ch !== "\n") Haptics.selectionAsync();
        setVisibleCount(i);
      }, TYPEWRITER_MS);
    }, SLIDE_DELAY_MS);
    return () => {
      clearTimeout(delayId);
      if (intervalId) clearInterval(intervalId);
    };
  }, [isActive, slide.question, hint, fadeHint, questionTokens]);

  useEffect(() => {
    if (!isActive || !hint) return;
    if (visibleCount < questionTokens.length) return;
    const t = setTimeout(() => {
      Animated.timing(fadeHint, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start();
    }, 0);
    return () => clearTimeout(t);
  }, [isActive, hint, visibleCount, questionTokens.length, fadeHint]);

  return (
    <View style={styles.questionSlide}>
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
                {word.chars.slice(0, charsVisible).map((tok, cIdx) =>
                  isActive ? (
                    <FadeLetter
                      key={`${word.startIdx}-${cIdx}`}
                      ch={tok.ch}
                      charStyle={questionCharStyle}
                    />
                  ) : (
                    <Text
                      key={`${word.startIdx}-${cIdx}`}
                      style={questionCharStyle}
                    >
                      {tok.ch}
                    </Text>
                  )
                )}
              </View>
            );
          })}
        </View>
      </View>
      {hint ? (
        <Animated.Text style={[styles.hint, { opacity: fadeHint }]}>
          {hint}
        </Animated.Text>
      ) : null}
    </View>
  );
}

// ─── multi options panel ──────────────────────────────────────────────────────

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
        const isSel = selected.includes(opt);
        const atMax = selected.length >= slide.maxSelect && !isSel;
        return (
          <TouchableOpacity
            key={opt}
            style={[styles.option, styles.optionRow, isSel && styles.optionSelected]}
            onPress={() => !atMax && onToggle(opt)}
            activeOpacity={atMax ? 1 : 0.7}
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

// ─── single options panel ─────────────────────────────────────────────────────

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
            style={[styles.option, styles.optionRow, isSel && styles.optionSelected]}
            onPress={() => onSelect(opt)}
            activeOpacity={0.7}
          >
            <Text style={[styles.optionText, styles.optionTextWrap, isSel && styles.optionTextSelected]}>
              {opt}
            </Text>
          </TouchableOpacity>
        );
      })}
    </Animated.View>
  );
}

// ─── goal body copy ───────────────────────────────────────────────────────────

const goalBodyCopy: Record<string, string> = {
  "🙏 Silence self-doubt":
    "we'll help you make sure the first voice your subconscious hears every day is your own empowering truth.",
  "💰 Unlock effortless wealth":
    "daily affirmations shift your mind from scarcity thinking to magnetic wealth attraction.",
  "❤️ Magnetize loving relationships":
    "love starts with self-belief. we'll help you dissolve the patterns that push connection away and replace them with genuine worthiness.",
  "😌 Find calm & peace":
    "we'll guide you with gentle reminders and background plays, turning inconsistency into your quiet daily wins.",
  "🔥 Build unshakable confidence":
    "go beyond surface-level affirmations. your own recorded voice + healing frequencies creates a more intimate dialogue.",
  "🧠 Gain crystal-clear focus":
    "eliminate mental noise and cultivate laser focus. daily practices that train your mind to lock onto what matters most.",
  "💪 Build a resilient body":
    "your body follows your mind. we'll build the mental foundation that makes healthy choices feel natural.",
};

// ─── personalized card (slide 3) ─────────────────────────────────────────────

// ─── day snap options (slide 3) ──────────────────────────────────────────────

function DaySnapOptions({
  isSlideCurrent,
  revealContent,
  value,
  onChange,
}: {
  isSlideCurrent: boolean;
  revealContent: boolean;
  value: number;
  onChange: (v: number) => void;
}) {
  const fadeOpts = useRef(new Animated.Value(0)).current;
  const lastVal = useRef(value);
  const visible = isSlideCurrent && revealContent;

  useEffect(() => {
    Animated.timing(fadeOpts, {
      toValue: visible ? 1 : 0,
      duration: 350,
      useNativeDriver: true,
    }).start();
  }, [visible]);

  const handleValueChange = (v: number) => {
    const snapped = Math.round(v);
    if (snapped !== lastVal.current) {
      lastVal.current = snapped;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onChange(snapped);
    }
  };

  const label = value === 1 ? "1 day" : `${value} days`;

  return (
    <Animated.View
      pointerEvents={visible ? "auto" : "none"}
      style={[snapStyles.panel, { opacity: fadeOpts }]}
    >
      <Text style={snapStyles.valueLabel}>{label}</Text>
      <View style={snapStyles.sliderRow}>
        <Text style={snapStyles.rangeLabel}>1</Text>
        <Slider
          style={snapStyles.slider}
          minimumValue={1}
          maximumValue={7}
          step={1}
          value={value}
          onValueChange={handleValueChange}
          minimumTrackTintColor="#FF3B30"
          maximumTrackTintColor="rgba(255,255,255,0.2)"
          thumbTintColor="#FF3B30"
        />
        <Text style={snapStyles.rangeLabel}>7</Text>
      </View>
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
    fontSize: isSmallDevice ? 38 : 46,
    color: "#fff",
    fontFamily: Fonts.mono,
    textAlign: "center",
  },
  sliderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    width: "100%",
  },
  slider: {
    flex: 1,
    height: 40,
  },
  rangeLabel: {
    fontSize: 13,
    color: "rgba(255,255,255,0.45)",
    fontFamily: Fonts.mono,
    width: 16,
    textAlign: "center",
  },
});

const TILT_ANGLES = ["-2deg", "1.5deg", "-1deg"];

function PersonalizedCard({
  goals,
  highestSelf,
  slideAnim,
  showCard,
  onContinue,
}: {
  goals: string[];
  highestSelf: string | null;
  slideAnim: Animated.Value;
  showCard: boolean;
  onContinue: () => void;
}) {
  const fadeContent = useRef(new Animated.Value(1)).current;

  return (
    <Animated.View
      style={[cardStyles.overlay, { transform: [{ translateX: slideAnim }] }]}
      pointerEvents={showCard ? "auto" : "none"}
    >
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
      <SafeAreaView style={cardStyles.safeArea}>

        {/* ── scrollable cards only ── */}
        <Animated.ScrollView
          style={cardStyles.cardsScroll}
          contentContainerStyle={cardStyles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View style={{ opacity: fadeContent }}>

            {goals.map((goal, i) => (
              <View
                key={goal}
                style={[
                  cardStyles.goalCard,
                  { transform: [{ rotate: TILT_ANGLES[i] ?? "0deg" }] },
                ]}
              >
                <Text style={cardStyles.goalCardTitle}>{goal}</Text>
                <Text style={cardStyles.goalCardBody}>
                  {goalBodyCopy[goal] ?? ""}
                </Text>
              </View>
            ))}

            {highestSelf ? (
              <View style={[cardStyles.goalCard, cardStyles.highestSelfCard]}>
                <Text style={cardStyles.hsLabel}>where you're headed</Text>
                <Text style={[cardStyles.goalCardTitle, cardStyles.centered]}>
                  {highestSelf}
                </Text>
                <Text style={[cardStyles.hsStat, cardStyles.centered]}>
                  92.08% of users formed a daily affirmation habit
                </Text>
              </View>
            ) : null}

          </Animated.View>
        </Animated.ScrollView>

        {/* ── fixed closing section ── */}
        <Animated.View style={[cardStyles.closingSection, { opacity: fadeContent }]}>
          <Text style={cardStyles.closingHeading}>
            you're in the right place
          </Text>
          <Text style={cardStyles.closingBody}>
            tens of thousands have started with the same goals, and Wu-Wu helped them get there.
          </Text>
        </Animated.View>

        <View style={cardStyles.footer}>
          <TouchableOpacity onPress={onContinue} activeOpacity={0.75}>
            <View style={cardStyles.continueButton}>
              <Text style={cardStyles.continueText}>continue</Text>
            </View>
          </TouchableOpacity>
        </View>

      </SafeAreaView>
    </Animated.View>
  );
}

// ─── main screen ──────────────────────────────────────────────────────────────

export default function Screen7() {
  usePostHogScreenViewed({
    screen: "onboarding/screen7",
    component: "Screen7",
    screen_number: 7,
  });
  const { contentOpacity, fadeIn, navigateTo } = useOnboardingNav();
  const [activeIndex, setActiveIndex] = useState(0);
  const [titleDone, setTitleDone] = useState(false);
  const [goalsSelected, setGoalsSelected] = useState<string[]>([]);
  const [highestSelfSelected, setHighestSelfSelected] = useState<string | null>(null);
  const [affirmationDays, setAffirmationDays] = useState(1);
  const [selfRelationshipSelected, setSelfRelationshipSelected] = useState<string | null>(null);
  const [blocksSelected, setBlocksSelected] = useState<string[]>([]);
  const [showCard, setShowCard] = useState(false);
  const listRef = useRef<FlatList>(null);

  const TOTAL_DOTS = 5;
  const dotAnims = useRef(
    Array.from({ length: TOTAL_DOTS }, (_, i) => new Animated.Value(i === 0 ? 1 : 0.3))
  ).current;
  const fadeContinue = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(width)).current;

  useEffect(() => { fadeIn(); }, []);

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
      ? goalsSelected.length > 0
      : activeIndex === 1
      ? highestSelfSelected !== null
      : activeIndex === 2
      ? titleDone
      : activeIndex === 3
      ? selfRelationshipSelected !== null
      : activeIndex === 4
      ? blocksSelected.length > 0
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

  const handleToggleGoal = (label: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setGoalsSelected((prev) =>
      prev.includes(label) ? prev.filter((p) => p !== label) : [...prev, label]
    );
  };

  const handleContinue = async () => {
    if (!canContinue) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    if (activeIndex === 0) {
      await AsyncStorage.setItem("onboarding_goals", JSON.stringify(goalsSelected));
      listRef.current?.scrollToIndex({ index: 1, animated: true });
      setActiveIndex(1);
    } else if (activeIndex === 1) {
      await AsyncStorage.setItem("onboarding_highest_self", highestSelfSelected!);
      setShowCard(true);
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 60,
        friction: 12,
      }).start();
    } else if (activeIndex === 2) {
      await AsyncStorage.setItem("onboarding_affirmation_days", String(affirmationDays));
      listRef.current?.scrollToIndex({ index: 3, animated: true });
      setActiveIndex(3);
    } else if (activeIndex === 3) {
      await AsyncStorage.setItem("onboarding_self_relationship", selfRelationshipSelected!);
      listRef.current?.scrollToIndex({ index: 4, animated: true });
      setActiveIndex(4);
    } else {
      await AsyncStorage.setItem("onboarding_blocks", JSON.stringify(blocksSelected));
      navigateTo("/(onboarding)/screen8");
    }
  };

  const handleCardContinue = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setActiveIndex(2);
    Animated.timing(slideAnim, {
      toValue: width,
      duration: 280,
      useNativeDriver: true,
    }).start(() => {
      setShowCard(false);
      listRef.current?.scrollToIndex({ index: 2, animated: false });
    });
  };

  return (
    <Animated.View style={[styles.container, { opacity: contentOpacity }]}>
      <SafeAreaView style={styles.safeArea}>

        {/* ── top: dots + scrolling question text ── */}
        <View style={styles.topSection}>
          <View style={styles.dots}>
            {dotAnims.map((anim, i) => (
              <Animated.View key={i} style={[styles.dot, { opacity: anim }]} />
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

        {/* ── middle: options centered ── */}
        <View style={styles.optionsArea}>
          <MultiOptions
            slide={slides[0] as MultiSlide}
            isSlideCurrent={activeIndex === 0}
            revealContent={titleDone}
            selected={goalsSelected}
            onToggle={handleToggleGoal}
          />
          <SingleOptions
            slide={slides[1] as SingleSlide}
            isSlideCurrent={activeIndex === 1}
            revealContent={titleDone}
            selected={highestSelfSelected}
            onSelect={(v) => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setHighestSelfSelected(v);
            }}
          />
          <DaySnapOptions
            isSlideCurrent={activeIndex === 2}
            revealContent={titleDone}
            value={affirmationDays}
            onChange={setAffirmationDays}
          />
          <SingleOptions
            slide={slides[3] as SingleSlide}
            isSlideCurrent={activeIndex === 3}
            revealContent={titleDone}
            selected={selfRelationshipSelected}
            onSelect={(v) => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setSelfRelationshipSelected(v);
            }}
          />
          <MultiOptions
            slide={slides[4] as MultiSlide}
            isSlideCurrent={activeIndex === 4}
            revealContent={titleDone}
            selected={blocksSelected}
            onToggle={(v) => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setBlocksSelected((prev) =>
                prev.includes(v) ? prev.filter((p) => p !== v) : [...prev, v]
              );
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

      <PersonalizedCard
        goals={goalsSelected}
        highestSelf={highestSelfSelected}
        slideAnim={slideAnim}
        showCard={showCard}
        onContinue={handleCardContinue}
      />
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
    paddingTop: 16,
    paddingBottom: 4,
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
    paddingTop: isSmallDevice ? 28 : 20,
    gap: 8,
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
  optionTextWrap: { flexShrink: 1, textAlign: "center" },

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

const cardStyles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  safeArea: { flex: 1 },

  cardsScroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: isSmallDevice ? 18 : 22,
    paddingTop: isSmallDevice ? 28 : 36,
    paddingBottom: 9,
  },

  goalCard: {
    backgroundColor: "#fff",
    borderRadius: 25,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 22,
    gap: 6,
    marginBottom: 14,
  },
  goalCardTitle: {
    fontSize: isSmallDevice ? 17 : 19,
    color: "#000",
    fontFamily: Fonts.serif,
    lineHeight: isSmallDevice ? 22 : 25,
    flexShrink: 1,
  },
  goalCardBody: {
    fontSize: isSmallDevice ? 11 : 12,
    color: "#555",
    fontFamily: Fonts.mono,
    lineHeight: isSmallDevice ? 17 : 18,
    letterSpacing: 0.1,
  },

  highestSelfCard: {
    gap: 5,
    alignItems: "center",
  },
  hsLabel: {
    fontSize: 10,
    color: "#999",
    fontFamily: Fonts.mono,
    letterSpacing: 0.4,
    textAlign: "center",
    marginBottom: 2,
  },
  hsStat: {
    fontSize: 10,
    color: "#7B2FBE",
    fontFamily: Fonts.mono,
    letterSpacing: 0.2,
    marginTop: 4,
  },
  centered: {
    textAlign: "center",
  },

  closingSection: {
    paddingHorizontal: isSmallDevice ? 24 : 30,
    paddingTop: 14,
    paddingBottom: 18,
    gap: 8,
  },
  closingHeading: {
    fontSize: isSmallDevice ? 24 : 28,
    color: "#fff",
    fontFamily: Fonts.serif,
    lineHeight: isSmallDevice ? 30 : 35,
  },
  closingBody: {
    fontSize: isSmallDevice ? 12 : 13,
    color: "rgba(255,255,255,0.5)",
    fontFamily: Fonts.mono,
    lineHeight: isSmallDevice ? 18 : 20,
    letterSpacing: 0.1,
  },

  footer: {
    paddingHorizontal: isSmallDevice ? 24 : 32,
    paddingBottom: isSmallDevice ? 10 : 10,
    paddingTop: 10,
  },
  continueButton: {
    borderRadius: 20,
    paddingVertical: 18,
    alignItems: "center",
    backgroundColor: "#fff",
  },
  continueText: {
    fontSize: isSmallDevice ? 15 : 17,
    fontFamily: Fonts.mono,
    letterSpacing: 0.3,
    color: "#000",
  },
});
