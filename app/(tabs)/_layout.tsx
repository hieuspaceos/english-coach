import { Tabs } from 'expo-router';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { useCoachStore } from '../../src/state/store';
import { CoinIcon, WaveformIcon } from '../../src/components/icons';
import { F } from '../../src/theme';

function CoinChip() {
  const coins = useCoachStore((s) => s.coins);
  return (
    <View style={styles.coinChip}>
      <CoinIcon size={13} />
      {/* key remounts the number on change → tiny pop each time coins move */}
      <Animated.Text key={coins} entering={ZoomIn.duration(220)} style={styles.coinText}>
        {coins}
      </Animated.Text>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#111',
        headerRight: () => <CoinChip />,
        headerRightContainerStyle: { paddingRight: 16 },
        headerTitleStyle: { fontFamily: F.semibold },
        tabBarLabelStyle: { fontFamily: F.medium, fontSize: 11 },
      }}
    >
      <Tabs.Screen
        name="history"
        options={{
          title: 'Lịch sử',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="time-outline" color={color as string} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="errors"
        options={{
          title: 'Lỗi',
          tabBarIcon: ({ color, size }) => (
            <Ionicons
              name="alert-circle-outline"
              color={color as string}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: 'Luyện',
          tabBarShowLabel: false,
          tabBarButton: ({ ref: _ref, children: _children, ...props }) => (
            <Pressable
              {...props}
              style={({ pressed }) => [
                styles.practiceWrap,
                pressed && { opacity: 0.85 },
              ]}
            >
              <View style={styles.practiceCircle}>
                <WaveformIcon size={30} />
              </View>
            </Pressable>
          ),
        }}
      />
      <Tabs.Screen
        name="vocab"
        options={{
          title: 'Từ vựng',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="book-outline" color={color as string} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Cài đặt',
          tabBarIcon: ({ color, size }) => (
            <Ionicons
              name="settings-outline"
              color={color as string}
              size={size}
            />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  coinChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#fef3c7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  coinText: { fontSize: 13, fontFamily: F.bold, color: '#92400e', fontVariant: ['tabular-nums'] },
  practiceWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  practiceCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -18,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
});
