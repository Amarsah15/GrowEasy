"use client";

import React, { useState, useEffect } from "react";
import {
  Settings,
  Save,
  ShieldAlert,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import styles from "./SettingsView.module.css";

interface SettingsProps {
  onSettingsChange?: () => void;
}

interface HealthData {
  status: string;
  timestamp: string;
  apiConfigured: {
    gemini: boolean;
  };
  engine: string;
}

export default function SettingsView({ onSettingsChange }: SettingsProps) {
  const [backendUrl, setBackendUrl] = useState("http://127.0.0.1:5000");
  const [geminiKey, setGeminiKey] = useState("");

  const [status, setStatus] = useState<
    "idle" | "testing" | "healthy" | "unhealthy"
  >("idle");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved">("idle");
  const [healthData, setHealthData] = useState<HealthData | null>(null);

  useEffect(() => {
    // Load config from localStorage
    const savedUrl =
      localStorage.getItem("groweasy_backend_url") ||
      process.env.NEXT_PUBLIC_BACKEND_URL;
    const targetUrl = savedUrl
      ? savedUrl.replace("localhost", "127.0.0.1")
      : "http://127.0.0.1:5000";

    const savedGemini = localStorage.getItem("groweasy_gemini_key") || "";

    setTimeout(() => {
      setBackendUrl(targetUrl);
      if (savedGemini) {
        setGeminiKey(savedGemini);
      }
    }, 0);
  }, []);

  const testConnection = async (url: string) => {
    setStatus("testing");
    try {
      const res = await fetch(`${url.replace(/\/$/, "")}/health`);
      if (res.ok) {
        const data = await res.json();
        setStatus("healthy");
        setHealthData(data);
      } else {
        setStatus("unhealthy");
        setHealthData(null);
      }
    } catch {
      setStatus("unhealthy");
      setHealthData(null);
    }
  };

  const handleSave = () => {
    localStorage.setItem("groweasy_backend_url", backendUrl);
    localStorage.setItem("groweasy_gemini_key", geminiKey);

    setSaveStatus("saved");
    setTimeout(() => setSaveStatus("idle"), 3000);

    if (onSettingsChange) {
      onSettingsChange();
    }

    testConnection(backendUrl);
  };

  return (
    <div className={`${styles.container} animate-fade-in`}>
      <header className={styles.header}>
        <div className={styles.headerTitle}>
          <Settings size={28} className={styles.headerIcon} />
          <div>
            <h1>System Settings</h1>
            <p>Configure API integrations and server settings.</p>
          </div>
        </div>
      </header>

      <div className={styles.grid}>
        {/* Connection Settings */}
        <section className={`${styles.card} glass-panel`}>
          <h3>Backend Server</h3>
          <p className={styles.cardDesc}>
            Point the UI to your Node.js/Express backend API.
          </p>

          <div className={styles.formGroup}>
            <label htmlFor="backendUrl">Server URL</label>
            <input
              id="backendUrl"
              type="text"
              value={backendUrl}
              onChange={(e) => setBackendUrl(e.target.value)}
              placeholder="e.g. http://localhost:5000"
            />
          </div>

          <div className={styles.healthStatus}>
            {status === "testing" && (
              <span className={styles.statusBadgeTesting}>
                <RefreshCw size={14} className="animate-spin" /> Testing
                connection...
              </span>
            )}
            {status === "healthy" && (
              <div className={styles.statusDetails}>
                <span className={styles.statusBadgeHealthy}>
                  <CheckCircle2 size={14} /> Server Connected
                </span>
                {healthData && (
                  <div className={styles.healthMeta}>
                    <span>
                      Backend Status: <strong>{healthData.status}</strong>
                    </span>
                    <span>
                      Gemini Configured:{" "}
                      <strong>
                        {healthData.apiConfigured?.gemini ? "Yes" : "No"}
                      </strong>
                    </span>
                  </div>
                )}
              </div>
            )}
            {status === "unhealthy" && (
              <span className={styles.statusBadgeUnhealthy}>
                <ShieldAlert size={14} /> Connection Failed (Check server is
                running)
              </span>
            )}
          </div>
        </section>

        {/* API Credentials */}
        <section className={`${styles.card} glass-panel`}>
          <h3>AI Overrides (Client-side)</h3>
          <p className={styles.cardDesc}>
            Provide custom API keys to override server configurations. They are
            stored only in your local browser and sent securely in headers.
          </p>

          <div className={styles.formGroup}>
            <label htmlFor="geminiKey">Gemini API Key</label>
            <input
              id="geminiKey"
              type="password"
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
              placeholder="AIzaSy..."
            />
          </div>
        </section>
      </div>

      <div className={styles.actions}>
        <button className={styles.saveButton} onClick={handleSave}>
          <Save size={18} />
          {saveStatus === "saved" ? "Settings Saved!" : "Save Configurations"}
        </button>
      </div>
    </div>
  );
}
