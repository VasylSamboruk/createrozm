const DB_NAME = 'personalize-handoff';
const STORE = 'payloads';

const openDb = () => new Promise((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, 1);
  request.onupgradeneeded = () => request.result.createObjectStore(STORE);
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const run = async (mode, action) => {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = action(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request?.result);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
};

// Передає зображення в нову вкладку через IndexedDB (data URL надто великі для URL чи localStorage).
export const openInNewTab = async (mode, items) => {
  const tab = window.open('about:blank', '_blank');
  if (!tab) return false;
  try {
    const id = crypto.randomUUID();
    await run('readwrite', (store) => store.put({ mode, items, createdAt: Date.now() }, id));
    const url = new URL(window.location.href);
    url.search = `?handoff=${id}`;
    url.hash = '';
    tab.location.href = url.toString();
    return true;
  } catch {
    tab.close();
    return false;
  }
};

let handoffPromise = null;

export const takeHandoff = () => {
  if (!handoffPromise) handoffPromise = readHandoff();
  return handoffPromise;
};

const readHandoff = async () => {
  const id = new URLSearchParams(window.location.search).get('handoff');
  if (!id) return null;
  window.history.replaceState(null, '', window.location.pathname);
  try {
    const payload = await run('readonly', (store) => store.get(id));
    await run('readwrite', (store) => store.delete(id));
    return payload || null;
  } catch {
    return null;
  }
};
