import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const CHANNEL_ID = "daily-reminders";
const LAST_AFFIRMATION_KEY = "lastAffirmationDate";
const DAILY_ID_KEY = "dailyNotificationId";
const ENABLED_KEY = "notificationsEnabled";

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => {
      try {
        const last = await AsyncStorage.getItem(LAST_AFFIRMATION_KEY);
        const show = last !== todayLocal();
        return {
          shouldShowAlert: show,
          shouldPlaySound: show,
          shouldSetBadge: false,
          shouldShowBanner: show,
          shouldShowList: show,
        };
      } catch {
        return {
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
          shouldShowBanner: true,
          shouldShowList: true,
        };
      }
    },
  });
}

async function ensureAndroidChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: "Daily reminders",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#111111",
  });
}

type NotificationPermissionResult = Awaited<
  ReturnType<typeof Notifications.getPermissionsAsync>
>;

export function isNotificationGranted(status: NotificationPermissionResult): boolean {
  const s = status as {
    granted?: boolean;
    status?: string;
    ios?: { status?: Notifications.IosAuthorizationStatus };
  };
  return (
    !!s.granted ||
    s.status === "granted" ||
    s.ios?.status === Notifications.IosAuthorizationStatus.AUTHORIZED ||
    s.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  );
}

export async function registerForNotificationsAsync(): Promise<boolean> {
  if (Platform.OS === "web") return false;

  await ensureAndroidChannel();

  const existing = await Notifications.getPermissionsAsync();
  if (isNotificationGranted(existing)) {
    await AsyncStorage.setItem(ENABLED_KEY, "true");
    return true;
  }

  const result = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: true,
      allowSound: true,
    },
  });
  const granted = isNotificationGranted(result);
  await AsyncStorage.setItem(ENABLED_KEY, granted ? "true" : "false");
  return granted;
}

export async function scheduleDailyNotification(): Promise<string | null> {
  if (Platform.OS === "web") return null;

  try {
    await ensureAndroidChannel();
    await Notifications.cancelAllScheduledNotificationsAsync();

    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        title: "Still time for you today",
        body: "You haven't done your affirmation today — take a moment now.",
        sound: true,
        ...(Platform.OS === "android"
          ? { priority: Notifications.AndroidNotificationPriority.HIGH }
          : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: 21,
        minute: 0,
        channelId: CHANNEL_ID,
      },
    });

    await AsyncStorage.setItem(DAILY_ID_KEY, identifier);
    return identifier;
  } catch (error) {
    console.error("[Notifications] Failed to schedule daily reminder:", error);
    return null;
  }
}

export async function scheduleAffirmationReminder(): Promise<void> {
  await scheduleDailyNotification();
}

export async function onAffirmationCompleted(): Promise<void> {
  await AsyncStorage.setItem(LAST_AFFIRMATION_KEY, todayLocal());
}

export async function initNotifications(): Promise<void> {
  if (Platform.OS === "web") return;

  try {
    await ensureAndroidChannel();
    const settings = await Notifications.getPermissionsAsync();
    if (!isNotificationGranted(settings)) {
      await Notifications.cancelAllScheduledNotificationsAsync();
      return;
    }
    await scheduleDailyNotification();
  } catch (error) {
    console.error("[Notifications] Init failed:", error);
  }
}

export function setupNotificationListeners(): () => void {
  if (Platform.OS === "web") return () => {};

  const received = Notifications.addNotificationReceivedListener((notification) => {
    console.log("[Notifications] received:", notification.request.identifier);
  });
  const response = Notifications.addNotificationResponseReceivedListener((res) => {
    console.log("[Notifications] tapped:", res.notification.request.identifier);
  });

  return () => {
    received.remove();
    response.remove();
  };
}
