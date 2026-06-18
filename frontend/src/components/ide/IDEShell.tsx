"use client";

import { useIDEStore } from "@/store/ideStore";
import ActivityBar from "./ActivityBar";
import Sidebar from "./Sidebar";
import EditorZone from "./EditorZone";
import BottomPanel from "./BottomPanel";
import StatusBar from "./StatusBar";
import BackendProvider from "./BackendProvider";
import { useCallback, useRef, useState, useEffect } from "react";

export default function IDEShell() {
  const { sidebarOpen, panelOpen, panelHeight, setPanelHeight } = useIDEStore();
  const [isDragging, setIsDragging] = useState(false);
  const dragStartY    = useRef(0);
  const dragStartH    = useRef(0);

  // Panel resize drag
  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragStartY.current = e.clientY;
    dragStartH.current = panelHeight;
  }, [panelHeight]);

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => {
      const delta = dragStartY.current - e.clientY;
      setPanelHeight(Math.max(120, Math.min(600, dragStartH.current + delta)));
    };
    const onUp = () => setIsDragging(false);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup",  onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup",  onUp);
    };
  }, [isDragging, setPanelHeight]);

  const sidebarWidth = sidebarOpen ? "260px" : "0px";
  const gridRows = panelOpen
    ? `1fr ${panelHeight}px 24px`
    : `1fr 0px 24px`;

  return (
    <BackendProvider>
      <div
        style={{
          display: "grid",
          gridTemplateAreas: `
            "actbar sidebar editor"
            "actbar sidebar panel"
            "statusbar statusbar statusbar"
          `,
          gridTemplateColumns: `48px ${sidebarWidth} 1fr`,
          gridTemplateRows: gridRows,
          width: "100vw",
          height: "100vh",
          overflow: "hidden",
          background: "var(--bg-base)",
          userSelect: isDragging ? "none" : undefined,
          cursor: isDragging ? "ns-resize" : undefined,
          transition: "grid-template-columns 0.2s ease",
        }}
      >
        {/* Zone 1: Activity Bar */}
        <ActivityBar />

        {/* Zone 2: Sidebar (routes to Explorer / History / etc.) */}
        <Sidebar />

        {/* Zone 3: Editor */}
        <EditorZone />

        {/* Resize handle — sits at top of panel grid row */}
        {panelOpen && (
          <div
            onMouseDown={onResizeStart}
            style={{
              gridArea: "panel",
              height: 4,
              cursor: "ns-resize",
              zIndex: 20,
              alignSelf: "start",
              background: isDragging ? "var(--accent-blue)" : "transparent",
              transition: "background 0.15s ease",
            }}
          />
        )}

        {/* Zone 4: Bottom Panel */}
        <BottomPanel />

        {/* Zone 5: Status Bar */}
        <StatusBar />
      </div>
    </BackendProvider>
  );
}
