"use client";

import { useState, useEffect } from "react";
import { Wifi, WifiOff, RefreshCw } from "lucide-react";
import { getOfflineLogs } from "@/lib/offline";

export function OfflineSyncBanner() {
  const [isOnline, setIsOnline] = useState(true);
  const [unsyncedCount, setUnsyncedCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const checkStatus = async () => {
    if (typeof window === "undefined") return;
    setIsOnline(navigator.onLine);
    
    // Purge any stale offline logs (> 24hrs) before syncing or checking count
    const { purgeStaleOfflineLogs, getOfflineLogs } = await import("@/lib/offline");
    await purgeStaleOfflineLogs();

    const logs = await getOfflineLogs();
    setUnsyncedCount(logs.length);
  };

  const triggerBackgroundSync = async () => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      setSyncing(true);
      try {
        const reg = await navigator.serviceWorker.ready;
        if ((reg as any).sync) {
          await (reg as any).sync.register("sync-collections");
          // check if synced
          setTimeout(async () => {
            const logs = await getOfflineLogs();
            setUnsyncedCount(logs.length);
            if (logs.length === 0) {
              setShowSuccess(true);
              setTimeout(() => setShowSuccess(false), 3000);
            }
            setSyncing(false);
          }, 1500);
        } else {
          // Fallback manual sync if Background Sync API not supported
          const logs = await getOfflineLogs();
          for (const log of logs) {
            const res = await fetch("/api/v1/collections/log", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(log),
            });
            if (res.ok) {
              const { deleteOfflineLog } = await import("@/lib/offline");
              await deleteOfflineLog(log.id);
            }
          }
          setUnsyncedCount(0);
          setShowSuccess(true);
          setTimeout(() => setShowSuccess(false), 3000);
          setSyncing(false);
        }
      } catch (err) {
        console.error("Manual sync fallback failed:", err);
        setSyncing(false);
      }
    }
  };

  useEffect(() => {
    checkStatus();
    
    const handleOnline = () => {
      setIsOnline(true);
      triggerBackgroundSync();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Poll IndexedDB every 5 seconds to check for offline queue changes
    const interval = setInterval(checkStatus, 5000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(interval);
    };
  }, []);

  if (isOnline && unsyncedCount === 0 && !showSuccess) {
    return null;
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0.75rem 1.25rem",
        fontSize: "0.875rem",
        fontWeight: 500,
        borderRadius: "var(--radius-md)",
        marginBottom: "1.5rem",
        transition: "all 0.3s",
        animation: "slideDown 0.2s ease-out",
        backgroundColor: !isOnline
          ? "var(--color-danger-bg)"
          : showSuccess
          ? "var(--color-success-bg)"
          : "var(--color-primary-light)",
        border: !isOnline
          ? "1px solid var(--color-danger)"
          : showSuccess
          ? "1px solid var(--color-success)"
          : "1px solid var(--color-primary)",
        color: !isOnline
          ? "var(--color-danger)"
          : showSuccess
          ? "var(--color-success)"
          : "var(--color-primary)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        {!isOnline ? (
          <>
            <WifiOff size={16} />
            <span>You are offline. Logs will save to your device and sync when reconnected.</span>
          </>
        ) : showSuccess ? (
          <>
            <Wifi size={16} />
            <span>All offline collection logs synced successfully!</span>
          </>
        ) : (
          <>
            <RefreshCw size={16} className={syncing ? "spin-animation" : ""} />
            <span>
              {unsyncedCount} log{unsyncedCount > 1 ? "s" : ""} pending synchronization...
            </span>
          </>
        )}
      </div>

      {isOnline && unsyncedCount > 0 && (
        <button
          onClick={triggerBackgroundSync}
          className="btn btn-primary btn-sm"
          style={{ padding: "0.25rem 0.75rem", fontSize: "0.75rem", minHeight: "auto" }}
          disabled={syncing}
        >
          {syncing ? "Syncing..." : "Sync Now"}
        </button>
      )}
    </div>
  );
}
