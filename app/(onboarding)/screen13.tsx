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
  Easing,
} from "react-native";
import RAnimated, { FadeIn, Easing as REasing } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAudioPlayer } from "@/lib/expo-audio";
import type { AudioPlayer } from "@/lib/expo-audio";
import { useFrequencyPreview } from "@/lib/use-frequency-preview";
import { Fonts, Colors, Layout } from "@/constants/theme";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import AnimatedGlow, { GlowEvent } from "@/lib/animated-glow";
import { GlowPresets } from "@/constants/glow";
import { AFFIRMATION_PILLARS, PillarKey } from "@/constants/affirmations";
import { getSavedRecordings } from "@/lib/recording-store";
import {
  activateLockScreenControls,
  clearLockScreenControls,
  configureMixedPlaybackAsync,
} from "@/lib/audio-playback";
import { useOnboardingNav } from "./use-onboarding-nav";
import { usePostHogScreenViewed } from "@/lib/posthog";
import { LinearGradient } from "expo-linear-gradient";

const { width } = Dimensions.get("window");
const isSmallDevice = width < 380;
const TOTAL_SLIDES = 6; // 0=pillar grid, 1-3=affirmations, 4=record, 5=frequency
const MSG_COUNT    = 5;
const HEADER_HORIZONTAL_PADDING = isSmallDevice ? 28 : 32;
const CONTENT_HORIZONTAL_PADDING = isSmallDevice ? 20 : 24;
const HEADER_TOP_PADDING = isSmallDevice ? 20 : 28;
const TYPEWRITER_STEP_MS = 33;
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
const RECORD_TITLE = "record your\nmessages";
const FREQUENCY_TITLE = "layer healing\nfrequency";

const PILLAR_TITLE_TOKENS = stringToCharTokens(PILLAR_TITLE);
const PILLAR_TITLE_WORDS  = charsToWordTokens(PILLAR_TITLE_TOKENS);
const RECORD_TITLE_TOKENS = stringToCharTokens(RECORD_TITLE);
const RECORD_TITLE_WORDS  = charsToWordTokens(RECORD_TITLE_TOKENS);
const FREQ_TITLE_TOKENS   = stringToCharTokens(FREQUENCY_TITLE);
const FREQ_TITLE_WORDS    = charsToWordTokens(FREQ_TITLE_TOKENS);

// ─── frequency slide constants ────────────────────────────────────────────────

const FREQ_ITEM_SIZE   = (width - (isSmallDevice ? 40 : 48) - 24) / 3;
const FREQ_ITEM_RADIUS = 24;
const FREQ_GRID_HEIGHT = FREQ_ITEM_SIZE * 3 + 12 * 2;

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

type TrackItem = {
  id: string;
  text: string;
  pillar: string;
  uri?: string;
  recorded: boolean;
};

type SelectedRecordingItem = {
  pillar: string;
  text: string;
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
  const [recordTitleVisible,  setRecordTitleVisible]  = useState(0);
  const [freqTitleVisible,    setFreqTitleVisible]    = useState(0);
  const [titleAnimDone,       setTitleAnimDone]       = useState(false);

  // ── recording slide state ──
  const [recordingSelections, setRecordingSelections] = useState<SelectedRecordingItem[]>([]);
  const [savedRecordingsByText, setSavedRecordingsByText] = useState<Record<string, { uri: string }>>({});
  const [playingId, setPlayingId]                         = useState<string | null>(null);
  const playerRef      = useRef<AudioPlayer | null>(null);
  const statusTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoAdvancedRef = useRef(false);

  // ── animation refs ──
  const dotAnims = useRef(
    Array.from({ length: TOTAL_SLIDES }, (_, i) => new Animated.Value(i === 0 ? 1 : 0.3))
  ).current;
  const fadeGrid     = useRef(new Animated.Value(0)).current;
  const fadeAff      = useRef(new Animated.Value(0)).current;
  const fadeMsgs     = useRef(new Animated.Value(1)).current;
  const fadeRec      = useRef(new Animated.Value(0)).current;
  const fadeFreq     = useRef(new Animated.Value(0)).current;
  const fadeContinue = useRef(new Animated.Value(0)).current;
  const btnScale = useRef(new Animated.Value(1)).current;
  const recordIconPulse = useRef(new Animated.Value(0)).current;
  const recordIconGlow  = useRef(new Animated.Value(0)).current;
  const titleTypingTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const titleIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // pillar indicator scale/opacity (3 values)
  const pillarScales    = useRef([new Animated.Value(1), new Animated.Value(0.78), new Animated.Value(0.78)]).current;
  const pillarOpacities = useRef([new Animated.Value(1), new Animated.Value(0.35), new Animated.Value(0.35)]).current;

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
        i += 1;
        if (i > tokens.length) {
          clearInterval(titleIntervalRef.current!);
          titleIntervalRef.current = null;
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

  const recordingItems = React.useMemo(() => {
    return recordingSelections.map(({ pillar, text }, index) => {
      const saved = savedRecordingsByText[text];

      return {
        id: `track-${index}-${pillar}`,
        text,
        pillar,
        uri: saved?.uri,
        recorded: !!saved?.uri,
      };
    });
  }, [recordingSelections, savedRecordingsByText]);

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

    if (activeIndex === 4) {
      runTitleTypewriter(RECORD_TITLE_TOKENS, setRecordTitleVisible, fadeRec, () => setTitleAnimDone(true));
      return;
    }

    if (activeIndex === 5) {
      runTitleTypewriter(FREQ_TITLE_TOKENS, setFreqTitleVisible, fadeFreq, () => setTitleAnimDone(true));
      return;
    }

    // affirmation slides have no title typewriter — unblock immediately
    setTitleAnimDone(true);
    clearTitleTypingTimeouts();
  }, [activeIndex, clearTitleTypingTimeouts, fadeFreq, fadeGrid, fadeRec, runTitleTypewriter]);

  useEffect(() => () => clearTitleTypingTimeouts(), [clearTitleTypingTimeouts]);

  // dots
  useEffect(() => {
    dotAnims.forEach((anim, i) =>
      Animated.timing(anim, { toValue: i === activeIndex ? 1 : 0.3, duration: 250, useNativeDriver: true }).start()
    );
  }, [activeIndex]);

  // pillar indicator animations (slides 1-3)
  useEffect(() => {
    if (activeIndex < 1 || activeIndex > 3) return;
    const cur = activeIndex - 1;
    pillarScales.forEach((anim, i) =>
      Animated.spring(anim, { toValue: i === cur ? 1 : 0.78, useNativeDriver: true, tension: 120, friction: 8 }).start()
    );
    pillarOpacities.forEach((anim, i) =>
      Animated.timing(anim, { toValue: i === cur ? 1 : 0.35, duration: 280, useNativeDriver: true }).start()
    );
  }, [activeIndex]);

  useEffect(() => {
    if (activeIndex !== 4) {
      recordIconPulse.stopAnimation();
      recordIconPulse.setValue(0);
      recordIconGlow.stopAnimation();
      recordIconGlow.setValue(0);
      return;
    }

    // shake: waits, then rattles
    const shake = Animated.loop(
      Animated.sequence([
        Animated.delay(1200),
        Animated.timing(recordIconPulse, { toValue:  1, duration: 80, easing: Easing.linear, useNativeDriver: true }),
        Animated.timing(recordIconPulse, { toValue: -1, duration: 80, easing: Easing.linear, useNativeDriver: true }),
        Animated.timing(recordIconPulse, { toValue:  1, duration: 80, easing: Easing.linear, useNativeDriver: true }),
        Animated.timing(recordIconPulse, { toValue: -1, duration: 80, easing: Easing.linear, useNativeDriver: true }),
        Animated.timing(recordIconPulse, { toValue:  0, duration: 60, easing: Easing.linear, useNativeDriver: true }),
      ])
    );

    // slow breathe: scale + opacity
    const glow = Animated.loop(
      Animated.sequence([
        Animated.timing(recordIconGlow, { toValue: 1, duration: 950, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(recordIconGlow, { toValue: 0, duration: 950, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );

    shake.start();
    glow.start();
    return () => { shake.stop(); glow.stop(); };
  }, [activeIndex, recordIconPulse, recordIconGlow]);

  // stop freq preview when leaving slide 5
  useEffect(() => {
    if (activeIndex !== 5) stopPreview();
  }, [activeIndex]);

  // stop playback when leaving slide 4
  useEffect(() => {
    if (activeIndex !== 4) {
      if (statusTimerRef.current) { clearInterval(statusTimerRef.current); statusTimerRef.current = null; }
      if (playerRef.current) {
        clearLockScreenControls(playerRef.current);
        playerRef.current.remove();
        playerRef.current = null;
      }
      setPlayingId(null);
    }
  }, [activeIndex]);

  // ── recording data ──

  useEffect(() => {
    if (activeIndex !== 4) return;
    loadSavedRecordingMeta();
  }, [activeIndex, loadSavedRecordingMeta]);

  // refresh recorded flags when returning from the recording screen
  const refreshTracks = useCallback(async () => {
    await loadSavedRecordingMeta();
  }, [loadSavedRecordingMeta]);

  useFocusEffect(
    useCallback(() => {
      if (activeIndexRef.current === 4) {
        refreshTracks();
      }
    }, [refreshTracks])
  );

  // auto-advance to frequency slide once all recordings are done
  useEffect(() => {
    if (activeIndex !== 4) {
      autoAdvancedRef.current = false;
      return;
    }
    if (autoAdvancedRef.current) return;
    const allRecorded = recordingItems.length > 0 && recordingItems.every((i) => i.recorded);
    if (!allRecorded) return;

    autoAdvancedRef.current = true;
    const t = setTimeout(() => goToFrequencySlide(), 420);
    return () => clearTimeout(t);
  }, [recordingItems, activeIndex]);

  // ── canContinue ──

  const currentAffPillar = activeIndex >= 1 && activeIndex <= 3 ? selectedPillars[activeIndex - 1] : null;

  const canContinue =
    !titleAnimDone ? false :
    activeIndex === 0 ? selectedPillars.length >= 3 :
    activeIndex >= 1 && activeIndex <= 3 ? !!selectedMessages[currentAffPillar!] :
    activeIndex === 4 ? recordingItems.length > 0 && recordingItems.every((item) => item.recorded) :
    activeIndex === 5 ? true :
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

  const goToNextAff = (next: number) => {
    Animated.timing(fadeMsgs, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
      setActiveIndex(next);
      Animated.timing(fadeMsgs, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    });
  };

  const goToRecordingSlide = () => {
    Animated.timing(fadeAff, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => {
      fadeRec.setValue(0);
      setActiveIndex(4);
    });
  };

  const goToFrequencySlide = () => {
    Animated.timing(fadeRec, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => {
      fadeFreq.setValue(0);
      setActiveIndex(5);
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
      const next = prev.includes(value)
        ? prev.filter(v => v !== value)
        : prev.length < 3
          ? [...prev, value]
          : prev;
      setSelectedMessages((prevMessages) =>
        Object.fromEntries(
          Object.entries(prevMessages).filter(([pillar]) => next.includes(pillar))
        )
      );

      return next;
    });
  };

  // ── playback ──

  const watchPlayerStatus = () => {
    if (statusTimerRef.current) { clearInterval(statusTimerRef.current); statusTimerRef.current = null; }
    statusTimerRef.current = setInterval(() => {
      const player = playerRef.current;
      if (!player) return;
      const duration = player.duration    || 0;
      const current  = player.currentTime || 0;
      if (!player.playing && duration > 0 && current >= duration - 0.05) {
        clearLockScreenControls(player);
        player.remove();
        playerRef.current = null;
        setPlayingId(null);
        if (statusTimerRef.current) { clearInterval(statusTimerRef.current); statusTimerRef.current = null; }
      }
    }, 120);
  };

  const handlePlay = async (item: TrackItem) => {
    if (!item.uri) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (playerRef.current && playingId === item.id) {
      if (playerRef.current.playing) {
        playerRef.current.pause();
        clearLockScreenControls(playerRef.current);
        setPlayingId(null);
        if (statusTimerRef.current) { clearInterval(statusTimerRef.current); statusTimerRef.current = null; }
      } else {
        activateLockScreenControls(playerRef.current, { title: item.text });
        playerRef.current.play();
        setPlayingId(item.id);
        watchPlayerStatus();
      }
      return;
    }
    if (statusTimerRef.current) { clearInterval(statusTimerRef.current); statusTimerRef.current = null; }
    if (playerRef.current) { clearLockScreenControls(playerRef.current); playerRef.current.remove(); playerRef.current = null; }
    await configureMixedPlaybackAsync();
    const player = createAudioPlayer(item.uri);
    playerRef.current = player;
    setPlayingId(item.id);
    activateLockScreenControls(player, { title: item.text });
    player.play();
    watchPlayerStatus();
  };

  const handleRecord = (item: TrackItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({ pathname: "/add/recording", params: { text: item.text, pillar: item.pillar, onboarding: "1" } });
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
    } else if (activeIndex < 3) {
      goToNextAff(activeIndex + 1);
    } else if (activeIndex === 3) {
      const nextRecordingSelections = selectedPillars
        .map((pillar) => ({
          pillar,
          text: selectedMessages[pillar]?.trim() ?? "",
        }))
        .filter((item) => item.text.length > 0);

      setRecordingSelections(nextRecordingSelections);
      await AsyncStorage.setItem(
        "onboarding_pillars_selected",
        JSON.stringify(selectedPillars)
      );
      await AsyncStorage.setItem(
        "onboarding_affirmations",
        JSON.stringify(selectedMessages)
      );
      goToRecordingSlide();
    } else if (activeIndex === 4) {
      goToFrequencySlide();
    } else {
      await AsyncStorage.setItem("onboarding_freq",       activeFreq);
      await AsyncStorage.setItem("onboarding_freq_bg",    selectedBg);
      await AsyncStorage.setItem("onboarding_brainwave",  selectedBrainwave);
      navigateTo("/(onboarding)/screen14");
    }
  };

  // ── recording slide render helper ──

  const renderTrackItem = (item: TrackItem) => {
    const pillarData   = AFFIRMATION_PILLARS[item.pillar as PillarKey];
    const glowColor    = pillarData?.color ?? Colors.chakra.violet;
    const isNowPlaying = playingId === item.id;
    const needsRecording = !item.recorded;
    const micStyle = needsRecording
      ? {
          opacity: recordIconGlow.interpolate({ inputRange: [0, 1], outputRange: [0.38, 1] }),
          transform: [
            { rotate: recordIconPulse.interpolate({ inputRange: [-1, 0, 1], outputRange: ["-22deg", "0deg", "22deg"] }) },
            { scale:  recordIconGlow.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1.14] }) },
          ],
        }
      : undefined;

    return (
      <View style={styles.trackRow}>
        <AnimatedGlow
          preset={GlowPresets.vaporwave(Layout.borderRadius, glowColor)}
          activeState="default"
        >
          <View style={[styles.trackOuter, { borderColor: glowColor }]}>
            <View style={styles.trackInner}>
              <View style={styles.trackTextWrap}>
                <Text style={styles.trackText} numberOfLines={2}>{item.text}</Text>
                <Text style={styles.trackSub}>{pillarData?.title ?? item.pillar}</Text>
              </View>

              <TouchableOpacity
                style={[styles.trackActionBtn, { backgroundColor: item.recorded ? glowColor + "22" : "#1e1e1e" }]}
                onPress={() => item.recorded ? handlePlay(item) : handleRecord(item)}
              >
                {needsRecording ? (
                  <Animated.View style={micStyle}>
                    <Ionicons name="mic" size={20} color={glowColor} />
                  </Animated.View>
                ) : (
                  <Ionicons
                    name={isNowPlaying ? "pause" : "play"}
                    size={20}
                    color={glowColor}
                  />
                )}
              </TouchableOpacity>
            </View>
          </View>
        </AnimatedGlow>
      </View>
    );
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
                <View style={styles.titleCharRow}>
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
              <Text style={styles.hint}>select 3 pillars to begin, you can always add more later!</Text>
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
                const atMax = selectedPillars.length >= 3 && !isSel;
                return (
                  <PillarCard
                    item={item}
                    isSelected={isSel}
                    isDisabled={atMax}
                    onSelect={() => { if (!atMax) handleTogglePillar(item.value); }}
                  />
                );
              }}
            />
          </Animated.View>
          <View style={styles.spacer} />
        </>)}

        {/* ── slides 1-3: affirmation picker ── */}
        {activeIndex >= 1 && activeIndex <= 3 && (
          <Animated.View style={[styles.affArea, { opacity: fadeAff }]}>
            <View style={styles.pillarRow}>
              {selectedPillars.map((value, i) => {
                const p        = AFFIRMATION_PILLARS[value as PillarKey];
                const isActive = i === activeIndex - 1;
                return (
                  <Animated.View
                    key={value}
                    style={{ transform: [{ scale: pillarScales[i] }], opacity: pillarOpacities[i] }}
                  >
                    <AnimatedGlow
                      preset={GlowPresets.ripple(24, p.color, 0.35)}
                      activeState={isActive ? "hover" : "default"}
                    >
                      <View style={[
                        styles.pillarIndicator,
                        { borderColor: isActive ? p.color : "rgba(255,255,255,0.2)", borderWidth: isActive ? 2 : 1.5 },
                      ]}>
                        <Ionicons name={p.icon as any} size={32} color={isActive ? p.color : "rgba(255,255,255,0.55)"} />
                        <Text style={[styles.pillarShort, isActive && { color: p.color }]}>
                          {PILLAR_SHORT[value]}
                        </Text>
                      </View>
                    </AnimatedGlow>
                  </Animated.View>
                );
              })}
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

        {/* ── slide 4: record your messages ── */}
        {activeIndex === 4 && (
          <View style={styles.recArea}>
            <View style={styles.recHeader}>
              <View style={styles.recHeaderLeft}>
                <View style={styles.titleCharRow}>
                  {RECORD_TITLE_WORDS.map((word, wIdx) => {
                    const charsVisible = Math.max(0, Math.min(word.chars.length, recordTitleVisible - word.startIdx));
                    if (charsVisible === 0) return null;
                    if (word.chars.length === 1 && word.chars[0].ch === "\n") return <View key={wIdx} style={styles.titleLineBreak} />;
                    return (
                      <View key={wIdx} style={styles.titleWordRow}>
                        {word.chars.slice(0, charsVisible).map((tok, cIdx) => (
                          <FadeLetter key={`${word.startIdx}-${cIdx}`} ch={tok.ch} charStyle={styles.recTitle} />
                        ))}
                      </View>
                    );
                  })}
                </View>
                <Animated.View style={{ opacity: fadeRec }}>
                  <Text style={styles.recSubtitle}>
                    click on each message and record{"\n"}them in your own voice
                  </Text>
                </Animated.View>
              </View>
              <Animated.View style={{ opacity: fadeRec }}>
                <Text style={styles.micDecor}>🎙️</Text>
              </Animated.View>
            </View>

            <Animated.View style={[styles.recBody, { opacity: fadeRec }]}>
              <ScrollView
                contentContainerStyle={[
                  styles.trackListContent,
                  recordingItems.length === 0 && styles.trackListContentEmpty,
                ]}
                style={styles.recList}
                showsVerticalScrollIndicator={false}
              >
                {recordingItems.length > 0 ? (
                  recordingItems.map((item) => (
                    <View key={item.id}>{renderTrackItem(item)}</View>
                  ))
                ) : (
                  <Text style={styles.emptyTracksText}>no selected messages yet</Text>
                )}
              </ScrollView>
            </Animated.View>
          </View>
        )}

        {/* ── slide 5: frequency selection ── */}
        {activeIndex === 5 && (
          <View style={styles.freqArea}>
            <View style={styles.freqHeaderPadded}>
            <View style={styles.freqHeaderBlock}>
              <View style={styles.freqHeaderLeft}>
                <View style={styles.titleCharRow}>
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
    paddingTop: 16,
    paddingBottom: 4,
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
    paddingBottom: isSmallDevice ? 28 : 36,
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
    marginBottom: 20,
    overflow: "visible",
  },
  cardWrapper: { flex: 1, maxWidth: "46%", overflow: "visible" },
  card: {
    width: "100%",
    minHeight: isSmallDevice ? 100 : 115,
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

  // slides 1-3
  affArea: {
    flex: 1,
    paddingHorizontal: CONTENT_HORIZONTAL_PADDING,
  },
  pillarRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: isSmallDevice ? 14 : 18,
    paddingTop: isSmallDevice ? 22 : 30,
    paddingBottom: isSmallDevice ? 22 : 30,
  },
  pillarIndicator: {
    width: isSmallDevice ? 88 : 96,
    height: isSmallDevice ? 88 : 96,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    gap: 6,
  },
  pillarShort: {
    fontSize: 12,
    fontFamily: Fonts.mono,
    color: "rgba(255,255,255,0.5)",
    letterSpacing: 0.3,
    textTransform: "lowercase",
  },
  affDescRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 14,
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
    marginBottom: 12,
    marginTop: 6,
  },
  shuffleBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  msgsWrap: { gap: 9 },
  msgCard: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    borderRadius: 15,
    paddingVertical: isSmallDevice ? 12 : 14,
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

  // slide 4
  recArea: {
    flex: 1,
    minHeight: 0,
  },
  recHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: HEADER_HORIZONTAL_PADDING,
    paddingTop: HEADER_TOP_PADDING,
    paddingBottom: 12,
  },
  recBody: {
    flex: 1,
    minHeight: 0,
  },
  recList: {
    flex: 1,
    minHeight: 0,
    overflow: "visible",
  },
  recHeaderLeft: { flex: 1 },
  recTitle: {
    fontFamily: Fonts.serif,
    fontSize: isSmallDevice ? 26 : 30,
    color: Colors.text,
    lineHeight: 40,
    marginBottom: 6,
  },
  recSubtitle: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  micDecor: {
    fontSize: 48,
    marginLeft: 8,
    marginTop: 4,
  },
  trackListContent: {
    paddingHorizontal: CONTENT_HORIZONTAL_PADDING,
    paddingTop: 4,
    paddingBottom: 24,
    marginTop: 50,
  },
  trackListContentEmpty: {
    flexGrow: 1,
  },
  emptyTracksText: {
    marginTop: 24,
    paddingHorizontal: 24,
    fontFamily: Fonts.mono,
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: "center",
  },
  trackRow: { marginBottom: 12 },
  trackOuter: {
    borderRadius: Layout.borderRadius,
    borderWidth: 2,
    padding: 4,
  },
  trackInner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.background,
    borderRadius: Layout.borderRadius - 4,
    paddingLeft: 6,
    paddingRight: 14,
    paddingVertical: 14,
  },
  trackTextWrap: {
    flex: 1,
    marginRight: 12,
    marginLeft: 12,
  },
  trackText: {
    fontFamily: Fonts.mono,
    fontSize: 13,
    color: Colors.text,
    lineHeight: 19,
    marginBottom: 4,
  },
  trackSub: {
    fontFamily: Fonts.mono,
    fontSize: 11,
    color: Colors.textSecondary,
  },
  trackActionBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#1e1e1e",
    alignItems: "center",
    justifyContent: "center",
  },

  // slide 5 — frequency
  freqArea: {
    flex: 1,
    paddingTop: HEADER_TOP_PADDING,
    gap: 16,
  },
  freqHeaderPadded: {
    paddingHorizontal: CONTENT_HORIZONTAL_PADDING,
  },
  freqGridSection: {
    paddingHorizontal: CONTENT_HORIZONTAL_PADDING,
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
    fontSize: isSmallDevice ? 26 : 30,
    color: Colors.text,
    lineHeight: 40,
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
    marginBottom: 18,
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
    paddingHorizontal: 14,
    paddingVertical: 7,
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
    fontSize: 14,
    color: Colors.textSecondary,
  },
  bgTextSelected: { color: Colors.text },
  freqGridContainer: { overflow: "hidden" },
  brainwaveDisclaimer: {
    fontFamily: Fonts.mono,
    fontSize: 11,
    color: Colors.textSecondary,
    lineHeight: 16,
    marginTop: 6,
    textAlign: "center",
  },
  freqList: { flexGrow: 0 },
  freqRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
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
    fontSize: 24,
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
