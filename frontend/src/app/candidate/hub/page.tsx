"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  getCandidates,
  getRequirements,
  analyzeCandidateFile,
  Candidate,
  Requirement,
} from "@/lib/api";

type AnalysisStatus = "idle" | "loading" | "success" | "error";

interface AnalysisResult {
  status: string;
  reasoning: string;
  evidence_pointer?: string;
}

export default function CandidateEvidenceHub() {
  // Data
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [requirements, setRequirements] = useState<Requirement[]>([]);

  // Form state
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>("");
  const [selectedRequirementIds, setSelectedRequirementIds] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);

  // UI state
  const [isDragging, setIsDragging] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus>("idle");
  const [results, setResults] = useState<{ requirementId: string; result: AnalysisResult | null; error: string | null }[]>([]);
  const [dataError, setDataError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch candidates and requirements on mount
  useEffect(() => {
    async function loadData() {
      try {
        const [cands, reqs] = await Promise.all([getCandidates(), getRequirements()]);
        setCandidates(cands);
        setRequirements(reqs);
      } catch {
        setDataError("Veriler yüklenemedi. Backend'in çalıştığından emin olun.");
      }
    }
    loadData();
  }, []);

  // Drag & Drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped && (dropped.type === "application/pdf" || dropped.name.endsWith(".txt"))) {
      setFile(dropped);
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) setFile(selected);
  };

  const toggleRequirement = (reqId: string) => {
    setSelectedRequirementIds((prev) =>
      prev.includes(reqId) ? prev.filter((id) => id !== reqId) : [...prev, reqId]
    );
  };

  const canSubmit =
    selectedCandidateId &&
    selectedRequirementIds.length > 0 &&
    file &&
    analysisStatus !== "loading";

  const handleAnalyze = async () => {
    if (!canSubmit) return;

    setAnalysisStatus("loading");
    setResults([]);

    // Analyze for each selected requirement sequentially
    const analysisResults: typeof results = [];
    for (const reqId of selectedRequirementIds) {
      const res = await analyzeCandidateFile(selectedCandidateId, reqId, file!);
      if (res.success) {
        analysisResults.push({ requirementId: reqId, result: res.data, error: null });
      } else {
        analysisResults.push({ requirementId: reqId, result: null, error: res.error || "Bilinmeyen hata" });
      }
    }

    setResults(analysisResults);
    const hasError = analysisResults.some((r) => r.error !== null);
    setAnalysisStatus(hasError && analysisResults.every((r) => r.error !== null) ? "error" : "success");
  };

  const statusColor = (status: string) => {
    if (status === "VERIFIED") return "text-emerald-400";
    if (status === "INSUFFICIENT_EVIDENCE") return "text-amber-400";
    if (status === "CONTRADICTION") return "text-red-400";
    return "text-slate-400";
  };

  const statusBg = (status: string) => {
    if (status === "VERIFIED") return "border-emerald-500/40 bg-emerald-500/10";
    if (status === "INSUFFICIENT_EVIDENCE") return "border-amber-500/40 bg-amber-500/10";
    if (status === "CONTRADICTION") return "border-red-500/40 bg-red-500/10";
    return "border-slate-700 bg-slate-800";
  };

  const statusIcon = (status: string) => {
    if (status === "VERIFIED") return "✓";
    if (status === "INSUFFICIENT_EVIDENCE") return "⚠";
    if (status === "CONTRADICTION") return "✗";
    return "?";
  };

  const getRequirementDesc = (id: string) =>
    requirements.find((r) => r.external_id === id)?.description || id;

  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>
      {/* Header */}
      <div
        style={{ borderBottom: "1px solid var(--border-color)" }}
        className="px-8 py-4 flex justify-between items-center"
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
            style={{ background: "var(--primary)" }}
          >
            E
          </div>
          <span className="font-semibold" style={{ color: "var(--foreground)" }}>
            EIP Candidate Hub
          </span>
        </div>
        <div className="flex gap-6 text-sm" style={{ color: "var(--border-color)" }}>
          <span className="cursor-pointer hover:text-white transition-colors">My Profile</span>
          <span className="cursor-pointer hover:text-white transition-colors">Career Analysis</span>
          <span className="cursor-pointer hover:text-white transition-colors">Data Hub</span>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-10">
        {/* Hero */}
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold mb-3" style={{ color: "var(--foreground)" }}>
            Your{" "}
            <span style={{ color: "var(--primary)" }}>Evidence Vault</span>
          </h1>
          <p className="text-base italic" style={{ color: "var(--border-color)" }}>
            &ldquo;We do not evaluate you. We evaluate the evidence you choose to share.&rdquo;
          </p>
        </div>

        {dataError && (
          <div
            className="mb-6 px-5 py-4 rounded-xl text-sm border"
            style={{ borderColor: "#ef4444", background: "rgba(239,68,68,0.08)", color: "#fca5a5" }}
          >
            ⚠ {dataError}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* ── Left panel: Form ── */}
          <div className="lg:col-span-3 flex flex-col gap-5">

            {/* Step 1: Candidate */}
            <div
              className="rounded-2xl p-6 border"
              style={{ background: "var(--surface)", borderColor: "var(--border-color)" }}
            >
              <div className="flex items-center gap-2 mb-4">
                <span
                  className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                  style={{ background: "var(--primary)" }}
                >
                  1
                </span>
                <h2 className="font-semibold" style={{ color: "var(--foreground)" }}>
                  Aday Seçin
                </h2>
              </div>

              {candidates.length === 0 && !dataError ? (
                <p className="text-sm" style={{ color: "var(--border-color)" }}>
                  Yükleniyor...
                </p>
              ) : (
                <select
                  value={selectedCandidateId}
                  onChange={(e) => setSelectedCandidateId(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
                  style={{
                    background: "var(--background)",
                    border: `1px solid ${selectedCandidateId ? "var(--primary)" : "var(--border-color)"}`,
                    color: "var(--foreground)",
                  }}
                >
                  <option value="">— Aday Seçin —</option>
                  {candidates.map((c) => (
                    <option key={c.external_id} value={c.external_id}>
                      {c.name} ({c.external_id})
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Step 2: Requirements */}
            <div
              className="rounded-2xl p-6 border"
              style={{ background: "var(--surface)", borderColor: "var(--border-color)" }}
            >
              <div className="flex items-center gap-2 mb-4">
                <span
                  className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                  style={{ background: "var(--primary)" }}
                >
                  2
                </span>
                <h2 className="font-semibold" style={{ color: "var(--foreground)" }}>
                  Gereksinim(ler) Seçin
                </h2>
                <span className="ml-auto text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--background)", color: "var(--border-color)" }}>
                  Çoklu seçim
                </span>
              </div>

              {requirements.length === 0 && !dataError ? (
                <p className="text-sm" style={{ color: "var(--border-color)" }}>
                  Yükleniyor...
                </p>
              ) : (
                <div className="flex flex-col gap-2 max-h-52 overflow-y-auto pr-1">
                  {requirements.map((req) => {
                    const selected = selectedRequirementIds.includes(req.external_id);
                    return (
                      <label
                        key={req.external_id}
                        className="flex items-start gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all"
                        style={{
                          background: selected ? "rgba(37,99,235,0.12)" : "var(--background)",
                          border: `1px solid ${selected ? "var(--primary)" : "var(--border-color)"}`,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleRequirement(req.external_id)}
                          className="mt-0.5 accent-blue-500"
                        />
                        <div>
                          <p className="text-xs font-mono mb-0.5" style={{ color: "var(--primary)" }}>
                            {req.external_id}
                          </p>
                          <p className="text-sm" style={{ color: "var(--foreground)" }}>
                            {req.description}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Step 3: File Upload */}
            <div
              className="rounded-2xl p-6 border"
              style={{ background: "var(--surface)", borderColor: "var(--border-color)" }}
            >
              <div className="flex items-center gap-2 mb-4">
                <span
                  className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                  style={{ background: "var(--primary)" }}
                >
                  3
                </span>
                <h2 className="font-semibold" style={{ color: "var(--foreground)" }}>
                  Dosya Yükle
                </h2>
                <span className="ml-auto text-xs" style={{ color: "var(--border-color)" }}>
                  PDF veya TXT
                </span>
              </div>

              {/* Drop zone */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="relative flex flex-col items-center justify-center gap-3 py-10 rounded-xl cursor-pointer transition-all duration-200"
                style={{
                  border: `2px dashed ${isDragging ? "var(--primary)" : file ? "#10b981" : "var(--border-color)"}`,
                  background: isDragging
                    ? "rgba(37,99,235,0.08)"
                    : file
                    ? "rgba(16,185,129,0.06)"
                    : "var(--background)",
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.txt"
                  className="hidden"
                  onChange={handleFileSelect}
                />

                {file ? (
                  <>
                    <div className="text-4xl">📄</div>
                    <div className="text-center">
                      <p className="font-semibold text-sm" style={{ color: "#10b981" }}>
                        {file.name}
                      </p>
                      <p className="text-xs mt-1" style={{ color: "var(--border-color)" }}>
                        {(file.size / 1024).toFixed(1)} KB — Değiştirmek için tıklayın
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-4xl select-none">📂</div>
                    <div className="text-center">
                      <p className="text-sm font-medium" style={{ color: "var(--foreground)" }}>
                        Sürükle & bırak veya{" "}
                        <span style={{ color: "var(--primary)" }}>tıklayarak seç</span>
                      </p>
                      <p className="text-xs mt-1" style={{ color: "var(--border-color)" }}>
                        Desteklenen: .pdf, .txt
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Submit Button */}
            <button
              onClick={handleAnalyze}
              disabled={!canSubmit}
              className="w-full py-4 rounded-2xl font-semibold text-white transition-all duration-200 relative overflow-hidden"
              style={{
                background: canSubmit
                  ? "var(--primary)"
                  : "var(--surface)",
                border: `1px solid ${canSubmit ? "var(--primary)" : "var(--border-color)"}`,
                color: canSubmit ? "white" : "var(--border-color)",
                cursor: canSubmit ? "pointer" : "not-allowed",
                opacity: canSubmit ? 1 : 0.6,
              }}
            >
              {analysisStatus === "loading" ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  AI Analiz Ediyor... ({selectedRequirementIds.length} gereksinim)
                </span>
              ) : (
                `🔍 Analizi Başlat${selectedRequirementIds.length > 0 ? ` (${selectedRequirementIds.length} gereksinim)` : ""}`
              )}
            </button>
          </div>

          {/* ── Right panel: Results ── */}
          <div className="lg:col-span-2 flex flex-col gap-4">
            <div
              className="rounded-2xl p-5 border h-full"
              style={{ background: "var(--surface)", borderColor: "var(--border-color)", minHeight: "400px" }}
            >
              <h2 className="font-semibold mb-4 flex items-center gap-2" style={{ color: "var(--foreground)" }}>
                <span>🧠</span> AI Sonuçları
              </h2>

              {analysisStatus === "idle" && (
                <div className="flex flex-col items-center justify-center h-64 text-center gap-3">
                  <div className="text-5xl opacity-30">🔬</div>
                  <p className="text-sm" style={{ color: "var(--border-color)" }}>
                    Aday, gereksinim ve dosya seçip analizi başlatın
                  </p>
                </div>
              )}

              {analysisStatus === "loading" && (
                <div className="flex flex-col items-center justify-center h-64 text-center gap-4">
                  <div className="relative w-16 h-16">
                    <div
                      className="absolute inset-0 rounded-full border-4 border-t-transparent animate-spin"
                      style={{ borderColor: `var(--primary) transparent transparent transparent` }}
                    />
                  </div>
                  <div>
                    <p className="text-sm font-medium" style={{ color: "var(--foreground)" }}>
                      Analiz Ediliyor...
                    </p>
                    <p className="text-xs mt-1" style={{ color: "var(--border-color)" }}>
                      Gemini AI dosyanızı inceliyor
                    </p>
                  </div>
                </div>
              )}

              {(analysisStatus === "success" || analysisStatus === "error") && results.length > 0 && (
                <div className="flex flex-col gap-4 overflow-y-auto max-h-[600px] pr-1">
                  {results.map(({ requirementId, result, error }) => (
                    <div
                      key={requirementId}
                      className="rounded-xl p-4 border"
                      style={
                        result
                          ? {
                              borderColor: statusBg(result.status).split(" ")[0].replace("border-", ""),
                              background: statusBg(result.status).split(" ")[1].replace("bg-", ""),
                            }
                          : { borderColor: "#ef4444", background: "rgba(239,68,68,0.08)" }
                      }
                    >
                      {result ? (
                        <>
                          {/* Status badge */}
                          <div className="flex items-center justify-between mb-3">
                            <span
                              className="text-xs font-mono px-2 py-1 rounded-lg"
                              style={{ background: "var(--background)", color: "var(--border-color)" }}
                            >
                              {requirementId}
                            </span>
                            <span
                              className={`text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1 ${statusColor(result.status)}`}
                              style={{ background: "var(--background)" }}
                            >
                              {statusIcon(result.status)} {result.status}
                            </span>
                          </div>

                          {/* Requirement description */}
                          <p className="text-xs mb-3 italic" style={{ color: "var(--border-color)" }}>
                            {getRequirementDesc(requirementId)}
                          </p>

                          {/* Reasoning */}
                          <div className="mb-2">
                            <p className="text-xs font-semibold mb-1" style={{ color: "var(--foreground)" }}>
                              Gerekçe
                            </p>
                            <p className="text-xs leading-relaxed" style={{ color: "var(--border-color)" }}>
                              {result.reasoning}
                            </p>
                          </div>

                          {/* Evidence pointer */}
                          {result.evidence_pointer && (
                            <div
                              className="mt-3 px-3 py-2 rounded-lg text-xs font-mono"
                              style={{ background: "var(--background)", color: "#10b981", borderLeft: "3px solid #10b981" }}
                            >
                              &ldquo;{result.evidence_pointer}&rdquo;
                            </div>
                          )}
                        </>
                      ) : (
                        <div>
                          <p className="text-xs font-mono mb-1" style={{ color: "var(--border-color)" }}>
                            {requirementId}
                          </p>
                          <p className="text-xs" style={{ color: "#fca5a5" }}>
                            ✗ {error}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                  
                  {selectedCandidateId && (
                    <div className="pt-3 border-t border-zinc-800 flex justify-center">
                      <a
                        href={`/reports/${selectedCandidateId}`}
                        className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl text-xs text-center transition shadow inline-block"
                      >
                        📊 View Full Explainability Report &rarr;
                      </a>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Info card */}
            <div
              className="rounded-2xl p-4 border text-xs"
              style={{ background: "var(--surface)", borderColor: "var(--border-color)", color: "var(--border-color)" }}
            >
              <p className="font-semibold mb-2" style={{ color: "var(--foreground)" }}>
                ℹ Nasıl Çalışır?
              </p>
              <ul className="space-y-1.5 list-none">
                <li>📄 PDF veya TXT formatında CV yükleyin</li>
                <li>✅ Birden fazla gereksinim seçebilirsiniz</li>
                <li>🤖 Gemini AI her gereksinim için ayrı analiz yapar</li>
                <li>🔒 Sonuçlar veritabanına kaydedilir</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
