import * as vscode from "vscode";

export type TextUtilsConfig = {
  mappings: Record<string, string>;
  disallowedCharRegex: RegExp;
};

function parseRegex(regexStr: string): RegExp {
  const trimmed = (regexStr ?? "").trim();
  const m = trimmed.match(/^\/([\s\S]+)\/([gimsuy]*)$/);
  if (m) {return new RegExp(m[1], m[2]);}
  return new RegExp(trimmed);
}

function decodeMappingKey(key: string): string {
  return key.replace(/\\u\{([0-9a-fA-F]+)\}|\\u([0-9a-fA-F]{4})|\\n|\\t|\\r/g, (m, braced, four) => {
    if (m === "\\n") {return "\n";}
    if (m === "\\t") {return "\t";}
    if (m === "\\r") {return "\r";}
    const hex = braced ?? four;
    const cp = parseInt(hex, 16);
    if (!Number.isFinite(cp)) {return m;}
    return String.fromCodePoint(cp);
  });
}

export function getTextUtilsConfig(): TextUtilsConfig {
  const cfg = vscode.workspace.getConfiguration("textUtils");

  const rawMappings = cfg.get<Record<string, string>>("mappings") ?? {};
  const disallowedCharRegexStr = cfg.get<string>("disallowedCharRegex") ?? "";

  const mappings: Record<string, string> = {};
  for (const [rawKey, value] of Object.entries(rawMappings)) {
    const decodedKey = decodeMappingKey(rawKey);
    if (!decodedKey) {continue;}
    mappings[decodedKey] = value ?? "";
  }

  let disallowedCharRegex: RegExp;
  try {
    disallowedCharRegex = parseRegex(disallowedCharRegexStr);
  } catch {
    disallowedCharRegex = /$^/g; // match nothing
  }

  if (!disallowedCharRegex.global) {
    disallowedCharRegex = new RegExp(disallowedCharRegex.source, disallowedCharRegex.flags + "g");
  }

  return { mappings, disallowedCharRegex };
}
