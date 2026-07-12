"use client";

import React, { useState, useEffect } from "react";
import { Menu, Leaf, BarChart2 } from "lucide-react";
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
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

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
      {/* Mobile Top Header */}
      <header className={styles.mobileHeader}>
        <button
          className={styles.menuToggleBtn}
          onClick={() => setIsSidebarOpen(true)}
          aria-label="Open navigation menu"
        >
          <Menu size={22} />
        </button>
        <div className={styles.mobileBrand}>
          <div className={styles.mobileBrandIcon} style={{ position: "relative", flexShrink: 0 }}>
            <Leaf
              size={17}
              style={{
                color: "#ffffff",
                position: "absolute",
                top: "6px",
                left: "4px",
              }}
            />
            <BarChart2
              size={13}
              style={{
                color: "#ffffff",
                position: "absolute",
                top: "13px",
                left: "14px",
                opacity: 0.85,
              }}
            />
          </div>
          <div className={styles.mobileBrandTextWrapper}>
            <span className={styles.mobileBrandText}>GrowEasy</span>
            <span className={styles.mobileBrandSub}>AI Ingest Hub</span>
          </div>
        </div>
      </header>

      {/* Sidebar navigation */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={(tab) => {
          setActiveTab(tab);
          setIsSidebarOpen(false); // Close sidebar on selection (mobile drawer)
        }}
        isDarkMode={isDarkMode}
        toggleDarkMode={toggleDarkMode}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      {/* Sidebar backdrop overlay */}
      {isSidebarOpen && (
        <div
          className={styles.backdrop}
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Main Content panel */}
      <main className={styles.mainContent}>
        {activeTab === "dashboard" && (
          <DashboardView
            onStartImport={() => {
              setActiveTab("importer");
              setIsSidebarOpen(false);
            }}
            onViewDatabase={() => {
              setActiveTab("database");
              setIsSidebarOpen(false);
            }}
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
