"use client";

import { useState } from "react";
import { Copy, Check, Building2 } from "lucide-react";
import { formatNaira } from "@/lib/utils";

interface DVAInfoCardProps {
  bankName: string;
  accountNumber: string;
  accountName: string;
  paymentReference?: string;
}

export function DVAInfoCard({ bankName, accountNumber, accountName, paymentReference }: DVAInfoCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(accountNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="card bg-gradient-to-br from-green-50 to-emerald-100 border-emerald-200" style={{ padding: "1.5rem" }}>
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-emerald-900 flex items-center gap-2">
            <Building2 size={18} />
            Your Dedicated Payment Account
          </h3>
          <p className="text-sm text-emerald-700 mt-1">
            Transfer funds here to instantly clear your waste bills.
          </p>
        </div>
      </div>

      <div className="mt-4 p-4 bg-white rounded-lg border border-emerald-100 shadow-sm">
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs text-muted uppercase font-medium tracking-wider">Bank Name</span>
          <span className="text-sm font-semibold text-gray-900">{bankName}</span>
        </div>
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs text-muted uppercase font-medium tracking-wider">Account Name</span>
          <span className="text-sm font-medium text-gray-700 truncate max-w-[200px]">{accountName}</span>
        </div>
        <div className="flex justify-between items-center pt-2 border-t border-gray-100">
          <span className="text-xs text-muted uppercase font-medium tracking-wider">Account No.</span>
          <div className="flex items-center gap-2">
            <span className="text-lg font-mono font-bold tracking-widest text-primary">{accountNumber}</span>
            <button 
              onClick={handleCopy}
              className="p-1.5 hover:bg-gray-100 rounded text-gray-500 transition-colors"
              title="Copy Account Number"
            >
              {copied ? <Check size={16} className="text-success" /> : <Copy size={16} />}
            </button>
          </div>
        </div>
        {paymentReference && (
          <div className="flex justify-between items-center pt-2 mt-2 border-t border-gray-100">
            <span className="text-xs text-emerald-700 uppercase font-bold tracking-wider">Payment Ref.</span>
            <div className="flex items-center gap-2">
              <span className="text-md font-mono font-bold text-emerald-800">{paymentReference}</span>
            </div>
          </div>
        )}
      </div>
      <p className="text-xs text-emerald-600 mt-3 text-center">
        Ensure you use your <strong className="font-bold">Payment Ref.</strong> in the transfer narration!
      </p>
    </div>
  );
}
