import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { queries } from '../db/database';
import { dayStr, computeStreak, getDailyGoal, getReminderHour } from './gamification';

/**
 * Practice reminder strategy — one notification, always re-planned on app open:
 * - Daily goal not met & before reminder hour → remind at that hour today
 * - Goal met / past the hour                → remind same hour tomorrow
 * Since the app's whole job is daily use, rescheduling on every open keeps
 * exactly one pending reminder that never nags on a day you already trained.
 */

const CHANNEL_ID = 'practice-reminders';
// Marker on our notification payload — lets future notification types be
// told apart from practice reminders when reading scheduled/delivered lists.
const TAG = 'practice-reminder';

/** Call once at app start: channel + foreground behavior. */
export async function setupNotifications(): Promise<void> {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Nhắc luyện',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
}

/** Re-plan the single practice reminder from fresh DB state. */
export async function syncPracticeReminder(): Promise<void> {
  // Android 13+ needs runtime permission — ask once, bail quietly if denied.
  const perm = await Notifications.getPermissionsAsync();
  let granted = perm.granted;
  if (!granted && perm.canAskAgain) {
    granted = (await Notifications.requestPermissionsAsync()).granted;
  }
  if (!granted) return;

  const goal = getDailyGoal();
  const today = dayStr(new Date());
  const stats = queries.practiceDayStats();
  const doneToday = stats.find((s) => s.day === today)?.count ?? 0;
  const goalMet = doneToday >= goal;
  const completed = new Set(stats.filter((s) => s.count >= goal).map((s) => s.day));
  const streak = computeStreak(completed);

  // The app only ever schedules practice reminders, so cancelling all pending
  // ones is correct — and also clears legacy reminders saved before the TAG
  // marker existed (a scoped cancel would leave those stacked forever).
  await Notifications.cancelAllScheduledNotificationsAsync();

  const fireAt = new Date();
  fireAt.setHours(getReminderHour(), 0, 0, 0);
  if (fireAt.getTime() <= Date.now() || goalMet) {
    fireAt.setDate(fireAt.getDate() + 1);
  }

  // When the reminder fires tomorrow, "hôm nay X/Y" counts computed now
  // would be stale — only the streak line stays meaningful by then.
  const firesTomorrow = dayStr(fireAt) !== today;
  const body =
    streak > 0
      ? goal > 1 && doneToday > 0 && !firesTomorrow
        ? `Chuỗi ${streak} ngày — hôm nay ${doneToday}/${goal} phiên, nốt ${goal - doneToday} là xong`
        : `Chuỗi ${streak} ngày đang chờ — 1 phiên nữa là giữ được lửa`
      : 'Hôm nay chưa luyện — 1 phiên ngắn để bắt đầu lại nào';

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'English Coach',
      body,
      data: { type: TAG },
      ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID } : {}),
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireAt },
  });
}
