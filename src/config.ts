import { error } from "console";
import { rawListeners } from "process";
import { decode } from "punycode";
import * as vscode from "vscode";

export type TextUtilsConfig = {
  map: Map<string, string>;
  allowedOutputChars: Set<string>; // derived from replacement VALUES only
};

export type RawMapEntry =
  | string
  | { replaceWith?: unknown; description?: string }
  | null
  | undefined;

function decodeEscapes(s: string): string {
  return s.replace(
    /\\u\{([0-9a-fA-F]+)\}|\\u([0-9a-fA-F]{4})|\\n|\\t|\\r|\\\\/g,
    (m, braced, four) => {
      if (m === "\\n") {
        return "\n";
      }
      if (m === "\\t") {
        return "\t";
      }
      if (m === "\\r") {
        return "\r";
      }
      if (m === "\\\\") {
        return "\\";
      }
      const hex = braced ?? four;
      const cp = parseInt(hex, 16);
      if (!Number.isFinite(cp)) {
        return m;
      }
      return String.fromCodePoint(cp);
    },
  );
}

export function buildConfigFromRaw(
  raw: Record<string, RawMapEntry>,
): TextUtilsConfig {
  const map = new Map<string, string>();
  const allowedOutputChars = new Set<string>();

  for (const [rawKey, rawEntry] of Object.entries(raw ?? {})) {
    if (!rawKey) {
      continue;
    }

    const decodedKey = decodeEscapes(rawKey);
    if (!decodedKey) {
      continue;
    }

    //Accept both new object form ans legacy string form.
    let replaceWith: unknown;
    if (typeof rawEntry === "string") {
      replaceWith = rawEntry;
    } else if (rawEntry && typeof rawEntry === "object") {
      replaceWith = (rawEntry as any).replaceWith;
    } else {
      // rawEntry is null/undefined/other -> treat as empty replacement
      replaceWith = "";
    }

    // Coalesce null/undefined to "" and decode escaped in replacement
    const replacement = decodeEscapes((replaceWith ?? "") as string);

    map.set(decodedKey, replacement);

    for (const ch of replacement) {
      allowedOutputChars.add(ch);
    }
  }

  return { map, allowedOutputChars };
}

export function getTextUtilsConfig(): TextUtilsConfig {
  const cfg = vscode.workspace.getConfiguration("textUtils");
  const raw = cfg.get<Record<string, RawMapEntry>>("map") ?? {};

  return buildConfigFromRaw(raw);
}
