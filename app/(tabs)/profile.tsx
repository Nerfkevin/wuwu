
import React, { useCallback, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Image,
  Linking,
  Platform,
  Dimensions,
} from 'react-native';
import { RecordingMicModal } from '@/components/RecordingMicModal';
import { getRecordingMicPref } from '@/lib/recording-mic-preference';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';
import { getSavedRecordings, clearAllRecordings } from '@/lib/recording-store';
import { formatPlayTime, getProfileStats, clearProfileStats } from '@/lib/profile-stats';
import * as StoreReview from 'expo-store-review';
import { useRouter } from 'expo-router';
import {
  openBrowserAsync,
  WebBrowserPresentationStyle,
} from 'expo-web-browser';
import { Colors, Fonts, Layout } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { usePostHog, usePostHogScreenViewed } from '@/lib/posthog';
import { ScalePressable } from '@/components/ScalePressable';

const { width: screenWidth } = Dimensions.get('window');
const isSmallDevice = screenWidth < 380;

const TERMS_URL = 'https://98goats.com/wuwu/terms';
const PRIVACY_URL = 'https://98goats.com/wuwu/privacy';
const SUPPORT_EMAIL = 'hello@98goats.com';
const ANDROID_PACKAGE = 'com.nerfkevin.wuwu';

async function openInAppBrowser(url: string) {
  await openBrowserAsync(url, {
    presentationStyle: WebBrowserPresentationStyle.AUTOMATIC,
  });
}

async function openLeaveReview() {
  try {
    if (await StoreReview.hasAction()) {
      await StoreReview.requestReview();
      return;
    }
  } catch {
    /* native review may fail in dev */
  }
  const store = StoreReview.storeUrl();
  if (store) {
    await Linking.openURL(store);
    return;
  }
  if (Platform.OS === 'android') {
    const play =
      `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;
    await Linking.openURL(play);
  }
}

const defaultBuiltInMicLabel =
  Platform.OS === 'ios' ? 'iPhone microphone' : 'Device microphone';

export default function ProfileScreen() {
  usePostHogScreenViewed({
    screen: "tabs/profile",
    component: "ProfileScreen",
  });

  const ph = usePostHog();
  const router = useRouter();
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);
  const [playTimeValue, setPlayTimeValue] = useState('0:00');
  const [playTimeLabel, setPlayTimeLabel] = useState('Minutes Played');
  const [sessionCount, setSessionCount] = useState('0');
  const [recordedCount, setRecordedCount] = useState('0');
  const [micModalOpen, setMicModalOpen] = useState(false);
  const [micSummary, setMicSummary] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void Promise.all([
        SecureStore.getItemAsync('user_name'),
        getProfileStats(),
        getSavedRecordings(),
        getRecordingMicPref(),
      ]).then(([n, stats, recordings, micPref]) => {
        if (cancelled) return;
        setUserName(n);
        const pt = formatPlayTime(stats.totalPlayMs);
        setPlayTimeValue(pt.value);
        setPlayTimeLabel(pt.label);
        setSessionCount(String(stats.sessionCount));
        setRecordedCount(String(recordings.length));
        setMicSummary(micPref?.name ?? null);
      });
      return () => {
        cancelled = true;
      };
    }, [])
  );

  const greeting = userName?.trim()
    ? `Hi, ${userName.trim()}`
    : 'Hi there';

  const handleClearAllData = async () => {
    setClearing(true);
    try {
      await Promise.all([
        clearAllRecordings(),
        clearProfileStats(),
        SecureStore.deleteItemAsync('onboarding_completed'),
      ]);
      try { ph?.capture('clear_all_data', { component: 'ProfileScreen' }); } catch {}
      router.replace('/(onboarding)/screen1');
    } catch {
      setClearing(false);
      setConfirmClear(false);
    }
  };

  return (
    <View style={styles.wrapper}>
      <LinearGradient
        colors={[Colors.background, '#1A0B2E', Colors.background]}
        locations={[0, 0.4, 1]}
        style={StyleSheet.absoluteFill}
      />
      <ScrollView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.avatarContainer}>
          <Image
            source={require('@/assets/images/onboarding/orb1.png')}
            style={styles.avatarImage}
            resizeMode="contain"
          />
        </View>
        <Text style={styles.username}>{greeting}</Text>
      </View>

      <View style={styles.statsContainer}>
        <View style={[styles.statSide, styles.statSideLeft]}>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{playTimeValue}</Text>
            <Text style={styles.statLabel}>{playTimeLabel}</Text>
          </View>
        </View>
        <View style={styles.statCenter}>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{sessionCount}</Text>
            <Text style={styles.statLabel}>Sessions</Text>
          </View>
        </View>
        <View style={[styles.statSide, styles.statSideRight]}>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{recordedCount}</Text>
            <Text style={styles.statLabel}>Recorded</Text>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <ScalePressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => {
            if (Platform.OS !== 'web') setMicModalOpen(true);
          }}
          disabled={Platform.OS === 'web'}
        >
          <Ionicons name="mic-outline" size={24} color={Colors.text} />
          <Text style={styles.rowText}>
            Using {micSummary ?? defaultBuiltInMicLabel}
          </Text>
          {Platform.OS !== 'web' ? <Text style={styles.editLink}>Edit</Text> : null}
        </ScalePressable>
      </View>

      <RecordingMicModal
        visible={micModalOpen}
        onClose={() => setMicModalOpen(false)}
        onApplied={(summary) => setMicSummary(summary)}
      />

      <View style={styles.section}>
        <ScalePressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => void openInAppBrowser(PRIVACY_URL)}
        >
          <Text style={styles.rowTextFull}>Privacy Policy</Text>
          <Ionicons
            name="shield-checkmark-outline"
            size={20}
            color={Colors.textSecondary}
          />
        </ScalePressable>
        <View style={styles.divider} />
        <ScalePressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => void openInAppBrowser(TERMS_URL)}
        >
          <Text style={styles.rowTextFull}>Terms of Service</Text>
          <Ionicons
            name="document-text-outline"
            size={20}
            color={Colors.textSecondary}
          />
        </ScalePressable>
        <View style={styles.divider} />
        <ScalePressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => {
            try { ph?.capture('review_requested', { component: 'ProfileScreen' }); } catch {}
            void openLeaveReview();
          }}
        >
          <Text style={styles.rowTextFull}>Leave a review</Text>
          <Ionicons name="star-outline" size={20} color={Colors.textSecondary} />
        </ScalePressable>
        <View style={styles.divider} />
        <ScalePressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() =>
            void Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=Wu-Wu%20support`)
          }
        >
          <Text style={styles.rowTextFull}>Contact Support</Text>
          <Ionicons name="mail-outline" size={20} color={Colors.textSecondary} />
        </ScalePressable>
      </View>

      <View style={[styles.section, styles.dangerSection]}>
        {confirmClear ? (
          <View style={styles.confirmContainer}>
            <Text style={styles.confirmTitle}>Are you sure?</Text>
            <Text style={styles.confirmBody}>
              This will permanently delete all your recordings, reset your stats, and restart onboarding. This cannot be undone.
            </Text>
            <View style={styles.confirmActions}>
              <ScalePressable
                style={({ pressed }) => [styles.cancelBtn, pressed && styles.rowPressed]}
                onPress={() => setConfirmClear(false)}
                disabled={clearing}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </ScalePressable>
              <ScalePressable
                style={({ pressed }) => [styles.confirmBtn, pressed && styles.rowPressed]}
                onPress={() => void handleClearAllData()}
                disabled={clearing}
              >
                <Text style={styles.confirmBtnText}>
                  {clearing ? 'Clearing…' : 'Yes, clear everything'}
                </Text>
              </ScalePressable>
            </View>
          </View>
        ) : (
          <ScalePressable
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={() => setConfirmClear(true)}
          >
            <Ionicons name="trash-outline" size={20} color="#FF453A" />
            <Text style={styles.dangerRowText}>Clear All Data</Text>
          </ScalePressable>
        )}
      </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  container: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    paddingTop: isSmallDevice ? 60 : 80,
    paddingBottom: isSmallDevice ? 28 : 40,
  },
  avatarContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#222',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  avatarImage: {
    width: 72,
    height: 72,
  },
  username: {
    fontFamily: Fonts.serif,
    fontSize: isSmallDevice ? 20 : 24,
    color: Colors.text,
  },
  statsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    marginBottom: 40,
  },
  statSide: {
    flex: 1,
    minWidth: 0,
  },
  statSideLeft: {
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  statSideRight: {
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  statCenter: {
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontFamily: Fonts.serifBold,
    fontSize: isSmallDevice ? 26 : 32,
    color: Colors.text,
  },
  statLabel: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 4,
    textTransform: 'uppercase',
  },
  section: {
    borderRadius: Layout.borderRadius,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  rowPressed: {
    opacity: 0.7,
  },
  rowText: {
    fontFamily: Fonts.mono,
    fontSize: 16,
    color: Colors.text,
    flex: 1,
    marginLeft: 16,
  },
  rowTextFull: {
    fontFamily: Fonts.mono,
    fontSize: 16,
    color: Colors.text,
    flex: 1,
  },
  editLink: {
    fontFamily: Fonts.mono,
    fontSize: 14,
    color: Colors.chakra.blue,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginLeft: 0,
  },
  dangerSection: {
    borderColor: 'rgba(255,69,58,0.25)',
    backgroundColor: 'rgba(255,69,58,0.05)',
    marginBottom: 100,
    paddingVertical: 4,
  },
  dangerRowText: {
    fontFamily: Fonts.mono,
    fontSize: 16,
    color: '#FF453A',
    flex: 1,
    marginLeft: 12,
  },
  confirmContainer: {
    paddingVertical: 4,
  },
  confirmTitle: {
    fontFamily: Fonts.serifBold,
    fontSize: 18,
    color: '#FF453A',
    marginBottom: 8,
  },
  confirmBody: {
    fontFamily: Fonts.mono,
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: 20,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontFamily: Fonts.mono,
    fontSize: 15,
    color: Colors.text,
  },
  confirmBtn: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(255,69,58,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,69,58,0.4)',
    alignItems: 'center',
  },
  confirmBtnText: {
    fontFamily: Fonts.mono,
    fontSize: 15,
    color: '#FF453A',
  },
});
