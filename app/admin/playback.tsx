import React, { useCallback, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts, Layout } from '@/constants/theme';
import { ScalePressable } from '@/components/ScalePressable';
import {
  ADMIN_TIMING_MAX_SEC,
  ADMIN_TIMING_MIN_SEC,
  ADMIN_TIMING_STEP_SEC,
  getAdminPlaybackSettings,
  isAdminUnlocked,
  setStartDelaySec,
  setTrackGapSec,
} from '@/lib/admin-settings';
import GradientSnapSlider from '@/components/gradient-snap-slider';
import { usePostHogScreenViewed } from '@/lib/posthog';

const { width: screenWidth } = Dimensions.get('window');
const isSmallDevice = screenWidth < 380;

function formatSec(value: number) {
  return `${value.toFixed(1)}s`;
}

function TimingSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <GradientSnapSlider
      minimumValue={ADMIN_TIMING_MIN_SEC}
      maximumValue={ADMIN_TIMING_MAX_SEC}
      step={ADMIN_TIMING_STEP_SEC}
      value={value}
      onValueChange={(next) => {
        const stepped =
          Math.round(next / ADMIN_TIMING_STEP_SEC) * ADMIN_TIMING_STEP_SEC;
        const rounded = Math.round(stepped * 10) / 10;
        if (rounded === value) return;
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onChange(rounded);
      }}
    />
  );
}

export default function AdminPlaybackScreen() {
  usePostHogScreenViewed({
    screen: 'admin/playback',
    component: 'AdminPlaybackScreen',
  });

  const router = useRouter();
  const [trackGapSec, setTrackGapSecState] = useState(5);
  const [startDelaySec, setStartDelaySecState] = useState(3);
  const [ready, setReady] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void (async () => {
        const unlocked = await isAdminUnlocked();
        if (!unlocked) {
          if (!cancelled) router.back();
          return;
        }
        const settings = await getAdminPlaybackSettings();
        if (cancelled) return;
        setTrackGapSecState(settings.trackGapSec);
        setStartDelaySecState(settings.startDelaySec);
        setReady(true);
      })();
      return () => {
        cancelled = true;
      };
    }, [router])
  );

  const handleGapChange = async (sec: number) => {
    setTrackGapSecState(sec);
    await setTrackGapSec(sec);
  };

  const handleDelayChange = async (sec: number) => {
    setStartDelaySecState(sec);
    await setStartDelaySec(sec);
  };

  if (!ready) {
    return <View style={styles.wrapper} />;
  }

  return (
    <View style={styles.wrapper}>
      <LinearGradient
        colors={[Colors.background, '#1A0B2E', Colors.background]}
        locations={[0, 0.4, 1]}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <ScalePressable
            style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
            onPress={() => router.back()}
            hitSlop={12}
          >
            <Ionicons name="chevron-back" size={24} color={Colors.text} />
          </ScalePressable>
          <Text style={styles.headerTitle}>Default Settings</Text>
          <View style={styles.backBtn} />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Gap between affirmations</Text>
            <Text style={styles.cardSubtitle}>
              Silence after each affirmation ends before the next one starts.
            </Text>
            <Text style={styles.valueLabel}>{formatSec(trackGapSec)}</Text>
            <TimingSlider value={trackGapSec} onChange={(s) => void handleGapChange(s)} />
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Start delay</Text>
            <Text style={styles.cardSubtitle}>
              Wait after pressing play before the first affirmation, ambient, and
              frequency audio begin.
            </Text>
            <Text style={styles.valueLabel}>{formatSec(startDelaySec)}</Text>
            <TimingSlider value={startDelaySec} onChange={(s) => void handleDelayChange(s)} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  safe: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: Fonts.serif,
    fontSize: isSmallDevice ? 20 : 22,
    color: Colors.text,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  card: {
    borderRadius: Layout.borderRadius,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 20,
    marginBottom: 16,
  },
  cardTitle: {
    fontFamily: Fonts.serif,
    fontSize: 20,
    color: Colors.text,
    marginBottom: 6,
  },
  cardSubtitle: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 18,
    marginBottom: 14,
  },
  valueLabel: {
    fontFamily: Fonts.serifBold,
    fontSize: 28,
    color: Colors.text,
    marginBottom: 8,
  },
});
