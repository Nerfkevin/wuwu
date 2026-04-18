
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  InstrumentSerif_400Regular,
  InstrumentSerif_400Regular_Italic,
} from '@expo-google-fonts/instrument-serif';
import { SpaceMono_400Regular } from '@expo-google-fonts/space-mono';
import { Colors, Fonts } from '@/constants/theme';
import { NativeModules } from 'react-native';
import { configureMixedPlaybackAsync } from '@/lib/audio-playback';
import Superwall from '@superwall/react-native-superwall';
import { AppPostHogProvider, usePostHog } from '@/lib/posthog-provider';
import * as SecureStore from 'expo-secure-store';

const SUPERWALL_API_KEY_IOS = 'pk_5L3AcVB9DaMbr9E9M79vc';
const USER_UUID_KEY = 'app_user_uuid';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

function UserIdentityManager() {
  const posthog = usePostHog();

  useEffect(() => {
    const identify = async () => {
      try {
        let uuid = await SecureStore.getItemAsync(USER_UUID_KEY);
        if (!uuid) {
          uuid = crypto.randomUUID();
          await SecureStore.setItemAsync(USER_UUID_KEY, uuid);
        }
        await Superwall.shared.identify({ userId: uuid });
        posthog?.identify(uuid);
      } catch (e) {
        console.log('[UserIdentityManager] error:', e);
      }
    };

    identify();
  }, [posthog]);

  return null;
}

export default function RootLayout() {
  const [loaded] = useFonts({
    InstrumentSerif_400Regular,
    InstrumentSerif_400Regular_Italic,
    SpaceMono_400Regular,
  });

  useEffect(() => {
    NativeModules.AudioAPIModule?.disableSessionManagement?.();
    void configureMixedPlaybackAsync();
  }, []);

  useEffect(() => {
    Superwall.configure({ apiKey: SUPERWALL_API_KEY_IOS });
  }, []);

  if (!loaded) {
    return null;
  }

  // Force Dark Theme for the app
  const theme = {
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
      background: Colors.background,
      text: Colors.text,
    },
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppPostHogProvider>
      <UserIdentityManager />
      <ThemeProvider value={theme}>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: Colors.background },
            headerTintColor: Colors.text,
            headerTitleStyle: { fontFamily: Fonts.serifBold },
            contentStyle: { backgroundColor: Colors.background },
            gestureEnabled: false,
          }}>
          <Stack.Screen name="(onboarding)" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="session/selection" options={{ title: 'Choose Soundscape', headerShown: false, presentation: 'card', animation: 'fade' }} />
          <Stack.Screen name="session/playback" options={{ title: 'Session', headerShown: false, presentation: 'fullScreenModal', animation: 'fade' }} />
          <Stack.Screen name="add/pillar" options={{ title: 'Select Affirmation Pillar', headerShown: false, presentation: 'card', animation: 'fade' }} />
          <Stack.Screen name="add/affirmation" options={{ title: 'Select Affirmation', headerShown: false, presentation: 'card' }} />
          <Stack.Screen name="add/write" options={{ title: 'Write Affirmation', headerShown: false, presentation: 'modal', gestureEnabled: false }} />
          <Stack.Screen name="add/record" options={{ title: 'Record', headerShown: false, presentation: 'modal', gestureEnabled: false }} />
          <Stack.Screen name="add/recording" options={{ title: 'Record', headerShown: false, presentation: 'modal', gestureEnabled: false, animation: 'fade' }} />
          <Stack.Screen name="add/review" options={{ title: 'Review', headerShown: false, presentation: 'modal', gestureEnabled: false }} />
          <Stack.Screen name="session/complete" options={{ headerShown: false, presentation: 'transparentModal', animation: 'none' }} />
          <Stack.Screen name="streak" options={{ headerShown: false, presentation: 'fullScreenModal', animation: 'fade' }} />
        </Stack>
        <StatusBar style="light" />
      </ThemeProvider>
      </AppPostHogProvider>
    </GestureHandlerRootView>
  );
}
