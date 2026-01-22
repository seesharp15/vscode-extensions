import * as vscode from "vscode";
import { getTextUtilsConfig } from "./config";
import { normalizeText } from "./normalize";

function getTargetRanges(editor: vscode.TextEditor): vscode.Range[] {
  const sels = editor.selections;
  const noSelection = sels.length > 0 && sels.every((s) => s.isEmpty);

  if (noSelection) {
    const doc = editor.document;
    const lastLine = doc.lineCount - 1;
    const end = new vscode.Position(lastLine, doc.lineAt(lastLine).text.length);
    return [new vscode.Range(new vscode.Position(0, 0), end)];
  }

  return sels.map((s) => new vscode.Range(s.start, s.end));
}

function formatSamples(label: string, samples: string[]): string {
  if (samples.length === 0) {
    return "";
  }
  return `\n\n${label}:\n${samples.join(" ")}`;
}

export async function runNormalizeCommand(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }

  const config = getTextUtilsConfig();
  const ranges = getTargetRanges(editor);

  // Pre-check all ranges first (atomic decision)
  let hasAnyIssues = false;

  const allUnmapped: string[] = [];
  const allIllegalOutput: string[] = [];

  for (const range of ranges) {
    const original = editor.document.getText(range);
    if (!original) {
      continue;
    }

    const result = normalizeText(original, config);

    if (
      result.unmappedInputSamples.length > 0 ||
      result.illegalOutputSamples.length > 0
    ) {
      hasAnyIssues = true;
      allUnmapped.push(...result.unmappedInputSamples);
      allIllegalOutput.push(...result.illegalOutputSamples);
    }
  }

  if (hasAnyIssues) {
    const uniqueUnmapped = Array.from(new Set(allUnmapped)).slice(0, 20);
    const uniqueIllegalOutput = Array.from(new Set(allIllegalOutput)).slice(
      0,
      20,
    );

    const detail =
      formatSamples("Unmapped input characters (kept as-is)", uniqueUnmapped) +
      formatSamples(
        "Output contains characters not present in any replacement value",
        uniqueIllegalOutput,
      );

    const choice = await vscode.window.showErrorMessage(
      `Text normalization found characters not covered by your configured map. Known fixes can still be applied, but some characters may remain unchanged.${detail}\n\nApply known fixes anyway?`,
      { modal: true },
      "Ignore and Apply Known Fixes",
    );

    if (choice !== "Ignore and Apply Known Fixes") {
      return; // dismissed
    }
  }

  // Apply mappings (even if issues exist and user chose Ignore)
  await editor.edit((editBuilder) => {
    for (const range of ranges) {
      const original = editor.document.getText(range);
      if (!original) {
        continue;
      }

      const result = normalizeText(original, config);
      editBuilder.replace(range, result.text);
    }
  });
}

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "text-utils.normalize",
      runNormalizeCommand,
    ),
  );
}

export function deactivate() {}
