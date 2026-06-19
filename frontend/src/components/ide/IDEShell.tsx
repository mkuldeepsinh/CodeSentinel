"use client";

import { useIDEStore } from "@/store/ideStore";
import Sidebar from "./Sidebar";
import EditorZone from "./EditorZone";
import BottomPanel from "./BottomPanel";
import StatusBar from "./StatusBar";
import { useCallback, useRef, useState, useEffect } from "react";

export default function IDEShell() {
  const { sidebarOpen, panelOpen, panelHeight, setPanelHeight } = useIDEStore();
  const [isDragging, setIsDragging] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef(0);
  const dragStartHeight = useRef(0);

  // Panel resize drag
  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragStartY.current = e.clientY;
    dragStartHeight.current = panelHeight;
  }, [panelHeight]);

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => {
      const delta = dragStartY.current - e.clientY;
      const next = Math.max(120, Math.min(600, dragStartHeight.current + delta));
      setPanelHeight(next);
    };
    const onUp = () => setIsDragging(false);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [isDragging, setPanelHeight]);

  const gridTemplateRows = panelOpen
    ? `1fr ${panelHeight}px 24px`
    : `1fr 0px 24px`;

  return (
    <div
      ref={shellRef}
      className="ide-shell"
      style={{
        gridTemplateColumns: sidebarOpen
          ? "260px 1fr"
          : "0px 1fr",
        gridTemplateRows,
        gridTemplateAreas: `
          "sidebar editor"
          "sidebar panel"
          "statusbar statusbar"
        `,
        userSelect: isDragging ? "none" : undefined,
        cursor: isDragging ? "ns-resize" : undefined,
      }}
    >
      {/* Zone 2: Sidebar */}
      <Sidebar />

      {/* Zone 3: Editor Group */}
      <EditorZone />

      {/* Resize Handle (between editor and panel) */}
      {panelOpen && (
        <div
          onMouseDown={onResizeStart}
          style={{
            gridArea: "panel",
            height: "4px",
            cursor: "ns-resize",
            zIndex: 20,
            marginTop: "-2px",
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
  );
}
