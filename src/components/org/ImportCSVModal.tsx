"use client";

import { useState } from "react";
import { X, Upload, Check, AlertCircle } from "lucide-react";

import { config } from "@/lib/config";
import { generateSecureReference } from "@/lib/utils";

interface ImportCSVModalProps {
  onClose: () => void;
  onSuccess: (newResidents: any[]) => void;
}

export function ImportCSVModal({ onClose, onSuccess }: ImportCSVModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successCount, setSuccessCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (!selectedFile.name.endsWith(".csv")) {
        setError("Please select a valid CSV file.");
        setFile(null);
        return;
      }
      setFile(selectedFile);
      setError(null);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    setError(null);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const lines = text.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
        
        if (lines.length <= 1) {
          setError("CSV file is empty or contains no records.");
          setLoading(false);
          return;
        }

        const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
        const hasContactHeader = headers.includes("email") || headers.includes("phone");

        if (!hasContactHeader) {
          setError("CSV must contain at least an 'email' or 'phone' column.");
          setLoading(false);
          return;
        }

        const firstNameIndex = headers.findIndex((h) => h === "first name" || h === "firstname");
        const lastNameIndex = headers.findIndex((h) => h === "last name" || h === "lastname");
        const emailIndex = headers.indexOf("email");
        const phoneIndex = headers.indexOf("phone");
        const addressIndex = headers.indexOf("address");
        const zoneIndex = headers.indexOf("zone");
        const wardIndex = headers.indexOf("ward");
        const lgaIndex = headers.indexOf("lga");
        const categoryIndex = headers.indexOf("category");
        const rateIndex = headers.indexOf("rate");

        const parsedResidents: any[] = [];

        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(",").map((c) => c.trim());
          if (cols.length === 0 || (cols.length === 1 && !cols[0])) continue;

          const email = emailIndex !== -1 ? cols[emailIndex] : "";
          const phone = phoneIndex !== -1 ? cols[phoneIndex] : "";

          if (!email && !phone) continue;

          const baseRate = rateIndex !== -1 ? parseFloat(cols[rateIndex]) || config.locality.rates.general.residential : config.locality.rates.general.residential;
          parsedResidents.push({
            firstName: firstNameIndex !== -1 ? cols[firstNameIndex] : "",
            lastName: lastNameIndex !== -1 ? cols[lastNameIndex] : "",
            email,
            phone,
            address: addressIndex !== -1 ? cols[addressIndex] : "",
            zone: zoneIndex !== -1 ? cols[zoneIndex] : "",
            ward: wardIndex !== -1 ? cols[wardIndex] : "",
            lga: lgaIndex !== -1 ? cols[lgaIndex] : "",
            billingCategory: (categoryIndex !== -1 ? cols[categoryIndex] : "residential") || "residential",
            baseRate,
          });
        }

        if (config.isMockMode) {
          const mockData = parsedResidents.map((r: any, i: number) => ({
            ...r,
            id: crypto.randomUUID(),
            isOverride: false,
            referenceCode: generateSecureReference(8),
            status: "active",
          }));
          setSuccessCount(mockData.length);
          setTimeout(() => {
            onSuccess(mockData);
          }, 1500);
          return;
        }

        // Live Mode database write via bulk API
        const response = await fetch("/api/v1/residents/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ residents: parsedResidents }),
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(errText || "Bulk import API failed.");
        }

        const resBody = await response.json() as any;
        setSuccessCount(resBody.count);
        setTimeout(() => {
          onSuccess(resBody.residents);
        }, 1500);
      } catch (err: any) {
        setError((err as Error).message || "Failed to process the CSV file. Please check its formatting.");
      } finally {
        setLoading(false);
      }
    };

    reader.readAsText(file);
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "1rem",
      }}
    >
      <div
        className="card"
        style={{
          width: "100%",
          maxWidth: "450px",
          position: "relative",
          animation: "toast-in 0.2s ease",
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

        <h3 style={{ marginBottom: "1rem" }}>Import Residents CSV</h3>
        <p className="text-muted" style={{ marginBottom: "1.5rem", fontSize: "0.875rem" }}>
          Upload a CSV file containing resident accounts. The CSV must have headers for <b>name</b>, <b>email</b>, <b>phone</b>, <b>address</b>, and <b>zone</b>. Optional columns include <b>category</b> and <b>rate</b>.
        </p>

        {error && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              background: "var(--color-danger-bg)",
              color: "var(--color-danger)",
              padding: "0.75rem",
              borderRadius: "var(--radius-sm)",
              fontSize: "0.875rem",
              marginBottom: "1rem",
            }}
          >
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {successCount !== null ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.75rem",
              padding: "2rem 0",
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "50%",
                background: "var(--color-success-bg)",
                color: "var(--color-success)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Check size={24} />
            </div>
            <h4>Import Successful</h4>
            <p className="text-muted" style={{ fontSize: "0.875rem" }}>
              Successfully imported {successCount} resident profiles.
            </p>
          </div>
        ) : (
          <form onSubmit={handleUpload} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <div
              style={{
                border: "2px dashed var(--color-border)",
                borderRadius: "var(--radius-md)",
                padding: "2rem 1rem",
                textAlign: "center",
                cursor: "pointer",
                position: "relative",
                transition: "border-color 0.15s",
              }}
            >
              <input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  opacity: 0,
                  cursor: "pointer",
                  width: "100%",
                }}
              />
              <Upload
                size={32}
                style={{ color: "var(--color-primary)", marginBottom: "0.75rem" }}
              />
              <p className="font-medium" style={{ fontSize: "0.9375rem" }}>
                {file ? file.name : "Click to select or drag CSV file"}
              </p>
              <p className="text-xs text-muted" style={{ marginTop: "0.25rem" }}>
                Max file size: 5MB
              </p>
            </div>

            <div style={{ background: "var(--color-primary-light)", padding: "0.875rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-primary)", display: "flex", alignItems: "flex-start", gap: "0.5rem" }}>
              <span style={{ color: "var(--color-primary)" }}>ℹ️</span>
              <p style={{ fontSize: "0.875rem", color: "var(--color-primary)", margin: 0, fontWeight: 500 }}>
                Termii SMS Notification Cost: Standard rates apply per resident added (approx. {config.locality.symbol}5.00/SMS) for account setup notifications.
              </p>
            </div>

            <div className="flex justify-end gap-3" style={{ marginTop: "0.5rem" }}>
              <button type="button" className="btn btn-ghost" onClick={onClose} disabled={loading}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={!file || loading}>
                {loading ? "Processing..." : "Upload & Process"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
