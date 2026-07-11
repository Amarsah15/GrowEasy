"use client";

import React, { useState, useRef, useEffect } from "react";
import Papa from "papaparse";
import {
  UploadCloud,
  FileText,
  Trash2,
  CheckCircle2,
  Info,
  RefreshCw,
  ArrowRight,
  ShieldAlert,
  X,
  Download,
  Check,
} from "lucide-react";
import styles from "./CSVImporterView.module.css";

interface Lead {
  created_at?: string;
  name?: string;
  email?: string;
  country_code?: string;
  mobile_without_country_code?: string;
  company?: string;
  city?: string;
  state?: string;
  country?: string;
  lead_owner?: string;
  crm_status?: string;
  crm_note?: string;
  data_source?: string;
  possession_time?: string;
  description?: string;
  _confidence?: number | null;
  confidence?: number;
  [key: string]: string | number | boolean | undefined | null;
}

interface SkippedLead {
  reason: string;
  rawData: Record<string, string | number | boolean | undefined | null>;
}

interface BatchRecord {
  status: "success" | "skipped";
  reason?: string;
  confidence?: number;
  data?: Partial<Lead>;
  rawData?: Record<string, string | number | boolean | undefined | null>;
}

interface CSVImporterProps {
  onImportComplete?: () => void;
}

const downloadLeadsAsCSV = (
  leadsList: Lead[],
  filename = "groweasy_mapped_leads.csv",
) => {
  if (!leadsList || leadsList.length === 0) return;
  const headers = [
    "created_at",
    "name",
    "email",
    "country_code",
    "mobile_without_country_code",
    "company",
    "city",
    "state",
    "country",
    "lead_owner",
    "crm_status",
    "crm_note",
    "data_source",
    "possession_time",
    "description",
  ];

  const csvRows = [];
  csvRows.push(headers.join(","));

  for (const lead of leadsList) {
    const values = headers.map((header) => {
      const val = lead[header] || "";
      const escaped = ("" + val).replace(/"/g, '""');
      return escaped.includes(",") ||
        escaped.includes("\n") ||
        escaped.includes('"')
        ? `"${escaped}"`
        : escaped;
    });
    csvRows.push(values.join(","));
  }

  const csvContent = csvRows.join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  link.click();
};

const isChip = (p: string) => {
  const colonIdx = p.indexOf(": ");
  if (colonIdx === -1) return false;
  const key = p.substring(0, colonIdx).trim();
  // Key should be reasonably short (<= 25 chars) and should not contain sentences (e.g. no periods)
  return key.length <= 25 && !key.includes(".") && !key.includes("\n");
};

const formatCommentText = (text: string, index: number) => {
  const varColor = `var(--comment-color-${index % 5})`;

  const colonIdx = text.indexOf(": ");
  if (colonIdx > -1) {
    const key = text.substring(0, colonIdx).trim();
    // Only highlight if key is a short label (matching chip logic)
    if (key.length <= 25 && !key.includes(".") && !key.includes("\n")) {
      const val = text.substring(colonIdx + 1);
      return (
        <span style={{ color: varColor }}>
          <strong style={{ opacity: 0.85 }}>{key}:</strong>
          <span style={{ color: "var(--foreground)" }}>{val}</span>
        </span>
      );
    }
  }

  return <span style={{ color: varColor }}>{text}</span>;
};

const renderNotes = (
  note: string,
  idx: number,
  isExpanded: boolean,
  onToggle: () => void,
) => {
  if (!note) return "-";
  // Split by comma or pipe (handling surrounding whitespace)
  const parts = note
    .split(/\s*,\s*|\s*\|\s*/)
    .filter((p) => p.trim().length > 0);

  // Separate chips (key: value) and raw comments (just text)
  const chips = parts.filter((p) => isChip(p));
  const comments = parts.filter((p) => !isChip(p));

  // Logical limits
  const visibleChips = isExpanded ? chips : chips.slice(0, 2);
  const visibleComments = isExpanded ? comments : comments.slice(0, 1);

  const MAX_LEN = 60;

  // Check if any of the visible values are truncated when collapsed
  const hasTruncatedVisible =
    !isExpanded &&
    (visibleChips.some((c) => {
      const colonIdx = c.indexOf(": ");
      return c.substring(colonIdx + 2).length > MAX_LEN;
    }) ||
      visibleComments.some((c) => c.length > MAX_LEN));

  const hasMore =
    chips.length > 2 || comments.length > 1 || hasTruncatedVisible;
  const remainingCount =
    chips.length > 2 || comments.length > 1
      ? parts.length - (visibleChips.length + visibleComments.length)
      : 0;

  return (
    <div className={styles.notesWrapper}>
      {/* 1. Chips Row */}
      <div className={styles.chipsRow}>
        {visibleChips.map((chip, chipIdx) => {
          const colonIdx = chip.indexOf(": ");
          const key = chip.substring(0, colonIdx);
          let val = chip.substring(colonIdx + 2);
          const isTruncated = !isExpanded && val.length > MAX_LEN;
          if (isTruncated) {
            val = val.substring(0, MAX_LEN) + "...";
          }
          return (
            <div
              key={chipIdx}
              className={styles.noteItem}
              onClick={
                isTruncated
                  ? (e) => {
                      e.stopPropagation();
                      onToggle();
                    }
                  : undefined
              }
              style={isTruncated ? { cursor: "pointer" } : undefined}
              title={isTruncated ? "Click to expand" : undefined}
            >
              <span className={styles.noteKey}>{key.replace(/_/g, " ")}:</span>
              <span className={styles.noteVal}>{val}</span>
            </div>
          );
        })}
      </div>

      {/* 2. Comments Row */}
      {visibleComments.length > 0 && (
        <div className={styles.commentsRow}>
          {visibleComments.map((comment, commentIdx) => {
            let text = comment;
            const isTruncated = !isExpanded && text.length > MAX_LEN;
            if (isTruncated) {
              text = text.substring(0, MAX_LEN) + "...";
            }
            return (
              <div
                key={commentIdx}
                className={styles.noteText}
                onClick={
                  isTruncated
                    ? (e) => {
                        e.stopPropagation();
                        onToggle();
                      }
                    : undefined
                }
                style={isTruncated ? { cursor: "pointer" } : undefined}
                title={isTruncated ? "Click to expand" : undefined}
              >
                {formatCommentText(text, commentIdx)}
              </div>
            );
          })}
        </div>
      )}

      {/* Toggle button at the very bottom (at the same place for both states) */}
      {hasMore && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className={styles.toggleNotesBtn}
          style={{ marginTop: "6px" }}
        >
          {isExpanded
            ? "Show Less"
            : remainingCount > 0
              ? `+${remainingCount} More`
              : "Show More"}
        </button>
      )}
    </div>
  );
};

const LOW_CONFIDENCE = 70;

const renderConfidence = (score: number | null | undefined) => {
  if (score === null || score === undefined)
    return <span style={{ color: "var(--text-lighter)" }}>—</span>;
  const low = score < LOW_CONFIDENCE;
  return (
    <span
      className={`badge ${low ? "badge-warning" : "badge-success"}`}
      title={
        low ? "Low confidence — please verify this row" : "High confidence"
      }
    >
      {low ? (
        <ShieldAlert size={11} style={{ marginRight: "4px" }} />
      ) : (
        <Check size={11} style={{ marginRight: "4px" }} />
      )}
      {score}%
    </span>
  );
};

export default function CSVImporterView({
  onImportComplete,
}: CSVImporterProps) {
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [previewRows, setPreviewRows] = useState<Record<string, string>[]>([]);
  const [previewHeaders, setPreviewHeaders] = useState<string[]>([]);

  // Steps: 'upload' | 'preview' | 'processing' | 'results'
  const [step, setStep] = useState<
    "upload" | "preview" | "processing" | "results"
  >("upload");
  const [expandedNotes, setExpandedNotes] = useState<Record<number, boolean>>(
    {},
  );

  const toggleNote = (idx: number) => {
    setExpandedNotes((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  // Streaming state
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalBatches, setTotalBatches] = useState(0);
  const [processedBatches, setProcessedBatches] = useState(0);
  const [processedRecords, setProcessedRecords] = useState(0);
  const [engineLabel, setEngineLabel] = useState<string>("");
  const [importLogs, setImportLogs] = useState<string[]>([]);

  // Results
  const [importedLeads, setImportedLeads] = useState<Lead[]>([]);
  const [skippedLeads, setSkippedLeads] = useState<SkippedLead[]>([]);
  const [viewingTable, setViewingTable] = useState<"imported" | "skipped">(
    "imported",
  );

  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  const [currentBackendUrl, setCurrentBackendUrl] = useState(
    "http://127.0.0.1:5000",
  );

  // Which engine will actually run the import: known up-front (before the
  // user even uploads) so it's never a surprise buried in a processing log.
  const [serverGeminiConfigured, setServerGeminiConfigured] = useState<
    boolean | null
  >(null);
  const [clientGeminiKey, setClientGeminiKey] = useState<string>("");

  useEffect(() => {
    const savedUrl = (
      localStorage.getItem("groweasy_backend_url") ||
      process.env.NEXT_PUBLIC_BACKEND_URL ||
      "http://127.0.0.1:5000"
    ).trim();
    let targetUrl = savedUrl.replace("localhost", "127.0.0.1");
    if (targetUrl && !/^https?:\/\//i.test(targetUrl)) {
      if (/^(localhost|127\.0\.0\.1)/i.test(targetUrl)) {
        targetUrl = `http://${targetUrl}`;
      } else {
        targetUrl = `https://${targetUrl}`;
      }
    }
    const savedKey = (localStorage.getItem("groweasy_gemini_key") || "").trim();

    setTimeout(() => {
      setCurrentBackendUrl(targetUrl);
      setClientGeminiKey(savedKey);
    }, 0);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timerId: any = null;

    const checkHealth = () => {
      fetch(`${currentBackendUrl}/health`)
        .then((res) => res.json())
        .then((data) => {
          if (!cancelled) {
            setServerGeminiConfigured(Boolean(data?.apiConfigured?.gemini));
          }
        })
        .catch(() => {
          if (!cancelled) {
            setServerGeminiConfigured(null);
            // Retry checking every 5 seconds if server is not reachable (Render cold start)
            timerId = setTimeout(checkHealth, 5000);
          }
        });
    };

    checkHealth();

    return () => {
      cancelled = true;
      if (timerId) clearTimeout(timerId);
    };
  }, [currentBackendUrl]);

  const engineStatus: {
    mode: "gemini-server" | "gemini-client" | "fallback" | "unknown";
    label: string;
  } = (() => {
    if (clientGeminiKey)
      return {
        mode: "gemini-client",
        label: "AI Engine: Gemini (your API key)",
      };
    if (serverGeminiConfigured === true)
      return {
        mode: "gemini-server",
        label: "AI Engine: Gemini (server configured)",
      };
    if (serverGeminiConfigured === false)
      return {
        mode: "fallback",
        label: "Fallback Mode: Local Heuristic Engine",
      };
    return { mode: "unknown", label: "Checking AI engine status…" };
  })();

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [importLogs]);

  // Handle drag events
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  // Handle drop
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  // Handle file select
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const validateAndSetFile = (selectedFile: File) => {
    if (selectedFile.name.endsWith(".csv")) {
      if (selectedFile.size <= 5 * 1024 * 1024) {
        // 5MB
        setFile(selectedFile);
        parsePreview(selectedFile);
      } else {
        setErrorMessage("File is too large. Maximum size allowed is 5MB.");
      }
    } else {
      setErrorMessage("Only .csv files are supported.");
    }
  };

  const parsePreview = (selectedFile: File) => {
    Papa.parse(selectedFile, {
      header: true,
      skipEmptyLines: "greedy",
      preview: 50, // Preview up to 50 rows
      complete: (results) => {
        if (results.data && results.data.length > 0) {
          const firstRow = results.data[0] as object;
          const headers = Object.keys(firstRow).filter(
            (h) => h && h.trim() !== "" && !h.startsWith("__parsed_extra"),
          );
          setPreviewHeaders(headers);
          setPreviewRows(results.data as Record<string, string>[]);
          setStep("preview");
        } else {
          alert("CSV file is empty or headers are missing.");
          setFile(null);
        }
      },
      error: (error) => {
        alert(`Error parsing CSV: ${error.message}`);
        setFile(null);
      },
    });
  };

  const handleRemoveFile = () => {
    setFile(null);
    setPreviewRows([]);
    setPreviewHeaders([]);
    setStep("upload");
  };

  const startStreamingImport = async () => {
    if (!file) return;

    setStep("processing");
    setProcessedBatches(0);
    setProcessedRecords(0);
    setTotalRecords(0);
    setEngineLabel("");
    setImportLogs(["Connecting to server…", "Uploading and reading your CSV…"]);
    setImportedLeads([]);
    setSkippedLeads([]);

    const backendUrl = currentBackendUrl;
    const geminiKey = localStorage.getItem("groweasy_gemini_key") || "";

    const headers: Record<string, string> = {};
    if (geminiKey) headers["x-gemini-key"] = geminiKey;

    const formData = new FormData();
    formData.append("file", file);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch(
        `${backendUrl.replace(/\/$/, "")}/api/import`,
        {
          method: "POST",
          body: formData,
          headers: headers,
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Server returned an error");
      }

      if (!response.body) {
        throw new Error("Streaming response body not supported by the server");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const tempImported: Lead[] = [];
      const tempSkipped: SkippedLead[] = [];

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || ""; // Keep partial line in buffer

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;

          try {
            const event = JSON.parse(trimmed.replace("data: ", "").trim());

            if (event.type === "mapping") {
              const label =
                event.engine === "local-pattern-engine"
                  ? "Local pattern engine"
                  : `Gemini (${event.engine})`;
              setEngineLabel(label);
              setServerGeminiConfigured(event.engine !== "local-pattern-engine");
              const mappedCols = Object.entries(event.mapping || {}).filter(
                ([, v]) => v && v !== "unmapped",
              ).length;
              setImportLogs((prev) => [
                ...prev,
                `Engine: ${label}.`,
                `Detected ${mappedCols} mappable column${mappedCols === 1 ? "" : "s"} from your CSV layout.`,
              ]);
            } else if (event.type === "start") {
              setTotalRecords(event.totalRecords);
              setTotalBatches(event.totalBatches);
              setImportLogs((prev) => [
                ...prev,
                `Found ${event.totalRecords} records — processing in ${event.totalBatches} batch${event.totalBatches === 1 ? "" : "es"}.`,
              ]);
            } else if (event.type === "progress") {
              // Live heartbeat while a batch's AI call is in flight — keeps the
              // bar moving smoothly instead of frozen until the batch returns.
              if (typeof event.processedRecords === "number") {
                setProcessedRecords((prev) =>
                  Math.max(prev, event.processedRecords),
                );
              }
            } else if (event.type === "batch") {
              setProcessedBatches((prev) => prev + 1);

              const batchResults: BatchRecord[] = event.data || [];
              const successCount = batchResults.filter(
                (r: BatchRecord) => r.status === "success",
              ).length;
              const skippedCount = batchResults.filter(
                (r: BatchRecord) => r.status === "skipped",
              ).length;

              // Snap to the real record count for this batch.
              if (typeof event.processedRecords === "number") {
                setProcessedRecords(event.processedRecords);
              } else {
                setProcessedRecords((prev) => prev + batchResults.length);
              }

              // Separate success and skipped
              batchResults.forEach((r: BatchRecord) => {
                if (r.status === "success") {
                  // Carry the AI's confidence alongside the mapped record so the
                  // results table can flag anything the model was unsure about.
                  tempImported.push({
                    ...r.data,
                    _confidence:
                      typeof r.confidence === "number" ? r.confidence : null,
                  });
                } else {
                  tempSkipped.push({
                    reason: r.reason || "Invalid contact data",
                    rawData: r.rawData || r.data || {},
                  });
                }
              });

              setImportedLeads([...tempImported]);
              setSkippedLeads([...tempSkipped]);

              setImportLogs((prev) => [
                ...prev,
                `Batch ${event.batchIndex + 1} processed: Mapped ${successCount} leads successfully, skipped ${skippedCount} records.`,
              ]);
            } else if (event.type === "error") {
              setImportLogs((prev) => [...prev, `Error: ${event.message}`]);
            }
          } catch (e) {
            console.error("Failed to parse SSE event:", e);
          }
        }
      }

      setImportLogs((prev) => [
        ...prev,
        "Import completed! Finalizing records...",
      ]);

      // Save results to local storage so they appear in Leads database tab
      const savedLeads = localStorage.getItem("groweasy_leads");
      const existingLeads = savedLeads ? JSON.parse(savedLeads) : [];
      const updatedLeads = [...tempImported, ...existingLeads];
      localStorage.setItem("groweasy_leads", JSON.stringify(updatedLeads));

      // Update files processed counter
      const filesCount = localStorage.getItem("groweasy_files_count");
      const nextFilesCount = filesCount ? parseInt(filesCount) + 1 : 1;
      localStorage.setItem("groweasy_files_count", nextFilesCount.toString());

      // Update cumulative skipped counter
      const skippedCount = localStorage.getItem("groweasy_skipped_count");
      const nextSkippedCount = skippedCount
        ? parseInt(skippedCount) + tempSkipped.length
        : tempSkipped.length;
      localStorage.setItem(
        "groweasy_skipped_count",
        nextSkippedCount.toString(),
      );

      setStep("results");
      if (onImportComplete) {
        onImportComplete();
      }
    } catch (err) {
      const isAbort = err instanceof Error && err.name === "AbortError";
      const errMsg = err instanceof Error ? err.message : String(err);
      if (isAbort) {
        setImportLogs((prev) => [...prev, "Import aborted by user."]);
        setErrorMessage("Import process was cancelled.");
        setStep("preview");
      } else {
        setImportLogs((prev) => [...prev, `Stream Failed: ${errMsg}`]);
        setErrorMessage(
          `Failed to import CSV: ${errMsg}. Please check if the GrowEasy backend server is running at ${backendUrl} and your network is connected.`,
        );
        setStep("preview");
      }
    } finally {
      abortControllerRef.current = null;
    }
  };

  const handleCancelImport = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const resetImporter = () => {
    setFile(null);
    setPreviewRows([]);
    setPreviewHeaders([]);
    setImportedLeads([]);
    setSkippedLeads([]);
    setStep("upload");
  };

  const downloadTemplate = () => {
    const csvContent = `created_at,name,email,country_code,mobile_without_country_code,company,city,state,country,lead_owner,crm_status,crm_note,data_source,possession_time,description
2026-05-13 14:20:48,John Doe,john.doe@example.com,+91,9876543210,GrowEasy,Mumbai,Maharashtra,India,test@gmail.com,GOOD_LEAD_FOLLOW_UP,Client is asking to reschedule demo,leads_on_demand,,
2026-05-13 14:25:30,Sarah Johnson,sarah.johnson@example.com,+91,9876543211,Tech Solutions,Bangalore,Karnataka,India,test@gmail.com,DID_NOT_CONNECT,"Person was busy, will try again next week",meridian_tower,,
2026-05-13 14:30:15,Rajesh Patel,rajesh.patel@example.com,+91,9876543212,Startup Inc,Delhi,Delhi,India,test@gmail.com,BAD_LEAD,Not interested in our services,eden_park,,
2026-05-13 14:35:22,Priya Singh,priya.singh@example.com,+91,9876543213,Enterprise Corp,Pune,Maharashtra,India,test@gmail.com,SALE_DONE,"Deal closed, onboarding in progress",sarjapur_plots,,`;

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "groweasy_crm_leads_template.csv");
    link.click();
  };

  // Record-based percentage so the bar moves smoothly with the heartbeat,
  // not in big jumps per batch. Capped at 99% until the final 'complete'.
  const rawPercent =
    totalRecords > 0 ? (processedRecords / totalRecords) * 100 : 0;
  const progressPercent =
    step === "results" ? 100 : Math.min(99, Math.round(rawPercent));

  return (
    <div className={`${styles.container} animate-fade-in`}>
      {/* Dynamic Dashboard Step layout */}
      <header className={styles.header}>
        <h1>Import leads from a CSV</h1>
        <p>
          Drop in any CSV — whatever the columns are called. We&apos;ll read it,
          map it to your CRM, and flag anything that needs a second look.
        </p>
        <div
          className={`${styles.engineBadge} ${
            engineStatus.mode === "fallback"
              ? styles.engineBadgeWarning
              : engineStatus.mode === "unknown"
                ? styles.engineBadgeNeutral
                : styles.engineBadgeOk
          }`}
          title={
            engineStatus.mode === "fallback"
              ? "No Gemini API key is configured. Imports will use the local pattern-matching engine instead of the LLM — good on clean data, weaker on very ambiguous or free-text-heavy columns."
              : engineStatus.mode === "gemini-client"
                ? "Using the Gemini API key saved in your browser for this session."
                : engineStatus.mode === "gemini-server"
                  ? "The backend has a Gemini API key configured — imports will use real AI extraction."
                  : "Contacting the backend to check which engine is active…"
          }
        >
          <span className={styles.engineBadgeDot} />
          {engineStatus.label}
        </div>
      </header>

      {/* STEP 1: UPLOAD FILE */}
      {step === "upload" && (
        <div className={styles.uploadArea}>
          <div
            className={`${styles.dropzone} glass-panel ${dragActive ? styles.dragActive : ""}`}
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              className={styles.fileInput}
              onChange={handleFileChange}
              accept=".csv"
            />
            <UploadCloud size={48} className={styles.uploadIcon} />
            <h3>Drag & Drop Lead CSV file here</h3>
            <p>or click to browse your local filesystem</p>
            <span className={styles.fileTypes}>
              Supported file: .csv (max 5MB)
            </span>
          </div>

          <div className={styles.uploadMeta}>
            <button className={styles.templateBtn} onClick={downloadTemplate}>
              <Download size={16} /> Download Sample CSV Template
            </button>
            <div className={styles.infoNote}>
              <Info size={16} />
              <span>
                No layout restrictions. The AI will read names, contact fields,
                locations, and other details even with custom or missing
                headers.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* STEP 2: PREVIEW ROWS */}
      {step === "preview" && (
        <div className={`${styles.previewArea} animate-fade-in`}>
          <div className={`${styles.fileHeader} glass-panel`}>
            <div className={styles.fileInfo}>
              <FileText size={24} className={styles.fileTextIcon} />
              <div>
                <h4>{file?.name}</h4>
                <span>
                  {(file ? file.size / 1024 : 0).toFixed(2)} KB • Local Preview
                  Mode (AI mapping not executed yet)
                </span>
              </div>
            </div>
            <button className={styles.removeBtn} onClick={handleRemoveFile}>
              <Trash2 size={16} /> Remove File
            </button>
          </div>

          <div className={`${styles.tableWrapper} glass-panel`}>
            <div className={styles.tableContainer}>
              <table>
                <thead>
                  <tr>
                    {previewHeaders.map((h, i) => {
                      const isNote =
                        h.toLowerCase().includes("note") ||
                        h.toLowerCase().includes("remark") ||
                        h.toLowerCase().includes("comment") ||
                        h.toLowerCase().includes("desc");
                      return (
                        <th
                          key={i}
                          className={isNote ? undefined : styles.nowrap}
                          style={
                            isNote
                              ? {
                                  minWidth: "220px",
                                  maxWidth: "300px",
                                  whiteSpace: "normal",
                                  wordBreak: "break-word",
                                }
                              : undefined
                          }
                        >
                          {h}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, rIdx) => (
                    <tr key={rIdx}>
                      {previewHeaders.map((h, cIdx) => {
                        const isNote =
                          h.toLowerCase().includes("note") ||
                          h.toLowerCase().includes("remark") ||
                          h.toLowerCase().includes("comment") ||
                          h.toLowerCase().includes("desc");
                        return (
                          <td
                            key={cIdx}
                            className={isNote ? undefined : styles.nowrap}
                            style={
                              isNote
                                ? {
                                    minWidth: "220px",
                                    maxWidth: "300px",
                                    whiteSpace: "normal",
                                    wordBreak: "break-word",
                                  }
                                : undefined
                            }
                          >
                            {row[h] || "-"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className={styles.previewActions}>
            <div className={styles.summaryBadge}>
              Showing first {previewRows.length} rows for review
            </div>
            <button
              className={styles.confirmBtn}
              onClick={startStreamingImport}
            >
              Confirm Import & Map with AI <ArrowRight size={18} />
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: PROCESSING STREAM */}
      {step === "processing" && (
        <div className={`${styles.processingArea} animate-fade-in`}>
          <div className={`${styles.processingCard} glass-panel`}>
            <div className={styles.processingHeader}>
              <div className={styles.spinnerBlock}>
                <RefreshCw size={28} className="animate-spin" />
                <div>
                  <h3>
                    Mapping your leads{engineLabel ? ` · ${engineLabel}` : ""}
                  </h3>
                  <p>Reading each row and cleaning it into your CRM schema…</p>
                </div>
              </div>
              <button className={styles.cancelBtn} onClick={handleCancelImport}>
                <X size={16} /> Cancel Processing
              </button>
            </div>

            {/* Progress Bar */}
            <div className={styles.progressBarWrapper}>
              <div className={styles.progressBarInfo}>
                <span>
                  {totalBatches > 1
                    ? `Batch ${Math.min(processedBatches + 1, totalBatches)} of ${totalBatches} · ${progressPercent}%`
                    : `${progressPercent}%`}
                </span>
                <span>
                  {Math.min(processedRecords, totalRecords) || 0} of{" "}
                  {totalRecords || "…"} records mapped
                </span>
              </div>
              <div className={styles.progressBarTrack}>
                <div
                  className={styles.progressBarFill}
                  style={{ width: `${progressPercent}%` }}
                ></div>
              </div>
            </div>

            {/* SSE Terminal Console */}
            <div className={styles.consoleConsole}>
              <div className={styles.consoleHeader}>
                <span>Streaming Event Logs</span>
                <span className={styles.pulseDot}></span>
              </div>
              <div className={styles.consoleLogs}>
                {importLogs.map((log, index) => (
                  <div key={index} className={styles.logRow}>
                    <span className={styles.logTime}>&gt;</span>
                    <span className={styles.logText}>{log}</span>
                  </div>
                ))}
                <div ref={logEndRef} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STEP 4: DISPLAY RESULTS */}
      {step === "results" && (
        <div className={`${styles.resultsArea} animate-fade-in`}>
          <div className={styles.resultsSummary}>
            <div className={`${styles.resultCard} glass-panel`}>
              <CheckCircle2 size={24} className={styles.successColor} />
              <div>
                <span>Imported Successfully</span>
                <h2>{importedLeads.length}</h2>
              </div>
            </div>

            <div className={`${styles.resultCard} glass-panel`}>
              <ShieldAlert size={24} style={{ color: "var(--danger)" }} />
              <div>
                <span>Records Skipped</span>
                <h2 style={{ color: "var(--danger)" }}>
                  {skippedLeads.length}
                </h2>
              </div>
            </div>

            <div className={`${styles.resultCard} glass-panel`}>
              <Info size={24} className={styles.warningColor} />
              <div>
                <span>Needs Review (&lt; {LOW_CONFIDENCE}%)</span>
                <h2>
                  {
                    importedLeads.filter(
                      (l) =>
                        typeof l._confidence === "number" &&
                        l._confidence < LOW_CONFIDENCE,
                    ).length
                  }
                </h2>
              </div>
            </div>

            <div className={`${styles.resultCard} glass-panel`}>
              <FileText size={24} className={styles.infoColor} />
              <div>
                <span>Total Processed</span>
                <h2>{importedLeads.length + skippedLeads.length}</h2>
              </div>
            </div>
          </div>
          <div className={styles.resultDetailsWrapper}>
            <div className={`${styles.resultDetailsNav} glass-panel`}>
              <div className={styles.resultTabs}>
                <button
                  className={`${styles.tabBtn} ${viewingTable === "imported" ? styles.activeTabBtn : ""}`}
                  onClick={() => setViewingTable("imported")}
                >
                  Mapped Leads ({importedLeads.length})
                </button>
                <button
                  className={`${styles.tabBtn} ${viewingTable === "skipped" ? styles.activeTabBtn : ""}`}
                  onClick={() => setViewingTable("skipped")}
                >
                  Skipped Records ({skippedLeads.length})
                </button>
              </div>
              {viewingTable === "imported" && importedLeads.length > 0 && (
                <button
                  className={styles.downloadCsvBtn}
                  onClick={() =>
                    downloadLeadsAsCSV(
                      importedLeads,
                      "groweasy_mapped_leads.csv",
                    )
                  }
                >
                  <Download size={14} /> Export to CSV
                </button>
              )}
            </div>

            {/* IMPORTED RECORDS TABLE */}
            {viewingTable === "imported" ? (
              <div className={`${styles.tableWrapper} glass-panel`}>
                <div className={styles.tableContainer}>
                  {importedLeads.length === 0 ? (
                    <div className={styles.emptyTable}>
                      No leads were mapped in this file.
                    </div>
                  ) : (
                    <table>
                      <thead>
                        <tr>
                          <th className={styles.nowrap}>Date Created</th>
                          <th className={styles.nowrap}>Name</th>
                          <th className={styles.nowrap}>Email</th>
                          <th className={styles.nowrap}>Phone</th>
                          <th className={styles.nowrap}>Company</th>
                          <th className={styles.nowrap}>Location</th>
                          <th className={styles.nowrap}>Status</th>
                          <th className={styles.nowrap}>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "4px",
                              }}
                              title="See detailed confidence explanation below the table"
                            >
                              <span>AI Confidence</span>
                              <Info
                                size={12}
                                style={{
                                  color: "var(--accent-primary)",
                                  cursor: "pointer",
                                }}
                              />
                            </div>
                          </th>
                          <th className={styles.nowrap}>Source</th>
                          <th className={styles.nowrap}>Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importedLeads.map((lead, idx) => (
                          <tr
                            key={idx}
                            className={
                              typeof lead._confidence === "number" &&
                              lead._confidence < LOW_CONFIDENCE
                                ? styles.lowConfidenceRow
                                : ""
                            }
                          >
                            <td className={styles.nowrap}>
                              {lead.created_at || "-"}
                            </td>
                            <td className={`${styles.bold} ${styles.nowrap}`}>
                              {lead.name || "-"}
                            </td>
                            <td className={styles.nowrap}>
                              {lead.email || "-"}
                            </td>
                            <td className={styles.nowrap}>
                              {lead.country_code ? `${lead.country_code} ` : ""}
                              {lead.mobile_without_country_code || "-"}
                            </td>
                            <td className={styles.nowrap}>
                              {lead.company || "-"}
                            </td>
                            <td className={styles.nowrap}>
                              {[lead.city, lead.state, lead.country]
                                .filter(Boolean)
                                .join(", ") || "-"}
                            </td>
                            <td className={styles.nowrap}>
                              {lead.crm_status ? (
                                <span
                                  className={`badge ${
                                    lead.crm_status === "SALE_DONE"
                                      ? "badge-primary"
                                      : lead.crm_status ===
                                          "GOOD_LEAD_FOLLOW_UP"
                                        ? "badge-success"
                                        : lead.crm_status === "DID_NOT_CONNECT"
                                          ? "badge-warning"
                                          : lead.crm_status === "BAD_LEAD" ||
                                              lead.crm_status === "REJECTED"
                                            ? "badge-danger"
                                            : ""
                                  }`}
                                >
                                  {lead.crm_status.replace(/_/g, " ")}
                                </span>
                              ) : (
                                <span
                                  className="badge"
                                  style={{
                                    backgroundColor: "var(--bg-subtle)",
                                    color: "var(--ink-muted)",
                                    border: "1px solid var(--border)",
                                  }}
                                >
                                  Neutral
                                </span>
                              )}
                            </td>
                            <td className={styles.nowrap}>
                              {renderConfidence(lead._confidence)}
                            </td>
                            <td className={styles.nowrap}>
                              {lead.data_source ? (
                                <span className={`${styles.miniSourceBadge}`}>
                                  {lead.data_source.replace(/_/g, " ")}
                                </span>
                              ) : (
                                "-"
                              )}
                            </td>
                            <td
                              className={
                                !!expandedNotes[idx]
                                  ? styles.noteCellExpanded
                                  : styles.noteCell
                              }
                            >
                              {renderNotes(
                                lead.crm_note || "",
                                idx,
                                !!expandedNotes[idx],
                                () => toggleNote(idx),
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            ) : (
              /* SKIPPED RECORDS TABLE */
              <div className={`${styles.tableWrapper} glass-panel`}>
                <div className={styles.tableContainer}>
                  {skippedLeads.length === 0 ? (
                    <div className={styles.emptyTable}>
                      No records were skipped!
                    </div>
                  ) : (
                    <table>
                      <thead>
                        <tr>
                          <th className={styles.nowrap}>Index</th>
                          <th className={styles.nowrap}>
                            Candidate Contact Details
                          </th>
                          <th className={styles.nowrap}>Skip Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {skippedLeads.map((skipped, idx) => (
                          <tr key={idx}>
                            <td>#{idx + 1}</td>
                            <td>
                              <div className={styles.skippedContacts}>
                                <span>
                                  Email:{" "}
                                  <strong>
                                    {skipped.rawData?.email ||
                                      skipped.rawData?.Email ||
                                      "Not found"}
                                  </strong>
                                </span>
                                <span>
                                  Mobile:{" "}
                                  <strong>
                                    {skipped.rawData?.mobile ||
                                      skipped.rawData?.Mobile ||
                                      skipped.rawData?.phone ||
                                      skipped.rawData?.Phone ||
                                      "Not found"}
                                  </strong>
                                </span>
                              </div>
                            </td>
                            <td>
                              <span className={styles.reasonBadge}>
                                <ShieldAlert size={12} /> {skipped.reason}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}

            {/* AI Confidence Disclaimer Box */}
            <div
              className="glass-panel"
              style={{
                padding: "20px",
                marginTop: "24px",
                borderLeft: "4px solid var(--accent-primary)",
                backgroundColor: "var(--card-bg)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  marginBottom: "8px",
                }}
              >
                <Info size={18} style={{ color: "var(--accent-primary)" }} />
                <h4
                  style={{
                    margin: 0,
                    fontSize: "0.95rem",
                    fontWeight: 600,
                    color: "var(--foreground)",
                  }}
                >
                  About AI Confidence Score
                </h4>
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: "0.85rem",
                  color: "var(--text-muted)",
                  lineHeight: "1.5",
                }}
              >
                The AI Confidence Score represents the machine learning
                model&apos;s self-assessed certainty when parsing,
                standardizing, and mapping the raw CSV row to the target CRM
                schema.
              </p>
              <ul
                style={{
                  margin: "8px 0 0 16px",
                  padding: 0,
                  fontSize: "0.85rem",
                  color: "var(--text-muted)",
                  lineHeight: "1.5",
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                }}
              >
                <li>
                  <strong>90% - 100% (High Confidence):</strong> The system
                  mapped standard headers (e.g. name, email, phone) and parsed
                  the cell values with high precision.
                </li>
                <li>
                  <strong>70% - 89% (Medium Confidence):</strong> Minor
                  standardization or inferences were applied (e.g. mapping
                  status/source synonyms or resolving slightly ambiguous
                  columns).
                </li>
                <li>
                  <strong>50% - 69% (Low Confidence):</strong> Heavy structural
                  noise, completely unmapped headers, or heavily parsed details
                  required heuristics-based guessing. We recommend reviewing
                  these records.
                </li>
              </ul>
            </div>
          </div>{" "}
          <div className={styles.resultsActions}>
            <button className={styles.resetBtn} onClick={resetImporter}>
              Upload Another CSV File
            </button>
          </div>
        </div>
      )}
      {errorMessage && (
        <div className={styles.modalOverlay}>
          <div className={`${styles.modalContent} animate-fade-in`}>
            {/* Centered elevated Warning Icon */}
            <div className={styles.modalIconContainer}>
              <ShieldAlert size={28} className={styles.modalIcon} />
            </div>

            {/* Modal Body */}
            <div className={styles.modalBody}>
              <h3>Connection Failed</h3>
              <p className={styles.modalErrorText}>
                We couldn&apos;t reach the lead-processing backend server.
              </p>

              {/* Sunken detail block */}
              <div className={styles.modalDetailBlock}>
                <span className={styles.detailLabel}>Error Details:</span>
                <code className={styles.errorCode}>{errorMessage}</code>
                <div className={styles.troubleSteps}>
                  <span>Please check:</span>
                  <ul>
                    <li>
                      Is the backend server running at{" "}
                      <code>{currentBackendUrl}</code>?
                    </li>
                    <li>Are your API keys configured in the settings?</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className={styles.modalActions}>
              <button
                className={styles.modalSecondaryBtn}
                onClick={() => setErrorMessage(null)}
              >
                Dismiss
              </button>
              <button
                className={styles.modalPrimaryBtn}
                onClick={() => {
                  setErrorMessage(null);
                  startStreamingImport();
                }}
              >
                Retry Connection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
