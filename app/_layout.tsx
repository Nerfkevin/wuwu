
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';
import { Arapey_400Regular, Arapey_400Regular_Italic } from '@expo-google-fonts/arapey';
import { SpaceMono_400Regular } from '@expo-google-fonts/space-mono';
import { Colors, Fonts } from '@/constants/theme';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded] = useFonts({
    Arapey_400Regular,
    Arapey_400Regular_Italic,
    SpaceMono_400Regular,
  });

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

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
    <ThemeProvider value={theme}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: Colors.background },
          headerTintColor: Colors.text,
          headerTitleStyle: { fontFamily: Fonts.serifBold },
          contentStyle: { backgroundColor: Colors.background },
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="session/selection" options={{ title: 'Choose Soundscape', headerShown: false, presentation: 'card' }} />
        <Stack.Screen name="session/playback" options={{ title: 'Session', headerShown: false, presentation: 'fullScreenModal' }} />
        <Stack.Screen name="add/pillar" options={{ title: 'Select Affirmation Pillar', headerShown: false, presentation: 'card' }} />
        <Stack.Screen name="add/affirmation" options={{ title: 'Select Affirmation', headerShown: false, presentation: 'card' }} />
        <Stack.Screen name="add/write" options={{ title: 'Write Affirmation', presentation: 'card' }} />
        <Stack.Screen name="add/record" options={{ title: 'Record', presentation: 'card' }} />
        <Stack.Screen name="add/recording" options={{ title: 'Record', presentation: 'card' }} />
        <Stack.Screen name="add/review" options={{ title: 'Review', presentation: 'card' }} />
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style="light" />
    </ThemeProvider>
  );
}
