import { useEffect, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, Modal } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  FadeIn,
  FadeInDown,
  ZoomIn,
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { BadgeIcon } from './icons';
import type { Tier } from './StreakCard';
import { F } from '../theme';

const CONFETTI = ['#f59e0b', '#111', '#bbb', '#16a34a', '#2563eb'];

function Drop({
  left,
  delay,
  dur,
  size,
  color,
}: {
  left: number;
  delay: number;
  dur: number;
  size: number;
  color: string;
}) {
  const y = useSharedValue(-20);
  const opacity = useSharedValue(1);
  useEffect(() => {
    y.value = withDelay(delay, withTiming(620, { duration: dur, easing: Easing.in(Easing.quad) }));
    opacity.value = withDelay(delay + dur * 0.7, withTiming(0, { duration: dur * 0.3 }));
  }, [y, opacity, delay, dur]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value }],
    opacity: opacity.value,
  }));
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          top: 0,
          left: `${left}%`,
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}

/** Full-screen "LÊN HẠNG" celebration shown when the streak reaches a new tier. */
export function LevelUpModal({ tier, onClose }: { tier: Tier; onClose: () => void }) {
  // Success buzz the moment the modal appears — once, not per render.
  useEffect(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);

  const drops = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => ({
        left: 4 + Math.random() * 92,
        delay: Math.random() * 500,
        dur: 1100 + Math.random() * 900,
        size: 5 + Math.random() * 6,
        color: i % 3 === 0 ? tier.color : CONFETTI[i % CONFETTI.length],
      })),
    [tier.color],
  );

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {drops.map((d, i) => (
            <Drop key={i} {...d} />
          ))}
        </View>

        <Animated.Text entering={FadeInDown.delay(350).springify()} style={styles.title}>
          LÊN HẠNG
        </Animated.Text>
        <Animated.View entering={ZoomIn.delay(100).springify().damping(9)}>
          <BadgeIcon rank={tier.rank} color={tier.color} size={150} />
        </Animated.View>
        <Animated.Text entering={FadeIn.delay(500)} style={styles.name}>
          {tier.name}
        </Animated.Text>
        <Animated.Text entering={FadeIn.delay(650)} style={styles.sub}>
          Giữ chuỗi mỗi ngày để leo hạng tiếp
        </Animated.Text>
        <Animated.View entering={FadeInDown.delay(800)}>
          <Pressable style={styles.btn} onPress={onClose}>
            <Text style={styles.btnText}>Tiếp tục</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.96)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 15, fontFamily: F.bold, color: '#999', letterSpacing: 3, marginBottom: 24 },
  name: { fontSize: 26, fontFamily: F.extrabold, color: '#111', marginTop: 20 },
  sub: { fontSize: 14, color: '#999', marginTop: 8, fontFamily: F.regular },
  btn: {
    marginTop: 40,
    backgroundColor: '#111',
    paddingVertical: 14,
    paddingHorizontal: 56,
    borderRadius: 999,
  },
  btnText: { color: '#fff', fontSize: 16, fontFamily: F.semibold },
});
