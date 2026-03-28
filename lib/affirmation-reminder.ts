import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";

const REMINDER_ID_KEY = "affirmationReminderNotificationId";
const LAST_AFFIRMATION_KEY = "lastAffirmationDate";

function getNext9pm(): Date {
  const now = new Date();
  const target = new Date();
  target.setHours(21, 0, 0, 0);
  if (now >= target) {
    target.setDate(target.getDate() + 1);
  }
  return target;
}

function getTomorrow9pm(): Date {
  const target = new Date();
  target.setDate(target.getDate() + 1);
  target.setHours(21, 0, 0, 0);
  return target;
}

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

async function scheduleAt(date: Date): Promise<string> {
  return Notifications.scheduleNotificationAsync({
    content: {
      title: "Time for your affirmation session 🌿",
      body: "You haven't done your affirmation today — take a moment now.",
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date,
    },
  });
}

export async function scheduleAffirmationReminder(): Promise<void> {
  const existingId = await AsyncStorage.getItem(REMINDER_ID_KEY);
  if (existingId) {
    await Notifications.cancelScheduledNotificationAsync(existingId).catch(() => {});
  }

  const id = await scheduleAt(getNext9pm());
  await AsyncStorage.setItem(REMINDER_ID_KEY, id);
}

/**
 * Call this when the user completes an affirmation session.
 * Cancels today's reminder and reschedules for tomorrow at 9pm.
 */
export async function onAffirmationCompleted(): Promise<void> {
  await AsyncStorage.setItem(LAST_AFFIRMATION_KEY, todayString());

  const existingId = await AsyncStorage.getItem(REMINDER_ID_KEY);
  if (existingId) {
    await Notifications.cancelScheduledNotificationAsync(existingId).catch(() => {});
  }

  const id = await scheduleAt(getTomorrow9pm());
  await AsyncStorage.setItem(REMINDER_ID_KEY, id);
}
