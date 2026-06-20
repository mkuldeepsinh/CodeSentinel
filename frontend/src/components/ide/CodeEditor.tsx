"use client";

import { useCallback, useMemo, useEffect } from "react";
import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { tokyoNight } from "@uiw/codemirror-theme-tokyo-night";
import { python } from "@codemirror/lang-python";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { useIDEStore, Tab } from "@/store/ideStore";

// ── Language extensions map ───────────────────────────────────────────────────
function getLangExtension(language: string) {
  switch (language.toLowerCase()) {
    case "python":     return [python()];
    case "typescript": return [javascript({ typescript: true, jsx: true })];
    case "javascript": return [javascript({ jsx: true })];
    case "json":       return [json()];
    case "css":        return [css()];
    case "html":       return [html()];
    default:           return [];
  }
}

// ── Custom editor theme overrides ─────────────────────────────────────────────
const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "13px",
    fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
    backgroundColor: "var(--bg-base) !important",
  },
  ".cm-content": {
    fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
    fontSize: "13px",
    padding: "0 0 100px 0",
    caretColor: "var(--accent-blue)",
  },
  ".cm-gutters": {
    backgroundColor: "var(--bg-base) !important",
    borderRight: "1px solid var(--border-subtle)",
    color: "var(--text-disabled)",
    minWidth: "48px",
    paddingRight: "4px",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    paddingLeft: "10px",
    minWidth: "40px",
    fontSize: "12px",
    lineHeight: "1.6",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "rgba(200, 122, 83, 0.08) !important",
    color: "var(--text-secondary) !important",
  },
  ".cm-activeLine": {
    backgroundColor: "rgba(200, 122, 83, 0.04) !important",
  },
  ".cm-cursor": {
    borderLeftColor: "var(--accent-blue)",
    borderLeftWidth: "2px",
  },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    backgroundColor: "var(--bg-selection) !important",
  },
  ".cm-focused .cm-selectionBackground": {
    backgroundColor: "var(--bg-selection) !important",
  },
  ".cm-matchingBracket": {
    backgroundColor: "rgba(200, 122, 83, 0.15)",
    outline: "1px solid rgba(200, 122, 83, 0.4)",
    borderRadius: "2px",
  },
  ".cm-scroller": {
    fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace) !important",
    overflow: "auto",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-line": {
    lineHeight: "1.6",
  },
  // Indent guides
  ".cm-indent-markers": {
    opacity: 0.15,
  },
  // Search highlight
  ".cm-searchMatch": {
    backgroundColor: "rgba(224, 175, 104, 0.25)",
    outline: "1px solid rgba(224, 175, 104, 0.5)",
  },
  ".cm-searchMatch.cm-searchMatch-selected": {
    backgroundColor: "rgba(224, 175, 104, 0.40)",
  },
});

const BASIC_SETUP = {
  lineNumbers: true,
  highlightActiveLine: true,
  highlightActiveLineGutter: true,
  foldGutter: true,
  dropCursor: true,
  allowMultipleSelections: true,
  bracketMatching: true,
  closeBrackets: true,
  autocompletion: true,
  syntaxHighlighting: true,
  searchKeymap: true,
};

// ── CodeEditor ────────────────────────────────────────────────────────────────
export default function CodeEditor({ tab }: { tab: Tab }) {
  const { updateTabContent, setCursor } = useIDEStore();

  // Listen for Format Document keyboard shortcut (Shift+Alt+F)
  useEffect(() => {
    const handleShortcut = async (e: KeyboardEvent) => {
      if (e.shiftKey && e.altKey && (e.key === "F" || e.key === "f")) {
        e.preventDefault();
        try {
          const { formatCode } = await import("@/lib/formatter");
          const formatted = await formatCode(tab.content, tab.language);
          updateTabContent(tab.id, formatted);
        } catch (err) {
          console.error("Format shortcut error:", err);
        }
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [tab.id, tab.content, tab.language, updateTabContent]);

  const handleChange = useCallback(
    (value: string) => updateTabContent(tab.id, value),
    [tab.id, updateTabContent]
  );

  const handleUpdate = useCallback(
    (viewUpdate: { view: EditorView; state: { selection: { main: { head: number } } } }) => {
      const { state } = viewUpdate;
      const pos = state.selection.main.head;
      const line = viewUpdate.view.state.doc.lineAt(pos);
      setCursor(line.number, pos - line.from + 1);
    },
    [setCursor]
  );

  const extensions = useMemo(() => [
    ...getLangExtension(tab.language),
    editorTheme,
    EditorView.lineWrapping,
  ], [tab.language]);

  return (
    <div style={{ height: "100%", overflow: "hidden" }}>
      <CodeMirror
        value={tab.content}
        height="100%"
        theme={tokyoNight}
        extensions={extensions}
        onChange={handleChange}
        onUpdate={handleUpdate as never}
        basicSetup={BASIC_SETUP}
        style={{
          height: "100%",
          fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
        }}
      />
    </div>
  );
}
