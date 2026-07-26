"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { X, CheckCircle, AlertCircle, Info } from "lucide-react";
import { AlertModal } from "@/components/ui/Modal";

export type ToastType = "success" | "error" | "info";

interface ToastMessage {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((message: string, type: ToastType = "info") => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    // Removed setTimeout, modals require explicit dismissal
  }, []);

  const activeToast = toasts[0];

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {activeToast && (
        <AlertModal
          isOpen={true}
          onClose={() => removeToast(activeToast.id)}
          title={
            activeToast.type === "error" 
              ? "Error" 
              : activeToast.type === "success" 
                ? "Success" 
                : "Notification"
          }
          message={activeToast.message}
        />
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
