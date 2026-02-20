import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";

let outputChannel: vscode.OutputChannel | undefined;

function getOutputChannel(): vscode.OutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel("Text Utils Detailed Log");
  }
  return outputChannel;
}

async function resolveLogDir(
  context?: vscode.ExtensionContext,
): Promise<string> {
  if (context?.globalStorageUri?.fsPath) {
    return path.join(context.globalStorageUri.fsPath, "logs");
  }

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (workspaceFolder) {
    return path.join(workspaceFolder, ".text-utils-logs");
  }

  return path.join(os.tmpdir(), "text-utils-logs");
}

function formatRunId(now: Date): string {
  const iso = now.toISOString().replace(/[:.]/g, "-");
  const random = Math.random().toString(36).slice(2, 8);
  return `${iso}-${random}`;
}

export type DetailedLogger = {
  runId: string;
  filePath?: string;
  log: (message: string) => void;
  show: () => void;
  close: () => Promise<void>;
};

export async function createDetailedLogger(
  context?: vscode.ExtensionContext,
): Promise<DetailedLogger> {
  const channel = getOutputChannel();
  const runId = formatRunId(new Date());

  let stream: fs.WriteStream | undefined;
  let filePath: string | undefined;

  try {
    const logDir = await resolveLogDir(context);
    await fs.promises.mkdir(logDir, { recursive: true });
    filePath = path.join(logDir, `normalize-${runId}.log`);
    stream = fs.createWriteStream(filePath, {
      encoding: "utf8",
      flags: "a",
    });
    stream.on("error", (err) => {
      channel.appendLine(
        `[${new Date().toISOString()}] [run:${runId}] File logger stream error: ${err.message}`,
      );
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    channel.appendLine(
      `[${new Date().toISOString()}] [run:${runId}] Failed to create file logger: ${reason}`,
    );
  }

  const log = (message: string) => {
    const line = `[${new Date().toISOString()}] [run:${runId}] ${message}`;
    channel.appendLine(line);
    stream?.write(`${line}\n`);
  };

  log("Detailed logging started.");
  if (filePath) {
    log(`Log file path: ${filePath}`);
  } else {
    log("File logging unavailable. Output channel logging remains enabled.");
  }

  return {
    runId,
    filePath,
    log,
    show: () => channel.show(true),
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
