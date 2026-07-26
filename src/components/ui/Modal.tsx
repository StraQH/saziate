"use client";

import { X } from "lucide-react";
import React, { useState } from "react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  maxWidth?: string;
}

export function Modal({ isOpen, onClose, title, children, maxWidth = "400px" }: ModalProps) {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "1rem",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="card"
        style={{
          width: "100%",
          maxWidth,
          position: "relative",
          animation: "toast-in 0.2s ease",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: "1.25rem",
            right: "1.25rem",
            background: "none",
            border: "none",
            color: "var(--color-text-muted)",
            cursor: "pointer",
          }}
        >
          <X size={20} />
        </button>

        {title && <h3 style={{ marginBottom: "1.5rem", paddingRight: "1.5rem" }}>{title}</h3>}
        {children}
      </div>
    </div>
  );
}

// Higher-level specialized modals:

interface AlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: React.ReactNode;
  type?: "info" | "success" | "warning" | "danger";
}

export function AlertModal({ isOpen, onClose, title, message, type = "info" }: AlertModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <p style={{ marginBottom: "1.5rem", color: "var(--color-text)" }}>{message}</p>
      <div className="flex justify-end">
        <button className="btn btn-primary" onClick={onClose}>
          OK
        </button>
      </div>
    </Modal>
  );
}

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  isDestructive = false,
}: ConfirmModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <p style={{ marginBottom: "1.5rem", color: "var(--color-text)" }}>{message}</p>
      <div className="flex gap-2 justify-end">
        <button className="btn btn-ghost" onClick={onClose}>
          {cancelText}
        </button>
        <button
          className={`btn ${isDestructive ? "btn-danger" : "btn-primary"}`}
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          {confirmText}
        </button>
      </div>
    </Modal>
  );
}

interface PromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (value: string) => void;
  title: string;
  message: React.ReactNode;
  placeholder?: string;
  defaultValue?: string;
  inputType?: string;
  submitText?: string;
}

export function PromptModal({
  isOpen,
  onClose,
  onSubmit,
  title,
  message,
  placeholder = "",
  defaultValue = "",
  inputType = "text",
  submitText = "Submit",
}: PromptModalProps) {
  const [value, setValue] = useState(defaultValue);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(value);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <form onSubmit={handleSubmit}>
        <p style={{ marginBottom: "1rem", color: "var(--color-text)", fontSize: "0.875rem" }}>{message}</p>
        <div className="form-group">
          <input
            type={inputType}
            className="input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            autoFocus
          />
        </div>
        <div className="flex gap-2 justify-end" style={{ marginTop: "1.5rem" }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={!value.trim()}>
            {submitText}
          </button>
        </div>
      </form>
    </Modal>
  );
}
