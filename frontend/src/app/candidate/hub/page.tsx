"use client";

import { useState } from "react";
import { analyzeCandidateEvidence } from "@/lib/api";

export default function CandidateEvidenceHub() {
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleTestAI = async () => {
    setLoading(true);
    setStatus("Analiz Ediliyor (AI Motoruna İstek Atıldı)...");
    
    // Simulate raw data showing React Context usage
    const rawDataMock = "import React, { useContext } from 'react'; const auth = useContext(AuthContext);";
    
    const res = await analyzeCandidateEvidence("cand_123", "GITHUB", rawDataMock);
    
    if (res.success) {
      setStatus(`Sonuç: ${res.data.status} | Gerekçe: ${res.data.reasoning}`);
    } else {
      setStatus(`Hata: ${res.error}`);
    }
    setLoading(false);
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex justify-between items-center border-b border-border-color pb-4 mb-8">
        <h1 className="text-2xl font-bold text-primary">EIP Candidate Hub</h1>
        <div className="flex space-x-4 text-sm">
          <span className="cursor-pointer hover:text-primary">My Profile</span>
          <span className="cursor-pointer hover:text-primary">Career Analysis</span>
          <span className="cursor-pointer hover:text-primary">Data Hub</span>
        </div>
      </div>

      <div className="bg-surface p-8 rounded-lg border border-border-color shadow-sm mb-8 text-center">
        <h2 className="text-2xl font-bold mb-2">YOUR EVIDENCE VAULT</h2>
        <p className="text-border-color italic mb-8">"We do not evaluate you. We evaluate the evidence you choose to share."</p>

        <div className="flex flex-col space-y-4 max-w-md mx-auto">
          <button 
            onClick={handleTestAI}
            disabled={loading}
            className="flex justify-between items-center px-6 py-4 bg-background border border-primary rounded hover:bg-surface transition disabled:opacity-50"
          >
            <span className="font-semibold">{loading ? "Processing..." : "+ Test AI Engine (React Context)"}</span>
            <span className="text-sm text-green-500">Demo</span>
          </button>
          
          <button className="flex justify-between items-center px-6 py-4 bg-background border border-border-color rounded hover:bg-surface transition">
            <span className="font-semibold">+ Upload ChatGPT Export</span>
            <span className="text-sm text-yellow-500">Pending</span>
          </button>
        </div>

        {status && (
          <div className="mt-6 p-4 border border-primary/50 bg-primary/10 rounded text-left text-sm">
            <strong className="text-primary">AI ENGINE YANITI:</strong>
            <p className="mt-2 text-foreground">{status}</p>
          </div>
        )}
      </div>
    </div>
  );
}
