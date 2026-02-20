import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { LogLevel, TextUtilsLoggingConfig } from "./config";

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  TRACE: 10,
  DEBUG: 20,
  INFO: 30,
  WARN: 40,
  ERROR: 50,
  OFF: 99,
};

let outputChannel: vscode.OutputChannel | undefined;

function getOutputChannel(): vscode.OutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel("Text Utils Detailed Log");
  }
  return outputChannel;
}

function shouldWrite(configLevel: LogLevel, messageLevel: LogLevel): boolean {
  return LOG_LEVEL_ORDER[messageLevel] >= LOG_LEVEL_ORDER[configLevel];
}

function resolveConfiguredFilePath(
  configuredPath: string,
  context?: vscode.ExtensionContext,
): string {
  if (configuredPath.startsWith("~/")) {
    configuredPath = path.join(os.homedir(), configuredPath.slice(2));
  }

  if (path.isAbsolute(configuredPath)) {
    return configuredPath;
  }

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (workspaceFolder) {
    return path.resolve(workspaceFolder, configuredPath);
  }

  if (context?.globalStorageUri?.fsPath) {
    return path.resolve(context.globalStorageUri.fsPath, configuredPath);
  }

  return path.resolve(os.tmpdir(), configuredPath);
}

function formatRunId(now: Date): string {
  const iso = now.toISOString().replace(/[:.]/g, "-");
  const random = Math.random().toString(36).slice(2, 8);
  return `${iso}-${random}`;
}

export type DetailedLogger = {
  runId: string;
  filePath?: string;
  trace: (message: string) => void;
  debug: (message: string) => void;
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
  show: () => void;
  close: () => Promise<void>;
};

export async function createDetailedLogger(
  config: TextUtilsLoggingConfig,
  context?: vscode.ExtensionContext,
): Promise<DetailedLogger> {
  const channel = getOutputChannel();
  const runId = formatRunId(new Date());
  const wantsOutputChannel =
    config.destination === "both" || config.destination === "outputChannel";
  const wantsFile = config.destination === "both" || config.destination === "file";

  let stream: fs.WriteStream | undefined;
  let filePath: string | undefined;
  let outputEnabled = wantsOutputChannel;

  const writeLine = (level: LogLevel, message: string) => {
    if (!shouldWrite(config.level, level)) {
      return;
    }
    const line = `[${new Date().toISOString()}] [run:${runId}] [${level}] ${message}`;
    if (outputEnabled) {
      channel.appendLine(line);
    }
    stream?.write(`${line}\n`);
  };

  if (wantsFile) {
    try {
      filePath = resolveConfiguredFilePath(config.filePath, context);
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
      stream = fs.createWriteStream(filePath, {
        encoding: "utf8",
        flags: "a",
      });
      stream.on("error", (err) => {
        writeLine("ERROR", `File logger stream error: ${err.message}`);
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      outputEnabled = true;
      writeLine("ERROR", `Failed to create file logger: ${reason}`);
      filePath = undefined;
    }
  }

  writeLine(
    "INFO",
    `Logger initialized: level=${config.level}, destination=${config.destination}`,
  );
  if (wantsFile) {
    if (filePath) {
      writeLine("INFO", `Log file path: ${filePath}`);
    } else {
      writeLine("WARN", "File logging requested but unavailable for this run.");
    }
  }

  return {
    runId,
    filePath,
    trace: (message: string) => writeLine("TRACE", message),
    debug: (message: string) => writeLine("DEBUG", message),
    info: (message: string) => writeLine("INFO", message),
    warn: (message: string) => writeLine("WARN", message),
    error: (message: string) => writeLine("ERROR", message),
    show: () => {
      if (outputEnabled && config.showOutputChannelOnRun) {
        channel.show(true);
      }
    },
    close: async () => {
      if (!stream) {
        return;
      }
      await new Promise<void>((resolve) => {
        stream?.end(() => resolve());
      });
    },
  };
}
