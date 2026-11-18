import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
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
  const [fontsReady, fontsError] = useFonts({
    BeVietnamPro_400Regular,
    BeVietnamPro_500Medium,
    BeVietnamPro_600SemiBold,
    BeVietnamPro_700Bold,
    BeVietnamPro_800ExtraBold,
  });

  useEffect(() => {
    initDb();
    getApiKey()
      .then(setApiKey)
      .catch(() => {}); // SecureStore hiccup → key stays null → settings warning
    setCoins(queries.getCoins());
    void setupNotifications();
    // Delete .m4a files whose session row is gone (crashed calls, resets).
    void (async () => {
      try {
        const { Paths, File } = await import('expo-file-system');
        const keep = new Set(queries.allAudioUris());
        for (const item of Paths.document.list()) {
          if (item instanceof File && item.name.endsWith('.m4a') && !keep.has(item.uri)) {
            item.delete();
          }
        }
      } catch {}
    })();
  }, [setApiKey, setCoins]);

  // Don't render anything until the brand font is on disk — a single
  // flash of system font would cheapen the whole first impression. If the
  // load somehow fails, system font beats a permanent blank screen.
  if (!fontsReady && !fontsError) return null;

  return (
    <>
      <StatusBar style="dark" />
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
    </>
  );
}
