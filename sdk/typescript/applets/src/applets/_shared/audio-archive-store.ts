import type { StoredAudioArchive } from "./audio-archive";

const DB_NAME_PREFIX = "corti-examples-audio-archive";
const DB_VERSION = 1;
const STORE_NAME = "archives";

function createIndexedDbError() {
  return new Error("IndexedDB is not available in this browser.");
}

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionToPromise(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });
}

async function openAudioArchiveDb(namespace: string) {
  if (typeof indexedDB === "undefined") {
    throw createIndexedDbError();
  }

  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(`${DB_NAME_PREFIX}:${namespace}`, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB"));
  });
}

export async function listStoredAudioArchives(namespace: string) {
  const db = await openAudioArchiveDb(namespace);
  try {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const archives = (await requestToPromise(store.getAll())) as StoredAudioArchive[];
    await transactionToPromise(transaction);
    return archives.sort((a, b) => b.finalizedAt - a.finalizedAt);
  } finally {
    db.close();
  }
}

export async function putStoredAudioArchive(namespace: string, archive: StoredAudioArchive) {
  const db = await openAudioArchiveDb(namespace);
  try {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(archive);
    await transactionToPromise(transaction);
  } finally {
    db.close();
  }
}

export async function deleteStoredAudioArchive(namespace: string, archiveId: string) {
  const db = await openAudioArchiveDb(namespace);
  try {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(archiveId);
    await transactionToPromise(transaction);
  } finally {
    db.close();
  }
}

export async function clearStoredAudioArchives(namespace: string) {
  const db = await openAudioArchiveDb(namespace);
  try {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).clear();
    await transactionToPromise(transaction);
  } finally {
    db.close();
  }
}
