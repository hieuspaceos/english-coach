import { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { useRouter, useFocusEffect, Redirect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { CATEGORIES } from '../../src/scenarios';
import { queries } from '../../src/db/database';
import { useCoachStore } from '../../src/state/store';
import { StreakCard, TIERS, tierFor, Tier } from '../../src/components/StreakCard';
import { LevelUpModal } from '../../src/components/LevelUpModal';
import { syncPracticeReminder } from '../../src/services/reminders';
import { dayStr, computeStreak, getDailyGoal } from '../../src/services/gamification';
import { isOnboarded, getUserName } from '../../src/services/profile';
import { F } from '../../src/theme';

const CATEGORY_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  'job-hunting': 'briefcase-outline',
  'winning-clients': 'people-outline',
  'money-scope': 'card-outline',
  'daily-work': 'calendar-outline',
  'hard-moments': 'shield-half-outline',
  closing: 'heart-outline',
};

export default function PracticeScreen() {
  const router = useRouter();
  const apiKey = useCoachStore((s) => s.apiKey);
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(0);
  const [todayDone, setTodayDone] = useState(false);
  const [todayCount, setTodayCount] = useState(0);
  const [goal, setGoal] = useState(1);
  const [week, setWeek] = useState<boolean[]>([]);
  const [rankUp, setRankUp] = useState<Tier | null>(null);
  const [name, setName] = useState<string | null>(null);
  const setCoins = useCoachStore((s) => s.setCoins);

  useFocusEffect(
    useCallback(() => {
      // Not onboarded yet — the render below redirects to /onboarding;
      // don't pop the notification permission or touch stats meanwhile.
      if (!isOnboarded()) return;

      // A day counts toward the streak only when the daily goal is met
      // (1–3 sessions, configurable in Settings).
      const g = getDailyGoal();
      setGoal(g);
      const stats = queries.practiceDayStats();
      const days = new Set(stats.filter((s) => s.count >= g).map((s) => s.day));
      const anyDays = new Set(stats.map((s) => s.day));
      const today = dayStr(new Date());
      const doneToday = stats.find((s) => s.day === today)?.count ?? 0;
      setTodayDone(doneToday >= g);
      setTodayCount(doneToday);

      // ── Missed-day penalty: -10 xu per fully-skipped day (zero sessions).
      // A day with partial progress (e.g. 1 of 2 goal sessions) only loses the
      // streak — it is not charged, so raising the goal never mass-fines the
      // past. New users with zero sessions are exempt.
      const dayList = [...anyDays].sort();
      const lastDay = dayList.pop();
      if (lastDay) {
        const paidThrough = queries.getMeta('penalty_through'); // last day already charged
        let charged = 0;
        const cursor = new Date(lastDay + 'T00:00:00');
        cursor.setDate(cursor.getDate() + 1);
        while (dayStr(cursor) < today) {
          const d = dayStr(cursor);
          if (!anyDays.has(d) && (!paidThrough || d > paidThrough)) {
            queries.addCoins(-10);
            queries.setMeta('penalty_through', d);
            charged++;
          }
          cursor.setDate(cursor.getDate() + 1);
        }
        if (charged > 0) setCoins(queries.getCoins());
      }

      // Current streak: consecutive completed days ending today (or
      // yesterday — the streak is still alive until today is missed).
      const n = computeStreak(days);
      setStreak(n);

      // Best streak ever — kept in meta so losing it hurts visibly.
      const bestEver = Math.max(n, parseInt(queries.getMeta('best_streak') ?? '0', 10) || 0);
      queries.setMeta('best_streak', String(bestEver));
      setBest(bestEver);

      // ── Rank-up detection: celebrate when the current tier passes the
      // highest tier we've already celebrated (stored in meta).
      const { tier } = tierFor(n);
      const curIdx = tier ? TIERS.indexOf(tier) : -1;
      const lastIdx = parseInt(queries.getMeta('last_rank_idx') ?? '-1', 10);
      if (curIdx > lastIdx) {
        queries.setMeta('last_rank_idx', String(curIdx));
        if (tier) setRankUp(tier);
      } else if (curIdx < lastIdx) {
        // Rank dropped (streak lost) — sync silently, celebration only goes up.
        queries.setMeta('last_rank_idx', String(curIdx));
      }

      // Last 7 days as dots, oldest → today.
      setWeek(
        Array.from({ length: 7 }, (_, i) => {
          const x = new Date();
          x.setDate(x.getDate() - (6 - i));
          return days.has(dayStr(x));
        }),
      );

      setName(getUserName());

      // Re-plan the practice reminder around today's status + configured hour.
      void syncPracticeReminder();
    }, [setCoins]),
  );

  // First launch — collect name + field before anything else.
  if (!isOnboarded()) return <Redirect href="/onboarding" />;

  return (
    <View style={styles.container}>
      {!apiKey && (
        <Pressable onPress={() => router.push('/(tabs)/settings')}>
          <Text style={styles.warn}>Nhập Gemini API key trong Cài đặt trước →</Text>
        </Pressable>
      )}
      <StreakCard
        streak={streak}
        best={best}
        todayDone={todayDone}
        todayCount={todayCount}
        goal={goal}
        week={week}
      />
      <FlatList
        data={CATEGORIES}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <Text style={styles.hint}>
            {name ? `Chào ${name} — ` : ''}chọn một mục để luyện, bên trong có
            sẵn tình huống gợi ý.{'\n'}Mới bắt đầu? Thử "Gặp khách & chốt dự án" trước.
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={() => router.push(`/category/${item.id}`)}
          >
            <View style={styles.iconBox}>
              <Ionicons
                name={CATEGORY_ICONS[item.id] ?? 'ellipse-outline'}
                size={20}
                color="#3f3f46"
              />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.title}>{item.titleVi}</Text>
              <Text style={styles.sub}>{item.descVi}</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        )}
      />
      {rankUp && <LevelUpModal tier={rankUp} onClose={() => setRankUp(null)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  warn: {
    padding: 16,
    color: '#666',
    fontSize: 14,
    fontFamily: F.regular,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e5e5',
  },
  list: { paddingVertical: 4 },
  hint: { padding: 16, paddingTop: 12, color: '#999', fontSize: 13, lineHeight: 19, fontFamily: F.regular },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    gap: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e5e5',
  },
  rowPressed: { backgroundColor: '#f5f5f5' },
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#f4f4f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1 },
  title: { fontSize: 16, fontFamily: F.semibold, color: '#111' },
  sub: { fontSize: 13, color: '#888', marginTop: 2, fontFamily: F.regular },
  chevron: { fontSize: 24, color: '#ccc', fontFamily: F.regular },
});
