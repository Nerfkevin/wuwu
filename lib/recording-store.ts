import { Directory, File, Paths } from 'expo-file-system';

export type SavedRecording = {
  id: string;
  text: string;
  pillar: string;
  /** Absolute file:// URI (resolved against current Documents on read). */
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

const isAbsoluteUri = (uri: string) =>
  uri.startsWith('file://') || uri.startsWith('/');

const filenameFromUri = (uri: string) => {
  const clean = uri.split('?')[0];
  const parts = clean.split('/');
  return parts[parts.length - 1] || uri;
};

/** Persist relative filenames so App Store / TestFlight container UUID changes don't break playback. */
const toRelativeUri = (uri: string) => {
  if (!uri) return uri;
  return isAbsoluteUri(uri) ? filenameFromUri(uri) : uri;
};

const toAbsoluteUri = (uri: string) => {
  const filename = toRelativeUri(uri);
  return new File(RECORDINGS_DIR, filename).uri;
};

const recordingFile = (uri: string) => new File(RECORDINGS_DIR, toRelativeUri(uri));

const writeIndex = (items: SavedRecording[]) => {
  ensureStorage();
  const relative = items.map((item) => ({
    ...item,
    uri: toRelativeUri(item.uri),
  }));
  RECORDINGS_INDEX_FILE.write(JSON.stringify(relative));
};

const readIndex = async () => {
  ensureStorage();
  try {
    const raw = await RECORDINGS_INDEX_FILE.text();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    const items = parsed as SavedRecording[];

    // One-shot migration: absolute paths → relative filenames on disk
    if (items.some((item) => item.uri && isAbsoluteUri(item.uri))) {
      writeIndex(items);
    }

    return items.map((item) => ({
      ...item,
      uri: toAbsoluteUri(item.uri),
    }));
  } catch {
    return [];
  }
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
  const filename = `${id}.${extension}`;
  const destination = new File(RECORDINGS_DIR, filename);
  const sourceFile = new File(normalizeFileUri(sourceUri));
  sourceFile.copy(destination);

  const entry: SavedRecording = {
    id,
    text,
    pillar,
    uri: filename,
    createdAt: Date.now(),
  };

  const current = await readIndex();
  writeIndex([entry, ...current]);
  return { ...entry, uri: toAbsoluteUri(filename) };
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
  return reordered.map((item) => ({
    ...item,
    uri: toAbsoluteUri(item.uri),
  }));
};

export const getSavedRecordingById = async (id: string) => {
  const items = await readIndex();
  return items.find((item) => item.id === id) ?? null;
};

export const clearAllRecordings = async () => {
  const items = await readIndex();
  for (const item of items) {
    if (item.uri) {
      const f = recordingFile(item.uri);
      if (f.exists) f.delete();
    }
  }
  writeIndex([]);
};

export const deleteSavedRecording = async (id: string) => {
  const items = await readIndex();
  const target = items.find((item) => item.id === id);
  const next = items.filter((item) => item.id !== id);
  writeIndex(next);

  if (target?.uri) {
    const targetFile = recordingFile(target.uri);
    if (targetFile.exists) {
      targetFile.delete();
    }
  }
};
