import * as assert from "assert";
import * as vscode from "vscode";
import { runNormalizeCommand } from "../extension";
import * as configMod from "../config";
import { buildConfigFromRaw } from "../config";
import { TextUtilsConfig } from "../config";

function identity(chars: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const ch of chars) {
    out.push([ch, ch]);
  }
  return out;
}

function makeConfig(entries: Array<[string, string]>): TextUtilsConfig {
  return buildConfigFromRaw(
    Object.fromEntries(
      entries.map(([k, v]) => [k, { replaceWith: v, description: "" }]),
    ),
  );
}

function withConfigOverride(
  configs: Array<[string, string]>,
  fn: () => Thenable<void> | Promise<void> | void,
) {
  const original = configMod.getTextUtilsConfig;

  // Monkey-patch exported function to return a config built from raw
  (configMod as any).getTextUtilsConfig = () => makeConfig(configs);

  const restore = () => {
    (configMod as any).getTextUtilsConfig = original;
  };

  try {
    const r = fn();
    if (r && typeof (r as any).then === "function") {
      return (r as Promise<void>).finally(restore);
    }
    restore();
    return Promise.resolve();
  } catch (e) {
    restore();
    throw e;
  }
}

suite("command failure behavior", () => {
  test("shows modal error and applies no edits when unsupported chars exist (user dismisses)", async () => {
    const doc = await vscode.workspace.openTextDocument({
      content: "ok “quote”\nBAD ☃\n",
      language: "plaintext",
    });
    const editor = await vscode.window.showTextDocument(doc);

    // No selection -> whole doc should be targeted (cursor only)
    editor.selections = [
      new vscode.Selection(
        new vscode.Position(0, 0),
        new vscode.Position(0, 0),
      ),
    ];

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

      if (
        optionsOrFirstItem &&
        typeof optionsOrFirstItem === "object" &&
        "modal" in optionsOrFirstItem
      ) {
        capturedModal = Boolean(optionsOrFirstItem.modal);
        capturedItems = items;
      } else {
        capturedItems = [optionsOrFirstItem, ...items].filter(
          (x) => typeof x === "string",
        );
      }

      return Promise.resolve(undefined);
    };

    try {
      let raw: any = [
        ...identity("ok quoteBAD\n"),
        ["“", '"'],
        ["”", '"'],
        ['"', '"'],
      ];

      await withConfigOverride(raw, async () => {
        const before = doc.getText();

        await runNormalizeCommand();

        const after = doc.getText();

        // No changes applied because user dismissed the modal
        assert.strictEqual(after, before);

        // Modal prompt shown with single action button

        let expectedSuffix =
          "Unmapped input characters (kept as-is):\n☃\n\nOutput contains characters not present in any replacement value:\n☃\n\nApply known fixes anyway?";
        ("Unmapped input characters (kept as-is):\n☃ ¿\n\nOutput contains characters not present in any replacement value:\n☃ ¿\n\nApply known fixes anyway?");

        if (!capturedMsg?.endsWith(expectedSuffix)) {
          assert.fail(
            `Expected error message string to end with "${expectedSuffix}", but received "${capturedMsg}"`,
          );
        }

        assert.ok(capturedMsg, "Expected an error prompt to be shown");
        assert.strictEqual(capturedModal, true, "Expected modal error prompt");
        assert.ok(
          capturedItems.includes("Ignore and Apply Known Fixes"),
          `Expected "Ignore and Apply Known Fixes" button. Got: ${capturedItems.join(", ")}`,
        );
        assert.strictEqual(
          capturedItems.filter((x) => x === "Ignore and Apply Known Fixes")
            .length,
          1,
          "Expected exactly one action button",
        );

        // Message includes the unsupported char sample
        assert.ok(
          capturedMsg!.includes("☃"),
          `Expected unsupported character sample in message. Got: ${capturedMsg}`,
        );
      });
    } finally {
      (vscode.window.showErrorMessage as any) = originalShowErrorMessage;
    }
  });

  test("applies known fixes when user chooses Ignore despite unsupported chars", async () => {
    const doc = await vscode.workspace.openTextDocument({
      content: "ok “quote” — … ☃\n¿",
      language: "plaintext",
    });
    const editor = await vscode.window.showTextDocument(doc);

    // No selection -> whole doc should be targeted
    editor.selections = [
      new vscode.Selection(
        new vscode.Position(0, 0),
        new vscode.Position(0, 0),
      ),
    ];

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

      if (
        optionsOrFirstItem &&
        typeof optionsOrFirstItem === "object" &&
        "modal" in optionsOrFirstItem
      ) {
        capturedModal = Boolean(optionsOrFirstItem.modal);
        capturedItems = items;
      } else {
        capturedItems = [optionsOrFirstItem, ...items].filter(
          (x) => typeof x === "string",
        );
      }

      return Promise.resolve("Ignore and Apply Known Fixes");
    };

    try {
      const raw: any = [
        ...identity('ok quote \n"-.'),
        ["“", '"'],
        ["”", '"'],
        ['"', '"'],
        ["—", "-"],
        ["–", "-"],
        ["-", "-"],
        ["…", "..."],
        [".", "."],
      ];

      await withConfigOverride(raw, async () => {
        await runNormalizeCommand();

        const after = doc.getText();
        assert.strictEqual(after, 'ok "quote" - ... ☃\n¿');

        let expectedSuffix =
          "Unmapped input characters (kept as-is):\n☃ ¿\n\nOutput contains characters not present in any replacement value:\n☃ ¿\n\nApply known fixes anyway?";

        if (!capturedMsg?.endsWith(expectedSuffix)) {
          assert.fail(
            `Expected error message string to end with "${expectedSuffix}", but received "${capturedMsg}"`,
          );
        }

        assert.ok(capturedMsg, "Expected a warning prompt");
        assert.strictEqual(capturedModal, true, "Expected modal warning");
        assert.ok(
          capturedItems.includes("Ignore and Apply Known Fixes"),
          `Expected Ignore button. Got: ${capturedItems.join(", ")}`,
        );
        assert.strictEqual(
          capturedItems.filter((x) => x === "Ignore and Apply Known Fixes")
            .length,
          1,
          "Expected exactly one action button",
        );
        assert.ok(capturedMsg!.includes("☃"));
      });
    } finally {
      (vscode.window.showErrorMessage as any) = originalShowErrorMessage;
    }
  });

  test("applies edits and shows no error when all chars are supported", async () => {
    const doc = await vscode.workspace.openTextDocument({
      content: "ok “quote” — …\n",
      language: "plaintext",
    });
    const editor = await vscode.window.showTextDocument(doc);

    // No selection -> whole doc
    editor.selections = [
      new vscode.Selection(
        new vscode.Position(0, 0),
        new vscode.Position(0, 0),
      ),
    ];

    let capturedMsg: string | undefined;
    const originalShowErrorMessage = vscode.window.showErrorMessage;

    (vscode.window.showErrorMessage as any) = (msg: string) => {
      capturedMsg = msg;
      return Promise.resolve(undefined);
    };

    try {
      const raw: any = [
        ...identity("ok quote\n"),
        ["“", '"'],
        ["”", '"'],
        ['"', '"'],
        ["—", "-"],
        ["–", "-"],
        ["-", "-"],
        ["…", "..."],
        [".", "."],
      ];

      await withConfigOverride(raw, async () => {
        await runNormalizeCommand();
        const after = doc.getText();
        assert.strictEqual(after, 'ok "quote" - ...\n');
        assert.strictEqual(capturedMsg, undefined);
      });
    } finally {
      (vscode.window.showErrorMessage as any) = originalShowErrorMessage;
    }
  });

  test("with explicit selection, only selection is normalized (not whole document)", async () => {
    const doc = await vscode.workspace.openTextDocument({
      content: "keep ☃\nfix “me” — …\n",
      language: "plaintext",
    });
    const editor = await vscode.window.showTextDocument(doc);

    // Select only second line
    const line1 = doc.lineAt(1);
    const range = new vscode.Range(
      new vscode.Position(1, 0),
      new vscode.Position(1, line1.text.length),
    );
    editor.selections = [new vscode.Selection(range.start, range.end)];

    let capturedMsg: string | undefined;
    const originalShowErrorMessage = vscode.window.showErrorMessage;
    (vscode.window.showErrorMessage as any) = (msg: string) => {
      capturedMsg = msg;
      return Promise.resolve(undefined);
    };

    try {

      const raw: any = [
        ...identity('fix me \n"-.'),
        ["“", '"'],
        ["”", '"'],
        ['"', '"'],
        ["—", "-"],
        ["–", "-"],
        ["-", "-"],
        ["…", "..."],
        [".", "."],
      ];

      await withConfigOverride(raw, async () => {
        await runNormalizeCommand();
        const after = doc.getText();
        assert.strictEqual(after, 'keep ☃\nfix "me" - ...\n');
        assert.strictEqual(capturedMsg, undefined);
      });
    } finally {
      (vscode.window.showErrorMessage as any) = originalShowErrorMessage;
    }
  });
});

function expect(arg0: boolean) {
  throw new Error("Function not implemented.");
}