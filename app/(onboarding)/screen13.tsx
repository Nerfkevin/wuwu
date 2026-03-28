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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAudioPlayer } from "@/lib/expo-audio";
import type { AudioPlayer } from "@/lib/expo-audio";
import { useFrequencyPreview } from "@/lib/use-frequency-preview";
import { Fonts, Colors, Layout } from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
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

const { width } = Dimensions.get("window");
const isSmallDevice = width < 380;
const TOTAL_SLIDES = 6; // 0=pillar grid, 1-3=affirmations, 4=record, 5=frequency
const MSG_COUNT    = 5;

// ─── frequency slide constants ────────────────────────────────────────────────

const FREQ_ITEM_SIZE   = (width - 40 - 24) / 3;
const FREQ_ITEM_RADIUS = 24;
const FREQ_GRID_HEIGHT = FREQ_ITEM_SIZE * 3 + 12 * 2;

const FREQUENCIES = [
  { id: "174", hz: "174 Hz", label: "Pain",      color: Colors.chakra.red    },
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

type RecordingSelectionSnapshot = {
  pillars: string[];
  messages: Record<string, string>;
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
  onSelect,
}: {
  item: (typeof FREQUENCIES)[0];
  isSelected: boolean;
  onSelect: () => void;
}) {
  const [glowState, setGlowState] = useState<GlowEvent>("default");
  useEffect(() => {
    setGlowState(isSelected ? "press" : "default");
  }, [isSelected]);
  return (
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
      >
        <Text style={styles.freqHz}>{item.hz}</Text>
        <Text style={styles.freqLabel}>{item.label}</Text>
      </Pressable>
    </AnimatedGlow>
  );
}

// ─── pillar card (slide 0) ────────────────────────────────────────────────────

function PillarCard({ item, isSelected, onSelect }: {
  item: PillarItem; isSelected: boolean; onSelect: () => void;
}) {
  const [glowState, setGlowState] = useState<GlowEvent>("default");
  return (
    <View style={styles.cardWrapper}>
      <AnimatedGlow preset={GlowPresets.ripple(24, item.color)} activeState={isSelected ? "hover" : glowState}>
        <Pressable
          style={[styles.card, isSelected && { backgroundColor: "#1A1A1E" }]}
          onPress={onSelect}
          onPressIn={() => setGlowState("press")}
          onPressOut={() => setGlowState("default")}
        >
          <View style={styles.cardContent}>
            <Ionicons name={item.icon} size={34} color={item.color} style={styles.cardIcon} />
            <Text style={styles.cardTitle}>{item.title}</Text>
          </View>
        </Pressable>
      </AnimatedGlow>
    </View>
  );
}

// ─── main screen ─────────────────────────────────────────────────────────────

export default function Screen13() {
  const { contentOpacity, fadeIn, navigateTo } = useOnboardingNav();
  const router = useRouter();

  // ── slide state ──
  const [activeIndex, setActiveIndex]         = useState(0);
  const [selectedPillars, setSelectedPillars] = useState<string[]>([]);
  const [selectedMessages, setSelectedMessages] = useState<Record<string, string>>({});
  const [shuffledMessages, setShuffledMessages] = useState<Record<string, string[]>>({});

  // ── frequency slide state ──
  const [selectedFreq,       setSelectedFreq]       = useState("528");
  const { previewFrequency, previewBrainwave } = useFrequencyPreview();
  const [selectedBg,         setSelectedBg]         = useState<typeof BG_OPTIONS[number]>("Brainwaves");
  const [selectedBrainwave,  setSelectedBrainwave]  = useState("alpha");

  // ── recording slide state ──
  const [savedRecordingsByText, setSavedRecordingsByText] = useState<Record<string, { uri: string }>>({});
  const [playingId, setPlayingId]                         = useState<string | null>(null);
  const playerRef      = useRef<AudioPlayer | null>(null);
  const statusTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const selectionRef = useRef<{
    pillars: string[];
    messages: Record<string, string>;
  }>({
    pillars: [],
    messages: {},
  });

  // ── animation refs ──
  const dotAnims = useRef(
    Array.from({ length: TOTAL_SLIDES }, (_, i) => new Animated.Value(i === 0 ? 1 : 0.3))
  ).current;
  const fadeQ        = useRef(new Animated.Value(0)).current;
  const fadeGrid     = useRef(new Animated.Value(0)).current;
  const fadeAff      = useRef(new Animated.Value(0)).current;
  const fadeMsgs     = useRef(new Animated.Value(1)).current;
  const fadeRec      = useRef(new Animated.Value(0)).current;
  const fadeFreq     = useRef(new Animated.Value(0)).current;
  const fadeContinue = useRef(new Animated.Value(0)).current;

  // pillar indicator scale/opacity (3 values)
  const pillarScales    = useRef([new Animated.Value(1), new Animated.Value(0.78), new Animated.Value(0.78)]).current;
  const pillarOpacities = useRef([new Animated.Value(1), new Animated.Value(0.35), new Animated.Value(0.35)]).current;

  // keep a ref of activeIndex for useFocusEffect
  const activeIndexRef = useRef(0);
  useEffect(() => { activeIndexRef.current = activeIndex; }, [activeIndex]);

  const loadStoredOnboardingSelection = useCallback(async () => {
    const [rawPillars, rawMessages] = await Promise.all([
      AsyncStorage.getItem("onboarding_pillars_selected"),
      AsyncStorage.getItem("onboarding_affirmations"),
    ]);

    const storedPillars: string[] = rawPillars ? JSON.parse(rawPillars) : [];
    const storedMessages: Record<string, string> = rawMessages ? JSON.parse(rawMessages) : {};

    return {
      pillars: storedPillars.filter((pillar, index) => storedPillars.indexOf(pillar) === index),
      messages: storedMessages,
    } satisfies RecordingSelectionSnapshot;
  }, []);

  const loadSavedRecordingMeta = useCallback(async () => {
    const recordings = await getSavedRecordings();
    setSavedRecordingsByText(
      Object.fromEntries(recordings.map((recording) => [recording.text, { uri: recording.uri }]))
    );
  }, []);

  const recordingItems = React.useMemo(() => {
    const orderedPillars = selectedPillars.filter(
      (pillar, index) =>
        selectedPillars.indexOf(pillar) === index && !!selectedMessages[pillar]?.trim()
    );

    return orderedPillars.map((pillar, index) => {
      const text = selectedMessages[pillar];
      const saved = savedRecordingsByText[text];

      return {
        id: `track-${index}-${pillar}`,
        text,
        pillar,
        uri: saved?.uri,
        recorded: !!saved?.uri,
      };
    });
  }, [savedRecordingsByText, selectedMessages, selectedPillars]);

  // ── init ──
  useEffect(() => {
    fadeIn();
    Animated.stagger(80, [
      Animated.timing(fadeQ,    { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(fadeGrid, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();

    loadStoredOnboardingSelection().then((storedSelection) => {
      if (!selectionRef.current.pillars.length && storedSelection.pillars.length) {
        selectionRef.current = storedSelection;
        setSelectedPillars(storedSelection.pillars);
        setSelectedMessages(storedSelection.messages);
      }
    });
  }, []);

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

  // ── canContinue ──

  const currentAffPillar = activeIndex >= 1 && activeIndex <= 3 ? selectedPillars[activeIndex - 1] : null;

  const canContinue =
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
    selectionRef.current.pillars.forEach(v => { msgs[v] = shuffleArr(AFFIRMATION_PILLARS[v as PillarKey].messages); });
    setShuffledMessages(msgs);
    Animated.parallel([
      Animated.timing(fadeGrid, { toValue: 0, duration: 220, useNativeDriver: true }),
      Animated.timing(fadeQ,    { toValue: 0, duration: 180, useNativeDriver: true }),
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
      Animated.timing(fadeRec, { toValue: 1, duration: 350, useNativeDriver: true }).start();
    });
  };

  const goToFrequencySlide = () => {
    Animated.timing(fadeRec, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => {
      fadeFreq.setValue(0);
      setActiveIndex(5);
      Animated.timing(fadeFreq, { toValue: 1, duration: 350, useNativeDriver: true }).start();
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

      selectionRef.current = {
        pillars: next,
        messages: Object.fromEntries(
          Object.entries(selectionRef.current.messages).filter(([pillar]) => next.includes(pillar))
        ),
      };
      setSelectedMessages(selectionRef.current.messages);

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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (activeIndex === 0) {
      await AsyncStorage.setItem(
        "onboarding_pillars_selected",
        JSON.stringify(selectionRef.current.pillars)
      );
      goToAffirmations();
    } else if (activeIndex < 3) {
      goToNextAff(activeIndex + 1);
    } else if (activeIndex === 3) {
      await AsyncStorage.setItem(
        "onboarding_pillars_selected",
        JSON.stringify(selectionRef.current.pillars)
      );
      await AsyncStorage.setItem(
        "onboarding_affirmations",
        JSON.stringify(selectionRef.current.messages)
      );
      goToRecordingSlide();
    } else if (activeIndex === 4) {
      goToFrequencySlide();
    } else {
      await AsyncStorage.setItem("onboarding_freq",       selectedFreq);
      await AsyncStorage.setItem("onboarding_freq_bg",    selectedBg);
      await AsyncStorage.setItem("onboarding_brainwave",  selectedBrainwave);
      navigateTo("/(onboarding)/screen14");
    }
  };

  // ── recording slide render helper ──

  const renderTrackItem = ({ item }: { item: TrackItem }) => {
    const pillarData   = AFFIRMATION_PILLARS[item.pillar as PillarKey];
    const glowColor    = pillarData?.color ?? Colors.chakra.violet;
    const isNowPlaying = playingId === item.id;

    return (
      <View style={styles.trackRow}>
        <AnimatedGlow
          preset={GlowPresets.vaporwave(Layout.borderRadius, glowColor)}
          activeState="default"
        >
          <View style={[
            styles.trackOuter,
            { borderColor: glowColor },
          ]}>
            <View style={styles.trackInner}>
              <View style={styles.dragHandle}>
                <Ionicons
                  name="ellipsis-vertical"
                  size={18}
                  color={Colors.textSecondary}
                />
              </View>

              <View style={styles.trackTextWrap}>
                <Text style={styles.trackText} numberOfLines={2}>{item.text}</Text>
                <Text style={styles.trackSub}>{pillarData?.title ?? item.pillar}</Text>
              </View>

              <TouchableOpacity
                style={[styles.trackActionBtn, item.recorded && { backgroundColor: "#333" }]}
                onPress={() => item.recorded ? handlePlay(item) : handleRecord(item)}
              >
                <Ionicons
                  name={!item.recorded ? "mic" : isNowPlaying ? "pause" : "play"}
                  size={20}
                  color={item.recorded ? Colors.text : glowColor}
                />
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
          <Animated.View style={[styles.questionWrap, { opacity: fadeQ }]}>
            <Text style={styles.question}>select affirmation{"\n"}pillar</Text>
            <Text style={styles.hint}>select 3 pillars to begin, you can always add more later!</Text>
          </Animated.View>

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
                      preset={GlowPresets.ripple(24, p.color)}
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

            <Text style={styles.affDesc}>
              choose an affirmation message tape, you can always add more later!
            </Text>

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
                      setSelectedMessages(prev => {
                        const next = { ...prev, [currentAffPillar]: msg };
                        selectionRef.current = {
                          pillars: selectionRef.current.pillars,
                          messages: next,
                        };
                        return next;
                      });
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
          <Animated.View style={[styles.recArea, { opacity: fadeRec }]}>
            <View style={styles.recHeader}>
              <View style={styles.recHeaderLeft}>
                <Text style={styles.recTitle}>record your{"\n"}messages</Text>
                <Text style={styles.recSubtitle}>
                  click on each message and record{"\n"}them in your own voice
                </Text>
              </View>
              <Text style={styles.micDecor}>🎙️</Text>
            </View>

            <View style={styles.recBody}>
              <FlatList
                data={recordingItems}
                renderItem={({ item }) => renderTrackItem({ item })}
                keyExtractor={item => item.id}
                contentContainerStyle={[
                  styles.trackListContent,
                  recordingItems.length === 0 && styles.trackListContentEmpty,
                ]}
                style={styles.recList}
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={<Text style={styles.emptyTracksText}>no selected messages yet</Text>}
              />
            </View>
          </Animated.View>
        )}

        {/* ── slide 5: frequency selection ── */}
        {activeIndex === 5 && (
          <Animated.View style={[styles.freqArea, { opacity: fadeFreq }]}>
            <View style={styles.freqHeaderBlock}>
              <View style={styles.freqHeaderLeft}>
                <Text style={styles.freqTitle}>layer healing{"\n"}frequency</Text>
                <Text style={styles.freqSubtitle}>
                  select a frequency and soundscape{"\n"}that aligns with your subconscious goals
                </Text>
              </View>
              <Ionicons name="pulse" size={48} color={Colors.textSecondary} style={styles.freqDecorIcon} />
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.bgList}
              style={styles.bgScroll}
            >
              {BG_OPTIONS.map(bg => (
                <TouchableOpacity
                  key={bg}
                  style={[styles.bgItem, selectedBg === bg && styles.bgItemSelected]}
                  onPress={() => setSelectedBg(bg)}
                >
                  <Text style={[styles.bgText, selectedBg === bg && styles.bgTextSelected]}>{bg}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={[styles.freqGridContainer, { height: FREQ_GRID_HEIGHT }]}>
              {selectedBg === "Brainwaves" ? (
                <View style={styles.freqList}>
                  <View style={styles.freqRow}>
                    {BRAINWAVES.slice(0, 3).map(item => (
                      <AnimatedGlow
                        key={item.id}
                        preset={GlowPresets.vaporwave(FREQ_ITEM_RADIUS, item.color)}
                        activeState={selectedBrainwave === item.id ? "press" : "default"}
                      >
                        <Pressable
                          style={[
                            styles.freqCard,
                            { borderColor: item.color },
                            selectedBrainwave === item.id && { backgroundColor: item.color + "20" },
                          ]}
                          onPress={() => { setSelectedBrainwave(item.id); previewBrainwave(item.id); }}
                        >
                          <Text style={styles.freqHz}>{item.name}</Text>
                          <Text style={styles.freqBrainHz}>{item.hz}</Text>
                          <Text style={styles.freqLabel}>{item.label}</Text>
                        </Pressable>
                      </AnimatedGlow>
                    ))}
                  </View>
                  <View style={[styles.freqRow, { justifyContent: "center" }]}>
                    {BRAINWAVES.slice(3).map(item => (
                      <AnimatedGlow
                        key={item.id}
                        preset={GlowPresets.vaporwave(FREQ_ITEM_RADIUS, item.color)}
                        activeState={selectedBrainwave === item.id ? "press" : "default"}
                      >
                        <Pressable
                          style={[
                            styles.freqCard,
                            { borderColor: item.color },
                            selectedBrainwave === item.id && { backgroundColor: item.color + "20" },
                          ]}
                          onPress={() => { setSelectedBrainwave(item.id); previewBrainwave(item.id); }}
                        >
                          <Text style={styles.freqHz}>{item.name}</Text>
                          <Text style={styles.freqBrainHz}>{item.hz}</Text>
                          <Text style={styles.freqLabel}>{item.label}</Text>
                        </Pressable>
                      </AnimatedGlow>
                    ))}
                  </View>
                </View>
              ) : (
                <FlatList
                  data={FREQUENCIES}
                  renderItem={({ item }) => (
                    <FrequencyCard
                      item={item}
                      isSelected={selectedFreq === item.id}
                      onSelect={() => { setSelectedFreq(item.id); previewFrequency(item.id, selectedBg); }}
                    />
                  )}
                  keyExtractor={item => item.id}
                  numColumns={3}
                  scrollEnabled={false}
                  columnWrapperStyle={styles.freqRow}
                  contentContainerStyle={styles.freqList}
                />
              )}
            </View>
          </Animated.View>
        )}

        {/* ── footer ── */}
        <View style={styles.footer}>
          <TouchableOpacity onPress={handleContinue} activeOpacity={canContinue ? 0.75 : 1} disabled={!canContinue}>
            <Animated.View style={[styles.continueButton, { backgroundColor: buttonBg }]}>
              <Animated.Text style={[styles.continueText, { color: buttonTextColor }]}>continue</Animated.Text>
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

  // slide 0
  questionWrap: {
    paddingHorizontal: isSmallDevice ? 28 : 32,
    paddingTop: isSmallDevice ? 20 : 28,
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
    paddingHorizontal: isSmallDevice ? 20 : 24,
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
    fontFamily: Fonts.serifBold,
    fontSize: isSmallDevice ? 14 : 16,
    color: Colors.text,
    textAlign: "center",
    lineHeight: 22,
  },
  spacer: { flex: 1 },

  // slides 1-3
  affArea: {
    flex: 1,
    paddingHorizontal: isSmallDevice ? 20 : 24,
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
    borderRadius: 22,
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
    paddingHorizontal: 20,
    paddingTop: 24,
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
    paddingHorizontal: 14,
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
  trackOuterActive: { opacity: 0.92 },
  trackOuterHold:   { transform: [{ scale: 1.015 }] },
  trackInner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.background,
    borderRadius: Layout.borderRadius - 4,
    paddingLeft: 6,
    paddingRight: 14,
    paddingVertical: 14,
  },
  dragHandle: {
    width: 24,
    height: 44,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  trackTextWrap: {
    flex: 1,
    marginLeft: 6,
    marginRight: 12,
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
    paddingHorizontal: 20,
    paddingTop: isSmallDevice ? 16 : 24,
    gap: 16,
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
  bgScroll: { flexGrow: 0, marginTop: 8, marginBottom: 8 },
  bgList: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 2,
  },
  bgItem: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Colors.textSecondary,
  },
  bgItemSelected: {
    borderColor: Colors.text,
    backgroundColor: "#333",
  },
  bgText: {
    fontFamily: Fonts.mono,
    fontSize: 14,
    color: Colors.textSecondary,
  },
  bgTextSelected: { color: Colors.text },
  freqGridContainer: { overflow: "hidden" },
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
