
import React, { useState } from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import AnimatedGlow, { GlowEvent } from 'react-native-animated-glow';
import { Colors, Fonts } from '@/constants/theme';
import { GlowPresets } from '@/constants/glow';
import { Ionicons } from '@expo/vector-icons';

export default function HomeScreen() {
  const router = useRouter();
  const [glowState, setGlowState] = useState<GlowEvent>('default');

  return (
    <View style={styles.container}>
      {/* Header Icons */}
      <View style={styles.header}>
        <View /> 
        {/* Just spacing, icons on right */}
        <View style={styles.headerIcons}>
           {/* Library and Profile are in tabs, but spec says "Top right: Library icon + Profile icon". 
               Since we have tabs, maybe these are shortcuts or redundant. I'll include them as per spec. */}
          <Pressable onPress={() => router.push('/(tabs)/library')} style={styles.iconButton}>
             <Ionicons name="library-outline" size={24} color={Colors.text} />
          </Pressable>
          <Pressable onPress={() => router.push('/(tabs)/profile')} style={styles.iconButton}>
             <Ionicons name="person-outline" size={24} color={Colors.text} />
          </Pressable>
        </View>
      </View>

      <View style={styles.content}>
        <Text style={styles.title}>Wu-Wu</Text>
        
        <View style={styles.buttonContainer}>
          <AnimatedGlow 
            preset={GlowPresets.chakra(90)}
            activeState={glowState}
          >
            <Pressable 
              style={styles.mainButton}
              onPress={() => router.push('/session/selection')}
              onPressIn={() => setGlowState('press')}
              onPressOut={() => setGlowState('default')}
            >
              <LinearGradient
                colors={Colors.chakra.gradient}
                style={styles.buttonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Text style={styles.buttonText}>Start Session</Text>
              </LinearGradient>
            </Pressable>
          </AnimatedGlow>
        </View>

        <Text style={styles.footerText}>
          Your voice. Your frequencies. Your transformation.
        </Text>
      </View>
      
      {/* Subtle bottom gradient */}
      <LinearGradient
        colors={['transparent', 'rgba(255, 0, 110, 0.1)']}
        style={styles.bottomGradient}
        pointerEvents="none"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 20,
    marginTop: 40,
  },
  headerIcons: {
    flexDirection: 'row',
    gap: 16,
  },
  iconButton: {
    padding: 8,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 60,
  },
  title: {
    fontFamily: Fonts.serif,
    fontSize: 64,
    color: Colors.text,
    letterSpacing: 4,
  },
  buttonContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 200,
    height: 200,
  },
  mainButton: {
    width: 180,
    height: 180,
    borderRadius: 90,
    elevation: 10,
    shadowColor: Colors.chakra.red,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
  },
  buttonGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 90,
  },
  buttonText: {
    fontFamily: Fonts.serifBold,
    fontSize: 24,
    color: Colors.text,
    textAlign: 'center',
  },
  footerText: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
    opacity: 0.7,
    maxWidth: '80%',
  },
  bottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 100,
  },
});
