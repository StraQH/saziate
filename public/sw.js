const CACHE_NAME = "saziate-cache-v2";

// ONLY cache static assets that never return HTTP 307/302 redirects
const ASSETS_TO_CACHE = [
  "/manifest.json",
  "/next.svg",
  "/globe.svg",
  "/logo.png"
];

// Install Event
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activate Event
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Event
self.addEventListener("fetch", (e) => {
  // Let Next.js handle API, static bundles, and navigation requests natively
  if (
    e.request.url.includes("/api/") || 
    e.request.url.includes("/_next/") ||
    e.request.mode === "navigate"
  ) {
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(e.request);
    })
  );
});

// Background Sync Event
self.addEventListener("sync", (e) => {
  if (e.tag === "sync-collections") {
    e.waitUntil(syncPendingCollections());
  }
});

// Sync handler that reads from IndexedDB and dispatches back to server
async function syncPendingCollections() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("saziate-offline-db", 1);
    
    request.onerror = () => reject();
    request.onsuccess = async (event) => {
      const db = event.target.result;
      const transaction = db.transaction(["pending-logs"], "readwrite");
      const store = transaction.objectStore("pending-logs");
      const getAllRequest = store.getAll();

      getAllRequest.onsuccess = async () => {
        const logs = getAllRequest.result || [];
        if (logs.length === 0) {
          resolve();
          return;
        }

        for (const log of logs) {
          try {
            const res = await fetch("/api/v1/collections/log", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(log),
            });

            if (res.ok) {
              const deleteTx = db.transaction(["pending-logs"], "readwrite");
              deleteTx.objectStore("pending-logs").delete(log.id);
            }
          } catch (err) {
            console.error("Failed to sync offline log during background sync:", err);
          }
        }
        resolve();
      };
    };
  });
}