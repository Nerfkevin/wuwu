import React, { useCallback, useRef, useState } from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import AnimatedGlow, { GlowEvent } from 'react-native-animated-glow';
import { Colors, Fonts, Layout } from '@/constants/theme';
import { GlowPresets } from '@/constants/glow';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import type { AudioPlayer } from 'expo-audio';
import { getSavedRecordings, SavedRecording } from '@/app/add/recording-store';
import { AFFIRMATION_PILLARS } from '@/constants/affirmations';

export default function LibraryScreen() {
  const router = useRouter();
  const tabBarHeight = 80;
  const [glowState, setGlowState] = useState<GlowEvent>('default');
  const [recordings, setRecordings] = useState<SavedRecording[]>([]);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const playerRef = useRef<AudioPlayer | null>(null);
  const statusTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadRecordings = useCallback(async () => {
    const next = await getSavedRecordings();
    setRecordings(next);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadRecordings();
      return () => {
        if (statusTimerRef.current) {
          clearInterval(statusTimerRef.current);
          statusTimerRef.current = null;
        }
        if (playerRef.current) {
          playerRef.current.remove();
          playerRef.current = null;
        }
        setPlayingId(null);
      };
    }, [loadRecordings])
  );

  const watchPlayerStatus = () => {
    if (statusTimerRef.current) {
      clearInterval(statusTimerRef.current);
      statusTimerRef.current = null;
    }
    statusTimerRef.current = setInterval(() => {
      const player = playerRef.current;
      if (!player) {
        return;
      }
      const duration = player.duration || 0;
      const current = player.currentTime || 0;
      if (!player.playing && duration > 0 && current >= duration - 0.05) {
        player.remove();
        playerRef.current = null;
        setPlayingId(null);
        if (statusTimerRef.current) {
          clearInterval(statusTimerRef.current);
          statusTimerRef.current = null;
        }
      }
    }, 120);
  };

  const handlePlay = async (item: SavedRecording) => {
    if (playerRef.current && playingId === item.id) {
      if (playerRef.current.playing) {
        playerRef.current.pause();
        setPlayingId(null);
        if (statusTimerRef.current) {
          clearInterval(statusTimerRef.current);
          statusTimerRef.current = null;
        }
      } else {
        playerRef.current.play();
        setPlayingId(item.id);
        watchPlayerStatus();
      }
      return;
    }

    if (statusTimerRef.current) {
      clearInterval(statusTimerRef.current);
      statusTimerRef.current = null;
    }
    if (playerRef.current) {
      playerRef.current.remove();
      playerRef.current = null;
    }

    await setAudioModeAsync({
      playsInSilentMode: true,
      allowsRecording: false,
      shouldPlayInBackground: true,
    });
    const player = createAudioPlayer(item.uri);
    playerRef.current = player;
    setPlayingId(item.id);
    player.play();
    watchPlayerStatus();
  };

  const renderItem = ({ item }: { item: SavedRecording }) => {
    const glowColor = AFFIRMATION_PILLARS[item.pillar as keyof typeof AFFIRMATION_PILLARS]?.color ?? Colors.chakra.violet;
    const createdAtLabel = new Date(item.createdAt).toLocaleDateString();

    return (
      <View style={styles.cardRow}>
        <AnimatedGlow
          preset={GlowPresets.vaporwave(Layout.borderRadius, glowColor)}
          activeState="default"
        >
          <View style={[styles.cardOuter, { borderColor: glowColor }]}>
            <View style={styles.cardInner}>
              <View style={styles.cardTextContainer}>
                <TouchableOpacity
                  onPress={() =>
                    router.push({
                      pathname: '/add/library-recording',
                      params: { id: item.id },
                    })
                  }
                >
                  <Text style={styles.cardTitle}>{item.text}</Text>
                  <Text style={styles.cardSubtitle}>{item.pillar} · {createdAtLabel}</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={styles.playButton} onPress={() => handlePlay(item)}>
                <Ionicons name={playingId === item.id ? 'pause' : 'play'} size={20} color={Colors.text} />
              </TouchableOpacity>
            </View>
          </View>
        </AnimatedGlow>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Affirmations</Text>
      </View>

      <FlatList
        data={recordings}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        contentContainerStyle={[styles.listContent, { paddingBottom: tabBarHeight + 100 }]}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No affirmations yet. Tap + to add one.</Text>
        }
      />

      <View style={[styles.fabWrapper, { bottom: tabBarHeight + 20 }]}>
        <AnimatedGlow
          preset={GlowPresets.chakra(30)}
          activeState={glowState}
        >
          <Pressable 
            style={styles.fab}
            onPress={() => router.push('/add/pillar')}
            onPressIn={() => setGlowState('press')}
            onPressOut={() => setGlowState('default')}
          >
            <LinearGradient
              colors={Colors.chakra.gradient}
              style={styles.fabGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Ionicons name="add" size={32} color={Colors.text} />
            </LinearGradient>
          </Pressable>
        </AnimatedGlow>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  headerTitle: {
    fontFamily: Fonts.serif,
    fontSize: 32,
    color: Colors.text,
  },
  listContent: {
    padding: 20,
    paddingBottom: 100, // Space for FAB
  },
  cardRow: {
    marginBottom: 16,
  },
  cardOuter: {
    borderRadius: Layout.borderRadius,
    borderWidth: 2,
    padding: 4,
  },
  cardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.background,
    borderRadius: Layout.borderRadius - 4,
    padding: 18,
  },
  cardTextContainer: {
    flex: 1,
  },
  cardTitle: {
    fontFamily: Fonts.serif,
    fontSize: 18,
    color: Colors.text,
    marginBottom: 4,
  },
  cardSubtitle: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    color: Colors.textSecondary,
  },
  playButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#222',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 16,
  },
  emptyText: {
    fontFamily: Fonts.mono,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 40,
  },
  fabWrapper: {
    position: 'absolute',
    right: 20,
    zIndex: 999,
    elevation: 30,
  },
  fab: {
    width: 60,
    height: 60,
    borderRadius: 30,
    elevation: 8,
    shadowColor: Colors.chakra.red,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
  },
  fabGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 30,
  },
});
