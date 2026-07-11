"use client";

import React, { useState, useEffect } from "react";
import {
  Sparkles,
  UploadCloud,
  Database,
  Activity,
  ShieldAlert,
  CheckCircle2,
  FileSpreadsheet,
} from "lucide-react";
import styles from "./DashboardView.module.css";

interface DashboardViewProps {
  onStartImport: () => void;
  onViewDatabase: () => void;
}

export default function DashboardView({
  onStartImport,
  onViewDatabase,
}: DashboardViewProps) {
  const [stats, setStats] = useState({
    totalLeads: 0,
    totalFiles: 0,
    totalSkipped: 0,
  });

  useEffect(() => {
    // Read stats from localStorage
    const savedLeads = localStorage.getItem("groweasy_leads");
    const leads = savedLeads ? JSON.parse(savedLeads) : [];

    const savedFilesCount = localStorage.getItem("groweasy_files_count");
    const filesCount = savedFilesCount ? parseInt(savedFilesCount) : 0;

    const savedSkippedCount = localStorage.getItem("groweasy_skipped_count");
    const skippedCount = savedSkippedCount ? parseInt(savedSkippedCount) : 0;

    setTimeout(() => {
      setStats({
        totalLeads: leads.length,
        totalFiles: filesCount,
        totalSkipped: skippedCount,
      });
    }, 0);
  }, []);

  return (
    <div className={`${styles.container} animate-fade-in`}>
      {/* Hero Welcome banner */}
      <header className={styles.hero}>
        <div className={styles.heroContent}>
          <div className={styles.badge}>
            <Sparkles size={14} /> AI-Powered Lead Extraction
          </div>
          <h1>Transform Raw Data Into GrowEasy CRM Records</h1>
          <p>
            Upload any arbitrary CSV format—Facebook lead exports, real estate
            spreadsheets, Google Ads data—and let our AI map, normalize, and
            validate leads instantly.
          </p>
          <div className={styles.heroActions}>
            <button className={styles.primaryBtn} onClick={onStartImport}>
              <UploadCloud size={18} /> Launch CSV Importer
            </button>
            <button className={styles.secondaryBtn} onClick={onViewDatabase}>
              <Database size={18} /> View Lead Records
            </button>
          </div>
        </div>
        <div className={styles.heroGraphics}>
          <div className={styles.floatingCard1}>
            <CheckCircle2 size={16} className={styles.greenText} />
            <div>
              <strong>Lead Normalization</strong>
              <span>Clean emails & phone numbers</span>
            </div>
          </div>
          <div className={styles.floatingCard2}>
            <FileSpreadsheet size={16} className={styles.blueText} />
            <div>
              <strong>CSV Mapping</strong>
              <span>Any column layout parsed</span>
            </div>
          </div>
        </div>
      </header>

      {/* Stats Cards */}
      <section className={styles.statsSection}>
        <div className={`${styles.statCard} glass-panel interactive-card`}>
          <div className={`${styles.statIcon} ${styles.blueIcon}`}>
            <Database size={22} />
          </div>
          <div className={styles.statData}>
            <span>Active CRM Leads</span>
            <h2>{stats.totalLeads}</h2>
          </div>
        </div>

        <div className={`${styles.statCard} glass-panel interactive-card`}>
          <div className={`${styles.statIcon} ${styles.greenIcon}`}>
            <Activity size={22} />
          </div>
          <div className={styles.statData}>
            <span>CSV Imports Processed</span>
            <h2>{stats.totalFiles}</h2>
          </div>
        </div>

        <div className={`${styles.statCard} glass-panel interactive-card`}>
          <div className={`${styles.statIcon} ${styles.redIcon}`}>
            <ShieldAlert size={22} />
          </div>
          <div className={styles.statData}>
            <span>Skipped Invalid Records</span>
            <h2>{stats.totalSkipped}</h2>
          </div>
        </div>
      </section>

      {/* Workflow Section */}
      <section className={styles.workflowSection}>
        <h2>How It Works</h2>
        <div className={styles.workflowGrid}>
          <div className={`${styles.stepCard} glass-panel`}>
            <div className={styles.stepNum}>1</div>
            <h4>Upload & Locally Preview</h4>
            <p>
              Select your CSV file. Preview the exact rows and structures in our
              table without running any AI mappings.
            </p>
          </div>
          <div className={`${styles.stepCard} glass-panel`}>
            <div className={styles.stepNum}>2</div>
            <h4>Review Schema Mapping</h4>
            <p>
              Click confirm to stream batch records. The AI identifies first
              names, emails, phones, notes, status, and sources.
            </p>
          </div>
          <div className={`${styles.stepCard} glass-panel`}>
            <div className={styles.stepNum}>3</div>
            <h4>Access Structured Leads</h4>
            <p>
              Filter, search, or review parsed and skipped records. Export
              cleanly formatted leads directly for GrowEasy CRM.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
