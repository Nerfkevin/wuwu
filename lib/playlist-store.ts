import { Directory, File, Paths } from 'expo-file-system';

export type Playlist = {
  id: string;
  name: string;
  recordingIds: string[];
};

export const ALL_PLAYLIST_ID = '__all__';

const RECORDINGS_DIR = new Directory(Paths.document, 'recordings');
const PLAYLISTS_FILE = new File(RECORDINGS_DIR, 'playlists.json');

const ensureStorage = () => {
  if (!RECORDINGS_DIR.exists) {
    RECORDINGS_DIR.create({ intermediates: true, idempotent: true });
  }
  if (!PLAYLISTS_FILE.exists) {
    PLAYLISTS_FILE.create({ intermediates: true, overwrite: true });
    PLAYLISTS_FILE.write('[]');
  }
};

const readPlaylists = async (): Promise<Playlist[]> => {
  ensureStorage();
  try {
    const raw = await PLAYLISTS_FILE.text();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as Playlist[];
    return [];
  } catch {
    return [];
  }
};

const writePlaylists = (playlists: Playlist[]) => {
  ensureStorage();
  PLAYLISTS_FILE.write(JSON.stringify(playlists));
};

export const getPlaylists = async (): Promise<Playlist[]> => {
  return await readPlaylists();
};

export const createPlaylist = async (name: string): Promise<Playlist> => {
  const playlists = await readPlaylists();
  const playlist: Playlist = {
    id: `${Date.now()}-${Math.floor(Math.random() * 100000)}`,
    name,
    recordingIds: [],
  };
  writePlaylists([...playlists, playlist]);
  return playlist;
};

export const deletePlaylist = async (id: string): Promise<void> => {
  const playlists = await readPlaylists();
  writePlaylists(playlists.filter((p) => p.id !== id));
};

export const addRecordingToPlaylist = async (
  playlistId: string,
  recordingId: string
): Promise<void> => {
  const playlists = await readPlaylists();
  writePlaylists(
    playlists.map((p) =>
      p.id === playlistId && !p.recordingIds.includes(recordingId)
        ? { ...p, recordingIds: [...p.recordingIds, recordingId] }
        : p
    )
  );
};

export const removeRecordingFromPlaylist = async (
  playlistId: string,
  recordingId: string
): Promise<void> => {
  const playlists = await readPlaylists();
  writePlaylists(
    playlists.map((p) =>
      p.id === playlistId
        ? { ...p, recordingIds: p.recordingIds.filter((id) => id !== recordingId) }
        : p
    )
  );
};

export const reorderPlaylistRecordings = async (
  playlistId: string,
  orderedIds: string[]
): Promise<void> => {
  const playlists = await readPlaylists();
  writePlaylists(
    playlists.map((p) => (p.id === playlistId ? { ...p, recordingIds: orderedIds } : p))
  );
};

export const cleanupRecordingFromAllPlaylists = async (recordingId: string): Promise<void> => {
  const playlists = await readPlaylists();
  writePlaylists(
    playlists.map((p) => ({
      ...p,
      recordingIds: p.recordingIds.filter((id) => id !== recordingId),
    }))
  );
};
