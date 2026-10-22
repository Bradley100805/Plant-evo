import type { GameSnapshot, Phase } from '@plant-evo/sim';

/**
 * Saved games live in IndexedDB (it stores typed arrays directly). Storage can be unavailable
 * (private windows, blocked site data), so every call fails soft.
 */
const DB = 'plant-evo';
const STORE = 'saves';
export const AUTOSAVE = 'autosave';

export interface SaveInfo {
  slot: string;
  savedAt: number;
  title: string;
  seed: string;
  pure: boolean;
  phase: Phase;
  epochIndex: number;
  ma: number;
  /** Epoch reports the player has read; a newer one is shown first on continuing. */
  seen: number;
}

interface Record {
  info: SaveInfo;
  snapshot: GameSnapshot;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = action(tx.objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function writeSave(
  slot: string,
  info: Omit<SaveInfo, 'slot' | 'savedAt'>,
  snapshot: GameSnapshot,
): Promise<boolean> {
  try {
    const record: Record = { info: { ...info, slot, savedAt: Date.now() }, snapshot };
    await withStore('readwrite', (s) => s.put(record, slot));
    return true;
  } catch {
    return false;
  }
}

export async function readSave(slot: string): Promise<GameSnapshot | null> {
  try {
    const record = await withStore<Record | undefined>('readonly', (s) => s.get(slot));
    return record?.snapshot ?? null;
  } catch {
    return null;
  }
}

export async function saveInfo(slot: string): Promise<SaveInfo | null> {
  try {
    const record = await withStore<Record | undefined>('readonly', (s) => s.get(slot));
    return record?.info ?? null;
  } catch {
    return null;
  }
}

/** Changes a save's description without rewriting its snapshot. */
export async function updateSaveInfo(slot: string, patch: Partial<SaveInfo>): Promise<void> {
  try {
    const record = await withStore<Record | undefined>('readonly', (s) => s.get(slot));
    if (record === undefined) return;
    const updated: Record = { ...record, info: { ...record.info, ...patch } };
    await withStore('readwrite', (s) => s.put(updated, slot));
  } catch {
    // Nothing to do: storage is unavailable.
  }
}

export async function deleteSave(slot: string): Promise<void> {
  try {
    await withStore('readwrite', (s) => s.delete(slot));
  } catch {
    // Nothing to do: storage is unavailable.
  }
}
