import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stroke } from './supabase';

// Storage keys
const INDEX_KEY = '@sf:notes';
const pageKey = (docId: string, page: number) => `@sf:note:${docId}:${page}`;

export interface LocalNote {
  id: string;
  title: string;
  type: 'notes';
  page_count: number;
  created_at: string;
  updated_at: string;
  owner_id: string;
}

function genId(): string {
  return 'local_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

async function readIndex(): Promise<LocalNote[]> {
  const raw = await AsyncStorage.getItem(INDEX_KEY);
  return raw ? JSON.parse(raw) : [];
}

async function writeIndex(notes: LocalNote[]): Promise<void> {
  await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(notes));
}

export async function listLocalNotes(): Promise<LocalNote[]> {
  return readIndex();
}

export async function getLocalNote(id: string): Promise<LocalNote | null> {
  const notes = await readIndex();
  return notes.find(n => n.id === id) ?? null;
}

export async function createLocalNote(title: string, ownerId: string): Promise<LocalNote> {
  const now = new Date().toISOString();
  const note: LocalNote = {
    id: genId(),
    title,
    type: 'notes',
    page_count: 1,
    created_at: now,
    updated_at: now,
    owner_id: ownerId,
  };
  const notes = await readIndex();
  notes.unshift(note);
  await writeIndex(notes);
  await AsyncStorage.setItem(pageKey(note.id, 1), JSON.stringify([]));
  return note;
}

export async function updateLocalNoteTitle(id: string, title: string): Promise<void> {
  const notes = await readIndex();
  const idx = notes.findIndex(n => n.id === id);
  if (idx === -1) return;
  notes[idx].title = title;
  notes[idx].updated_at = new Date().toISOString();
  await writeIndex(notes);
}

export async function deleteLocalNote(id: string): Promise<void> {
  const notes = await readIndex();
  const note = notes.find(n => n.id === id);
  if (!note) return;
  // Remove all page entries
  const keys = Array.from({ length: note.page_count }, (_, i) => pageKey(id, i + 1));
  await AsyncStorage.multiRemove(keys);
  await writeIndex(notes.filter(n => n.id !== id));
}

export async function getNotePage(docId: string, pageNumber: number): Promise<Stroke[]> {
  const raw = await AsyncStorage.getItem(pageKey(docId, pageNumber));
  return raw ? JSON.parse(raw) : [];
}

export async function saveNotePage(
  docId: string,
  pageNumber: number,
  strokes: Stroke[],
): Promise<void> {
  await AsyncStorage.setItem(pageKey(docId, pageNumber), JSON.stringify(strokes));
  // Touch updated_at in index
  const notes = await readIndex();
  const idx = notes.findIndex(n => n.id === docId);
  if (idx !== -1) {
    notes[idx].updated_at = new Date().toISOString();
    await writeIndex(notes);
  }
}

export async function addLocalNotePage(docId: string): Promise<number> {
  const notes = await readIndex();
  const idx = notes.findIndex(n => n.id === docId);
  if (idx === -1) return 1;
  notes[idx].page_count += 1;
  const newCount = notes[idx].page_count;
  await writeIndex(notes);
  await AsyncStorage.setItem(pageKey(docId, newCount), JSON.stringify([]));
  return newCount;
}

export async function deleteLocalNotePage(docId: string, pageNumber: number): Promise<number> {
  const notes = await readIndex();
  const idx = notes.findIndex(n => n.id === docId);
  if (idx === -1) return 1;
  const count = notes[idx].page_count;

  if (count <= 1) {
    // Only page - clear strokes instead of deleting
    await AsyncStorage.setItem(pageKey(docId, 1), JSON.stringify([]));
    return 1;
  }

  // Remove this page key
  await AsyncStorage.removeItem(pageKey(docId, pageNumber));

  // Shift subsequent pages down
  for (let p = pageNumber + 1; p <= count; p++) {
    const raw = await AsyncStorage.getItem(pageKey(docId, p));
    await AsyncStorage.setItem(pageKey(docId, p - 1), raw ?? '[]');
    await AsyncStorage.removeItem(pageKey(docId, p));
  }

  notes[idx].page_count -= 1;
  await writeIndex(notes);
  return notes[idx].page_count;
}
