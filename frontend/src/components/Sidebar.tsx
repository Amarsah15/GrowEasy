"use client";

import React from "react";
import {
  LayoutDashboard,
  UploadCloud,
  Database,
  Settings,
  Sun,
  Moon,
  ChevronRight,
  Leaf,
  BarChart2,
  X,
} from "lucide-react";
import styles from "./Sidebar.module.css";

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  isOpen?: boolean;
  onClose?: () => void;
}

export default function Sidebar({
  activeTab,
  setActiveTab,
  isDarkMode,
  toggleDarkMode,
  isOpen = false,
  onClose,
}: SidebarProps) {
  const menuItems = [
    {
      id: "dashboard",
      name: "Dashboard",
      icon: LayoutDashboard,
      desc: "Overview & metrics",
    },
    {
      id: "importer",
      name: "CSV Importer",
      icon: UploadCloud,
      desc: "AI Lead Ingestion",
    },
    {
      id: "database",
      name: "Leads Database",
      icon: Database,
      desc: "View CRM records",
    },
    {
      id: "settings",
      name: "System Settings",
      icon: Settings,
      desc: "API & Configuration",
    },
  ];

  return (
    <aside className={`${styles.sidebar} ${isOpen ? styles.sidebarOpen : ""}`}>
      {/* Brand Header */}
      <div className={styles.brand}>
        <div
          className={styles.brandIcon}
          style={{ position: "relative", flexShrink: 0 }}
        >
          <Leaf
            size={21}
            style={{
              color: "#ffffff",
              position: "absolute",
              top: "8px",
              left: "5px",
            }}
          />
          <BarChart2
            size={17}
            style={{
              color: "#ffffff",
              position: "absolute",
              top: "16px",
              left: "17px",
              opacity: 0.85,
            }}
          />
        </div>
        <div className={styles.brandText}>
          <h2>GrowEasy</h2>
          <span>AI CSV Ingest Hub</span>
        </div>
        {/* Mobile close button */}
        <button
          className={styles.closeBtn}
          onClick={onClose}
          aria-label="Close navigation menu"
        >
          <X size={18} />
        </button>
      </div>

      {/* Menu Navigation */}
      <nav className={styles.nav}>
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                setActiveTab(item.id);
                onClose?.();
              }}
              className={`${styles.navItem} ${isActive ? styles.active : ""}`}
            >
              <div className={styles.itemMain}>
                <Icon size={20} className={styles.icon} />
                <div className={styles.itemText}>
                  <span className={styles.itemName}>{item.name}</span>
                  <span className={styles.itemDesc}>{item.desc}</span>
                </div>
              </div>
              <ChevronRight size={14} className={styles.chevron} />
            </button>
          );
        })}
      </nav>

      {/* Theme Toggle / Footer */}
      <div className={styles.footer}>
        <button className={styles.themeToggle} onClick={toggleDarkMode}>
          {isDarkMode ? (
            <>
              <Sun size={18} className={styles.yellowSun} />
              <span>Light Mode</span>
            </>
          ) : (
            <>
              <Moon size={18} className={styles.blueMoon} />
              <span>Dark Mode</span>
            </>
          )}
        </button>
        <div className={styles.developer}>
          <span>Engineered by Developer</span>
          <span>v1.0.0</span>
        </div>
      </div>
    </aside>
  );
}
