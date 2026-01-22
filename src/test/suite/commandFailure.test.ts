import * as assert from "assert";
import * as vscode from "vscode";
import { runNormalizeCommand } from "../../extension";

suite("command failure behavior", () => {
  function fullDocumentRange(doc: vscode.TextDocument): vscode.Range {
    const lastLine = doc.lineCount - 1;
    const end = new vscode.Position(lastLine, doc.lineAt(lastLine).text.length);
    return new vscode.Range(new vscode.Position(0, 0), end);
  }

  test("shows modal error and applies no edits when unsupported chars exist (user dismisses)", async () => {
    const doc = await vscode.workspace.openTextDocument({
      content: 'ok “quote”\nBAD ☃\n',
      language: "plaintext",
    });
    const editor = await vscode.window.showTextDocument(doc);

    // No selection -> whole doc should be targeted (cursor only)
    editor.selections = [new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 0))];

    let capturedMsg: string | undefined;
    let capturedModal: boolean | undefined;
    let capturedItems: string[] = [];

    const originalShowErrorMessage = vscode.window.showErrorMessage;

    // Simulate dismiss/escape (no selection made)
    (vscode.window.showErrorMessage as any) = (
      msg: string,
      optionsOrFirstItem: any,
      ...items: string[]
    ) => {
      capturedMsg = msg;

      if (optionsOrFirstItem && typeof optionsOrFirstItem === "object" && "modal" in optionsOrFirstItem) {
        capturedModal = Boolean(optionsOrFirstItem.modal);
        capturedItems = items;
      } else {
        capturedItems = [optionsOrFirstItem, ...items].filter((x) => typeof x === "string");
      }

      return Promise.resolve(undefined);
    };

    try {
      const before = doc.getText();

      await runNormalizeCommand();

      const after = doc.getText();

      // No changes applied because user dismissed the modal
      assert.strictEqual(after, before);

      // Modal prompt shown with single action button
      assert.ok(capturedMsg, "Expected an error prompt to be shown");
      assert.strictEqual(capturedModal, true, "Expected modal error prompt");
      assert.ok(
        capturedItems.includes("Ignore and Apply Known Fixes"),
        `Expected "Ignore and Apply Known Fixes" button. Got: ${capturedItems.join(", ")}`
      );
      assert.strictEqual(
        capturedItems.filter((x) => x === "Ignore and Apply Known Fixes").length,
        1,
        "Expected exactly one action button"
      );

      // Message includes the unsupported char sample
      assert.ok(
        capturedMsg!.includes("☃"),
        `Expected unsupported character sample in message. Got: ${capturedMsg}`
      );
    } finally {
      (vscode.window.showErrorMessage as any) = originalShowErrorMessage;
    }
  });

  test("applies known fixes when user chooses Ignore despite unsupported chars", async () => {
    const doc = await vscode.workspace.openTextDocument({
      content: 'ok “quote” — … ☃\n',
      language: "plaintext",
    });
    const editor = await vscode.window.showTextDocument(doc);

    // No selection -> whole doc should be targeted
    editor.selections = [new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 0))];

    let capturedMsg: string | undefined;
    let capturedModal: boolean | undefined;
    let capturedItems: string[] = [];

    const originalShowErrorMessage = vscode.window.showErrorMessage;

    (vscode.window.showErrorMessage as any) = (
      msg: string,
      optionsOrFirstItem: any,
      ...items: string[]
    ) => {
      capturedMsg = msg;

      if (optionsOrFirstItem && typeof optionsOrFirstItem === "object" && "modal" in optionsOrFirstItem) {
        capturedModal = Boolean(optionsOrFirstItem.modal);
        capturedItems = items;
      } else {
        capturedItems = [optionsOrFirstItem, ...items].filter((x) => typeof x === "string");
      }

      return Promise.resolve("Ignore and Apply Known Fixes");
    };

    try {
      await runNormalizeCommand();

      const after = doc.getText();

      // Known fixes applied; unsupported char remains
      assert.strictEqual(after, 'ok "quote" - ... ☃\n');

      // Modal prompt shown with single action button
      assert.ok(capturedMsg, "Expected a warning prompt");
      assert.strictEqual(capturedModal, true, "Expected modal warning");
      assert.ok(
        capturedItems.includes("Ignore and Apply Known Fixes"),
        `Expected Ignore button. Got: ${capturedItems.join(", ")}`
      );
      assert.strictEqual(
        capturedItems.filter((x) => x === "Ignore and Apply Known Fixes").length,
        1,
        "Expected exactly one action button"
      );

      // Message mentioned unsupported character
      assert.ok(
        capturedMsg!.includes("☃"),
        `Expected unsupported character in message. Got: ${capturedMsg}`
      );
    } finally {
      (vscode.window.showErrorMessage as any) = originalShowErrorMessage;
    }
  });

  test("applies edits and shows no error when all chars are supported", async () => {
    const doc = await vscode.workspace.openTextDocument({
      content: 'ok “quote” — …\n',
      language: "plaintext",
    });
    const editor = await vscode.window.showTextDocument(doc);

    // No selection -> whole doc
    editor.selections = [new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 0))];

    let capturedMsg: string | undefined;
    const originalShowErrorMessage = vscode.window.showErrorMessage;

    (vscode.window.showErrorMessage as any) = (msg: string) => {
      capturedMsg = msg;
      return Promise.resolve(undefined);
    };

    try {
      await runNormalizeCommand();

      const after = doc.getText();
      assert.strictEqual(after, 'ok "quote" - ...\n');
      assert.strictEqual(capturedMsg, undefined);
    } finally {
      (vscode.window.showErrorMessage as any) = originalShowErrorMessage;
    }
  });

  test("with explicit selection, only selection is normalized (not whole document)", async () => {
    const doc = await vscode.workspace.openTextDocument({
      content: 'keep ☃\nfix “me” — …\n',
      language: "plaintext",
    });
    const editor = await vscode.window.showTextDocument(doc);

    // Select only second line
    const line1 = doc.lineAt(1);
    const range = new vscode.Range(
      new vscode.Position(1, 0),
      new vscode.Position(1, line1.text.length)
    );
    editor.selections = [new vscode.Selection(range.start, range.end)];

    // No modal expected because the selected line has no unsupported chars
    let capturedMsg: string | undefined;
    const originalShowErrorMessage = vscode.window.showErrorMessage;
    (vscode.window.showErrorMessage as any) = (msg: string) => {
      capturedMsg = msg;
      return Promise.resolve(undefined);
    };

    try {
      await runNormalizeCommand();

      const after = doc.getText();
      assert.strictEqual(after, 'keep ☃\nfix "me" - ...\n');
      assert.strictEqual(capturedMsg, undefined);
    } finally {
      (vscode.window.showErrorMessage as any) = originalShowErrorMessage;
    }
  });
});
