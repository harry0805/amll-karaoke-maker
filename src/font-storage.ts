const DATABASE = 'karaoke-studio-fonts';
const STORE = 'fonts';
const KEY = 'custom';

// One atomic record. A successful upload replaces the previous file.
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Close other Karaoke studio tabs and try again.'));
  });
}
export async function readCustomFont(): Promise<File | undefined> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE).objectStore(STORE).get(KEY);
      request.onsuccess = () => resolve(request.result as File | undefined);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}
export async function storeCustomFont(file: File | null): Promise<void> {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readwrite');
      const store = transaction.objectStore(STORE);
      if (file) store.put(file, KEY); else store.delete(KEY);
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error ?? new Error('Could not save the custom font.'));
      transaction.onerror = () => reject(transaction.error);
    });
  } finally { db.close(); }
}
