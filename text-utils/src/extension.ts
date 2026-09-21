import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import {
  TextUtilsConfig,
  decodeEscapes,
  extendConfig,
  getTextUtilsConfig,
  saveMapEntries,
} from "./config";
import { buildHtmlReport, RangeDiffData } from "./diffReport";
import { createDetailedLogger, DetailedLogger } from "./logging";
import { NormalizeResult, NormalizeTraceEvent, normalizeText } from "./normalize";

const IGNORE_AND_APPLY = "Ignore and Apply Known Fixes";
const PROVIDE_REPLACEMENTS = "Provide Replacements…";

type RangeNormalization = {
  range: vscode.Range;
  original: string;
  result: NormalizeResult;
};

type NormalizationPass = {
  normalizedRanges: RangeNormalization[];
  /** Every distinct unmapped input character -> occurrences across all ranges. */
  unmappedCounts: Map<string, number>;
  illegalOutputSamples: string[];
};

type UnknownCharItem = vscode.QuickPickItem & { char: string };

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
  debug: (message: string) => void,
  config: TextUtilsConfig,
): void {
  debug(
    `Config summary: mapEntries=${config.map.size}, allowedOutputChars=${config.allowedOutputChars.size}, disallowedRegex=/${config.disallowedRegex.source}/${config.disallowedRegex.flags}`,
  );
  debug("Configured map entries (input => replacement):");
  for (const [from, to] of Array.from(config.map.entries())) {
    debug(`MAP ${describeChar(from)} => ${describeText(to)}`);
  }
  debug("Allowed output characters (derived from replacement values):");
  for (const ch of sortedChars(config.allowedOutputChars)) {
    debug(`ALLOWED ${describeChar(ch)}`);
  }
}

function logTraceEvent(
  debug: (message: string) => void,
  rangeLabel: string,
  event: NormalizeTraceEvent,
): void {
  if (event.kind === "input") {
    debug(
      `${rangeLabel} INPUT[${event.index}] char=${describeChar(event.char, event.codePoint)} mapped=${event.mapped} replacement=${describeText(event.replacement)} disallowed=${event.disallowed}`,
    );
    return;
  }

  debug(
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

/** Normalizes every target range with `config`; pure apart from logging. */
function normalizeRanges(
  editor: vscode.TextEditor,
  ranges: vscode.Range[],
  config: TextUtilsConfig,
  logger: DetailedLogger,
  pass: number,
): NormalizationPass {
  const normalizedRanges: RangeNormalization[] = [];
  const unmappedCounts = new Map<string, number>();
  const illegalOutput = new Set<string>();
  const passPrefix = pass === 1 ? "" : `PASS[${pass}] `;

  for (const [rangeIndex, range] of ranges.entries()) {
    const rangeLabel = `${passPrefix}RANGE[${rangeIndex}](${describeRange(range)})`;
    const original = editor.document.getText(range);
    logger.debug(
      `${rangeLabel} originalLength=${original.length} originalText=${describeText(original)}`,
    );

    if (!original) {
      logger.debug(`${rangeLabel} skipped because selection text is empty.`);
      continue;
    }

    const result = normalizeText(original, config, {
      onTrace: (event) => logTraceEvent(logger.debug, rangeLabel, event),
    });

    logger.debug(
      `${rangeLabel} resultText=${describeText(result.text)} unmappedSamples=${result.unmappedInputSamples.length} illegalOutputSamples=${result.illegalOutputSamples.length}`,
    );
    if (result.unmappedInputSamples.length > 0) {
      logger.warn(
        `${rangeLabel} unmappedSampleChars=${result.unmappedInputSamples.map((ch) => describeChar(ch)).join(", ")}`,
      );
    }
    if (result.illegalOutputSamples.length > 0) {
      logger.warn(
        `${rangeLabel} illegalOutputSampleChars=${result.illegalOutputSamples.map((ch) => describeChar(ch)).join(", ")}`,
      );
    }

    for (const m of result.charMappings) {
      if (m.unmapped) {
        unmappedCounts.set(m.original, (unmappedCounts.get(m.original) ?? 0) + 1);
      }
    }
    for (const ch of result.illegalOutputSamples) {
      illegalOutput.add(ch);
    }

    normalizedRanges.push({ range, original, result });
  }

  return {
    normalizedRanges,
    unmappedCounts,
    illegalOutputSamples: Array.from(illegalOutput).slice(0, 20),
  };
}

function hasIssues(pass: NormalizationPass): boolean {
  return pass.unmappedCounts.size > 0 || pass.illegalOutputSamples.length > 0;
}

/** Modal warning about unknown characters. Resolves to the chosen button, or undefined if dismissed. */
async function showIssuesDialog(
  pass: NormalizationPass,
): Promise<string | undefined> {
  // First-encounter order, matching the samples users have seen in earlier versions.
  const uniqueUnmapped = Array.from(pass.unmappedCounts.keys()).slice(0, 20);
  const detail =
    formatSamples("Unmapped input characters (kept as-is)", uniqueUnmapped) +
    formatSamples(
      "Output contains characters not present in any replacement value",
      pass.illegalOutputSamples,
    );

  const canProvide = pass.unmappedCounts.size > 0;
  const guidance = canProvide
    ? "You can provide a replacement for each of them now, or apply only the known fixes and leave them unchanged."
    : "Known fixes can still be applied, but some characters may remain unchanged.";
  const buttons = canProvide
    ? [PROVIDE_REPLACEMENTS, IGNORE_AND_APPLY]
    : [IGNORE_AND_APPLY];

  return vscode.window.showErrorMessage(
    `Text normalization found characters not covered by your configured map. ${guidance}${detail}\n\nApply known fixes anyway?`,
    { modal: true },
    ...buttons,
  );
}

/**
 * Lets the user pick which unknown characters to replace, then asks for a
 * replacement for each. Escape on an individual prompt keeps that character
 * unchanged; escape on the picker abandons the whole step.
 */
async function promptForReplacements(
  unmappedCounts: Map<string, number>,
  logger: DetailedLogger,
): Promise<Map<string, string>> {
  const provided = new Map<string, string>();

  const items: UnknownCharItem[] = sortedChars(unmappedCounts.keys()).map((ch) => {
    const count = unmappedCounts.get(ch) ?? 0;
    return {
      char: ch,
      label: `'${escapeForLog(ch)}'`,
      description: formatCodePoint(ch.codePointAt(0) ?? 0),
      detail: `${count} occurrence${count === 1 ? "" : "s"}`,
      picked: true,
    };
  });

  const selected = await vscode.window.showQuickPick(items, {
    canPickMany: true,
    ignoreFocusOut: true,
    title: "Unknown characters: choose which to replace",
    placeHolder: "Deselect any you want to leave unchanged, then press Enter",
  });

  if (!selected) {
    logger.warn("Replacement prompt cancelled at character selection.");
    return provided;
  }

  for (const [i, item] of selected.entries()) {
    const label = describeChar(item.char);
    const value = await vscode.window.showInputBox({
      ignoreFocusOut: true,
      title: `Replacement for ${label} (${i + 1} of ${selected.length})`,
      prompt:
        "Replacement text (\\n, \\t and \\uXXXX escapes are supported). Empty = delete. Same character = allow as-is. Escape = keep unchanged for this run.",
      placeHolder: "replacement text",
    });

    if (value === undefined) {
      logger.warn(`No replacement provided for ${label}; it will be kept as-is.`);
      continue;
    }

    const replacement = decodeEscapes(value);
    provided.set(item.char, replacement);
    logger.info(`User replacement: ${label} => ${describeText(replacement)}`);
  }

  return provided;
}

/** Offers to persist newly provided replacements to settings so future runs pick them up. */
async function offerToSaveReplacements(
  provided: Map<string, string>,
  logger: DetailedLogger,
): Promise<void> {
  const SAVE_WORKSPACE = "Save to Workspace Settings";
  const SAVE_USER = "Save to User Settings";
  const RUN_ONLY = "Use for This Run Only";

  const hasWorkspace = (vscode.workspace.workspaceFolders?.length ?? 0) > 0;
  const options = hasWorkspace
    ? [SAVE_WORKSPACE, SAVE_USER, RUN_ONLY]
    : [SAVE_USER, RUN_ONLY];

  const count = provided.size;
  const choice = await vscode.window.showQuickPick(options, {
    ignoreFocusOut: true,
    title: `Remember ${count} new replacement${count === 1 ? "" : "s"} in textUtils.map?`,
    placeHolder: "Saved replacements are applied automatically in future runs",
  });

  if (!choice || choice === RUN_ONLY) {
    logger.info("Replacements kept for this run only.");
    return;
  }

  const target =
    choice === SAVE_WORKSPACE
      ? vscode.ConfigurationTarget.Workspace
      : vscode.ConfigurationTarget.Global;
  const scopeName = choice === SAVE_WORKSPACE ? "workspace" : "user";

  try {
    await saveMapEntries(provided, target);
    logger.info(`Saved ${count} replacement(s) to ${scopeName} settings.`);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    logger.error(`Failed to save replacements to ${scopeName} settings: ${reason}`);
    vscode.window.showErrorMessage(
      `Text Utils: could not save replacements to ${scopeName} settings. ${reason}`,
    );
  }
}

async function writeAndOpenReport(
  normalizedRanges: RangeNormalization[],
  logger: DetailedLogger,
  documentUri: string,
  editsApplied: boolean,
): Promise<void> {
  try {
    const reportDir = path.join(os.tmpdir(), "text-utils-reports");
    await fs.promises.mkdir(reportDir, { recursive: true });
    const reportPath = path.join(reportDir, `${logger.runId}.html`);

    const ranges: RangeDiffData[] = normalizedRanges.map((item, i) => ({
      rangeLabel: `RANGE[${i}](${describeRange(item.range)})`,
      charMappings: item.result.charMappings,
      original: item.original,
      normalized: item.result.text,
    }));

    const html = buildHtmlReport({
      ranges,
      documentUri,
      runId: logger.runId,
      timestamp: new Date().toISOString(),
      editsApplied,
    });

    await fs.promises.writeFile(reportPath, html, "utf8");
    logger.info(`Report written: ${reportPath}`);

    const reportUri = vscode.Uri.file(reportPath);
    vscode.window
      .showInformationMessage(
        `Text Utils: Report ready${editsApplied ? "" : " (no edits applied)"}.`,
        "Open Report",
      )
      .then((choice) => {
        if (choice === "Open Report") {
          vscode.env.openExternal(reportUri);
        }
      });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    logger.error(`Failed to write report: ${reason}`);
  }
}

export async function runNormalizeCommand(
  context?: vscode.ExtensionContext,
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }

  const config = getTextUtilsConfig();
  const logger = await createDetailedLogger(config.logging, context);

  try {
    logger.show();
    logger.info(
      `Command started for document '${editor.document.uri.toString()}'`,
    );

    const ranges = getTargetRanges(editor);

    logger.info(`Target range count: ${ranges.length}`);
    logConfig(logger.debug, config);

    // Pre-check all ranges first (atomic decision). If unknown characters turn
    // up, the user may supply replacements; each round extends the map and
    // re-runs until the result is clean, the user ignores, or the user cancels.
    let activeConfig = config;
    let pass = 1;
    let current = normalizeRanges(editor, ranges, activeConfig, logger, pass);

    while (hasIssues(current)) {
      const choice = await showIssuesDialog(current);
      logger.warn(`User decision on warning dialog: ${choice ?? "dismissed"}`);

      if (choice === undefined) {
        logger.warn("Command ended without applying edits.");
        await writeAndOpenReport(
          current.normalizedRanges,
          logger,
          editor.document.uri.toString(),
          false,
        );
        return; // dismissed
      }

      if (choice === IGNORE_AND_APPLY) {
        break;
      }

      const provided = await promptForReplacements(current.unmappedCounts, logger);
      if (provided.size === 0) {
        logger.info("No replacements provided; showing the warning again.");
        continue;
      }

      activeConfig = extendConfig(activeConfig, provided);
      await offerToSaveReplacements(provided, logger);

      pass += 1;
      logger.info(
        `Re-running normalization (pass ${pass}) with ${provided.size} additional map entr${provided.size === 1 ? "y" : "ies"}.`,
      );
      current = normalizeRanges(editor, ranges, activeConfig, logger, pass);
    }

    const normalizedRanges = current.normalizedRanges;

    // Apply mappings (even if issues exist and user chose Ignore)
    const didEdit = await editor.edit((editBuilder) => {
      for (const [rangeIndex, item] of normalizedRanges.entries()) {
        editBuilder.replace(item.range, item.result.text);
        logger.info(
          `RANGE[${rangeIndex}] applied edit originalLength=${item.original.length} outputLength=${item.result.text.length}`,
        );
      }
    });

    logger.info(`Edit transaction success=${didEdit}`);
    await writeAndOpenReport(normalizedRanges, logger, editor.document.uri.toString(), didEdit);
    logger.info("Command completed.");
  } catch (err) {
    const reason = err instanceof Error ? err.stack ?? err.message : String(err);
    logger.error(`Command failed: ${reason}`);
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
