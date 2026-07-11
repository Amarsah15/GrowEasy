"use client";

import React, { useState, useEffect } from "react";
import {
  Database,
  Search,
  Trash2,
  Filter,
  X,
  AlertCircle,
  Download,
  ShieldAlert,
  ChevronDown,
  Check,
  Info,
} from "lucide-react";
import styles from "./LeadsDatabaseView.module.css";

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

const downloadLeadsAsCSV = (
  leadsList: Lead[],
  filename = "groweasy_database_export.csv",
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

export default function LeadsDatabaseView() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [expandedNotes, setExpandedNotes] = useState<Record<number, boolean>>(
    {},
  );

  const toggleNote = (idx: number) => {
    setExpandedNotes((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const [statusOpen, setStatusOpen] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    confirmText?: string;
    confirmType?: "danger" | "primary";
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  const showConfirm = (
    title: string,
    message: string,
    onConfirm: () => void,
    confirmText = "Confirm",
    confirmType: "danger" | "primary" = "primary",
  ) => {
    setConfirmModal({
      isOpen: true,
      title,
      message,
      onConfirm: () => {
        onConfirm();
        closeConfirm();
      },
      confirmText,
      confirmType,
    });
  };

  const closeConfirm = () => {
    setConfirmModal((prev) => ({ ...prev, isOpen: false }));
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeConfirm();
      }
    };
    if (confirmModal.isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [confirmModal.isOpen]);

  useEffect(() => {
    const handleCloseDropdowns = () => {
      setStatusOpen(false);
      setSourceOpen(false);
      setSortOpen(false);
    };
    window.addEventListener("click", handleCloseDropdowns);
    return () => window.removeEventListener("click", handleCloseDropdowns);
  }, []);

  const loadLeads = () => {
    const savedLeads = localStorage.getItem("groweasy_leads");
    if (savedLeads) {
      setLeads(JSON.parse(savedLeads));
    }
  };

  useEffect(() => {
    setTimeout(() => {
      loadLeads();
    }, 0);
  }, []);

  const handleDeleteLead = (indexToDelete: number) => {
    showConfirm(
      "Delete Lead",
      "Are you sure you want to delete this lead? This action cannot be undone.",
      () => {
        const updated = leads.filter((_, idx) => idx !== indexToDelete);
        setLeads(updated);
        localStorage.setItem("groweasy_leads", JSON.stringify(updated));
      },
      "Delete Lead",
      "danger",
    );
  };

  const handleClearDatabase = () => {
    showConfirm(
      "Clear Database",
      "WARNING: Are you sure you want to clear the entire database? This cannot be undone.",
      () => {
        setLeads([]);
        localStorage.removeItem("groweasy_leads");
        localStorage.removeItem("groweasy_files_count");
        localStorage.removeItem("groweasy_skipped_count");
      },
      "Wipe Database",
      "danger",
    );
  };

  // Filter & Sort Logic
  const filteredLeads = leads
    .filter((lead) => {
      const nameMatch = lead.name
        ?.toLowerCase()
        .includes(searchTerm.toLowerCase());
      const emailMatch = lead.email
        ?.toLowerCase()
        .includes(searchTerm.toLowerCase());
      const phoneMatch = lead.mobile_without_country_code?.includes(searchTerm);
      const companyMatch = lead.company
        ?.toLowerCase()
        .includes(searchTerm.toLowerCase());
      return nameMatch || emailMatch || phoneMatch || companyMatch;
    })
    .filter((lead) => {
      if (!statusFilter) return true;
      return lead.crm_status === statusFilter;
    })
    .filter((lead) => {
      if (!sourceFilter) return true;
      return lead.data_source === sourceFilter;
    })
    .sort((a, b) => {
      if (sortBy === "newest") {
        return (
          new Date(b.created_at || 0).getTime() -
          new Date(a.created_at || 0).getTime()
        );
      } else if (sortBy === "oldest") {
        return (
          new Date(a.created_at || 0).getTime() -
          new Date(b.created_at || 0).getTime()
        );
      } else if (sortBy === "name") {
        return (a.name || "").localeCompare(b.name || "");
      }
      return 0;
    });

  return (
    <div className={`${styles.container} animate-fade-in`}>
      <header className={styles.header}>
        <div className={styles.headerTitle}>
          <Database size={28} className={styles.headerIcon} />
          <div>
            <h1>Leads Database</h1>
            <p>Query and manage your AI-mapped GrowEasy CRM leads.</p>
          </div>
        </div>
        <div className={styles.headerActions}>
          {filteredLeads.length > 0 && (
            <button
              className={styles.exportBtn}
              onClick={() =>
                downloadLeadsAsCSV(
                  filteredLeads,
                  "groweasy_database_export.csv",
                )
              }
            >
              <Download size={14} /> Export filtered leads (CSV)
            </button>
          )}
          {leads.length > 0 && (
            <button className={styles.clearBtn} onClick={handleClearDatabase}>
              <Trash2 size={16} /> Wipe Database
            </button>
          )}
        </div>
      </header>

      {/* Control filters */}
      <section className={`${styles.controls} glass-panel`}>
        <div className={styles.searchWrapper}>
          <Search size={18} className={styles.searchIcon} />
          <input
            type="text"
            placeholder="Search by name, email, phone, company..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button
              className={styles.clearSearch}
              onClick={() => setSearchTerm("")}
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className={styles.filtersWrapper}>
          {/* Status Filter */}
          <div className={styles.customSelectWrapper}>
            <button
              className={styles.customSelectTrigger}
              onClick={(e) => {
                e.stopPropagation();
                setStatusOpen(!statusOpen);
                setSourceOpen(false);
                setSortOpen(false);
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <Filter size={14} className={styles.filterIcon} />
                <span>
                  {statusFilter
                    ? statusFilter.replace(/_/g, " ")
                    : "All Statuses"}
                </span>
              </div>
              <ChevronDown size={14} className={styles.chevronIcon} />
            </button>
            {statusOpen && (
              <div className={styles.customDropdownMenu}>
                <div
                  className={`${styles.customDropdownOption} ${statusFilter === "" ? styles.activeOption : ""}`}
                  onClick={() => setStatusFilter("")}
                >
                  All Statuses
                </div>
                <div
                  className={`${styles.customDropdownOption} ${statusFilter === "GOOD_LEAD_FOLLOW_UP" ? styles.activeOption : ""}`}
                  onClick={() => setStatusFilter("GOOD_LEAD_FOLLOW_UP")}
                >
                  Good Lead Follow Up
                </div>
                <div
                  className={`${styles.customDropdownOption} ${statusFilter === "DID_NOT_CONNECT" ? styles.activeOption : ""}`}
                  onClick={() => setStatusFilter("DID_NOT_CONNECT")}
                >
                  Did Not Connect
                </div>
                <div
                  className={`${styles.customDropdownOption} ${statusFilter === "BAD_LEAD" ? styles.activeOption : ""}`}
                  onClick={() => setStatusFilter("BAD_LEAD")}
                >
                  Bad Lead
                </div>
                <div
                  className={`${styles.customDropdownOption} ${statusFilter === "SALE_DONE" ? styles.activeOption : ""}`}
                  onClick={() => setStatusFilter("SALE_DONE")}
                >
                  Sale Done
                </div>
              </div>
            )}
          </div>

          {/* Source Filter */}
          <div className={styles.customSelectWrapper}>
            <button
              className={styles.customSelectTrigger}
              onClick={(e) => {
                e.stopPropagation();
                setSourceOpen(!sourceOpen);
                setStatusOpen(false);
                setSortOpen(false);
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <Filter size={14} className={styles.filterIcon} />
                <span>
                  {sourceFilter
                    ? sourceFilter.replace(/_/g, " ")
                    : "All Sources"}
                </span>
              </div>
              <ChevronDown size={14} className={styles.chevronIcon} />
            </button>
            {sourceOpen && (
              <div className={styles.customDropdownMenu}>
                <div
                  className={`${styles.customDropdownOption} ${sourceFilter === "" ? styles.activeOption : ""}`}
                  onClick={() => setSourceFilter("")}
                >
                  All Sources
                </div>
                <div
                  className={`${styles.customDropdownOption} ${sourceFilter === "leads_on_demand" ? styles.activeOption : ""}`}
                  onClick={() => setSourceFilter("leads_on_demand")}
                >
                  Leads On Demand
                </div>
                <div
                  className={`${styles.customDropdownOption} ${sourceFilter === "meridian_tower" ? styles.activeOption : ""}`}
                  onClick={() => setSourceFilter("meridian_tower")}
                >
                  Meridian Tower
                </div>
                <div
                  className={`${styles.customDropdownOption} ${sourceFilter === "eden_park" ? styles.activeOption : ""}`}
                  onClick={() => setSourceFilter("eden_park")}
                >
                  Eden Park
                </div>
                <div
                  className={`${styles.customDropdownOption} ${sourceFilter === "varah_swamy" ? styles.activeOption : ""}`}
                  onClick={() => setSourceFilter("varah_swamy")}
                >
                  Varah Swamy
                </div>
                <div
                  className={`${styles.customDropdownOption} ${sourceFilter === "sarjapur_plots" ? styles.activeOption : ""}`}
                  onClick={() => setSourceFilter("sarjapur_plots")}
                >
                  Sarjapur Plots
                </div>
              </div>
            )}
          </div>

          {/* Sort Dropdown */}
          <div className={styles.customSelectWrapper}>
            <button
              className={styles.customSelectTrigger}
              onClick={(e) => {
                e.stopPropagation();
                setSortOpen(!sortOpen);
                setStatusOpen(false);
                setSourceOpen(false);
              }}
            >
              <span>
                {sortBy === "newest"
                  ? "Sort: Newest"
                  : sortBy === "oldest"
                    ? "Sort: Oldest"
                    : sortBy === "name"
                      ? "Sort: Name"
                      : "Sort Options"}
              </span>
              <ChevronDown size={14} className={styles.chevronIcon} />
            </button>
            {sortOpen && (
              <div
                className={`${styles.customDropdownMenu} ${styles.rightAlignedDropdown}`}
              >
                <div
                  className={`${styles.customDropdownOption} ${sortBy === "newest" ? styles.activeOption : ""}`}
                  onClick={() => setSortBy("newest")}
                >
                  Sort: Newest
                </div>
                <div
                  className={`${styles.customDropdownOption} ${sortBy === "oldest" ? styles.activeOption : ""}`}
                  onClick={() => setSortBy("oldest")}
                >
                  Sort: Oldest
                </div>
                <div
                  className={`${styles.customDropdownOption} ${sortBy === "name" ? styles.activeOption : ""}`}
                  onClick={() => setSortBy("name")}
                >
                  Sort: Name
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Table view */}
      {filteredLeads.length === 0 ? (
        <div className={`${styles.emptyState} glass-panel`}>
          <AlertCircle size={48} className={styles.emptyIcon} />
          <h3>No leads matches your criteria</h3>
          <p>
            {leads.length === 0
              ? "You haven't imported any leads yet. Head over to the CSV Importer tab to upload records."
              : "Try adjusting your search terms or filters to find records."}
          </p>
        </div>
      ) : (
        <>
          <div className={`${styles.tableWrapper} glass-panel`}>
            <div className={styles.tableContainer}>
              <table>
                <thead>
                  <tr>
                    <th className={styles.nowrap}>Creation Date</th>
                    <th className={styles.nowrap}>Lead Name</th>
                    <th className={styles.nowrap}>Email</th>
                    <th className={styles.nowrap}>Mobile Contact</th>
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
                    <th
                      className={`${styles.actionColHeader} ${styles.nowrap}`}
                    >
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLeads.map((lead, idx) => {
                    const score =
                      lead._confidence !== undefined
                        ? lead._confidence
                        : lead.confidence;
                    const hasLowConfidence =
                      typeof score === "number" && score < LOW_CONFIDENCE;
                    return (
                      <tr
                        key={idx}
                        className={
                          hasLowConfidence ? styles.lowConfidenceRow : ""
                        }
                      >
                        <td className={styles.nowrap}>
                          {lead.created_at || "-"}
                        </td>
                        <td className={`${styles.bold} ${styles.nowrap}`}>
                          {lead.name || "-"}
                        </td>
                        <td className={styles.nowrap}>{lead.email || "-"}</td>
                        <td className={styles.nowrap}>
                          {lead.country_code ? `${lead.country_code} ` : ""}
                          {lead.mobile_without_country_code || "-"}
                        </td>
                        <td className={styles.nowrap}>{lead.company || "-"}</td>
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
                                  : lead.crm_status === "GOOD_LEAD_FOLLOW_UP"
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
                          {renderConfidence(score)}
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
                        <td>
                          <button
                            className={styles.deleteRowBtn}
                            onClick={() => handleDeleteLead(idx)}
                            title="Delete Lead"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className={styles.tableFooter}>
              Showing {filteredLeads.length} of {leads.length} records
            </div>
          </div>

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
              model&apos;s self-assessed certainty when parsing, standardizing,
              and mapping the raw CSV row to the target CRM schema.
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
                <strong>90% - 100% (High Confidence):</strong> The system mapped
                standard headers (e.g. name, email, phone) and parsed the cell
                values with high precision.
              </li>
              <li>
                <strong>70% - 89% (Medium Confidence):</strong> Minor
                standardization or inferences were applied (e.g. mapping
                status/source synonyms or resolving slightly ambiguous columns).
              </li>
              <li>
                <strong>50% - 69% (Low Confidence):</strong> Heavy structural
                noise, completely unmapped headers, or heavily parsed details
                required heuristics-based guessing. We recommend reviewing these
                records.
              </li>
            </ul>
          </div>
        </>
      )}

      {/* Confirmation Modal */}
      {confirmModal.isOpen && (
        <div className={styles.modalOverlay} onClick={closeConfirm}>
          <div
            className={`${styles.modalContent} glass-panel`}
            onClick={(e) => e.stopPropagation()}
          >
            <button className={styles.modalCloseBtn} onClick={closeConfirm}>
              <X size={18} />
            </button>
            <div className={styles.modalHeader}>
              <div
                className={
                  confirmModal.confirmType === "danger"
                    ? styles.modalIconDanger
                    : styles.modalIconPrimary
                }
              >
                <ShieldAlert size={24} />
              </div>
              <h3>{confirmModal.title}</h3>
            </div>
            <div className={styles.modalBody}>
              <p>{confirmModal.message}</p>
            </div>
            <div className={styles.modalActions}>
              <button className={styles.modalCancelBtn} onClick={closeConfirm}>
                Cancel
              </button>
              <button
                className={
                  confirmModal.confirmType === "danger"
                    ? styles.modalConfirmBtnDanger
                    : styles.modalConfirmBtnPrimary
                }
                onClick={confirmModal.onConfirm}
              >
                {confirmModal.confirmText || "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
