import { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  FadeInDown,
  ZoomIn,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { BadgeIcon, FlameIcon } from './icons';
import { F, SOFT_SHADOW } from '../theme';

/** Streak rank tiers — game-style C → B → A → A+ → S → S+ → SS. */
export const TIERS = [
  { min: 90, rank: 'SS', color: '#92400e', name: 'Huyền thoại' },
  { min: 60, rank: 'S+', color: '#dc2626', name: 'Bậc thầy' },
  { min: 30, rank: 'S', color: '#ea580c', name: 'Chuyên nghiệp' },
  { min: 21, rank: 'A+', color: '#7c3aed', name: 'Kỷ luật' },
  { min: 14, rank: 'A', color: '#16a34a', name: 'Ổn định' },
  { min: 7, rank: 'B', color: '#2563eb', name: 'Quen nhịp' },
  { min: 3, rank: 'C', color: '#525252', name: 'Khởi đầu' },
] as const;

export type Tier = (typeof TIERS)[number];

export function tierFor(streak: number): { tier: Tier | null; next: Tier | null } {
  const idx = TIERS.findIndex((t) => streak >= t.min);
  const tier = idx >= 0 ? TIERS[idx] : null;
  const next = idx > 0 ? TIERS[idx - 1] : idx === -1 ? TIERS[TIERS.length - 1] : null;
  return { tier, next };
}

export function StreakCard({
  streak,
  best,
  todayDone,
  todayCount = 0,
  goal = 1,
  week,
}: {
  streak: number;
  best: number;
  todayDone: boolean;
  /** Sessions finished today — shown as "1/2" when goal > 1. */
  todayCount?: number;
  /** Sessions per day needed to keep the streak. */
  goal?: number;
  week: boolean[];
}) {
  const { tier, next } = tierFor(streak);
  const { tier: bestTier } = tierFor(best);
  const lost = streak === 0 && best > 0;
  const progress = next ? Math.min(1, streak / next.min) : 1;

  const prog = useSharedValue(0);
  useEffect(() => {
    prog.value = withTiming(progress, { duration: 700, easing: Easing.out(Easing.quad) });
  }, [progress, prog]);
  const progStyle = useAnimatedStyle(() => ({
    width: `${prog.value * 100}%`,
    backgroundColor: tier?.color ?? '#111',
  }));

  return (
    <Animated.View entering={FadeInDown.duration(350)} style={styles.streakCard}>
      <View style={styles.streakTop}>
        <FlameIcon size={30} color={lost ? '#d4d4d4' : '#111'} />
        <Text style={[styles.streakNum, lost && styles.dim]}>{streak}</Text>
        <View style={styles.streakMid}>
          <Text style={styles.streakLabel}>ngày liên tiếp</Text>
          <Text style={styles.streakNote}>
            {todayDone
              ? 'Hôm nay ✓'
              : lost
                ? 'Mất chuỗi rồi — bắt đầu lại nào'
                : goal > 1
                  ? `Hôm nay ${todayCount}/${goal} phiên`
                  : 'Nói 1 phiên để giữ chuỗi'}
            {best > 0 ? ` · kỷ lục ${best}` : ''}
          </Text>
        </View>
        {tier ? (
          <Animated.View entering={ZoomIn.delay(250).springify().damping(11)}>
            <BadgeIcon rank={tier.rank} color={tier.color} size={56} />
          </Animated.View>
        ) : bestTier ? (
          // The badge you lost — kept dim so it stings a little.
          <BadgeIcon rank={bestTier.rank} color={bestTier.color} size={56} dim />
        ) : null}
      </View>

      <View style={styles.dots}>
        {week.map((done, i) => (
          <View
            key={i}
            style={[styles.dot, done && styles.dotDone, i === 6 && styles.dotToday]}
          />
        ))}
      </View>

      <View style={styles.progressTrack}>
        <Animated.View style={[styles.progressFill, progStyle]} />
      </View>
      <Text style={styles.progressText}>
        {next
          ? `Còn ${next.min - streak} ngày lên hạng ${next.rank} — ${next.name}`
          : 'Huy hiệu cao nhất — huyền thoại rồi đó'}
        {'\n'}Nghỉ 1 ngày = mất chuỗi + -10 xu/ngày
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  streakCard: {
    margin: 16,
    marginBottom: 8,
    paddingVertical: 18,
    paddingHorizontal: 18,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ededed',
    ...SOFT_SHADOW,
  },
  streakTop: { flexDirection: 'row', alignItems: 'center' },
  streakNum: {
    fontSize: 34,
    fontFamily: F.bold,
    color: '#111',
    fontVariant: ['tabular-nums'],
    marginLeft: 6,
  },
  dim: { color: '#bbb' },
  streakMid: { marginLeft: 10, flex: 1 },
  streakLabel: { fontSize: 13, color: '#888', fontFamily: F.regular },
  streakNote: { fontSize: 12, color: '#bbb', marginTop: 2, fontFamily: F.regular },
  dots: { flexDirection: 'row', gap: 6, marginTop: 12 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#e9e9eb' },
  dotDone: { backgroundColor: '#111' },
  dotToday: { borderWidth: 1.5, borderColor: '#111' },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ececee',
    marginTop: 12,
    overflow: 'hidden',
  },
  progressFill: { height: 4, borderRadius: 2 },
  progressText: { fontSize: 12, color: '#999', marginTop: 8, fontFamily: F.regular, lineHeight: 17 },
});
