
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
import { configureMixedPlaybackAsync } from '@/lib/audio-playback';
import Superwall from '@superwall/react-native-superwall';

const SUPERWALL_API_KEY_IOS = 'pk_5L3AcVB9DaMbr9E9M79vc';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded] = useFonts({
    InstrumentSerif_400Regular,
    InstrumentSerif_400Regular_Italic,
    SpaceMono_400Regular,
  });

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  useEffect(() => {
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
      <ThemeProvider value={theme}>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: Colors.background },
            headerTintColor: Colors.text,
            headerTitleStyle: { fontFamily: Fonts.serifBold },
            contentStyle: { backgroundColor: Colors.background },
          }}>
          <Stack.Screen name="(onboarding)" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="session/selection" options={{ title: 'Choose Soundscape', headerShown: false, presentation: 'card', animation: 'fade' }} />
          <Stack.Screen name="session/playback" options={{ title: 'Session', headerShown: false, presentation: 'fullScreenModal' }} />
          <Stack.Screen name="add/pillar" options={{ title: 'Select Affirmation Pillar', headerShown: false, presentation: 'card', animation: 'fade' }} />
          <Stack.Screen name="add/affirmation" options={{ title: 'Select Affirmation', headerShown: false, presentation: 'card' }} />
          <Stack.Screen name="add/write" options={{ title: 'Write Affirmation', headerShown: false, presentation: 'modal', gestureEnabled: false }} />
          <Stack.Screen name="add/record" options={{ title: 'Record', headerShown: false, presentation: 'modal', gestureEnabled: false }} />
          <Stack.Screen name="add/recording" options={{ title: 'Record', headerShown: false, presentation: 'modal', gestureEnabled: false, animation: 'fade' }} />
          <Stack.Screen name="add/review" options={{ title: 'Review', headerShown: false, presentation: 'modal', gestureEnabled: false }} />
          <Stack.Screen name="streak" options={{ headerShown: false, presentation: 'fullScreenModal', animation: 'fade' }} />
        </Stack>
        <StatusBar style="light" />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
