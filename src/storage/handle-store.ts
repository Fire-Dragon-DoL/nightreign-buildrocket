/**
 * Remembers FileSystemFileHandles between sessions so the app can reopen the
 * user's data file without a picker.
 *
 * Only the HANDLE (a pointer to the file) is stored, in IndexedDB, because a
 * handle cannot be serialized anywhere else. The user's data itself always
 * lives in the file on disk.
 */

const DB_NAME = 'nightreign-buildrocket';
const STORE = 'file-handles';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = run(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export const rememberHandle = (key: string, handle: FileSystemFileHandle): Promise<IDBValidKey> =>
  withStore('readwrite', (s) => s.put(handle, key));

export const recallHandle = (key: string): Promise<FileSystemFileHandle | undefined> =>
  withStore<FileSystemFileHandle | undefined>('readonly', (s) => s.get(key));

export const forgetHandle = (key: string): Promise<undefined> =>
  withStore('readwrite', (s) => s.delete(key));
