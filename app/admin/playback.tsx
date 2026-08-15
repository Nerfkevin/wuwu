import React, { useCallback, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
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
  getAdminPlaybackSettings,
  isAdminUnlocked,
  setStartDelaySec,
  setTrackGapSec,
} from '@/lib/admin-settings';
import { usePostHogScreenViewed } from '@/lib/posthog';

const { width: screenWidth } = Dimensions.get('window');
const isSmallDevice = screenWidth < 380;

const SEC_OPTIONS = Array.from(
  { length: ADMIN_TIMING_MAX_SEC - ADMIN_TIMING_MIN_SEC + 1 },
  (_, i) => ADMIN_TIMING_MIN_SEC + i
);

function SecPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <View style={styles.pickerRow}>
      {SEC_OPTIONS.map((sec) => {
        const selected = sec === value;
        return (
          <Pressable
            key={sec}
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onChange(sec);
            }}
            style={[styles.secChip, selected && styles.secChipSelected]}
          >
            <Text style={[styles.secChipText, selected && styles.secChipTextSelected]}>
              {sec}
            </Text>
          </Pressable>
        );
      })}
    </View>
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
            <Text style={styles.valueLabel}>{trackGapSec}s</Text>
            <SecPicker value={trackGapSec} onChange={(s) => void handleGapChange(s)} />
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Start delay</Text>
            <Text style={styles.cardSubtitle}>
              Wait after pressing play before the first affirmation begins. Ambient /
              frequency audio still starts immediately.
            </Text>
            <Text style={styles.valueLabel}>{startDelaySec}s</Text>
            <SecPicker value={startDelaySec} onChange={(s) => void handleDelayChange(s)} />
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
    marginBottom: 14,
  },
  pickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  secChip: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secChipSelected: {
    backgroundColor: Colors.text,
    borderColor: Colors.text,
  },
  secChipText: {
    fontFamily: Fonts.mono,
    fontSize: 14,
    color: Colors.text,
  },
  secChipTextSelected: {
    color: '#000',
  },
});
