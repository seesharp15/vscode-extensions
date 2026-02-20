import * as vscode from "vscode";

const DEFAULT_DISALLOWED_CHAR_REGEX =
  /[^A-Za-z0-9 ,."'()\[\];:/?><!@#$%^&*+=\-\\ \t\r\n{}|]/;

const LOG_LEVELS = ["TRACE", "DEBUG", "INFO", "WARN", "ERROR", "OFF"] as const;
const LOG_DESTINATIONS = ["both", "outputChannel", "file"] as const;

const DEFAULT_LOGGING_CONFIG: TextUtilsLoggingConfig = {
  level: "DEBUG",
  destination: "both",
  filePath: ".text-utils-logs/normalize.log",
  showOutputChannelOnRun: true,
};

export type TextUtilsConfig = {
  map: Map<string, string>;
  allowedOutputChars: Set<string>; // derived from replacement VALUES only
  disallowedRegex: RegExp;
  logging: TextUtilsLoggingConfig;
};

export type RawMapEntry =
  | string
  | { replaceWith?: unknown; description?: string }
  | null
  | undefined;

export type LogLevel = (typeof LOG_LEVELS)[number];
export type LogDestination = (typeof LOG_DESTINATIONS)[number];

export type TextUtilsLoggingConfig = {
  level: LogLevel;
  destination: LogDestination;
  filePath: string;
  showOutputChannelOnRun: boolean;
};

type RawLoggingConfig = Partial<{
  level: unknown;
  destination: unknown;
  filePath: unknown;
  showOutputChannelOnRun: unknown;
}>;

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

function parseRegexSetting(raw: string | undefined): RegExp {
  if (!raw) {
    return DEFAULT_DISALLOWED_CHAR_REGEX;
  }

  const literal = raw.match(/^\/([\s\S]*)\/([a-z]*)$/);

  try {
    if (literal) {
      return new RegExp(literal[1], literal[2]);
    }
    return new RegExp(raw);
  } catch {
    return DEFAULT_DISALLOWED_CHAR_REGEX;
  }
}

function buildLoggingConfig(raw: unknown): TextUtilsLoggingConfig {
  const source: RawLoggingConfig =
    raw && typeof raw === "object" ? (raw as RawLoggingConfig) : {};

  const level: LogLevel = LOG_LEVELS.includes(source.level as LogLevel)
    ? (source.level as LogLevel)
    : DEFAULT_LOGGING_CONFIG.level;

  const destination: LogDestination = LOG_DESTINATIONS.includes(
    source.destination as LogDestination,
  )
    ? (source.destination as LogDestination)
    : DEFAULT_LOGGING_CONFIG.destination;

  const filePath =
    typeof source.filePath === "string" && source.filePath.trim().length > 0
      ? source.filePath.trim()
      : DEFAULT_LOGGING_CONFIG.filePath;

  const showOutputChannelOnRun =
    typeof source.showOutputChannelOnRun === "boolean"
      ? source.showOutputChannelOnRun
      : DEFAULT_LOGGING_CONFIG.showOutputChannelOnRun;

  return {
    level,
    destination,
    filePath,
    showOutputChannelOnRun,
  };
}

export function buildConfigFromRaw(
  raw: Record<string, RawMapEntry>,
  disallowedRegexSetting?: string,
  rawLogging?: unknown,
): TextUtilsConfig {
  const map = new Map<string, string>();
  const allowedOutputChars = new Set<string>();
  const disallowedRegex = parseRegexSetting(disallowedRegexSetting);
  const logging = buildLoggingConfig(rawLogging);

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
    const rawReplacement = replaceWith ?? "";
    const replacement = decodeEscapes(
      typeof rawReplacement === "string"
        ? rawReplacement
        : String(rawReplacement),
    );

    map.set(decodedKey, replacement);

    for (const ch of replacement) {
      allowedOutputChars.add(ch);
    }
  }

  return { map, allowedOutputChars, disallowedRegex, logging };
}

export function getTextUtilsConfig(): TextUtilsConfig {
  const cfg = vscode.workspace.getConfiguration("textUtils");
  const raw = cfg.get<Record<string, RawMapEntry>>("map") ?? {};
  const disallowedRegexSetting = cfg.get<string>("disallowedCharRegex");
  const rawLogging = cfg.get<unknown>("logging");

  return buildConfigFromRaw(raw, disallowedRegexSetting, rawLogging);
}
