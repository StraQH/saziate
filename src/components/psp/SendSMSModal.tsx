import { useState } from "react";
import { MessageSquare, X, AlertCircle } from "lucide-react";

interface SendSMSModalProps {
  residentIds: string[];
  onClose: () => void;
  onSuccess: () => void;
}

export function SendSMSModal({ residentIds, onClose, onSuccess }: SendSMSModalProps) {
  const [message, setMessage] = useState("");
  const [channel, setChannel] = useState<"email" | "sms" | "whatsapp">("email");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const costPerRecipient = channel === "whatsapp" ? 12.00 : channel === "sms" ? 4.00 : 0.00;
  const estimatedCost = residentIds.length * costPerRecipient;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) {
      setError("Message cannot be empty.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/v1/psp/messaging", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          residentIds,
          messageText: message,
          channel,
        }),
      });

      if (!res.ok) {
        const errData = await res.json() as any;
        throw new Error(errData.error || "Failed to send message");
      }

      onSuccess();
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2 style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <MessageSquare size={20} style={{ color: "var(--color-primary)" }} />
            Send Message
          </h2>
          <button className="btn btn-ghost" style={{ padding: "0.25rem" }} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: "1.5rem" }}>
          {error && (
            <div style={{ marginBottom: "1rem", padding: "0.75rem", backgroundColor: "rgba(239, 68, 68, 0.1)", color: "var(--color-danger)", borderRadius: "var(--radius-sm)", fontSize: "0.875rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          <div className="form-group">
            <label className="form-label">
              Recipients
            </label>
            <div style={{ padding: "0.75rem", backgroundColor: "var(--color-background)", borderRadius: "var(--radius-sm)", fontSize: "0.875rem" }}>
              {residentIds.length} resident(s) selected
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Delivery Channel</label>
            <select 
              className="form-input" 
              value={channel} 
              onChange={(e) => setChannel(e.target.value as any)}
              style={{ padding: "0.5rem" }}
            >
              <option value="email">Email (Free)</option>
              <option value="sms">SMS (₦4.00 per recipient)</option>
              <option value="whatsapp">WhatsApp (₦12.00 per recipient)</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="message">Message Content</label>
            <textarea
              id="message"
              className="form-input"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your message here..."
              rows={4}
              required
            />
            <p className="text-muted text-xs" style={{ marginTop: "0.25rem" }}>
              {message.length} characters {channel !== "email" && `(approx. ${Math.ceil((message.length || 1) / 160)} SMS segment(s))`}
            </p>
          </div>

          {channel !== "email" && (
            <div style={{ marginBottom: "1.5rem", padding: "1rem", backgroundColor: "rgba(37, 99, 235, 0.05)", borderRadius: "var(--radius-md)", border: "1px solid rgba(37, 99, 235, 0.1)" }}>
              <p className="text-sm font-medium" style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.25rem" }}>
                <span>Estimated Cost:</span>
                <span style={{ color: "var(--color-primary)" }}>₦{estimatedCost.toFixed(2)}</span>
              </p>
              <p className="text-xs text-muted">
                Cost will be deducted from your available payout balance.
              </p>
            </div>
          )}

          <div className="flex gap-2" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? "Sending..." : "Send Message"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
