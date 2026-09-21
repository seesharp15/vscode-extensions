# vscode-ext

Beginner-friendly setup and usage guide for the VS Code extension in this repo.

## Project overview

This repository currently contains one extension:

- `text-utils`: normalizes unusual/unsupported characters using a configurable replacement map.

The command exposed by the extension is:

- `Text Utilities: Normalize Characters` (`text-utils.normalize`)

## What the extension does

- Replaces configured characters (smart quotes, em dashes, zero-width characters, etc.).
- Leaves allowed characters unchanged.
- Warns if disallowed characters remain unmapped, and lets you type a replacement for each one on the spot.
- Optionally saves those replacements to `textUtils.map` so future runs handle them automatically.
- Writes highly detailed logs for each run (per character input/output decisions).

## Prerequisites

Install these first:

- Node.js 22+ (includes `npm`)
- VS Code
- Git

Check versions:

```bash
node -v
npm -v
git --version
```

## Quick start (first-time setup)

1. Clone this repository:

```bash
git clone <your-repo-url>
cd vscode-ext
```

2. Install dependencies and build:

```bash
cd text-utils
npm install
npm run compile
```

3. Open the extension project folder in VS Code:

- Recommended: open `vscode-ext/text-utils` as the workspace root.
- If you prefer terminal:

```bash
code .
```

If `code` is not installed, open VS Code and use `File -> Open Folder...` and select `text-utils`.

## Install into VS Code (packaged build)

To use the extension in your normal VS Code window rather than the debug host, run the install script from the repo root:

```bash
./install.sh
```

It packages `text-utils` into a `.vsix` (compiling first), installs it with `code --install-extension --force`, and prints a reminder to reload the window. Requires the `code` command on your PATH. It uses `vsce` if installed, otherwise `npx @vscode/vsce`.

## Run the extension in VS Code (Extension Development Host)

This is the main path for local testing.

1. In VS Code, make sure you are in the `text-utils` folder.
2. Press `F5` (`fn+F5` on some keyboards), or open `Run and Debug` and choose `Run Extension`.
3. VS Code opens a second window called an **Extension Development Host**.
4. In that second window, create/open a test file and paste sample text such as:

```text
This is “quoted” text — with … and zero-width​characters.
```

5. Open Command Palette (`Cmd+Shift+P` on macOS, `Ctrl+Shift+P` on Windows/Linux).
6. Run `Text Utilities: Normalize Characters`.
7. Confirm the text is transformed (for example `“` -> `"`, `—` -> `-`, `…` -> `...`).

Behavior note:

- If there is no selection, it normalizes the entire document.
- If text is selected, it only normalizes the selected ranges.

## How to see detailed logs

Every normalize run is logged in detail.

1. In VS Code, open `View -> Output`.
2. In the dropdown, select `Text Utils Detailed Log`.
3. You will see:
   - config summary and map entries
   - allowed output characters
   - every input character (mapped/unmapped, replacement, code point)
   - every output character (allowed/illegal, code point)
   - edit application result and final status

File logs are written based on `textUtils.logging.destination`:

- `both`: Output channel + file
- `outputChannel`: Output channel only
- `file`: file only

The file path is controlled by `textUtils.logging.filePath`.

Path behavior:

- absolute path: used as-is
- relative path: resolved from workspace folder (if present), otherwise extension storage/temp fallback

## Handling unknown characters

When a run finds characters that are disallowed but not in `textUtils.map`, a dialog lists them and offers:

- `Provide Replacements…`: a picker lists every unknown character with its code point and count. Deselect any you want to leave alone, then you get one input box per character.
  - Type the replacement text. Escapes like `\n`, `\t`, and `\u2014` work the same as in settings.
  - Leave it empty to delete the character.
  - Type the character itself to allow it as-is.
  - Press `Escape` to keep it unchanged for this run.
- `Ignore and Apply Known Fixes`: apply the configured map and leave unknown characters untouched.
- Cancel: apply nothing. A report is still written.

After you provide replacements you are asked whether to save them to workspace settings, user settings, or use them for this run only. Saved entries are written under `textUtils.map` with a `description` noting the date they were added. The text is then re-checked with the extended map; if anything is still unknown, the dialog appears again.

## Configure replacements and allowed/disallowed logic

Settings are under `textUtils`:

- `textUtils.map`: replacement definitions.
- `textUtils.disallowedCharRegex`: characters considered disallowed.
- `textUtils.logging`: logger configuration (level + destination + file path).

### Edit via Settings UI

1. Open Settings.
2. Search for `Text Utils`.
3. Edit `Text Utils: Map`, `Text Utils: Disallowed Char Regex`, and `Text Utils: Logging`.

### Edit via `settings.json`

```json
{
  "textUtils.map": {
    "\\u2014": { "replaceWith": "-", "description": "EM DASH" },
    "\\u201C": { "replaceWith": "\"", "description": "LEFT DOUBLE QUOTE" },
    "\\u201D": { "replaceWith": "\"", "description": "RIGHT DOUBLE QUOTE" },
    "\\u200B": { "replaceWith": "", "description": "ZERO WIDTH SPACE" }
  },
  "textUtils.disallowedCharRegex": "/[^A-Za-z0-9 ,.\\\"'()\\[\\];:/?><!@#$%^&*+=\\\\-\\\\ \\\\t\\\\r\\\\n{}|]/g",
  "textUtils.logging": {
    "level": "DEBUG",
    "destination": "both",
    "filePath": ".text-utils-logs/normalize.log",
    "showOutputChannelOnRun": true
  }
}
```

### Logging level behavior

Logging uses log4j-style threshold behavior:

- `TRACE`: logs everything
- `DEBUG`: debug + info + warn + error
- `INFO`: info + warn + error
- `WARN`: warn + error
- `ERROR`: error only
- `OFF`: disables logging

This is a log4j-like configuration model (level + destination + path), but not full log4j appenders/layout syntax.

## Build, lint, and test commands

Run these from `vscode-ext/text-utils`:

```bash
npm run compile
npm run watch
npm run lint
npm run test
```

What they do:

- `compile`: TypeScript build to `out/`
- `watch`: incremental TypeScript build (used by the debug launch task)
- `lint`: ESLint checks
- `test`: VS Code extension test run via `vscode-test`

## Manual verification checklist

Use this when validating changes:

1. Run `npm run compile` and `npm run lint`.
2. Launch Extension Development Host (`F5`).
3. In host window, run normalize on sample text containing:
   - smart quotes
   - dashes
   - ellipsis
   - zero-width chars
   - one intentionally unsupported character (for warning path)
4. Confirm transformed output is correct.
5. Confirm warning modal appears when expected.
6. Confirm `Text Utils Detailed Log` includes full per-character trace and final status.

## Troubleshooting

- `Command 'Text Utilities: Normalize Characters' not found`:
  - Make sure you are using the Extension Development Host window opened by `F5`.
- `F5` does nothing:
  - Ensure the opened workspace is `text-utils` (where `.vscode/launch.json` exists).
- `npm run test` fails with VS Code download/version errors:
  - Retry with network access.
  - Some environments without external network access can fail in `vscode-test`.
- No file log created:
  - Check `textUtils.logging.destination` and `textUtils.logging.filePath`.
  - If destination is `file`, verify the configured path is writable.
