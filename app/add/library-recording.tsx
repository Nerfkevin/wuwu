import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { createAudioPlayer } from 'expo-audio';
import type { AudioPlayer } from 'expo-audio';
import { AFFIRMATION_PILLARS } from '@/constants/affirmations';
import * as Haptics from 'expo-haptics';
import { Colors, Fonts } from '@/constants/theme';
import AffirmationCard from './components/affirmation-card';
import {
  deleteSavedRecording,
  getSavedRecordingById,
  SavedRecording,
} from '@/lib/recording-store';
import {
  activateLockScreenControls,
  clearLockScreenControls,
  configureMixedPlaybackAsync,
} from '@/lib/audio-playback';
import {
  ALL_PLAYLIST_ID,
  Playlist,
  addRecordingToPlaylist,
  cleanupRecordingFromAllPlaylists,
  createPlaylist,
  getPlaylists,
  removeRecordingFromPlaylist,
} from '@/lib/playlist-store';

export default function LibraryRecordingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; playlistId?: string }>();
  const [recording, setRecording] = useState<SavedRecording | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const [allPlaylists, setAllPlaylists] = useState<Playlist[]>([]);
  const [showCreateInput, setShowCreateInput] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const playerRef = useRef<AudioPlayer | null>(null);

  const playlistId = params.playlistId ?? ALL_PLAYLIST_ID;
  const isCustomPlaylist = playlistId !== ALL_PLAYLIST_ID;

  useEffect(() => {
    const load = async () => {
      if (!params.id) return;
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
        clearLockScreenControls(playerRef.current);
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
      clearLockScreenControls(playerRef.current);
      playerRef.current.remove();
      playerRef.current = null;
    }
    setIsPlaying(false);
    if (resetProgress) setProgress(0);
  };

  const handlePlayback = async () => {
    if (!recording) return;
    if (playerRef.current) {
      if (playerRef.current.playing) {
        playerRef.current.pause();
        clearLockScreenControls(playerRef.current);
        setIsPlaying(false);
        if (progressTimerRef.current) {
          clearInterval(progressTimerRef.current);
          progressTimerRef.current = null;
        }
      } else {
        activateLockScreenControls(playerRef.current, { title: recording.text });
        playerRef.current.play();
        setIsPlaying(true);
        progressTimerRef.current = setInterval(() => {
          const active = playerRef.current;
          if (!active) return;
          const duration = active.duration || 0;
          const current = active.currentTime || 0;
          setProgress(duration > 0 ? Math.min(1, current / duration) : 0);
          if (!active.playing && current >= duration && duration > 0) {
            clearLockScreenControls(active);
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

    await configureMixedPlaybackAsync();
    const player = createAudioPlayer(recording.uri);
    playerRef.current = player;
    setIsPlaying(true);
    setProgress(0);
    activateLockScreenControls(player, { title: recording.text });
    player.play();

    progressTimerRef.current = setInterval(() => {
      const active = playerRef.current;
      if (!active) return;
      const duration = active.duration || 0;
      const current = active.currentTime || 0;
      setProgress(duration > 0 ? Math.min(1, current / duration) : 0);
      if (!active.playing && current >= duration && duration > 0) {
        clearLockScreenControls(active);
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
    if (!recording) return;

    if (isCustomPlaylist) {
      Alert.alert(
        'Remove from playlist?',
        'This recording will be removed from this playlist but stays in your library.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: async () => {
              stopPlayback(true);
              await removeRecordingFromPlaylist(playlistId, recording.id);
              router.back();
            },
          },
        ]
      );
    } else {
      Alert.alert(
        'Delete recording?',
        'This will permanently remove it from your library and all playlists.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              stopPlayback(true);
              await deleteSavedRecording(recording.id);
              await cleanupRecordingFromAllPlaylists(recording.id);
              router.replace({
                pathname: '/add/recording',
                params: { text: recording.text, pillar: recording.pillar },
              });
            },
          },
        ]
      );
    }
  };

  const handleOpenAddToPlaylist = async () => {
    const pls = await getPlaylists();
    setAllPlaylists(pls);
    setShowPlaylistModal(true);
  };

  const handleSelectPlaylist = async (playlist: Playlist) => {
    if (!recording) return;
    await addRecordingToPlaylist(playlist.id, recording.id);
    setShowPlaylistModal(false);
    setShowCreateInput(false);
    setNewPlaylistName('');
  };

  const handleCreateAndAdd = async () => {
    const name = newPlaylistName.trim();
    if (!name || !recording) return;
    const playlist = await createPlaylist(name);
    setAllPlaylists((prev) => [...prev, playlist]);
    await addRecordingToPlaylist(playlist.id, recording.id);
    setShowPlaylistModal(false);
    setShowCreateInput(false);
    setNewPlaylistName('');
  };

  const availablePlaylists = allPlaylists.filter(
    (p) => !p.recordingIds.includes(recording?.id ?? '')
  );

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
        <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.back(); }} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <View style={styles.cardGlowWrapper}>
          <AffirmationCard glowColor={pillarColor}>
            <Text style={styles.affirmationText}>
              "{recording?.text ?? 'Recording not found.'}"
            </Text>
          </AffirmationCard>
        </View>

        <View style={styles.controls}>
          <View style={styles.playbackRow}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
            </View>
            <TouchableOpacity style={styles.playButton} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); handlePlayback(); }}>
              <Ionicons name={isPlaying ? 'pause' : 'play'} size={22} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.deleteBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); handleDelete(); }}>
              <Ionicons
                name={isCustomPlaylist ? 'remove-circle-outline' : 'trash-outline'}
                size={26}
                color="#FF4D4F"
              />
            </TouchableOpacity>
            <TouchableOpacity style={styles.addToPlaylistBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); handleOpenAddToPlaylist(); }}>
              <Ionicons name="list-outline" size={26} color={Colors.chakra.violet} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <Modal
        visible={showPlaylistModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowPlaylistModal(false);
          setShowCreateInput(false);
          setNewPlaylistName('');
        }}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlayWrapper}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable
            style={styles.modalOverlay}
            onPress={() => {
              setShowPlaylistModal(false);
              setShowCreateInput(false);
              setNewPlaylistName('');
            }}
          >
            <Pressable style={styles.modalBox} onPress={() => {}}>
              <Text style={styles.modalTitle}>Add to Playlist</Text>

              {availablePlaylists.length === 0 && !showCreateInput && (
                <Text style={styles.modalEmpty}>
                  {allPlaylists.length === 0
                    ? 'No playlists yet.'
                    : 'Already in all playlists.'}
                </Text>
              )}

              {availablePlaylists.length > 0 && (
                <FlatList
                  data={availablePlaylists}
                  keyExtractor={(item) => item.id}
                  scrollEnabled={false}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.playlistRow}
                      onPress={() => { Haptics.selectionAsync(); handleSelectPlaylist(item); }}
                    >
                      <Ionicons name="musical-notes-outline" size={18} color={Colors.textSecondary} />
                      <Text style={styles.playlistRowText}>{item.name}</Text>
                      <Ionicons name="add" size={18} color={Colors.chakra.violet} />
                    </TouchableOpacity>
                  )}
                  ItemSeparatorComponent={() => <View style={styles.separator} />}
                />
              )}

              {showCreateInput ? (
                <View style={styles.createInputRow}>
                  <TextInput
                    style={styles.createInput}
                    placeholder="Playlist name…"
                    placeholderTextColor={Colors.textSecondary}
                    value={newPlaylistName}
                    onChangeText={setNewPlaylistName}
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={handleCreateAndAdd}
                  />
                  <TouchableOpacity
                    style={[
                      styles.createConfirmBtn,
                      !newPlaylistName.trim() && styles.createConfirmBtnDisabled,
                    ]}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); handleCreateAndAdd(); }}
                    disabled={!newPlaylistName.trim()}
                  >
                    <Ionicons name="checkmark" size={18} color="#000" />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.newPlaylistBtn}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowCreateInput(true); }}
                >
                  <Ionicons name="add-circle-outline" size={18} color={Colors.chakra.violet} />
                  <Text style={styles.newPlaylistBtnText}>New Playlist</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => {
                  setShowPlaylistModal(false);
                  setShowCreateInput(false);
                  setNewPlaylistName('');
                }}
              >
                <Text style={styles.modalCloseTxt}>Done</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
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
    flexDirection: 'row',
    gap: 16,
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
  addToPlaylistBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: Colors.chakra.violet,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(139,92,246,0.12)',
  },
  modalOverlayWrapper: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalBox: {
    width: '100%',
    backgroundColor: '#16112A',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    padding: 24,
  },
  modalTitle: {
    fontFamily: Fonts.mono,
    fontSize: 16,
    color: Colors.text,
    marginBottom: 16,
  },
  modalEmpty: {
    fontFamily: Fonts.mono,
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingVertical: 12,
  },
  playlistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  playlistRowText: {
    flex: 1,
    fontFamily: Fonts.mono,
    fontSize: 14,
    color: Colors.text,
  },
  separator: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  newPlaylistBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    paddingVertical: 10,
  },
  newPlaylistBtnText: {
    fontFamily: Fonts.mono,
    fontSize: 14,
    color: Colors.chakra.violet,
  },
  createInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
  },
  createInput: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 12,
    fontFamily: Fonts.mono,
    fontSize: 14,
    color: Colors.text,
  },
  createConfirmBtn: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: Colors.chakra.violet,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createConfirmBtnDisabled: {
    backgroundColor: 'rgba(139,92,246,0.3)',
  },
  modalCloseBtn: {
    marginTop: 20,
    alignSelf: 'flex-end',
  },
  modalCloseTxt: {
    fontFamily: Fonts.mono,
    fontSize: 14,
    color: Colors.chakra.violet,
  },
});
