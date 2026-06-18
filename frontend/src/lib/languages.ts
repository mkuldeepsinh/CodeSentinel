/**
 * Language utilities — maps backend language names to file extensions,
 * display labels, and CodeMirror language keys.
 */

/** Maps backend language name → file extension */
export const LANG_EXT: Record<string, string> = {
  javascript: "js",
  typescript: "ts",
  python:     "py",
  go:         "go",
  rust:       "rs",
  java:       "java",
  cpp:        "cpp",
  ruby:       "rb",
  php:        "php",
  shell:      "sh",
  bash:       "sh",
};

/** Maps file extension → language name */
export const EXT_LANG: Record<string, string> = Object.fromEntries(
  Object.entries(LANG_EXT).map(([lang, ext]) => [ext, lang])
);

/** Languages exposed in the UI language selector */
export const SUPPORTED_LANGUAGES = [
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "python",     label: "Python"     },
  { value: "go",         label: "Go"         },
  { value: "rust",       label: "Rust"       },
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]["value"];

/**
 * Returns the standard filename for generated output.
 * e.g. getFileName("javascript") → "index.js"
 */
export function getFileName(language: string): string {
  const lang = language.toLowerCase();
  if (lang === "python") return "main.py";
  if (lang === "typescript" || lang === "ts") return "index.ts";
  if (lang === "go" || lang === "golang") return "main.go";
  if (lang === "rust") return "main.rs";
  const ext = LANG_EXT[lang] ?? "js";
  return `index.${ext}`;
}

/** Human-readable label for a given language value */
export function getLanguageLabel(language: string): string {
  const found = SUPPORTED_LANGUAGES.find(l => l.value === language);
  return found?.label ?? language;
}

/** Maps language name to CodeMirror / store language key */
export function getCodeMirrorLang(language: string): string {
  const map: Record<string, string> = {
    javascript: "javascript",
    typescript: "typescript",
    python:     "python",
    go:         "plaintext",  // no go extension installed yet
    rust:       "plaintext",
    java:       "plaintext",
    cpp:        "plaintext",
  };
  return map[language.toLowerCase()] ?? "plaintext";
}
