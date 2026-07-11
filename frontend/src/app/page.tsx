"use client";

import React, { useState, useEffect } from "react";
import Sidebar from "../components/Sidebar";
import DashboardView from "../components/DashboardView";
import CSVImporterView from "../components/CSVImporterView";
import LeadsDatabaseView from "../components/LeadsDatabaseView";
import SettingsView from "../components/SettingsView";
import styles from "./page.module.css";

export default function Home() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [isDarkMode, setIsDarkMode] = useState(true); // Defaults to dark mode for premium look
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    // Load preference from localStorage
    const savedTheme = localStorage.getItem("groweasy_theme");
    const isDark = savedTheme ? savedTheme === "dark" : true;
    if (!savedTheme) {
      localStorage.setItem("groweasy_theme", "dark");
    }

    setTimeout(() => {
      setIsDarkMode(isDark);
      setIsMounted(true);
    }, 0);
  }, []);

  useEffect(() => {
    if (!isMounted) return;
    // Apply dark class to document element
    if (isDarkMode) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("groweasy_theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("groweasy_theme", "light");
    }
  }, [isDarkMode, isMounted]);

  const toggleDarkMode = () => {
    setIsDarkMode((prev) => !prev);
  };

  if (!isMounted) {
    return (
      <div
        style={{
          height: "100vh",
          width: "100vw",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#171512",
          color: "#ece7da",
          fontFamily: "var(--font-body), sans-serif",
          letterSpacing: "-0.01em",
        }}
      >
        Loading your workspace…
      </div>
    );
  }

  return (
    <div className={styles.appWrapper}>
      {/* Sidebar navigation */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isDarkMode={isDarkMode}
        toggleDarkMode={toggleDarkMode}
      />

      {/* Main Content panel */}
      <main className={styles.mainContent}>
        {activeTab === "dashboard" && (
          <DashboardView
            onStartImport={() => setActiveTab("importer")}
            onViewDatabase={() => setActiveTab("database")}
          />
        )}
        {activeTab === "importer" && (
          <CSVImporterView
            onImportComplete={() => {
              // Can run optional callback here
            }}
          />
        )}
        {activeTab === "database" && <LeadsDatabaseView />}
        {activeTab === "settings" && <SettingsView />}
      </main>
    </div>
  );
}
