// Database layer — IndexedDB with idb for local development,
// falls back to in-memory for sandboxed deploy environments
//
// For deploy builds: change useMemory to true and remove the idb import
// to avoid IndexedDB references in the bundle.

import type { Note, Folder } from '../types';

// === In-memory fallback ===
let memNotes: Map<string, Note> = new Map();
let memFolders: Map<string, Folder> = new Map();

// === IndexedDB via idb ===
let dbPromise: Promise<any> | null = null;

// Set to true for deploy builds (IndexedDB blocked in sandboxed iframe)
// Set to false for local development
let useMemory = true;

async function getDB() {
  if (useMemory) return null;
  if (!dbPromise) {
    try {
      const { openDB } = await import('idb');
      dbPromise = openDB('mugen-canvas-v3', 1, {
        upgrade(db) {
          if (!db.objectStoreNames.contains('notes')) {
            db.createObjectStore('notes', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('folders')) {
            db.createObjectStore('folders', { keyPath: 'id' });
          }
        },
      });
    } catch {
      useMemory = true;
      return null;
    }
  }
  try {
    return await dbPromise;
  } catch {
    useMemory = true;
    return null;
  }
}

// === Note CRUD ===

export async function getAllNotes(): Promise<Note[]> {
  const db = await getDB();
  if (db) {
    const notes = await db.getAll('notes');
    return migrateNotes(notes);
  }
  return Array.from(memNotes.values());
}

export async function getActiveNotes(): Promise<Note[]> {
  const all = await getAllNotes();
  return all.filter(n => !n.trashed);
}

export async function saveNote(note: Note): Promise<void> {
  const db = await getDB();
  if (db) {
    await db.put('notes', note);
  }
  memNotes.set(note.id, note);
}

export async function deleteNote(id: string): Promise<void> {
  const db = await getDB();
  if (db) {
    await db.delete('notes', id);
  }
  memNotes.delete(id);
}

export async function trashNote(id: string): Promise<void> {
  const all = await getAllNotes();
  const note = all.find(n => n.id === id);
  if (note) {
    note.trashed = true;
    note.trashedAt = Date.now();
    await saveNote(note);
  }
}

export async function restoreNote(id: string): Promise<void> {
  const all = await getAllNotes();
  const note = all.find(n => n.id === id);
  if (note) {
    note.trashed = false;
    note.trashedAt = null;
    await saveNote(note);
  }
}

// === Folder CRUD ===

export async function getAllFolders(): Promise<Folder[]> {
  const db = await getDB();
  if (db) {
    return await db.getAll('folders');
  }
  return Array.from(memFolders.values());
}

export async function saveFolder(folder: Folder): Promise<void> {
  const db = await getDB();
  if (db) {
    await db.put('folders', folder);
  }
  memFolders.set(folder.id, folder);
}

export async function deleteFolder(id: string): Promise<void> {
  const db = await getDB();
  if (db) {
    await db.delete('folders', id);
  }
  memFolders.delete(id);
}

// === Import/Export ===

export async function exportAllNotes(): Promise<string> {
  const notes = await getAllNotes();
  const folders = await getAllFolders();
  return JSON.stringify({ version: 3, notes, folders }, null, 2);
}

export async function importNotes(json: string): Promise<void> {
  try {
    const data = JSON.parse(json);
    const notes: Note[] = data.notes || [];
    const folders: Folder[] = data.folders || [];

    for (const note of migrateNotes(notes)) {
      await saveNote(note);
    }
    for (const folder of folders) {
      await saveFolder(folder);
    }
  } catch (err) {
    console.error('Import error:', err);
    throw err;
  }
}

// === Migration from v2 (canvas-based) to v3 (card-based) ===

function migrateNotes(notes: any[]): Note[] {
  return notes.map(n => {
    // If already v3 format (has cards array), return as-is
    if (Array.isArray(n.cards)) return n;

    // Migrate from v2: convert canvasData-based note to card-based
    return {
      id: n.id,
      name: n.name,
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
      cards: [], // Start fresh — old canvas data can't be meaningfully converted to cards
      connectors: [],
      folderId: n.folderId ?? null,
      tags: n.tags ?? [],
      trashed: n.trashed ?? false,
      trashedAt: n.trashedAt ?? null,
      thumbnail: n.thumbnail ?? null,
    } as Note;
  });
}
