
import React, { useCallback, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Image,
  Pressable,
  Linking,
  Platform,
} from 'react-native';
import { RecordingMicModal } from '@/components/RecordingMicModal';
import { getRecordingMicPref } from '@/lib/recording-mic-preference';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';
import { getSavedRecordings } from '@/lib/recording-store';
import { formatHoursPlayed, getProfileStats } from '@/lib/profile-stats';
import * as StoreReview from 'expo-store-review';
import {
  openBrowserAsync,
  WebBrowserPresentationStyle,
} from 'expo-web-browser';
import { Colors, Fonts, Layout } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { usePostHogScreenViewed } from '@/lib/posthog';

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

  const [userName, setUserName] = useState<string | null>(null);
  const [hoursPlayed, setHoursPlayed] = useState('0');
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
        setHoursPlayed(formatHoursPlayed(stats.totalPlayMs));
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
            <Text style={styles.statNumber}>{hoursPlayed}</Text>
            <Text style={styles.statLabel}>Hours Played</Text>
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
        <Pressable
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
        </Pressable>
      </View>

      <RecordingMicModal
        visible={micModalOpen}
        onClose={() => setMicModalOpen(false)}
        onApplied={(summary) => setMicSummary(summary)}
      />

      <View style={styles.section}>
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => void openInAppBrowser(PRIVACY_URL)}
        >
          <Text style={styles.rowTextFull}>Privacy Policy</Text>
          <Ionicons
            name="shield-checkmark-outline"
            size={20}
            color={Colors.textSecondary}
          />
        </Pressable>
        <View style={styles.divider} />
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => void openInAppBrowser(TERMS_URL)}
        >
          <Text style={styles.rowTextFull}>Terms of Service</Text>
          <Ionicons
            name="document-text-outline"
            size={20}
            color={Colors.textSecondary}
          />
        </Pressable>
        <View style={styles.divider} />
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => void openLeaveReview()}
        >
          <Text style={styles.rowTextFull}>Leave a review</Text>
          <Ionicons name="star-outline" size={20} color={Colors.textSecondary} />
        </Pressable>
        <View style={styles.divider} />
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() =>
            void Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=Wu-Wu%20support`)
          }
        >
          <Text style={styles.rowTextFull}>Contact Support</Text>
          <Ionicons name="mail-outline" size={20} color={Colors.textSecondary} />
        </Pressable>
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
    paddingTop: 80,
    paddingBottom: 40,
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
    fontSize: 24,
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
    fontSize: 32,
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
});
