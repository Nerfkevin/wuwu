import React, { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import type { AudioPlayer } from 'expo-audio';
import { AFFIRMATION_PILLARS } from '@/constants/affirmations';
import { Colors, Fonts } from '@/constants/theme';
import AffirmationCard from './components/affirmation-card';
import {
  deleteSavedRecording,
  getSavedRecordingById,
  SavedRecording,
} from './recording-store';

export default function LibraryRecordingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const [recording, setRecording] = useState<SavedRecording | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const playerRef = useRef<AudioPlayer | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!params.id) {
        return;
      }
      const entry = await getSavedRecordingById(params.id);
      setRecording(entry);
    };
    load();
  }, [params.id]);

  useEffect(() => {
    return () => {
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
      if (playerRef.current) {
        playerRef.current.remove();
        playerRef.current = null;
      }
    };
  }, []);

  const stopPlayback = (resetProgress: boolean) => {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
    if (playerRef.current) {
      playerRef.current.remove();
      playerRef.current = null;
    }
    setIsPlaying(false);
    if (resetProgress) {
      setProgress(0);
    }
  };

  const handlePlayback = async () => {
    if (!recording) {
      return;
    }
    if (playerRef.current) {
      if (playerRef.current.playing) {
        playerRef.current.pause();
        setIsPlaying(false);
        if (progressTimerRef.current) {
          clearInterval(progressTimerRef.current);
          progressTimerRef.current = null;
        }
      } else {
        playerRef.current.play();
        setIsPlaying(true);
        progressTimerRef.current = setInterval(() => {
          const active = playerRef.current;
          if (!active) {
            return;
          }
          const duration = active.duration || 0;
          const current = active.currentTime || 0;
          const next = duration > 0 ? Math.min(1, current / duration) : 0;
          setProgress(next);
          if (!active.playing && current >= duration && duration > 0) {
            active.remove();
            playerRef.current = null;
            setIsPlaying(false);
            if (progressTimerRef.current) {
              clearInterval(progressTimerRef.current);
              progressTimerRef.current = null;
            }
            setProgress(1);
          }
        }, 80);
      }
      return;
    }

    await setAudioModeAsync({
      playsInSilentMode: true,
      allowsRecording: false,
      shouldPlayInBackground: true,
    });
    const player = createAudioPlayer(recording.uri);
    playerRef.current = player;
    setIsPlaying(true);
    setProgress(0);
    player.play();

    progressTimerRef.current = setInterval(() => {
      const active = playerRef.current;
      if (!active) {
        return;
      }
      const duration = active.duration || 0;
      const current = active.currentTime || 0;
      const next = duration > 0 ? Math.min(1, current / duration) : 0;
      setProgress(next);
      if (!active.playing && current >= duration && duration > 0) {
        active.remove();
        playerRef.current = null;
        setIsPlaying(false);
        if (progressTimerRef.current) {
          clearInterval(progressTimerRef.current);
          progressTimerRef.current = null;
        }
        setProgress(1);
      }
    }, 80);
  };

  const handleDelete = () => {
    if (!recording) {
      return;
    }
    Alert.alert('Delete recording?', 'This recording will be removed from your library.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          stopPlayback(true);
          await deleteSavedRecording(recording.id);
          router.replace({
            pathname: '/add/recording',
            params: { text: recording.text, pillar: recording.pillar },
          });
        },
      },
    ]);
  };

  const pillarColor =
    AFFIRMATION_PILLARS[recording?.pillar as keyof typeof AFFIRMATION_PILLARS]?.color ??
    Colors.chakra.violet;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <LinearGradient
        colors={[Colors.background, '#1A0B2E', Colors.background]}
        locations={[0, 0.4, 1]}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <View style={styles.cardGlowWrapper}>
          <AffirmationCard glowColor={pillarColor}>
            <Text style={styles.affirmationText}>
              “{recording?.text ?? 'Recording not found.'}”
            </Text>
          </AffirmationCard>
        </View>

        <View style={styles.controls}>
          <View style={styles.playbackRow}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
            </View>
            <TouchableOpacity style={styles.playButton} onPress={handlePlayback}>
              <Ionicons name={isPlaying ? 'pause' : 'play'} size={22} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
              <Ionicons name="trash-outline" size={26} color="#FF4D4F" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    paddingTop: 58,
    paddingHorizontal: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  cardGlowWrapper: {
    width: '100%',
    alignItems: 'center',
    marginTop: 24,
  },
  affirmationText: {
    fontFamily: Fonts.serif,
    fontSize: 30,
    lineHeight: 40,
    textAlign: 'center',
    color: Colors.text,
  },
  controls: {
    width: '100%',
    marginTop: 36,
    alignItems: 'center',
  },
  playbackRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 18,
  },
  progressTrack: {
    flex: 1,
    height: 6,
    borderRadius: 99,
    backgroundColor: 'rgba(255,255,255,0.14)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#FFFFFF',
  },
  playButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#1F1F26',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.textSecondary,
  },
  actionsRow: {
    width: 56,
    alignItems: 'center',
    marginTop: 8,
  },
  deleteBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#FF4D4F',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,77,79,0.12)',
  },
});
