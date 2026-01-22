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

export async function runNormalizeCommand(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {return;}

  const config = getTextUtilsConfig();
  const ranges = getTargetRanges(editor);

  // Pre-check all ranges for disallowed chars after applying known mappings
  let hasAnyDisallowed = false;
  let allSamples: string[] = [];

  for (const range of ranges) {
    const original = editor.document.getText(range);
    if (!original) {continue;}

    const result = normalizeText(original, config);
    if (result.hasDisallowedChars) {
      hasAnyDisallowed = true;
      allSamples.push(...result.disallowedSamples);
    }
  }

  if (hasAnyDisallowed) {
    const uniqueSamples = Array.from(new Set(allSamples)).slice(0, 20);
    const sampleText = uniqueSamples.length ? `\n\nUnsupported characters:\n${uniqueSamples.join(" ")}` : "";

    const choice = await vscode.window.showErrorMessage(
      `Text normalization found unsupported characters. Known fixes can still be applied, but some characters will remain.${sampleText}\n\nApply known fixes anyway?`,
      { modal: true },
      "Ignore and Apply Known Fixes"
    );

    if (choice !== "Ignore and Apply Known Fixes") {
      return; // dismissed
    }
  }

  await editor.edit((editBuilder) => {
    for (const range of ranges) {
      const original = editor.document.getText(range);
      if (!original) {continue;}

      const result = normalizeText(original, config);
      editBuilder.replace(range, result.text);
    }
  });
}

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand("text-utils.normalize", runNormalizeCommand)
  );
}

export function deactivate() {}


// import * as vscode from "vscode";
// import { normalizeText } from "./normalize";

// function getTargetRanges(editor: vscode.TextEditor): vscode.Range[] {
//   const sels = editor.selections;

//   // If every selection is empty (just cursors), treat as "no selection"
//   const noSelection = sels.length > 0 && sels.every((s) => s.isEmpty);
//   if (noSelection) {
//     const doc = editor.document;
//     const lastLine = doc.lineCount - 1;
//     const end = new vscode.Position(lastLine, doc.lineAt(lastLine).text.length);
//     return [new vscode.Range(new vscode.Position(0, 0), end)];
//   }

//   // Otherwise, use the explicit selection ranges
//   return sels.map((s) => new vscode.Range(s.start, s.end));
// }

// export async function runNormalizeCommand(): Promise<void> {
//   const editor = vscode.window.activeTextEditor;
//   if (!editor) {return;}

//   const ranges = getTargetRanges(editor);

//   // Pre-check all ranges first (atomic decision)
//   let allSamples: string[] = [];
//   let hasAnyDisallowed = false;

//   for (const range of ranges) {
//     const original = editor.document.getText(range);
//     if (!original) {continue;}

//     const result = normalizeText(original);
//     if (result.hasDisallowedChars) {
//       hasAnyDisallowed = true;
//       allSamples.push(...result.disallowedSamples);
//     }
//   }

//   // If any disallowed chars remain, ask what to do.
//   if (hasAnyDisallowed) {
//     const uniqueSamples = Array.from(new Set(allSamples)).slice(0, 20);
//     const sampleText = uniqueSamples.length
//       ? `\n\nUnsupported characters:\n${uniqueSamples.join(" ")}`
//       : "";

//     const choice = await vscode.window.showErrorMessage(
//       `Text normalization found unsupported characters. Known fixes can still be applied, but some characters will remain.${sampleText}\n\nApply known fixes anyway?`,
//       { modal: true },
//       "Ignore and Apply Known Fixes"
//     );

//     if (choice !== "Ignore and Apply Known Fixes") {
//       return; // user cancelled
//     }
//   }

//   // Apply known fixes (always safe) to all selections
//   await editor.edit((editBuilder) => {
//     for (const range of ranges) {
//       const original = editor.document.getText(range);
//       if (!original) {continue;}

//       const result = normalizeText(original);
//       // IMPORTANT: even if result.hasDisallowedChars is true,
//       // we still apply the known replacements when user chose Ignore.
//       editBuilder.replace(range, result.text);
//     }
//   });
// }


// // export async function runNormalizeCommand(): Promise<void> {
// //   const editor = vscode.window.activeTextEditor;
// //   if (!editor) {return;}

// //   // Pre-check all selections before making any edits (true atomic behavior)
// //   for (const sel of editor.selections) {
// //     const original = editor.document.getText(sel);
// //     if (!original) {continue;}

// //     const result = normalizeText(original);
// //     if (result.hasDisallowedChars) {
// //       // const extra = result.disallowedSamples.length
// //       //   ? ` Unsupported characters: ${result.disallowedSamples.join(" ")}`
// //       //   : "";

// //       await vscode.window.showErrorMessage(
// //         `Text normalization failed.
// //             \nUnsupported characters detected: ${result.disallowedSamples.join(" ")}
// //             \nNo changes were applied.`,
// //         { modal: true },
// //       );
// //       return;
// //     }

// //     // All selections are safe → apply edits
// //     await editor.edit((editBuilder) => {
// //       for (const sel of editor.selections) {
// //         const original = editor.document.getText(sel);
// //         if (!original) {continue;}

// //         const result = normalizeText(original);
// //         editBuilder.replace(sel, result.text);
// //       }
// //     });
// //   }
// // }

// export function activate(context: vscode.ExtensionContext) {
//   const disposable = vscode.commands.registerCommand(
//     "text-utils.normalize",
//     runNormalizeCommand,
//   );
//   context.subscriptions.push(disposable);
// }

// export function deactivate() {}


// // export async function runNormalizeCommand(): Promise<void> {
// //   const editor = vscode.window.activeTextEditor;
// //   if (!editor) {return;}

// //   // Pre-check all selections before making any edits (true atomic behavior)
// //   for (const sel of editor.selections) {
// //     const original = editor.document.getText(sel);
// //     if (!original) {continue;}

// //     const result = normalizeText(original);
// //     if (result.hasDisallowedChars) {
// //       // const extra = result.disallowedSamples.length
// //       //   ? ` Unsupported characters: ${result.disallowedSamples.join(" ")}`
// //       //   : "";

// //       await vscode.window.showErrorMessage(
// //         `Text normalization failed.
// //             \nUnsupported characters detected: ${result.disallowedSamples.join(" ")}
// //             \nNo changes were applied.`,
// //         { modal: true },
// //       );
// //       return;
// //     }

// //     // All selections are safe → apply edits
// //     await editor.edit((editBuilder) => {
// //       for (const sel of editor.selections) {
// //         const original = editor.document.getText(sel);
// //         if (!original) {continue;}

// //         const result = normalizeText(original);
// //         editBuilder.replace(sel, result.text);
// //       }
// //     });
// //   }
// // }
 
