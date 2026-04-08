import { useEffect, useRef } from 'react';
import { NativeTabs, Icon, Label, VectorIcon } from 'expo-router/unstable-native-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSegments } from 'expo-router';
import { Colors } from '@/constants/theme';
import * as Haptics from 'expo-haptics';

/** NativeTabs ignores React Navigation `screenListeners`; sync haptics to actual tab segment changes. */
function NativeTabBarHaptics() {
  const segments = useSegments();
  const prevTab = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (segments[0] !== '(tabs)') {
      return;
    }
    const tab = segments[1] ?? 'index';
    if (prevTab.current !== undefined && prevTab.current !== tab) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    prevTab.current = tab;
  }, [segments]);

  return null;
}

export default function TabLayout() {
  return (
    <>
      <NativeTabBarHaptics />
      <NativeTabs
      tintColor={Colors.tint}
      backgroundColor={Colors.background}
      iconColor={{
        default: Colors.tabIconDefault,
        selected: Colors.tabIconSelected,
      }}
      labelStyle={{
        default: { color: Colors.tabIconDefault },
        selected: { color: Colors.tabIconSelected },
      }}
    >
      <NativeTabs.Trigger name="index">
        <Icon 
          sf="house.fill" 
          androidSrc={<VectorIcon family={Ionicons} name="home" />} 
        />
        <Label>Home</Label>
      </NativeTabs.Trigger>
      
      <NativeTabs.Trigger name="library">
        <Icon 
          sf="books.vertical.fill" 
          androidSrc={<VectorIcon family={Ionicons} name="library" />} 
        />
        <Label>Track</Label>
      </NativeTabs.Trigger>
      
      <NativeTabs.Trigger name="profile">
        <Icon 
          sf="person.fill" 
          androidSrc={<VectorIcon family={Ionicons} name="person" />} 
        />
        <Label>Profile</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
    </>
  );
}
