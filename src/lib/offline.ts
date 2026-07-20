export interface OfflineCollectionLog {
  id: string;
  routeId: string;
  residentId: string;
  status: "collected" | "no_access" | "no_waste";
  notes?: string;
  loggedAt: string;
}

export function openOfflineDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("IndexedDB is only available in browser environments."));
      return;
    }

    const request = window.indexedDB.open("saziate-offline-db", 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (!db.objectStoreNames.contains("pending-logs")) {
        db.createObjectStore("pending-logs", { keyPath: "id" });
      }
    };
  });
}

export async function saveOfflineLog(log: OfflineCollectionLog): Promise<void> {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(["pending-logs"], "readwrite");
    const store = transaction.objectStore("pending-logs");
    const request = store.put(log);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

export async function getOfflineLogs(): Promise<OfflineCollectionLog[]> {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(["pending-logs"], "readonly");
    const store = transaction.objectStore("pending-logs");
    const request = store.getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || []);
  });
}

export async function deleteOfflineLog(id: string): Promise<void> {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(["pending-logs"], "readwrite");
    const store = transaction.objectStore("pending-logs");
    const request = store.delete(id);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

export async function purgeStaleOfflineLogs(): Promise<void> {
  const logs = await getOfflineLogs();
  const now = Date.now();
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  
  for (const log of logs) {
    const logTime = new Date(log.loggedAt).getTime();
    if (now - logTime > ONE_DAY_MS) {
      await deleteOfflineLog(log.id);
    }
  }
}

export function registerServiceWorker() {
  if (typeof window !== "undefined" && "serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          console.log("Saziate Service Worker registered successfully:", reg.scope);
        })
        .catch((err) => {
          console.error("Service Worker registration failed:", err);
        });
    });
  }
}
