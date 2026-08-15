
import React, { useCallback, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Image,
  Linking,
  Platform,
  Dimensions,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Pressable,
} from 'react-native';
import { RecordingMicModal } from '@/components/RecordingMicModal';
import { getRecordingMicPref } from '@/lib/recording-mic-preference';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';
import { getSavedRecordings, clearAllRecordings } from '@/lib/recording-store';
import { formatPlayTime, getProfileStats, clearProfileStats } from '@/lib/profile-stats';
import {
  clearStoreReviewPromptState,
  markStoreReviewCompleted,
} from '@/lib/store-review-prompt';
import {
  ADMIN_TAP_THRESHOLD,
  isAdminUnlocked,
  setAdminUnlocked,
  verifyAdminPassword,
} from '@/lib/admin-settings';
import { useRouter, type Href } from 'expo-router';
import {
  openBrowserAsync,
  WebBrowserPresentationStyle,
} from 'expo-web-browser';
import { Colors, Fonts, Layout } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { usePostHog, usePostHogScreenViewed } from '@/lib/posthog';
import { ScalePressable } from '@/components/ScalePressable';
import * as Haptics from 'expo-haptics';

const { width: screenWidth } = Dimensions.get('window');
const isSmallDevice = screenWidth < 380;

const TERMS_URL = 'https://98goats.com/wuwu/terms';
const PRIVACY_URL = 'https://98goats.com/wuwu/privacy';
const SUPPORT_EMAIL = 'hello@98goats.com';
const IOS_APP_STORE_ID = '6760009072';
const ANDROID_PACKAGE = 'com.nerfkevin.wuwu';

/** Explicit review CTA — open store write-review page (requestReview is unreliable for buttons). */
function getLeaveReviewUrl(): string | null {
  if (Platform.OS === 'ios') {
    return `https://apps.apple.com/app/id${IOS_APP_STORE_ID}?action=write-review`;
  }
  if (Platform.OS === 'android') {
    return `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;
  }
  return null;
}

async function openInAppBrowser(url: string) {
  await openBrowserAsync(url, {
    presentationStyle: WebBrowserPresentationStyle.AUTOMATIC,
  });
}

async function openLeaveReview() {
  const url = getLeaveReviewUrl();
  if (!url) return;
  await markStoreReviewCompleted();
  await Linking.openURL(url);
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
  const [clearing, setClearing] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);
  const [playTimeValue, setPlayTimeValue] = useState('0:00');
  const [playTimeLabel, setPlayTimeLabel] = useState('Minutes Played');
  const [sessionCount, setSessionCount] = useState('0');
  const [recordedCount, setRecordedCount] = useState('0');
  const [micModalOpen, setMicModalOpen] = useState(false);
  const [micSummary, setMicSummary] = useState<string | null>(null);
  const [adminUnlocked, setAdminUnlockedState] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState(false);
  const adminTapCountRef = useRef(0);
  const adminTapResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void Promise.all([
        SecureStore.getItemAsync('user_name'),
        getProfileStats(),
        getSavedRecordings(),
        getRecordingMicPref(),
        isAdminUnlocked(),
      ]).then(([n, stats, recordings, micPref, unlocked]) => {
        if (cancelled) return;
        setUserName(n);
        const pt = formatPlayTime(stats.totalPlayMs);
        setPlayTimeValue(pt.value);
        setPlayTimeLabel(pt.label);
        setSessionCount(String(stats.sessionCount));
        setRecordedCount(String(recordings.length));
        setMicSummary(micPref?.name ?? null);
        setAdminUnlockedState(unlocked);
      });
      return () => {
        cancelled = true;
      };
    }, [])
  );

  const handleRecordedSecretTap = () => {
    if (adminUnlocked) return;
    if (adminTapResetRef.current) clearTimeout(adminTapResetRef.current);
    adminTapCountRef.current += 1;
    if (adminTapCountRef.current >= ADMIN_TAP_THRESHOLD) {
      adminTapCountRef.current = 0;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPasswordInput('');
      setPasswordError(false);
      setPasswordModalOpen(true);
      return;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    adminTapResetRef.current = setTimeout(() => {
      adminTapCountRef.current = 0;
    }, 1500);
  };

  const handlePasswordSubmit = async () => {
    if (!verifyAdminPassword(passwordInput)) {
      setPasswordError(true);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    await setAdminUnlocked(true);
    setAdminUnlockedState(true);
    setPasswordModalOpen(false);
    setPasswordInput('');
    setPasswordError(false);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const greeting = userName?.trim()
    ? `Hi, ${userName.trim()}`
    : 'Hi there';

  const handleClearAllData = async () => {
    setClearing(true);
    try {
      await Promise.all([
        clearAllRecordings(),
        clearProfileStats(),
        clearStoreReviewPromptState(),
        SecureStore.deleteItemAsync('onboarding_completed'),
        SecureStore.deleteItemAsync('streak_count'),
        SecureStore.deleteItemAsync('streak_last_date'),
      ]);
      try { ph?.capture('clear_all_data', { component: 'ProfileScreen' }); } catch {}
      router.replace('/(onboarding)/screen1');
    } catch {
      setClearing(false);
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
            <Pressable onPress={handleRecordedSecretTap} hitSlop={12}>
              <Text style={styles.statLabel}>Recorded</Text>
            </Pressable>
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

      <Modal
        visible={passwordModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPasswordModalOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.passwordOverlay}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setPasswordModalOpen(false)}
          />
          <View style={styles.passwordCard}>
            <Text style={styles.passwordTitle}>Admin Access</Text>
            <Text style={styles.passwordSubtitle}>Enter password</Text>
            <TextInput
              style={[styles.passwordInput, passwordError && styles.passwordInputError]}
              value={passwordInput}
              onChangeText={(t) => {
                setPasswordInput(t);
                setPasswordError(false);
              }}
              secureTextEntry
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={() => void handlePasswordSubmit()}
              placeholder="Password"
              placeholderTextColor={Colors.textSecondary}
            />
            {passwordError ? (
              <Text style={styles.passwordErrorText}>Incorrect password</Text>
            ) : null}
            <View style={styles.passwordActions}>
              <ScalePressable
                style={({ pressed }) => [
                  styles.passwordBtn,
                  styles.passwordBtnCancel,
                  pressed && styles.rowPressed,
                ]}
                onPress={() => setPasswordModalOpen(false)}
              >
                <Text style={styles.passwordBtnCancelText}>Cancel</Text>
              </ScalePressable>
              <ScalePressable
                style={({ pressed }) => [
                  styles.passwordBtn,
                  styles.passwordBtnSubmit,
                  pressed && styles.rowPressed,
                ]}
                onPress={() => void handlePasswordSubmit()}
              >
                <Text style={styles.passwordBtnSubmitText}>Unlock</Text>
              </ScalePressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <View style={styles.section}>
        {adminUnlocked ? (
          <>
            <ScalePressable
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() => router.push('/admin/playback' as Href)}
            >
              <Text style={styles.rowTextFull}>Default Settings</Text>
              <Ionicons
                name="settings-outline"
                size={20}
                color={Colors.textSecondary}
              />
            </ScalePressable>
            <View style={styles.divider} />
          </>
        ) : null}
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
        <ScalePressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() =>
            Alert.alert(
              'Clear All Data',
              'This will permanently delete all your recordings, reset your stats, and restart onboarding. This cannot be undone.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Clear Everything', style: 'destructive', onPress: () => void handleClearAllData() },
              ]
            )
          }
          disabled={clearing}
        >
          <Ionicons name="trash-outline" size={20} color="#FF453A" />
          <Text style={styles.dangerRowText}>Clear All Data</Text>
        </ScalePressable>
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
  passwordOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  passwordCard: {
    borderRadius: Layout.borderRadius,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: '#1A1524',
    padding: 22,
  },
  passwordTitle: {
    fontFamily: Fonts.serif,
    fontSize: 22,
    color: Colors.text,
    marginBottom: 4,
  },
  passwordSubtitle: {
    fontFamily: Fonts.mono,
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 16,
  },
  passwordInput: {
    fontFamily: Fonts.mono,
    fontSize: 16,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  passwordInputError: {
    borderColor: '#FF453A',
  },
  passwordErrorText: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    color: '#FF453A',
    marginTop: 8,
  },
  passwordActions: {
    flexDirection: 'row',
    marginTop: 18,
    gap: 10,
  },
  passwordBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
  },
  passwordBtnCancel: {
    borderWidth: 1,
    borderColor: Colors.border,
  },
  passwordBtnSubmit: {
    backgroundColor: Colors.text,
  },
  passwordBtnCancelText: {
    fontFamily: Fonts.mono,
    fontSize: 14,
    color: Colors.text,
  },
  passwordBtnSubmitText: {
    fontFamily: Fonts.mono,
    fontSize: 14,
    color: '#000',
  },
});
