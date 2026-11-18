import { useEffect } from 'react';
import { Stack } from 'expo-router';
import {
  useFonts,
  BeVietnamPro_400Regular,
  BeVietnamPro_500Medium,
  BeVietnamPro_600SemiBold,
  BeVietnamPro_700Bold,
  BeVietnamPro_800ExtraBold,
} from '@expo-google-fonts/be-vietnam-pro';
import { initDb, queries } from '../src/db/database';
import { getApiKey } from '../src/services/apiKey';
import { setupNotifications } from '../src/services/reminders';
import { useCoachStore } from '../src/state/store';
import { F } from '../src/theme';

export default function RootLayout() {
  const setApiKey = useCoachStore((s) => s.setApiKey);
  const setCoins = useCoachStore((s) => s.setCoins);
  const [fontsReady] = useFonts({
    BeVietnamPro_400Regular,
    BeVietnamPro_500Medium,
    BeVietnamPro_600SemiBold,
    BeVietnamPro_700Bold,
    BeVietnamPro_800ExtraBold,
  });

  useEffect(() => {
    initDb();
    getApiKey().then(setApiKey);
    setCoins(queries.getCoins());
    void setupNotifications();
  }, [setApiKey, setCoins]);

  // Don't render anything until the brand font is on disk — a single
  // flash of system font would cheapen the whole first impression.
  if (!fontsReady) return null;

  return (
    <Stack
      screenOptions={{
        headerTitleStyle: { fontFamily: F.semibold },
        headerBackTitleStyle: { fontFamily: F.regular },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      <Stack.Screen name="category/[id]" options={{ title: '' }} />
      <Stack.Screen
        name="session/[id]"
        options={{ title: 'Practice', presentation: 'card' }}
      />
      <Stack.Screen name="pitch" options={{ title: 'Pitch hàng tuần' }} />
    </Stack>
  );
}
