import { Directory, File, Paths } from 'expo-file-system';

const PREFS_DIR = new Directory(Paths.document, 'prefs');
const PREFS_FILE = new File(PREFS_DIR, 'session.json');

type SessionPrefs = {
  lastPlaylistId?: string;
};

const ensureStorage = () => {
  if (!PREFS_DIR.exists) PREFS_DIR.create({ intermediates: true, idempotent: true });
  if (!PREFS_FILE.exists) {
    PREFS_FILE.create({ intermediates: true, overwrite: true });
    PREFS_FILE.write('{}');
  }
};

const read = async (): Promise<SessionPrefs> => {
  ensureStorage();
  try {
    return JSON.parse(await PREFS_FILE.text()) as SessionPrefs;
  } catch {
    return {};
  }
};

const write = async (prefs: SessionPrefs) => {
  ensureStorage();
  PREFS_FILE.write(JSON.stringify(prefs));
};

export const getLastPlaylistId = async (): Promise<string | null> => {
  const prefs = await read();
  return prefs.lastPlaylistId ?? null;
};

export const setLastPlaylistId = async (id: string): Promise<void> => {
  const prefs = await read();
  await write({ ...prefs, lastPlaylistId: id });
};
