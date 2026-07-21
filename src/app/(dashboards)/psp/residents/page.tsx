"use client";

import { useState, useEffect } from "react";
import { Users, PlusCircle, Upload, MessageSquare } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { formatNaira, calculateResidentBill } from "@/lib/utils";
import { AddResidentModal } from "@/components/psp/AddResidentModal";
import { ImportCSVModal } from "@/components/psp/ImportCSVModal";
import { SendSMSModal } from "@/components/psp/SendSMSModal";
import { MOCK_RESIDENTS, type Resident, MOCK_PSP_ID } from "@/lib/mockdata";
import { SaziateRepository } from "@/lib/repository";
import { config } from "@/lib/config";

// --- Types ---
type BillingCategory = "residential" | "commercial" | "industrial" | "health";


const CATEGORY_LABELS: Record<BillingCategory, string> = {
  residential: "Residential",
  commercial: "Commercial",
  industrial: "Industrial",
  health: "Health",
};

export default function PSPResidentsPage() {
  const [residents, setResidents] = useState<Resident[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showSMSModal, setShowSMSModal] = useState(false);
  const [selectedResidents, setSelectedResidents] = useState<string[]>([]);

  useEffect(() => {
    const repo = new SaziateRepository(MOCK_PSP_ID);
    repo.getResidents().then((data) => {
      setResidents(data);
      setLoading(false);
    });
  }, []);

  const handleAddResident = (newResident: Resident) => {
    setResidents((prev) => [newResident, ...prev]);
    setShowModal(false);
  };

  const handleImportResidents = (newResidents: Resident[]) => {
    setResidents((prev) => [...newResidents, ...prev]);
    setShowImportModal(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this resident profile?")) return;

    try {
      if (config.isMockMode) {
        setResidents((prev) => prev.filter((r) => r.id !== id));
        return;
      }

      const response = await fetch("/api/v1/residents", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: id }),
      });

      if (!response.ok) {
        throw new Error("Failed to delete resident profile.");
      }

      setResidents((prev) => prev.filter((r) => r.id !== id));
    } catch (err: any) {
      alert(err.message || "Could not complete deletion.");
    }
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedResidents(residents.map(r => r.id));
    } else {
      setSelectedResidents([]);
    }
  };

  const toggleSelectResident = (id: string) => {
    setSelectedResidents(prev => 
      prev.includes(id) ? prev.filter(rId => rId !== id) : [...prev, id]
    );
  };

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1>Residents</h1>
          <p className="text-muted" style={{ marginTop: "0.25rem" }}>
            {residents.length} resident{residents.length !== 1 ? "s" : ""} registered
          </p>
        </div>
        <div className="flex gap-3">
          {selectedResidents.length > 0 && (
            <button className="btn btn-primary btn-sm" onClick={() => setShowSMSModal(true)} style={{ backgroundColor: "var(--color-primary-dark)" }}>
              <MessageSquare size={16} />
              Message ({selectedResidents.length})
            </button>
          )}
          <button className="btn btn-secondary btn-sm" onClick={() => setShowImportModal(true)}>
            <Upload size={16} />
            Import CSV
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowModal(true)}>
            <PlusCircle size={16} />
            Add Resident
          </button>
        </div>
      </div>

      {/* Table or Empty State */}
      {loading ? (
        <div className="card flex items-center justify-center" style={{ padding: "4rem" }}>
          <div className="spinner" />
        </div>
      ) : residents.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Users}
            title="No residents added yet"
            description="Add your first resident manually or import a CSV to get started."
            action={
              <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                <PlusCircle size={16} />
                Add your first resident
              </button>
            }
          />
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: "40px" }}>
                  <input 
                    type="checkbox" 
                    checked={residents.length > 0 && selectedResidents.length === residents.length}
                    onChange={handleSelectAll}
                  />
                </th>
                <th>Name</th>
                <th>Route</th>
                <th>Category</th>
                <th>PSP Rate</th>
                <th>Resident Bill (incl. 5%)</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {residents.map((r) => {
                const { totalAmount } = calculateResidentBill(r.baseRate);
                return (
                  <tr key={r.id}>
                    <td>
                      <input 
                        type="checkbox" 
                        checked={selectedResidents.includes(r.id)}
                        onChange={() => toggleSelectResident(r.id)}
                      />
                    </td>
                    <td>
                      <div>
                        <p className="font-medium">{r.name}</p>
                        <p className="text-muted text-xs">{r.phone}</p>
                      </div>
                    </td>
                    <td className="text-sm">{r.route}</td>
                    <td>
                      <Badge variant="primary">
                        {CATEGORY_LABELS[r.billingCategory]}
                      </Badge>
                    </td>
                    <td className="text-sm">
                      {formatNaira(r.baseRate)}
                      {r.isOverride && (
                        <span className="text-xs text-muted" style={{ marginLeft: "0.25rem" }}>
                          (custom)
                        </span>
                      )}
                    </td>
                    <td className="font-semibold text-sm">{formatNaira(totalAmount)}</td>
                    <td>
                      <Badge variant={r.status === "active" ? "success" : "warning"}>
                        {r.status === "active" ? "Active" : "Suspended"}
                      </Badge>
                    </td>
                    <td>
                      <div className="flex gap-2">
                        <button className="btn btn-ghost btn-sm">Edit</button>
                        <button 
                          className="btn btn-danger btn-sm"
                          style={{ minHeight: "34px", padding: "0 0.75rem" }}
                          onClick={() => handleDelete(r.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Resident Modal */}
      {showModal && (
        <AddResidentModal
          onClose={() => setShowModal(false)}
          onSuccess={handleAddResident}
        />
      )}

      {/* Import CSV Modal */}
      {showImportModal && (
        <ImportCSVModal
          onClose={() => setShowImportModal(false)}
          onSuccess={handleImportResidents}
        />
      )}

      {/* Send SMS Modal */}
      {showSMSModal && (
        <SendSMSModal
          residentIds={selectedResidents}
          onClose={() => setShowSMSModal(false)}
          onSuccess={() => {
            setShowSMSModal(false);
            setSelectedResidents([]);
          }}
        />
      )}
    </div>
  );
}
