import * as prettier from "prettier/standalone";
import * as babelPlugin from "prettier/plugins/babel";
import * as estreePlugin from "prettier/plugins/estree";
import * as htmlPlugin from "prettier/plugins/html";
import * as postcssPlugin from "prettier/plugins/postcss";

export async function formatCode(code: string, language: string): Promise<string> {
  const lang = language.toLowerCase();
  try {
    if (lang === "json") {
      return JSON.stringify(JSON.parse(code), null, 2);
    }
    
    let parser = "";
    const plugins = [babelPlugin, estreePlugin, htmlPlugin, postcssPlugin];

    if (lang === "javascript" || lang === "jsx" || lang === "js") {
      parser = "babel";
    } else if (lang === "typescript" || lang === "tsx" || lang === "ts") {
      parser = "babel-ts";
    } else if (lang === "html") {
      parser = "html";
    } else if (lang === "css" || lang === "scss") {
      parser = "css";
    } else {
      return formatFallback(code);
    }

    const formatted = await prettier.format(code, {
      parser,
      plugins,
      semi: true,
      singleQuote: false,
      tabWidth: 2,
      printWidth: 80,
    });
    return formatted;
  } catch (err) {
    console.warn("Formatting failed, using fallback:", err);
    return formatFallback(code);
  }
}

function formatFallback(code: string): string {
  const lines = code.split(/\r?\n/);
  const formattedLines = lines.map(line => line.trimEnd());
  
  while (formattedLines.length > 0 && formattedLines[formattedLines.length - 1] === "") {
    formattedLines.pop();
  }
  
  return formattedLines.join("\n") + "\n";
}
