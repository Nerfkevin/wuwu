import React, { useRef, useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  TouchableOpacity,
  FlatList,
  Pressable,
  ScrollView,
  Linking,
} from "react-native";
import RAnimated, { FadeIn, Easing as REasing } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { requestRecordingPermissionsAsync } from "@/lib/expo-audio";
import { useFrequencyPreview } from "@/lib/use-frequency-preview";
import { Fonts, Colors } from "@/constants/theme";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import AnimatedGlow, { GlowEvent } from "@/lib/animated-glow";
import { GlowPresets } from "@/constants/glow";
import { AFFIRMATION_PILLARS, PillarKey } from "@/constants/affirmations";
import { getSavedRecordings } from "@/lib/recording-store";
import { useOnboardingNav } from "./use-onboarding-nav";
import { usePostHogScreenViewed } from "@/lib/posthog";
import { LinearGradient } from "expo-linear-gradient";

const { width } = Dimensions.get("window");
const isSmallDevice = width < 380;
const TOTAL_SLIDES = 3; // 0=pillar grid, 1=affirmation, 2=frequency
const MSG_COUNT    = 5;
const HEADER_HORIZONTAL_PADDING = isSmallDevice ? 28 : 32;
const CONTENT_HORIZONTAL_PADDING = isSmallDevice ? 20 : 24;
const HEADER_TOP_PADDING = isSmallDevice ? 20 : 28;
const TYPEWRITER_STEP_MS = 28;
const TYPEWRITER_STEP_SIZE = isSmallDevice ? 2 : 1;
const LETTER_FADE_MS = isSmallDevice ? 130 : 280;

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
    while (i < chars.length && chars[i].ch !== " " && chars[i].ch !== "\n") wordChars.push(chars[i++]);
    while (i < chars.length && chars[i].ch === " ") wordChars.push(chars[i++]);
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

const PILLAR_TITLE = "select affirmation\npillar";
const FREQUENCY_TITLE = "layer healing\nfrequency";

const PILLAR_TITLE_TOKENS = stringToCharTokens(PILLAR_TITLE);
const PILLAR_TITLE_WORDS  = charsToWordTokens(PILLAR_TITLE_TOKENS);
const FREQ_TITLE_TOKENS   = stringToCharTokens(FREQUENCY_TITLE);
const FREQ_TITLE_WORDS    = charsToWordTokens(FREQ_TITLE_TOKENS);

// ─── frequency slide constants ────────────────────────────────────────────────

const FREQ_GAP         = isSmallDevice ? 8 : 12;
const FREQ_GRID_H_PAD  = isSmallDevice ? CONTENT_HORIZONTAL_PADDING + 14 : CONTENT_HORIZONTAL_PADDING;
const FREQ_ITEM_SIZE   = (width - 2 * FREQ_GRID_H_PAD - FREQ_GAP * 2) / 3;
const FREQ_ITEM_RADIUS = 24;
const FREQ_GRID_HEIGHT = FREQ_ITEM_SIZE * 3 + FREQ_GAP * 2;

const FREQUENCIES = [
  { id: "174", hz: "174 Hz", label: "Pain",       color: Colors.chakra.red    },
  { id: "285", hz: "285 Hz", label: "Rejuvenate", color: Colors.chakra.orange },
  { id: "396", hz: "396 Hz", label: "Fear",       color: Colors.chakra.yellow },
  { id: "417", hz: "417 Hz", label: "Trauma",     color: Colors.chakra.green  },
  { id: "528", hz: "528 Hz", label: "Transform",  color: Colors.chakra.blue   },
  { id: "639", hz: "639 Hz", label: "Love",       color: Colors.chakra.indigo },
  { id: "741", hz: "741 Hz", label: "Detox",      color: Colors.chakra.violet },
  { id: "852", hz: "852 Hz", label: "Anxiety",    color: "#FF00FF"            },
  { id: "963", hz: "963 Hz", label: "Awaken",     color: "#FFFFFF"            },
];

const BRAINWAVES = [
  { id: "delta", name: "Delta", hz: "2 Hz",  label: "Sleep",   beat: 2,  color: Colors.chakra.violet },
  { id: "theta", name: "Theta", hz: "6 Hz",  label: "Meditate",beat: 6,  color: Colors.chakra.indigo },
  { id: "alpha", name: "Alpha", hz: "10 Hz", label: "Relax",   beat: 10, color: Colors.chakra.blue   },
  { id: "beta",  name: "Beta",  hz: "18 Hz", label: "Focus",   beat: 18, color: Colors.chakra.green  },
  { id: "gamma", name: "Gamma", hz: "40 Hz", label: "Clarity", beat: 40, color: Colors.chakra.yellow },
];

const BG_OPTIONS = ["Brainwaves", "Singing Bowl", "Pure"] as const;

// ─── types ────────────────────────────────────────────────────────────────────

type PillarItem = {
  id: string;
  title: string;
  value: string;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
};

// ─── static data ──────────────────────────────────────────────────────────────

const PILLARS: PillarItem[] = [
  { id: "1", title: "Self-Worth &\nConfidence", value: "Confidence", color: Colors.chakra.orange, icon: "flash" },
  { id: "2", title: "Wealth &\nAbundance",     value: "Abundance",  color: Colors.chakra.green,  icon: "cash" },
  { id: "3", title: "Love &\nRelationships",   value: "Love",       color: Colors.chakra.red,    icon: "heart" },
  { id: "4", title: "Health &\nVitality",      value: "Health",     color: Colors.chakra.yellow, icon: "fitness" },
  { id: "5", title: "Peace &\nMental Calm",    value: "Peace",      color: Colors.chakra.blue,   icon: "flower" },
  { id: "6", title: "Focus &\nAchievement",    value: "Focus",      color: Colors.chakra.indigo, icon: "locate" },
];

const PILLAR_SHORT: Record<string, string> = {
  Confidence: "self-worth",
  Abundance:  "wealth",
  Love:       "love",
  Health:     "health",
  Peace:      "peace",
  Focus:      "focus",
};

const shuffleArr = <T,>(arr: T[]): T[] => [...arr].sort(() => Math.random() - 0.5);

// ─── frequency card (slide 5) ────────────────────────────────────────────────

function FrequencyCard({
  item,
  isSelected,
  isGreyed,
  onSelect,
}: {
  item: (typeof FREQUENCIES)[0];
  isSelected: boolean;
  isGreyed?: boolean;
  onSelect: () => void;
}) {
  const [glowState, setGlowState] = useState<GlowEvent>("default");
  const scaleAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    setGlowState(isSelected ? "press" : "default");
  }, [isSelected]);
  const handlePressIn = () => {
    Animated.spring(scaleAnim, { toValue: 0.92, useNativeDriver: true, speed: 60, bounciness: 0 }).start();
  };
  const handlePressOut = () => {
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
  };
  return (
    <Animated.View style={[{ transform: [{ scale: scaleAnim }] }, isGreyed && { opacity: 0.35 }]}>
      <AnimatedGlow
        preset={GlowPresets.vaporwave(FREQ_ITEM_RADIUS, item.color)}
        activeState={glowState}
      >
        <Pressable
          style={[
            styles.freqCard,
            { borderColor: item.color },
            isSelected && { backgroundColor: item.color + "20" },
          ]}
          onPress={onSelect}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
        >
          <Text style={styles.freqHz}>{item.hz}</Text>
          <Text style={styles.freqLabel}>{item.label}</Text>
        </Pressable>
      </AnimatedGlow>
    </Animated.View>
  );
}

function BrainwaveCard({
  item,
  isSelected,
  isGreyed,
  onSelect,
}: {
  item: (typeof BRAINWAVES)[0];
  isSelected: boolean;
  isGreyed?: boolean;
  onSelect: () => void;
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const handlePressIn = () => {
    Animated.spring(scaleAnim, { toValue: 0.92, useNativeDriver: true, speed: 60, bounciness: 0 }).start();
  };
  const handlePressOut = () => {
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
  };
  return (
    <Animated.View style={[{ transform: [{ scale: scaleAnim }] }, isGreyed && { opacity: 0.35 }]}>
      <AnimatedGlow
        preset={GlowPresets.vaporwave(FREQ_ITEM_RADIUS, item.color)}
        activeState={isSelected ? "press" : "default"}
      >
        <Pressable
          style={[
            styles.freqCard,
            { borderColor: item.color },
            isSelected && { backgroundColor: item.color + "20" },
          ]}
          onPress={onSelect}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
        >
          <Text style={styles.freqHz}>{item.name}</Text>
          <Text style={styles.freqBrainHz}>{item.hz}</Text>
          <Text style={styles.freqLabel}>{item.label}</Text>
        </Pressable>
      </AnimatedGlow>
    </Animated.View>
  );
}

function BgButton({
  bg,
  isSelected,
  onPress,
}: {
  bg: string;
  isSelected: boolean;
  onPress: () => void;
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const handlePressIn = () => {
    Animated.spring(scaleAnim, { toValue: 0.92, useNativeDriver: true, speed: 60, bounciness: 0 }).start();
  };
  const handlePressOut = () => {
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
  };
  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <Pressable
        style={[styles.bgItem, isSelected && styles.bgItemSelected]}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      >
        <Text style={[styles.bgText, isSelected && styles.bgTextSelected]}>{bg}</Text>
      </Pressable>
    </Animated.View>
  );
}

// ─── pillar card (slide 0) ────────────────────────────────────────────────────

function PillarCard({ item, isSelected, isDisabled, onSelect }: {
  item: PillarItem; isSelected: boolean; isDisabled?: boolean; onSelect: () => void;
}) {
  const [glowState, setGlowState] = useState<GlowEvent>("default");
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const iconColor = isSelected ? item.color : isDisabled ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.4)";
  const titleColor = isSelected ? item.color : isDisabled ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.62)";

  const handlePressIn = () => {
    setGlowState("press");
    Animated.spring(scaleAnim, { toValue: 0.92, useNativeDriver: true, speed: 60, bounciness: 0 }).start();
  };
  const handlePressOut = () => {
    setGlowState("default");
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
  };

  return (
    <View style={[styles.cardWrapper, isDisabled && { opacity: 0.38 }]}>
      <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
        <AnimatedGlow preset={GlowPresets.ripple(24, item.color, 0.35)} activeState={isSelected ? "hover" : glowState}>
          <Pressable
            style={[
              styles.card,
              { borderColor: isSelected ? item.color : isDisabled ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.14)" },
            ]}
            onPress={onSelect}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
          >
            <View style={styles.cardContent}>
              <Ionicons name={item.icon} size={34} color={iconColor} style={styles.cardIcon} />
              <Text style={[styles.cardTitle, { color: titleColor }]}>{item.title}</Text>
            </View>
          </Pressable>
        </AnimatedGlow>
      </Animated.View>
    </View>
  );
}

// ─── main screen ─────────────────────────────────────────────────────────────

export default function Screen13() {
  usePostHogScreenViewed({
    screen: "onboarding/screen13",
    component: "Screen13",
    screen_number: 13,
  });
  const { contentOpacity, fadeIn, navigateTo } = useOnboardingNav();
  const router = useRouter();

  // ── slide state ──
  const [activeIndex, setActiveIndex]         = useState(0);
  const [selectedPillars, setSelectedPillars] = useState<string[]>([]);
  const [selectedMessages, setSelectedMessages] = useState<Record<string, string>>({});
  const [shuffledMessages, setShuffledMessages] = useState<Record<string, string[]>>({});

  // ── frequency slide state ──
  const [selectedBowlFreq,   setSelectedBowlFreq]   = useState("528");
  const [selectedPureFreq,   setSelectedPureFreq]   = useState("528");
  const { previewFrequency, previewBrainwave, stopPreview, fadeOutPreview } = useFrequencyPreview();
  const [selectedBg,         setSelectedBg]         = useState<typeof BG_OPTIONS[number]>("Brainwaves");
  const [selectedBrainwave,  setSelectedBrainwave]  = useState("alpha");

  const activeFreq = selectedBg === "Singing Bowl" ? selectedBowlFreq : selectedPureFreq;
  const [pillarTitleVisible,  setPillarTitleVisible]  = useState(0);
  const [freqTitleVisible,    setFreqTitleVisible]    = useState(0);
  const [titleAnimDone,       setTitleAnimDone]       = useState(false);

  // ── mic permission gate ──
  const [showMicGate, setShowMicGate] = useState(false);

  // ── recording return state ──
  const [savedRecordingsByText, setSavedRecordingsByText] = useState<Record<string, { uri: string }>>({});
  const awaitingRecordingRef = useRef(false);
  const autoAdvancedRef = useRef(false);

  // ── animation refs ──
  const dotAnims = useRef(
    Array.from({ length: TOTAL_SLIDES }, (_, i) => new Animated.Value(i === 0 ? 1 : 0.3))
  ).current;
  const fadeGrid     = useRef(new Animated.Value(0)).current;
  const fadeAff      = useRef(new Animated.Value(0)).current;
  const fadeMsgs     = useRef(new Animated.Value(1)).current;
  const fadeFreq     = useRef(new Animated.Value(0)).current;
  const fadeContinue = useRef(new Animated.Value(0)).current;
  const btnScale = useRef(new Animated.Value(1)).current;
  const titleTypingTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const titleIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTitleTypingTimeouts = useCallback(() => {
    titleTypingTimeoutsRef.current.forEach(clearTimeout);
    titleTypingTimeoutsRef.current = [];
    if (titleIntervalRef.current) {
      clearInterval(titleIntervalRef.current);
      titleIntervalRef.current = null;
    }
  }, []);

  const runTitleTypewriter = useCallback(
    (
      tokens: CharToken[],
      setVisible: React.Dispatch<React.SetStateAction<number>>,
      fadeBody: Animated.Value,
      onComplete?: () => void
    ) => {
      clearTitleTypingTimeouts();
      setVisible(0);
      fadeBody.setValue(0);

      let i = 0;
      titleIntervalRef.current = setInterval(() => {
        i += TYPEWRITER_STEP_SIZE;
        if (i > tokens.length) {
          clearInterval(titleIntervalRef.current!);
          titleIntervalRef.current = null;
          setVisible(tokens.length);
          onComplete?.();
          const ft = setTimeout(() => {
            Animated.timing(fadeBody, {
              toValue: 1,
              duration: 350,
              useNativeDriver: true,
            }).start();
          }, 140);
          titleTypingTimeoutsRef.current.push(ft);
          return;
        }
        const ch = tokens[i - 1]?.ch;
        if (ch && ch !== " " && ch !== "\n") Haptics.selectionAsync();
        setVisible(i);
      }, TYPEWRITER_STEP_MS);
    },
    [clearTitleTypingTimeouts]
  );

  // keep a ref of activeIndex for useFocusEffect
  const activeIndexRef = useRef(0);
  useEffect(() => { activeIndexRef.current = activeIndex; }, [activeIndex]);

  const loadSavedRecordingMeta = useCallback(async () => {
    const recordings = await getSavedRecordings();
    setSavedRecordingsByText(
      Object.fromEntries(recordings.map((recording) => [recording.text, { uri: recording.uri }]))
    );
  }, []);

  const selectedPillar = selectedPillars[0] ?? null;
  const selectedAffirmationText = selectedPillar ? selectedMessages[selectedPillar]?.trim() ?? "" : "";

  // ── init ──
  useEffect(() => {
    fadeIn();
  }, []);

  useEffect(() => {
    setTitleAnimDone(false);
    if (activeIndex === 0) {
      runTitleTypewriter(PILLAR_TITLE_TOKENS, setPillarTitleVisible, fadeGrid, () => setTitleAnimDone(true));
      return;
    }

    if (activeIndex === 2) {
      runTitleTypewriter(FREQ_TITLE_TOKENS, setFreqTitleVisible, fadeFreq, () => setTitleAnimDone(true));
      return;
    }

    // affirmation slide has no title typewriter — unblock immediately
    setTitleAnimDone(true);
    clearTitleTypingTimeouts();
  }, [activeIndex, clearTitleTypingTimeouts, fadeFreq, fadeGrid, runTitleTypewriter]);

  useEffect(() => () => clearTitleTypingTimeouts(), [clearTitleTypingTimeouts]);

  // dots
  useEffect(() => {
    dotAnims.forEach((anim, i) =>
      Animated.timing(anim, { toValue: i === activeIndex ? 1 : 0.3, duration: 250, useNativeDriver: true }).start()
    );
  }, [activeIndex]);

  // stop freq preview when leaving frequency slide
  useEffect(() => {
    if (activeIndex !== 2) stopPreview();
  }, [activeIndex]);

  const goToFrequencySlide = useCallback(() => {
    Animated.timing(fadeAff, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => {
      fadeFreq.setValue(0);
      setActiveIndex(2);
    });
  }, [fadeAff, fadeFreq]);

  // refresh recorded flags when returning from the recording screen
  useFocusEffect(
    useCallback(() => {
      if (activeIndexRef.current === 1 && awaitingRecordingRef.current) {
        void loadSavedRecordingMeta();
      }
    }, [loadSavedRecordingMeta])
  );

  // auto-advance to frequency slide once the selected message is recorded
  useEffect(() => {
    if (activeIndex !== 1) {
      autoAdvancedRef.current = false;
      return;
    }
    if (!awaitingRecordingRef.current || autoAdvancedRef.current) return;
    if (!selectedAffirmationText || !savedRecordingsByText[selectedAffirmationText]?.uri) return;

    autoAdvancedRef.current = true;
    awaitingRecordingRef.current = false;
    const t = setTimeout(() => goToFrequencySlide(), 220);
    return () => clearTimeout(t);
  }, [savedRecordingsByText, activeIndex, selectedAffirmationText, goToFrequencySlide]);

  // ── canContinue ──

  const currentAffPillar = activeIndex === 1 ? selectedPillar : null;
  const affPillarData = currentAffPillar ? AFFIRMATION_PILLARS[currentAffPillar as PillarKey] : null;

  const canContinue =
    !titleAnimDone ? false :
    activeIndex === 0 ? selectedPillars.length === 1 :
    activeIndex === 1 ? !!selectedAffirmationText :
    activeIndex === 2 ? true :
    false;

  useEffect(() => {
    Animated.timing(fadeContinue, { toValue: canContinue ? 1 : 0, duration: 300, useNativeDriver: false }).start();
  }, [canContinue]);

  const buttonBg = fadeContinue.interpolate({
    inputRange:  [0, 1],
    outputRange: ["rgba(255,255,255,0.18)", "rgba(255,255,255,1)"],
  });
  const buttonTextColor = fadeContinue.interpolate({
    inputRange:  [0, 1],
    outputRange: ["rgba(255,255,255,0.35)", "rgba(0,0,0,1)"],
  });

  // ── slide transitions ──

  const goToAffirmations = () => {
    const msgs: Record<string, string[]> = {};
    selectedPillars.forEach((pillar) => {
      msgs[pillar] = shuffleArr(AFFIRMATION_PILLARS[pillar as PillarKey].messages);
    });
    setShuffledMessages(msgs);
    Animated.parallel([
      Animated.timing(fadeGrid, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start(() => {
      setActiveIndex(1);
      Animated.timing(fadeAff, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    });
  };

  // ── affirmation slide handlers ──

  const handleShuffle = (pillarValue: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.timing(fadeMsgs, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
      setShuffledMessages(prev => ({ ...prev, [pillarValue]: shuffleArr(prev[pillarValue] ?? []) }));
      Animated.timing(fadeMsgs, { toValue: 1, duration: 250, useNativeDriver: true }).start();
    });
  };

  const handleTogglePillar = (value: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedPillars(prev => {
      const next = prev.includes(value) ? [] : [value];
      setSelectedMessages((prevMessages) =>
        Object.fromEntries(
          Object.entries(prevMessages).filter(([pillar]) => next.includes(pillar))
        )
      );

      return next;
    });
  };

  const openRecordingModal = async (pillar: string, text: string) => {
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) {
      awaitingRecordingRef.current = false;
      setShowMicGate(true);
      return;
    }
    awaitingRecordingRef.current = true;
    router.push({ pathname: "/add/recording", params: { text, pillar, onboarding: "1" } });
  };

  // ── continue ──

  const handleContinue = async () => {
    if (!canContinue) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    if (activeIndex === 0) {
      await AsyncStorage.setItem(
        "onboarding_pillars_selected",
        JSON.stringify(selectedPillars)
      );
      goToAffirmations();
    } else if (activeIndex === 1) {
      if (!selectedPillar || !selectedAffirmationText) return;
      await AsyncStorage.setItem(
        "onboarding_pillars_selected",
        JSON.stringify(selectedPillars)
      );
      await AsyncStorage.setItem(
        "onboarding_affirmations",
        JSON.stringify(selectedMessages)
      );
      await openRecordingModal(selectedPillar, selectedAffirmationText);
    } else {
      await AsyncStorage.setItem("onboarding_freq",       activeFreq);
      await AsyncStorage.setItem("onboarding_freq_bg",    selectedBg);
      await AsyncStorage.setItem("onboarding_brainwave",  selectedBrainwave);
      navigateTo("/(onboarding)/screen14");
    }
  };

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <Animated.View style={[styles.container, { opacity: contentOpacity }]}>
      <SafeAreaView style={styles.safeArea}>

        {/* ── dots (always visible) ── */}
        <View style={styles.dots}>
          {Array.from({ length: TOTAL_SLIDES }).map((_, i) => (
            <Animated.View key={i} style={[styles.dot, { opacity: dotAnims[i] }]} />
          ))}
        </View>

        {/* ── slide 0: question + grid ── */}
        {activeIndex === 0 && (<>
          <View style={styles.questionWrap}>
            <View style={styles.pillarHeaderRow}>
              <View style={styles.pillarHeaderLeft}>
                <View style={[styles.titleCharRow, { minHeight: isSmallDevice ? 72 : 88 }]}>
                  {PILLAR_TITLE_WORDS.map((word, wIdx) => {
                    const charsVisible = Math.max(0, Math.min(word.chars.length, pillarTitleVisible - word.startIdx));
                    if (charsVisible === 0) return null;
                    if (word.chars.length === 1 && word.chars[0].ch === "\n") return <View key={wIdx} style={styles.titleLineBreak} />;
                    return (
                      <View key={wIdx} style={styles.titleWordRow}>
                        {word.chars.slice(0, charsVisible).map((tok, cIdx) => (
                          <FadeLetter key={`${word.startIdx}-${cIdx}`} ch={tok.ch} charStyle={styles.question} />
                        ))}
                      </View>
                    );
                  })}
                </View>
              </View>
              <Animated.View style={{ opacity: fadeGrid }}>
                <Ionicons name="apps-outline" size={46} color={Colors.textSecondary} style={styles.pillarDecorIcon} />
              </Animated.View>
            </View>
            <Animated.View style={{ opacity: fadeGrid }}>
              <Text style={styles.hint}>select a pillar to begin, you can always add more later!</Text>
            </Animated.View>
          </View>

          <Animated.View style={[styles.optionsArea, { opacity: fadeGrid }]}>
            <FlatList
              data={PILLARS}
              keyExtractor={item => item.id}
              numColumns={2}
              scrollEnabled={false}
              columnWrapperStyle={styles.row}
              contentContainerStyle={styles.grid}
              style={styles.gridList}
              renderItem={({ item }) => {
                const isSel = selectedPillars.includes(item.value);
                return (
                  <PillarCard
                    item={item}
                    isSelected={isSel}
                    onSelect={() => handleTogglePillar(item.value)}
                  />
                );
              }}
            />
          </Animated.View>
          <View style={styles.spacer} />
        </>)}

        {/* ── slide 1: affirmation picker ── */}
        {activeIndex === 1 && (
          <Animated.View style={[styles.affArea, { opacity: fadeAff }]}>
            <View style={styles.pillarRow}>
              {affPillarData && currentAffPillar ? (
                <AnimatedGlow
                  preset={GlowPresets.ripple(24, affPillarData.color, 0.35)}
                  activeState="hover"
                >
                  <View style={[
                    styles.pillarIndicator,
                    { borderColor: affPillarData.color, borderWidth: 2 },
                  ]}>
                    <Ionicons
                      name={affPillarData.icon as any}
                      size={isSmallDevice ? 26 : 32}
                      color={affPillarData.color}
                    />
                    <Text style={[styles.pillarShort, { color: affPillarData.color }]}>
                      {PILLAR_SHORT[currentAffPillar]}
                    </Text>
                  </View>
                </AnimatedGlow>
              ) : null}
            </View>

            <View style={styles.affDescRow}>
              <Text style={[styles.affDesc, { flex: 1, marginBottom: 0 }]}>
                choose an affirmation message, you can always add more later!
              </Text>
              <Ionicons name="chatbubbles-outline" size={40} color={Colors.textSecondary} style={styles.affDecorIcon} />
            </View>

            <View style={styles.shuffleRow}>
              <TouchableOpacity
                style={styles.shuffleBtn}
                onPress={() => currentAffPillar && handleShuffle(currentAffPillar)}
                activeOpacity={0.7}
              >
                <Ionicons name="shuffle" size={18} color="rgba(255,255,255,0.75)" />
              </TouchableOpacity>
            </View>

            <Animated.View style={[styles.msgsWrap, { opacity: fadeMsgs }]}>
              {currentAffPillar && (shuffledMessages[currentAffPillar] ?? []).slice(0, MSG_COUNT).map(msg => {
                const isSel = selectedMessages[currentAffPillar] === msg;
                return (
                  <TouchableOpacity
                    key={msg}
                    style={[styles.msgCard, isSel && styles.msgCardSelected]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      awaitingRecordingRef.current = false;
                      setSelectedMessages((prev) => ({ ...prev, [currentAffPillar]: msg }));
                    }}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.msgText, isSel && styles.msgTextSelected]}>{msg}</Text>
                  </TouchableOpacity>
                );
              })}
            </Animated.View>
          </Animated.View>
        )}

        {/* ── slide 2: frequency selection ── */}
        {activeIndex === 2 && (
          <View style={styles.freqArea}>
            <View style={styles.freqHeaderPadded}>
            <View style={styles.freqHeaderBlock}>
                <View style={styles.freqHeaderLeft}>
                <View style={[styles.titleCharRow, { minHeight: isSmallDevice ? 64 : 80 }]}>
                  {FREQ_TITLE_WORDS.map((word, wIdx) => {
                    const charsVisible = Math.max(0, Math.min(word.chars.length, freqTitleVisible - word.startIdx));
                    if (charsVisible === 0) return null;
                    if (word.chars.length === 1 && word.chars[0].ch === "\n") return <View key={wIdx} style={styles.titleLineBreak} />;
                    return (
                      <View key={wIdx} style={styles.titleWordRow}>
                        {word.chars.slice(0, charsVisible).map((tok, cIdx) => (
                          <FadeLetter key={`${word.startIdx}-${cIdx}`} ch={tok.ch} charStyle={styles.freqTitle} />
                        ))}
                      </View>
                    );
                  })}
                </View>
                <Animated.View style={{ opacity: fadeFreq }}>
                  <Text style={styles.freqSubtitle}>
                    select a frequency and soundscape{"\n"}that aligns with your subconscious goals
                  </Text>
                </Animated.View>
              </View>
              <Animated.View style={{ opacity: fadeFreq }}>
                {selectedBg === 'Brainwaves' ? (
                  <MaterialCommunityIcons name="brain" size={48} color={Colors.textSecondary} style={styles.freqDecorIcon} />
                ) : (
                  <MaterialCommunityIcons
                    name={selectedBg === 'Singing Bowl' ? 'bowl-mix-outline' : 'pulse'}
                    size={48}
                    color={Colors.textSecondary}
                    style={styles.freqDecorIcon}
                  />
                )}
              </Animated.View>
            </View>
            </View>

            <Animated.View style={{ opacity: fadeFreq }}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.bgList}
                style={styles.bgScroll}
              >
                {BG_OPTIONS.map(bg => (
                  <BgButton
                    key={bg}
                    bg={bg}
                    isSelected={selectedBg === bg}
                    onPress={() => { Haptics.selectionAsync(); fadeOutPreview(); setSelectedBg(bg); }}
                  />
                ))}
              </ScrollView>

              <View style={styles.bgDividerRow}>
                <LinearGradient
                  colors={[
                    "rgba(200, 200, 205, 0)",
                    "rgba(200, 200, 205, 0.35)",
                    "rgba(220, 220, 225, 0.85)",
                    "rgba(200, 200, 205, 0.35)",
                    "rgba(200, 200, 205, 0)",
                  ]}
                  locations={[0, 0.22, 0.5, 0.78, 1]}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={styles.bgDividerGradient}
                />
              </View>

              <View style={styles.freqGridSection}>
              <View style={[styles.freqGridContainer, { height: FREQ_GRID_HEIGHT }]}>
                {selectedBg === "Brainwaves" ? (
                  <View style={styles.freqList}>
                    <View style={styles.freqRow}>
                      {BRAINWAVES.slice(0, 3).map(item => (
                        <BrainwaveCard
                          key={item.id}
                          item={item}
                          isSelected={selectedBrainwave === item.id}
                          isGreyed={selectedBrainwave !== item.id}
                          onSelect={() => { Haptics.selectionAsync(); setSelectedBrainwave(item.id); previewBrainwave(item.id); }}
                        />
                      ))}
                    </View>
                    <View style={[styles.freqRow, { justifyContent: "center" }]}>
                      {BRAINWAVES.slice(3).map(item => (
                        <BrainwaveCard
                          key={item.id}
                          item={item}
                          isSelected={selectedBrainwave === item.id}
                          isGreyed={selectedBrainwave !== item.id}
                          onSelect={() => { Haptics.selectionAsync(); setSelectedBrainwave(item.id); previewBrainwave(item.id); }}
                        />
                      ))}
                    </View>
                  </View>
                ) : (
                  <FlatList
                    data={FREQUENCIES}
                    renderItem={({ item }) => {
                      const setter = selectedBg === "Singing Bowl" ? setSelectedBowlFreq : setSelectedPureFreq;
                      return (
                        <FrequencyCard
                          item={item}
                          isSelected={activeFreq === item.id}
                          isGreyed={activeFreq !== item.id}
                          onSelect={() => { Haptics.selectionAsync(); setter(item.id); previewFrequency(item.id, selectedBg); }}
                        />
                      );
                    }}
                    keyExtractor={item => item.id}
                    numColumns={3}
                    scrollEnabled={false}
                    columnWrapperStyle={styles.freqRow}
                    contentContainerStyle={styles.freqList}
                  />
                )}
              </View>
              {selectedBg === "Brainwaves" ? (
                <Text style={styles.brainwaveDisclaimer}>
                  *This is a Binaural Frequency, best used with stereo headphones.
                </Text>
              ) : null}
              </View>
            </Animated.View>
          </View>
        )}

        {/* ── footer ── */}
        <View style={styles.footer}>
          <Animated.View style={{ transform: [{ scale: btnScale }] }}>
            <TouchableOpacity
              onPress={handleContinue}
              activeOpacity={canContinue ? 0.75 : 1}
              disabled={!canContinue}
              onPressIn={() => Animated.spring(btnScale, { toValue: 0.96, useNativeDriver: true, speed: 60, bounciness: 0 }).start()}
              onPressOut={() => Animated.spring(btnScale, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 6 }).start()}
            >
              <Animated.View style={[styles.continueButton, { backgroundColor: buttonBg }]}>
                <Animated.Text style={[styles.continueText, { color: buttonTextColor }]}>continue</Animated.Text>
              </Animated.View>
            </TouchableOpacity>
          </Animated.View>
        </View>

      </SafeAreaView>

      {/* ── Mic permission gate overlay ── */}
      {showMicGate && (
        <View style={styles.micGateOverlay}>
          <View style={styles.micGateCard}>
            <Text style={styles.micGateEmoji}>🎙️</Text>
            <Text style={styles.micGateTitle}>microphone needed</Text>
            <Text style={styles.micGateBody}>
              voice recordings require microphone access. enable it in Settings to record your affirmations in your own voice.
            </Text>
            <TouchableOpacity
              style={styles.micGateSettingsBtn}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                Linking.openSettings();
              }}
              activeOpacity={0.75}
            >
              <Text style={styles.micGateSettingsBtnText}>open Settings</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.micGateDismissBtn}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowMicGate(false);
              }}
              activeOpacity={0.75}
            >
              <Text style={styles.micGateDismissText}>not now</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </Animated.View>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea:  { flex: 1 },

  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 7,
    paddingTop: isSmallDevice ? 8 : 16,
    paddingBottom: isSmallDevice ? 2 : 4,
  },
  dot: {
    width: 28,
    height: 3,
    borderRadius: 2,
    backgroundColor: "#fff",
  },

  // shared typewriter layout
  titleCharRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
  },
  titleWordRow: { flexDirection: "row" },
  titleLineBreak: { width: "100%", height: 0 },

  // slide 0
  pillarHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  pillarHeaderLeft: {
    flex: 1,
  },
  pillarDecorIcon: {
    marginLeft: 8,
    marginTop: 4,
    opacity: 0.6,
  },
  questionWrap: {
    paddingHorizontal: HEADER_HORIZONTAL_PADDING,
    paddingTop: HEADER_TOP_PADDING,
    paddingBottom: isSmallDevice ? 14 : 36,
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
    lineHeight: 18,
  },
  optionsArea: {
    paddingHorizontal: CONTENT_HORIZONTAL_PADDING,
    overflow: "visible",
  },
  gridList: { overflow: "visible" },
  grid:     { overflow: "visible" },
  row: {
    justifyContent: "space-between",
    marginBottom: isSmallDevice ? 12 : 20,
    overflow: "visible",
  },
  cardWrapper: { flex: 1, maxWidth: "46%", overflow: "visible" },
  card: {
    width: "100%",
    minHeight: isSmallDevice ? 88 : 115,
    backgroundColor: "transparent",
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
  cardContent: {
    width: "100%",
    minHeight: 80,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    paddingVertical: 6,
    gap: 8,
  },
  cardIcon:  { marginBottom: 2 },
  cardTitle: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    textAlign: "center",
  },
  spacer: { flex: 1 },

  // slides 1
  affArea: {
    flex: 1,
    paddingHorizontal: CONTENT_HORIZONTAL_PADDING,
  },
  pillarRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: isSmallDevice ? 10 : 18,
    paddingTop: isSmallDevice ? 12 : 30,
    paddingBottom: isSmallDevice ? 12 : 30,
  },
  pillarIndicator: {
    width: isSmallDevice ? 82 : 96,
    height: isSmallDevice ? 82 : 96,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    gap: 6,
  },
  pillarShort: {
    fontSize: isSmallDevice ? 10 : 12,
    fontFamily: Fonts.mono,
    color: "rgba(255,255,255,0.5)",
    letterSpacing: 0.2,
    textTransform: "lowercase",
    textAlign: "center",
  },
  affDescRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: isSmallDevice ? 6 : 14,
  },
  affDecorIcon: {
    marginLeft: 12,
    marginTop: 2,
    opacity: 0.6,
  },
  affDesc: {
    fontSize: 13,
    fontFamily: Fonts.mono,
    color: "rgba(255,255,255,0.86)",
    lineHeight: 20,
    letterSpacing: 0.2,
    marginBottom: 14,
  },
  shuffleRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: isSmallDevice ? 6 : 12,
    marginTop: isSmallDevice ? 2 : 6,
  },
  shuffleBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  msgsWrap: { gap: isSmallDevice ? 7 : 9 },
  msgCard: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    borderRadius: 15,
    paddingVertical: isSmallDevice ? 9 : 14,
    paddingHorizontal: 18,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  msgCardSelected: {
    borderColor: "#fff",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  msgText: {
    fontFamily: Fonts.mono,
    fontSize: isSmallDevice ? 12 : 13,
    color: "rgba(255,255,255,0.55)",
    textAlign: "center",
    lineHeight: 20,
  },
  msgTextSelected: { color: "#fff" },

  // slide 2 — frequency
  freqArea: {
    flex: 1,
    paddingTop: HEADER_TOP_PADDING,
    gap: isSmallDevice ? 8 : 16,
  },
  freqHeaderPadded: {
    paddingHorizontal: CONTENT_HORIZONTAL_PADDING,
  },
  freqGridSection: {
    paddingHorizontal: FREQ_GRID_H_PAD,
  },
  freqHeaderBlock: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  freqHeaderLeft: {
    flex: 1,
    gap: 6,
  },
  freqDecorIcon: {
    marginLeft: 12,
    marginTop: 4,
    opacity: 0.6,
  },
  freqTitle: {
    fontFamily: Fonts.serif,
    fontSize: isSmallDevice ? 22 : 26,
    color: Colors.text,
    lineHeight: isSmallDevice ? 28 : 34,
  },
  freqSubtitle: {
    fontFamily: Fonts.mono,
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  bgScroll: {
    flexGrow: 0,
    flexShrink: 0,
    marginTop: 8,
    marginBottom: 0,
    alignSelf: "stretch",
  },
  bgDividerRow: {
    width: "100%",
    marginTop: 2,
    marginBottom: isSmallDevice ? 6 : 12,
  },
  bgDividerGradient: {
    height: 2,
    width: "100%",
    borderRadius: 1,
  },
  bgList: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexGrow: 1,
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bgItem: {
    paddingHorizontal: isSmallDevice ? 10 : 14,
    paddingVertical: isSmallDevice ? 5 : 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  bgItemSelected: {
    borderColor: Colors.chakra.violet,
    backgroundColor: "rgba(139,92,246,0.18)",
  },
  bgText: {
    fontFamily: Fonts.mono,
    fontSize: isSmallDevice ? 12 : 14,
    color: Colors.textSecondary,
  },
  bgTextSelected: { color: Colors.text },
  freqGridContainer: { overflow: "hidden" },
  brainwaveDisclaimer: {
    fontFamily: Fonts.mono,
    fontSize: 11,
    color: Colors.textSecondary,
    lineHeight: 16,
    marginTop: isSmallDevice ? -30 : 0,
    textAlign: "center",
  },
  freqList: { flexGrow: 0 },
  freqRow: {
    flexDirection: "row",
    gap: FREQ_GAP,
    marginBottom: FREQ_GAP,
  },
  freqCard: {
    width: FREQ_ITEM_SIZE,
    height: FREQ_ITEM_SIZE,
    borderRadius: FREQ_ITEM_RADIUS,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    padding: 4,
  },
  freqHz: {
    fontFamily: Fonts.serifBold,
    fontSize: isSmallDevice ? 18 : 24,
    color: Colors.text,
    marginBottom: 2,
    textAlign: "center",
  },
  freqBrainHz: {
    fontFamily: Fonts.mono,
    fontSize: 10,
    color: Colors.textSecondary,
    textAlign: "center",
    marginBottom: 2,
  },
  freqLabel: {
    fontFamily: Fonts.mono,
    fontSize: 10,
    color: Colors.textSecondary,
    textAlign: "center",
  },

  // footer
  footer: {
    paddingHorizontal: isSmallDevice ? 24 : 32,
    paddingBottom: isSmallDevice ? 8 : 10,
    paddingTop: isSmallDevice ? 6 : 12,
  },
  continueButton: {
    borderRadius: 20,
    paddingVertical: isSmallDevice ? 14 : 18,
    alignItems: "center",
  },
  continueText: {
    fontSize: isSmallDevice ? 15 : 17,
    fontFamily: Fonts.mono,
    letterSpacing: 0.3,
  },
  micGateOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.72)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 20,
    paddingHorizontal: 28,
  },
  micGateCard: {
    width: "100%",
    backgroundColor: "#1a0030",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(155,109,255,0.3)",
    padding: 28,
    alignItems: "center",
    gap: 12,
  },
  micGateEmoji: {
    fontSize: 48,
    marginBottom: 4,
  },
  micGateTitle: {
    fontFamily: Fonts.serif,
    fontSize: 24,
    color: "#fff",
    textAlign: "center",
  },
  micGateBody: {
    fontFamily: Fonts.mono,
    fontSize: 13,
    color: "rgba(255,255,255,0.65)",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 4,
  },
  micGateSettingsBtn: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  micGateSettingsBtnText: {
    fontFamily: Fonts.mono,
    fontSize: 15,
    fontWeight: "700",
    color: "#0a000d",
    letterSpacing: 0.4,
  },
  micGateDismissBtn: {
    paddingVertical: 8,
    alignItems: "center",
  },
  micGateDismissText: {
    fontFamily: Fonts.mono,
    fontSize: 13,
    color: "rgba(255,255,255,0.4)",
    letterSpacing: 0.3,
  },
});
