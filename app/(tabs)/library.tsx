import React, { useCallback, useMemo, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import {
  Animated,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Dimensions,
} from 'react-native';

const { width: screenWidth } = Dimensions.get('window');
const isSmallDevice = screenWidth < 380;
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import AnimatedGlow, { GlowEvent } from '@/lib/animated-glow';
import { Colors, Fonts, Layout } from '@/constants/theme';
import { GlowPresets } from '@/constants/glow';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createAudioPlayer } from '@/lib/expo-audio';
import type { AudioPlayer } from '@/lib/expo-audio';
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import SwipeableItem, { useSwipeableItemParams } from 'react-native-swipeable-item';
import { getSavedRecordings, reorderSavedRecordings, deleteSavedRecording, SavedRecording } from '@/lib/recording-store';
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
import { usePostHog, usePostHogScreenViewed } from '@/lib/posthog';

const springPressIn = { toValue: 0.92 as const, useNativeDriver: true as const, speed: 60, bounciness: 0 };
const springPressOut = { toValue: 1 as const, useNativeDriver: true as const, speed: 40, bounciness: 6 };

function PlaylistChip({
  isActive,
  onPress,
  onLongPress,
  delayLongPress,
  children,
}: {
  isActive: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  delayLongPress?: number;
  children: React.ReactNode;
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const handlePressIn = () => {
    Animated.spring(scaleAnim, springPressIn).start();
  };
  const handlePressOut = () => {
    Animated.spring(scaleAnim, springPressOut).start();
  };
  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <Pressable
        style={[styles.playlistChip, isActive && styles.playlistChipActive]}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onLongPress={onLongPress}
        delayLongPress={onLongPress ? (delayLongPress ?? 500) : undefined}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

function PlaylistAddButton({ onPress }: { onPress: () => void }) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const handlePressIn = () => {
    Animated.spring(scaleAnim, springPressIn).start();
  };
  const handlePressOut = () => {
    Animated.spring(scaleAnim, springPressOut).start();
  };
  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <Pressable
        style={styles.playlistAddBtn}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      >
        <Ionicons name="add" size={14} color={Colors.textSecondary} />
        <Text style={styles.playlistAddText}>Playlist</Text>
      </Pressable>
    </Animated.View>
  );
}

function DeleteUnderlay({
  item,
  onDelete,
}: {
  item: SavedRecording;
  onDelete: (item: SavedRecording) => void;
}) {
  const { close } = useSwipeableItemParams<SavedRecording>();
  return (
    <View style={styles.underlayLeft}>
      <TouchableOpacity
        style={styles.deleteBtn}
        onPress={() => {
          close();
          onDelete(item);
        }}
      >
        <Ionicons name="trash" size={22} color="#fff" />
        <Text style={styles.deleteBtnText}>Delete</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function LibraryScreen() {
  usePostHogScreenViewed({
    screen: "tabs/library",
    component: "LibraryScreen",
  });

  const ph = usePostHog();
  const router = useRouter();
  const { bottom: bottomInset } = useSafeAreaInsets();
  const tabBarHeight = 50 + bottomInset;
  const [glowState, setGlowState] = useState<GlowEvent>('default');
  const fabScale = useRef(new Animated.Value(1)).current;
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
    try {
      ph?.capture('library_recording_played', { pillar: item.pillar });
    } catch {}
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
    try {
      ph?.capture('playlist_created');
    } catch {}
  };

  const handleDeleteRecording = useCallback(
    (item: SavedRecording) => {
      Alert.alert(
        'Delete Recording',
        `Delete "${item.text}"? This cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              if (playerRef.current && playingId === item.id) {
                clearLockScreenControls(playerRef.current);
                playerRef.current.remove();
                playerRef.current = null;
                setPlayingId(null);
              }
              await deleteSavedRecording(item.id);
              setRecordings((prev) => prev.filter((r) => r.id !== item.id));
              try {
                ph?.capture('recording_deleted', { pillar: item.pillar });
              } catch {}
            },
          },
        ]
      );
    },
    [playingId]
  );

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

  const renderUnderlayLeft = ({ item }: { item: SavedRecording }) => (
    <DeleteUnderlay item={item} onDelete={handleDeleteRecording} />
  );

  const renderItem = ({ item, drag, isActive }: RenderItemParams<SavedRecording>) => {
    const glowColor =
      AFFIRMATION_PILLARS[item.pillar as keyof typeof AFFIRMATION_PILLARS]?.color ??
      Colors.chakra.violet;
    const isHoldActive = activeDragId === item.id || pressedHandleId === item.id;

    return (
      <View style={styles.cardRow}>
        <SwipeableItem
          key={item.id}
          item={item}
          renderUnderlayLeft={() => renderUnderlayLeft({ item })}
          snapPointsLeft={[80]}
          swipeEnabled={!isActive}
        >
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
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push({
                      pathname: '/add/library-recording',
                      params: { id: item.id, playlistId: selectedPlaylistId },
                    });
                  }}
                >
                  <View style={styles.leftMeta}>
                    <TouchableOpacity
                      style={styles.dragHandle}
                      onPressIn={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setPressedHandleId(item.id); }}
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
                    <TouchableOpacity style={styles.playButton} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); handlePlay(item); }}>
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
        </SwipeableItem>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[Colors.background, '#1A0B2E', Colors.background]}
        locations={[0, 0.4, 1]}
        style={StyleSheet.absoluteFill}
      />
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
        <PlaylistChip
          isActive={selectedPlaylistId === ALL_PLAYLIST_ID}
          onPress={() => { Haptics.selectionAsync(); setSelectedPlaylistId(ALL_PLAYLIST_ID); }}
        >
          <Text
            style={[
              styles.playlistChipText,
              selectedPlaylistId === ALL_PLAYLIST_ID && styles.playlistChipTextActive,
            ]}
          >
            All Recorded
          </Text>
        </PlaylistChip>

        {playlists.map((pl) => (
          <PlaylistChip
            key={pl.id}
            isActive={selectedPlaylistId === pl.id}
            onPress={() => { Haptics.selectionAsync(); setSelectedPlaylistId(pl.id); }}
            onLongPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); handleDeletePlaylist(pl); }}
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
          </PlaylistChip>
        ))}

        <PlaylistAddButton
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowCreateInput((v) => !v); }}
        />
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
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); handleCreatePlaylist(); }}
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
        contentContainerStyle={[styles.listContent, { paddingBottom: tabBarHeight + 220 }]}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {selectedPlaylistId === ALL_PLAYLIST_ID
              ? 'No affirmation tracks yet. Tap + to add one.'
              : 'No affirmation tracks yet. Tap + to add one.'}
          </Text>
        }
      />

      <Animated.View style={[styles.fabWrapper, { bottom: tabBarHeight - 40 }, { transform: [{ scale: fabScale }] }]}>
        <AnimatedGlow preset={GlowPresets.chakra(30, ['#6B21CC', '#BF5FFF', '#FF4DC4', '#BF5FFF', '#6B21CC'], 6, 6)} activeState={glowState}>
          <Pressable
            style={styles.fab}
            onPress={() => router.push('/add/pillar')}
            onPressIn={() => {
              setGlowState('press');
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              Animated.spring(fabScale, { toValue: 0.88, useNativeDriver: true, speed: 50, bounciness: 0 }).start();
            }}
            onPressOut={() => {
              setGlowState('default');
              Animated.spring(fabScale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 8 }).start();
            }}
          >
            <LinearGradient
              colors={['#6B21CC', '#BF5FFF', '#FF4DC4']}
              style={styles.fabGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Ionicons name="add" size={32} color={Colors.text} />
            </LinearGradient>
          </Pressable>
        </AnimatedGlow>
      </Animated.View>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingTop: isSmallDevice ? 60 : 80,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  headerTitle: {
    fontFamily: Fonts.serif,
    fontSize: isSmallDevice ? 32 : 40,
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
    marginBottom: 3,
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
    marginBottom: 3,
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
    fontFamily: Fonts.mono,
    fontSize: 14,
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
    shadowColor: '#BF5FFF',
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
  underlayLeft: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    borderRadius: Layout.borderRadius,
    overflow: 'hidden',
    backgroundColor: '#c0392b',
  },
  deleteBtn: {
    width: 80,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#c0392b',
    alignSelf: 'stretch',
  },
  deleteBtnText: {
    fontFamily: Fonts.mono,
    fontSize: 11,
    color: '#fff',
  },
});
