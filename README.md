# vscode-ext

This repository contains a VS Code extension project:

- `text-utils`: Normalize unusual/unsupported characters in text using a configurable replacement map.

## What `text-utils` does

- Runs the command `Text Utilities: Normalize Characters` (`text-utils.normalize`).
- Replaces configured characters (for example smart quotes, em dash, zero-width spaces).
- Preserves regular allowed characters.
- Warns when disallowed characters remain unmapped.
- Produces detailed execution logs for every run, including per-character decisions.

## Repository layout

- `text-utils/`: VS Code extension source and build/test scripts.
- `text-utils/src/`: TypeScript source (`extension.ts`, `normalize.ts`, `config.ts`, `logging.ts`).
- `text-utils/out/`: Compiled output.

## Local development

Requirements:

- Node.js 22+ (or a version compatible with the `@types/node` and TypeScript setup)
- npm
- VS Code

Install and build:

```bash
cd text-utils
npm install
npm run compile
```

Useful scripts:

```bash
npm run watch
npm run lint
npm run test
```

## Running the extension

1. Open the `text-utils` folder in VS Code.
2. Press `F5` to launch an Extension Development Host.
3. In the host window, open a document and run:
   `Text Utilities: Normalize Characters`

## Configuration

Settings are under `textUtils`:

- `textUtils.map`: character replacement map.
- `textUtils.disallowedCharRegex`: regex for characters considered disallowed.

Example:

```json
{
  "textUtils.map": {
    "\\u2014": { "replaceWith": "-", "description": "EM DASH" },
    "\\u201C": { "replaceWith": "\"", "description": "LEFT DOUBLE QUOTE" },
    "\\u201D": { "replaceWith": "\"", "description": "RIGHT DOUBLE QUOTE" },
    "\\u200B": { "replaceWith": "", "description": "ZERO WIDTH SPACE" }
  },
  "textUtils.disallowedCharRegex": "/[^A-Za-z0-9 ,.\\\"'()\\[\\];:/?><!@#$%^&*+=\\\\-\\\\ \\\\t\\\\r\\\\n{}|]/g"
}
```

## Detailed logging

Each normalize command run writes detailed logs (including each input/output character and decisions) to:

- VS Code Output panel channel: `Text Utils Detailed Log`
- Log file (best-effort):
  - Preferred: extension global storage `logs/normalize-<timestamp>-<id>.log`
  - Fallback: `<workspace>/.text-utils-logs/`
  - Final fallback: temp directory `text-utils-logs`

The exact log file path is printed at the beginning of each run in the output channel.

