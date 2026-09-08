// OPFS contains completed MP4s and small completion records. A per-export Web
// Lock prevents another tab's startup cleanup from deleting a live render.
const DIRECTORY = 'karaoke-exports-v1';
const validId = /^[a-f0-9-]{36}$/;
const lockName = (id: string) => `${DIRECTORY}/${id}`;
export interface StoredExport {
  id: string;
  name: string;
  createdAt: number;
  file: File;
}

async function directory(create = true) {
  if (!navigator.storage?.getDirectory || !navigator.locks) {
    throw new Error(
      'Saving renders needs OPFS and Web Locks. Use a recent browser over HTTPS or localhost. No in-memory fallback is used.',
    );
  }
  return (await navigator.storage.getDirectory()).getDirectoryHandle(DIRECTORY, { create });
}
async function removeFiles(dir: FileSystemDirectoryHandle, id: string) {
  for (const suffix of ['.json', '.mp4']) {
    try {
      await dir.removeEntry(id + suffix);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error;
    }
  }
}

export async function writeStoredExport(
  name: string,
  signal: AbortSignal,
  write: (stream: FileSystemWritableFileStream) => Promise<void>,
): Promise<StoredExport> {
  signal.throwIfAborted();
  const dir = await directory();
  const id = crypto.randomUUID();
  return navigator.locks.request(lockName(id), { signal }, async () => {
    let stream: FileSystemWritableFileStream | undefined;
    try {
      const handle = await dir.getFileHandle(id + '.mp4', { create: true });
      if (!handle.createWritable)
        throw new Error(
          'This browser cannot save renders to browser storage. Try a recent Chrome, Edge, or Firefox.',
        );
      stream = await handle.createWritable();
      await write(stream); // The encoder finalizes and closes this stream.
      signal.throwIfAborted();
      const file = await handle.getFile(); // Disk-backed File, never arrayBuffer().
      const record = { id, name, createdAt: Date.now() };
      const metadata = await (
        await dir.getFileHandle(id + '.json', { create: true })
      ).createWritable();
      try {
        await metadata.write(JSON.stringify(record));
        await metadata.close();
      } catch (error) {
        await metadata.abort().catch(() => {});
        throw error;
      }
      signal.throwIfAborted();
      return { ...record, file };
    } catch (error) {
      await stream?.abort().catch(() => {});
      await removeFiles(dir, id);
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        throw new Error(
          'Browser storage is full. Delete saved renders or free disk space, then try again. The partial render was removed.',
          { cause: error },
        );
      }
      throw error;
    }
  });
}

/** Recover completed exports and remove interrupted files, never active renders. */
export async function listStoredExports(): Promise<StoredExport[]> {
  let dir: FileSystemDirectoryHandle;
  try {
    dir = await directory(false);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') return [];
    throw error;
  }
  const ids = new Set<string>();
  for await (const name of dir.keys()) {
    const id = name.replace(/\.(mp4|json)$/, '');
    if (validId.test(id)) ids.add(id);
  }
  const exports: StoredExport[] = [];
  for (const id of ids) {
    await navigator.locks.request(lockName(id), { ifAvailable: true }, async (lock) => {
      if (!lock) return;
      try {
        const record = JSON.parse(
          await (await (await dir.getFileHandle(id + '.json')).getFile()).text(),
        );
        if (
          record.id !== id ||
          typeof record.name !== 'string' ||
          !Number.isFinite(record.createdAt)
        )
          throw new SyntaxError('Invalid render record');
        const file = await (await dir.getFileHandle(id + '.mp4')).getFile();
        exports.push({ id, name: record.name, createdAt: record.createdAt, file });
      } catch (error) {
        if (
          error instanceof SyntaxError ||
          (error instanceof DOMException && error.name === 'NotFoundError')
        )
          await removeFiles(dir, id);
        else throw error;
      }
    });
  }
  return exports.sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteStoredExport(id: string) {
  if (!validId.test(id)) throw new Error('Invalid render ID');
  await navigator.locks.request(lockName(id), { ifAvailable: true }, async (lock) => {
    if (!lock) throw new Error('This render is still being written in another tab.');
    await removeFiles(await directory(false), id);
  });
}
