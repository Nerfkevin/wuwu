import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import AnimatedGlow, { GlowEvent } from '@/lib/animated-glow';
import { Colors, Fonts, Layout } from '@/constants/theme';
import { GlowPresets } from '@/constants/glow';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { createAudioPlayer } from 'expo-audio';
import type { AudioPlayer } from 'expo-audio';
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import { getSavedRecordings, reorderSavedRecordings, SavedRecording } from '@/lib/recording-store';
import { AFFIRMATION_PILLARS } from '@/constants/affirmations';
import {
  activateLockScreenControls,
  clearLockScreenControls,
  configureMixedPlaybackAsync,
} from '@/lib/audio-playback';
import {
  ALL_PLAYLIST_ID,
  Playlist,
  createPlaylist,
  deletePlaylist,
  getPlaylists,
  reorderPlaylistRecordings,
} from '@/lib/playlist-store';

export default function LibraryScreen() {
  const router = useRouter();
  const tabBarHeight = 80;
  const [glowState, setGlowState] = useState<GlowEvent>('default');
  const [recordings, setRecordings] = useState<SavedRecording[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState(ALL_PLAYLIST_ID);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [pressedHandleId, setPressedHandleId] = useState<string | null>(null);
  const [showCreateInput, setShowCreateInput] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const playerRef = useRef<AudioPlayer | null>(null);
  const statusTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadData = useCallback(async () => {
    const [recs, pls] = await Promise.all([getSavedRecordings(), getPlaylists()]);
    setRecordings(recs);
    setPlaylists(pls);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
      return () => {
        if (statusTimerRef.current) {
          clearInterval(statusTimerRef.current);
          statusTimerRef.current = null;
        }
        if (playerRef.current) {
          clearLockScreenControls(playerRef.current);
          playerRef.current.remove();
          playerRef.current = null;
        }
        setPlayingId(null);
      };
    }, [loadData])
  );

  const displayedRecordings = useMemo(() => {
    if (selectedPlaylistId === ALL_PLAYLIST_ID) return recordings;
    const playlist = playlists.find((p) => p.id === selectedPlaylistId);
    if (!playlist) return [];
    const byId = new Map(recordings.map((r) => [r.id, r]));
    return playlist.recordingIds
      .map((id) => byId.get(id))
      .filter(Boolean) as SavedRecording[];
  }, [recordings, playlists, selectedPlaylistId]);

  const watchPlayerStatus = () => {
    if (statusTimerRef.current) {
      clearInterval(statusTimerRef.current);
      statusTimerRef.current = null;
    }
    statusTimerRef.current = setInterval(() => {
      const player = playerRef.current;
      if (!player) return;
      const duration = player.duration || 0;
      const current = player.currentTime || 0;
      if (!player.playing && duration > 0 && current >= duration - 0.05) {
        clearLockScreenControls(player);
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
        clearLockScreenControls(playerRef.current);
        setPlayingId(null);
        if (statusTimerRef.current) {
          clearInterval(statusTimerRef.current);
          statusTimerRef.current = null;
        }
      } else {
        activateLockScreenControls(playerRef.current, { title: item.text });
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
      clearLockScreenControls(playerRef.current);
      playerRef.current.remove();
      playerRef.current = null;
    }

    await configureMixedPlaybackAsync();
    const player = createAudioPlayer(item.uri);
    playerRef.current = player;
    setPlayingId(item.id);
    activateLockScreenControls(player, { title: item.text });
    player.play();
    watchPlayerStatus();
  };

  const handleDragEnd = useCallback(
    async (data: SavedRecording[]) => {
      setActiveDragId(null);
      setPressedHandleId(null);
      if (selectedPlaylistId === ALL_PLAYLIST_ID) {
        setRecordings(data);
        await reorderSavedRecordings(data.map((e) => e.id));
      } else {
        const newIds = data.map((e) => e.id);
        setPlaylists((prev) =>
          prev.map((p) => (p.id === selectedPlaylistId ? { ...p, recordingIds: newIds } : p))
        );
        await reorderPlaylistRecordings(selectedPlaylistId, newIds);
      }
    },
    [selectedPlaylistId]
  );

  const handleDragBegin = useCallback(
    (index: number) => {
      const active = displayedRecordings[index];
      setActiveDragId(active?.id ?? null);
      setPressedHandleId(active?.id ?? null);
    },
    [displayedRecordings]
  );

  const handleDragRelease = useCallback(() => {
    setActiveDragId(null);
    setPressedHandleId(null);
  }, []);

  const handleCreatePlaylist = async () => {
    const name = newPlaylistName.trim();
    if (!name) return;
    const playlist = await createPlaylist(name);
    setPlaylists((prev) => [...prev, playlist]);
    setNewPlaylistName('');
    setShowCreateInput(false);
    setSelectedPlaylistId(playlist.id);
  };

  const handleDeletePlaylist = (playlist: Playlist) => {
    Alert.alert(`Delete "${playlist.name}"?`, 'Recordings will not be deleted.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deletePlaylist(playlist.id);
          setPlaylists((prev) => prev.filter((p) => p.id !== playlist.id));
          if (selectedPlaylistId === playlist.id) setSelectedPlaylistId(ALL_PLAYLIST_ID);
        },
      },
    ]);
  };

  const renderItem = ({ item, drag, isActive }: RenderItemParams<SavedRecording>) => {
    const glowColor =
      AFFIRMATION_PILLARS[item.pillar as keyof typeof AFFIRMATION_PILLARS]?.color ??
      Colors.chakra.violet;
    const isHoldActive = activeDragId === item.id || pressedHandleId === item.id;

    return (
      <View style={styles.cardRow}>
        <ScaleDecorator activeScale={1.03}>
          <AnimatedGlow
            preset={GlowPresets.vaporwave(Layout.borderRadius, glowColor)}
            activeState="default"
          >
            <View
              style={[
                styles.cardOuter,
                { borderColor: glowColor },
                isActive && styles.cardOuterActive,
                isHoldActive && styles.cardOuterHold,
              ]}
            >
              <Pressable
                style={({ pressed }) => [styles.cardInner, pressed && styles.cardInnerPressed]}
                onPress={() =>
                  router.push({
                    pathname: '/add/library-recording',
                    params: { id: item.id, playlistId: selectedPlaylistId },
                  })
                }
              >
                <View style={styles.leftMeta}>
                  <TouchableOpacity
                    style={styles.dragHandle}
                    onPressIn={() => setPressedHandleId(item.id)}
                    onPressOut={() =>
                      setPressedHandleId((current) => (current === item.id ? null : current))
                    }
                    onLongPress={drag}
                    disabled={isActive}
                    delayLongPress={140}
                  >
                    <Ionicons name="ellipsis-vertical" size={18} color={Colors.textSecondary} />
                  </TouchableOpacity>
                </View>
                <View style={styles.cardTextContainer}>
                  <Text style={styles.cardTitle}>{item.text}</Text>
                  <Text style={styles.cardSubtitle}>{item.pillar}</Text>
                </View>
                <View style={styles.cardMeta}>
                  <TouchableOpacity style={styles.playButton} onPress={() => handlePlay(item)}>
                    <Ionicons
                      name={playingId === item.id ? 'pause' : 'play'}
                      size={20}
                      color={Colors.text}
                    />
                  </TouchableOpacity>
                </View>
              </Pressable>
            </View>
          </AnimatedGlow>
        </ScaleDecorator>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Affirmation Track</Text>
        <Text style={styles.headerStatus}>{displayedRecordings.length} ACTIVE</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.playlistBarScroll}
        contentContainerStyle={styles.playlistBar}
      >
        <TouchableOpacity
          style={[
            styles.playlistChip,
            selectedPlaylistId === ALL_PLAYLIST_ID && styles.playlistChipActive,
          ]}
          onPress={() => setSelectedPlaylistId(ALL_PLAYLIST_ID)}
        >
          <Text
            style={[
              styles.playlistChipText,
              selectedPlaylistId === ALL_PLAYLIST_ID && styles.playlistChipTextActive,
            ]}
          >
            All Recorded
          </Text>
        </TouchableOpacity>

        {playlists.map((pl) => (
          <TouchableOpacity
            key={pl.id}
            style={[
              styles.playlistChip,
              selectedPlaylistId === pl.id && styles.playlistChipActive,
            ]}
            onPress={() => setSelectedPlaylistId(pl.id)}
            onLongPress={() => handleDeletePlaylist(pl)}
            delayLongPress={500}
          >
            <Text
              style={[
                styles.playlistChipText,
                selectedPlaylistId === pl.id && styles.playlistChipTextActive,
              ]}
            >
              {pl.name}
            </Text>
          </TouchableOpacity>
        ))}

        <TouchableOpacity
          style={styles.playlistAddBtn}
          onPress={() => setShowCreateInput((v) => !v)}
        >
          <Ionicons name="add" size={14} color={Colors.textSecondary} />
          <Text style={styles.playlistAddText}>Playlist</Text>
        </TouchableOpacity>
      </ScrollView>

      {showCreateInput && (
        <View style={styles.createInputRow}>
          <TextInput
            style={styles.createInput}
            placeholder="Playlist name…"
            placeholderTextColor={Colors.textSecondary}
            value={newPlaylistName}
            onChangeText={setNewPlaylistName}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleCreatePlaylist}
          />
          <TouchableOpacity
            style={[
              styles.createConfirmBtn,
              !newPlaylistName.trim() && styles.createConfirmBtnDisabled,
            ]}
            onPress={handleCreatePlaylist}
            disabled={!newPlaylistName.trim()}
          >
            <Ionicons name="checkmark" size={18} color="#000" />
          </TouchableOpacity>
        </View>
      )}

      <DraggableFlatList
        data={displayedRecordings}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        onDragEnd={({ data }) => handleDragEnd(data)}
        onDragBegin={handleDragBegin}
        onRelease={handleDragRelease}
        activationDistance={14}
        autoscrollSpeed={220}
        autoscrollThreshold={48}
        dragItemOverflow={false}
        extraData={activeDragId}
        contentContainerStyle={[styles.listContent, { paddingBottom: tabBarHeight + 100 }]}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {selectedPlaylistId === ALL_PLAYLIST_ID
              ? 'No affirmation tracks yet. Tap + to add one.'
              : 'This playlist is empty. Add tracks via the track detail screen.'}
          </Text>
        }
      />

      <View style={[styles.fabWrapper, { bottom: tabBarHeight + 20 }]}>
        <AnimatedGlow preset={GlowPresets.chakra(30)} activeState={glowState}>
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
    paddingBottom: 12,
  },
  headerTitle: {
    fontFamily: Fonts.mono,
    fontSize: 26,
    color: Colors.text,
  },
  headerStatus: {
    marginTop: 4,
    fontFamily: Fonts.mono,
    fontSize: 11,
    color: Colors.textSecondary,
  },
  playlistBarScroll: {
    flexGrow: 0,
    flexShrink: 0,
  },
  playlistBar: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
    alignItems: 'center',
  },
  playlistChip: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  playlistChipActive: {
    borderColor: Colors.chakra.violet,
    backgroundColor: 'rgba(139,92,246,0.18)',
  },
  playlistChipText: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    color: Colors.textSecondary,
  },
  playlistChipTextActive: {
    color: Colors.text,
  },
  playlistAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderStyle: 'dashed',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  playlistAddText: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    color: Colors.textSecondary,
  },
  listContent: {
    paddingTop: 12,
    paddingHorizontal: 14,
    paddingBottom: 100,
  },
  cardRow: {
    marginBottom: 16,
  },
  cardOuter: {
    borderRadius: Layout.borderRadius,
    borderWidth: 2,
    padding: 4,
  },
  cardOuterActive: {
    opacity: 0.92,
  },
  cardOuterHold: {
    transform: [{ scale: 1.015 }],
  },
  cardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.background,
    borderRadius: Layout.borderRadius - 4,
    paddingLeft: 6,
    paddingRight: 14,
    paddingVertical: 14,
  },
  cardInnerPressed: {
    backgroundColor: '#1A1A1A',
  },
  leftMeta: {
    width: 24,
    alignSelf: 'stretch',
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  cardTextContainer: {
    flex: 1,
    marginLeft: 2,
    marginRight: 10,
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
  dragHandle: {
    width: 20,
    height: 28,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  cardMeta: {
    alignItems: 'center',
    gap: 8,
  },
  playButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#222',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
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
  createInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingBottom: 10,
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
});
