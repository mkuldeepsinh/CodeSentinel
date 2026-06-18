"use client";

import { useIDEStore, ActivityView } from "@/store/ideStore";
import {
  Files,
  Search,
  GitBranch,
  Settings,
  Shield,
  ChevronRight,
} from "lucide-react";

interface NavItem {
  id: ActivityView;
  icon: React.ReactNode;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: "explorer", icon: <Files size={20} />, label: "Explorer" },
  { id: "search",   icon: <Search size={20} />, label: "Search" },
  { id: "git",      icon: <GitBranch size={20} />, label: "Source Control" },
];

const BOTTOM_ITEMS: NavItem[] = [
  { id: "settings", icon: <Settings size={20} />, label: "Settings" },
];

export default function ActivityBar() {
  const { activeView, setActiveView } = useIDEStore();

  return (
    <div className="ide-actbar fade-in">
      {/* Logo */}
      <div
        style={{
          width: 36,
          height: 36,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 8,
          color: "var(--accent-blue)",
          opacity: 0.9,
        }}
      >
        <Shield size={22} strokeWidth={1.5} />
      </div>

      {/* Divider */}
      <div style={{
        width: 24,
        height: 1,
        background: "var(--border-subtle)",
        margin: "2px 0 6px",
      }} />

      {/* Nav items */}
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

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Bottom items */}
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
