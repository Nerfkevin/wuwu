import { Directory, File, Paths } from 'expo-file-system';

export type SavedRecording = {
  id: string;
  text: string;
  pillar: string;
  uri: string;
  createdAt: number;
};

const RECORDINGS_DIR = new Directory(Paths.document, 'recordings');
const RECORDINGS_INDEX_FILE = new File(RECORDINGS_DIR, 'index.json');

const ensureStorage = () => {
  if (!RECORDINGS_DIR.exists) {
    RECORDINGS_DIR.create({ intermediates: true, idempotent: true });
  }
  if (!RECORDINGS_INDEX_FILE.exists) {
    RECORDINGS_INDEX_FILE.create({ intermediates: true, overwrite: true });
    RECORDINGS_INDEX_FILE.write('[]');
  }
};

const readIndex = async () => {
  ensureStorage();
  try {
    const raw = await RECORDINGS_INDEX_FILE.text();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed as SavedRecording[];
    }
    return [];
  } catch {
    return [];
  }
};

const writeIndex = (items: SavedRecording[]) => {
  ensureStorage();
  RECORDINGS_INDEX_FILE.write(JSON.stringify(items));
};

const getFileExtension = (uri: string) => {
  const clean = uri.split('?')[0];
  const last = clean.split('.').pop();
  if (!last || last.includes('/')) {
    return 'm4a';
  }
  return last;
};

const normalizeFileUri = (uri: string) => {
  if (uri.startsWith('file://')) {
    return uri;
  }
  if (uri.startsWith('/')) {
    return `file://${uri}`;
  }
  return uri;
};

export const saveRecordingToDevice = async ({
  sourceUri,
  text,
  pillar,
}: {
  sourceUri: string;
  text: string;
  pillar: string;
}) => {
  ensureStorage();
  const id = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const extension = getFileExtension(sourceUri);
  const destination = new File(RECORDINGS_DIR, `${id}.${extension}`);
  const sourceFile = new File(normalizeFileUri(sourceUri));
  sourceFile.copy(destination);

  const entry: SavedRecording = {
    id,
    text,
    pillar,
    uri: destination.uri,
    createdAt: Date.now(),
  };

  const current = await readIndex();
  writeIndex([entry, ...current]);
  return entry;
};

export const getSavedRecordings = async () => {
  return await readIndex();
};

export const reorderSavedRecordings = async (orderedIds: string[]) => {
  const items = await readIndex();
  const byId = new Map(items.map((item) => [item.id, item]));
  const reordered: SavedRecording[] = [];

  for (const id of orderedIds) {
    const item = byId.get(id);
    if (item) {
      reordered.push(item);
      byId.delete(id);
    }
  }

  if (byId.size > 0) {
    reordered.push(...Array.from(byId.values()));
  }

  writeIndex(reordered);
  return reordered;
};

export const getSavedRecordingById = async (id: string) => {
  const items = await readIndex();
  return items.find((item) => item.id === id) ?? null;
};

export const deleteSavedRecording = async (id: string) => {
  const items = await readIndex();
  const target = items.find((item) => item.id === id);
  const next = items.filter((item) => item.id !== id);
  writeIndex(next);

  if (target?.uri) {
    const targetFile = new File(normalizeFileUri(target.uri));
    if (targetFile.exists) {
      targetFile.delete();
    }
  }
};
