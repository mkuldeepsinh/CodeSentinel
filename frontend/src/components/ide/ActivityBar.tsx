"use client";

import { useIDEStore, ActivityView } from "@/store/ideStore";
import {
  Files, Search, GitBranch, Settings, Shield, Clock,
} from "lucide-react";

interface NavItem {
  id: ActivityView;
  icon: React.ReactNode;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: "explorer", icon: <Files   size={20} />, label: "Explorer" },
  { id: "history",  icon: <Clock   size={20} />, label: "Chat History" },
  { id: "search",   icon: <Search  size={20} />, label: "Search" },
  { id: "git",      icon: <GitBranch size={20} />, label: "Source Control" },
];

const BOTTOM_ITEMS: NavItem[] = [
  { id: "settings", icon: <Settings size={20} />, label: "Settings" },
];

export default function ActivityBar() {
  const { activeView, setActiveView, backendOnline } = useIDEStore();

  return (
    <div className="ide-actbar fade-in">
      {/* Logo */}
      <div style={{
        width: 36, height: 36,
        display: "flex", alignItems: "center", justifyContent: "center",
        marginBottom: 8, color: "var(--accent-blue)", opacity: 0.9, position: "relative",
      }}>
        <Shield size={22} strokeWidth={1.5} />
        {/* Backend status dot on logo */}
        <span style={{
          position: "absolute", bottom: 2, right: 2,
          width: 6, height: 6, borderRadius: "50%",
          background: backendOnline ? "var(--accent-green)" : "var(--accent-red)",
          border: "1px solid var(--bg-surface)",
        }} />
      </div>

      {/* Divider */}
      <div style={{ width: 24, height: 1, background: "var(--border-subtle)", margin: "2px 0 6px" }} />

      {/* Nav */}
      {NAV_ITEMS.map(item => (
        <button
          key={item.id}
          id={`actbar-${item.id}`}
          className={`actbar-btn tooltip ${activeView === item.id ? "active" : ""}`}
          data-tip={item.label}
          onClick={() => setActiveView(item.id)}
          title={item.label}
        >
          {item.icon}
        </button>
      ))}

      <div style={{ flex: 1 }} />

      {BOTTOM_ITEMS.map(item => (
        <button
          key={item.id}
          id={`actbar-${item.id}`}
          className={`actbar-btn tooltip ${activeView === item.id ? "active" : ""}`}
          data-tip={item.label}
          onClick={() => setActiveView(item.id)}
          title={item.label}
        >
          {item.icon}
        </button>
      ))}
    </div>
  );
}
