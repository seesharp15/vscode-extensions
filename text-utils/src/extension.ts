import * as vscode from "vscode";
import { TextUtilsConfig, getTextUtilsConfig } from "./config";
import { createDetailedLogger } from "./logging";
import { NormalizeResult, NormalizeTraceEvent, normalizeText } from "./normalize";

type RangeNormalization = {
  range: vscode.Range;
  original: string;
  result: NormalizeResult;
};

function escapeForLog(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t");
}

function formatCodePoint(codePoint: number): string {
  return `U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`;
}

function describeChar(ch: string, codePoint?: number): string {
  const cp = codePoint ?? (ch.codePointAt(0) ?? 0);
  return `'${escapeForLog(ch)}' (${formatCodePoint(cp)})`;
}

function describeText(text: string): string {
  if (text.length === 0) {
    return "''";
  }
  return `'${escapeForLog(text)}'`;
}

function describeRange(range: vscode.Range): string {
  return `${range.start.line}:${range.start.character}-${range.end.line}:${range.end.character}`;
}

function sortedChars(chars: Iterable<string>): string[] {
  return Array.from(chars).sort((a, b) => {
    const aCp = a.codePointAt(0) ?? 0;
    const bCp = b.codePointAt(0) ?? 0;
    return aCp - bCp;
  });
}

function logConfig(
  log: (message: string) => void,
  config: TextUtilsConfig,
): void {
  log(
    `Config summary: mapEntries=${config.map.size}, allowedOutputChars=${config.allowedOutputChars.size}, disallowedRegex=/${config.disallowedRegex.source}/${config.disallowedRegex.flags}`,
  );
  log("Configured map entries (input => replacement):");
  for (const [from, to] of Array.from(config.map.entries())) {
    log(`MAP ${describeChar(from)} => ${describeText(to)}`);
  }
  log("Allowed output characters (derived from replacement values):");
  for (const ch of sortedChars(config.allowedOutputChars)) {
    log(`ALLOWED ${describeChar(ch)}`);
  }
}

function logTraceEvent(
  log: (message: string) => void,
  rangeLabel: string,
  event: NormalizeTraceEvent,
): void {
  if (event.kind === "input") {
    log(
      `${rangeLabel} INPUT[${event.index}] char=${describeChar(event.char, event.codePoint)} mapped=${event.mapped} replacement=${describeText(event.replacement)} disallowed=${event.disallowed}`,
    );
    return;
  }

  log(
    `${rangeLabel} OUTPUT[${event.index}] char=${describeChar(event.char, event.codePoint)} disallowed=${event.disallowed} allowedByReplacementValue=${event.allowedByReplacementValue} illegal=${event.illegal}`,
  );
}

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

export async function runNormalizeCommand(
  context?: vscode.ExtensionContext,
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }

  const logger = await createDetailedLogger(context);

  try {
    logger.show();
    logger.log(
      `Command started for document '${editor.document.uri.toString()}'`,
    );

    const config = getTextUtilsConfig();
    const ranges = getTargetRanges(editor);

    logger.log(`Target range count: ${ranges.length}`);
    logConfig(logger.log, config);

    // Pre-check all ranges first (atomic decision)
    let hasAnyIssues = false;
    const allUnmapped: string[] = [];
    const allIllegalOutput: string[] = [];
    const normalizedRanges: RangeNormalization[] = [];

    for (const [rangeIndex, range] of ranges.entries()) {
      const rangeLabel = `RANGE[${rangeIndex}](${describeRange(range)})`;
      const original = editor.document.getText(range);
      logger.log(
        `${rangeLabel} originalLength=${original.length} originalText=${describeText(original)}`,
      );

      if (!original) {
        logger.log(`${rangeLabel} skipped because selection text is empty.`);
        continue;
      }

      const result = normalizeText(original, config, {
        onTrace: (event) => logTraceEvent(logger.log, rangeLabel, event),
      });

      logger.log(
        `${rangeLabel} resultText=${describeText(result.text)} unmappedSamples=${result.unmappedInputSamples.length} illegalOutputSamples=${result.illegalOutputSamples.length}`,
      );
      if (result.unmappedInputSamples.length > 0) {
        logger.log(
          `${rangeLabel} unmappedSampleChars=${result.unmappedInputSamples.map((ch) => describeChar(ch)).join(", ")}`,
        );
      }
      if (result.illegalOutputSamples.length > 0) {
        logger.log(
          `${rangeLabel} illegalOutputSampleChars=${result.illegalOutputSamples.map((ch) => describeChar(ch)).join(", ")}`,
        );
      }

      if (
        result.unmappedInputSamples.length > 0 ||
        result.illegalOutputSamples.length > 0
      ) {
        hasAnyIssues = true;
        allUnmapped.push(...result.unmappedInputSamples);
        allIllegalOutput.push(...result.illegalOutputSamples);
      }

      normalizedRanges.push({ range, original, result });
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

      logger.log(`User decision on warning dialog: ${choice ?? "dismissed"}`);

      if (choice !== "Ignore and Apply Known Fixes") {
        logger.log("Command ended without applying edits.");
        return; // dismissed
      }
    }

    // Apply mappings (even if issues exist and user chose Ignore)
    const didEdit = await editor.edit((editBuilder) => {
      for (const [rangeIndex, item] of normalizedRanges.entries()) {
        editBuilder.replace(item.range, item.result.text);
        logger.log(
          `RANGE[${rangeIndex}] applied edit originalLength=${item.original.length} outputLength=${item.result.text.length}`,
        );
      }
    });

    logger.log(`Edit transaction success=${didEdit}`);
    logger.log("Command completed.");
  } catch (err) {
    const reason = err instanceof Error ? err.stack ?? err.message : String(err);
    logger.log(`Command failed: ${reason}`);
    throw err;
  } finally {
    await logger.close();
  }
}

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "text-utils.normalize",
      () => runNormalizeCommand(context),
    ),
  );
}

export function deactivate() {}
